import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import dotenv from 'dotenv';
import pg from 'pg';

function loadEnv() {
  dotenv.config({ path: '.env.local' });
  dotenv.config({ path: '.env' });
}

function getDbUrl() {
  const raw = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || '';
  if (!raw) return '';

  // Allow .env.local values like: postgresql://postgres:${SUPABASE_DB_PASSWORD}@...
  const interpolated = raw.replace(/\$\{([A-Z0-9_]+)\}/gi, (_m, name) => {
    const v = process.env[String(name)] ?? '';
    return String(v);
  });

  return interpolated;
}

function getDbConfigFromParts() {
  const host = process.env.SUPABASE_DB_HOST;
  const portRaw = process.env.SUPABASE_DB_PORT;
  const user = process.env.SUPABASE_DB_USER;
  const password = process.env.SUPABASE_DB_PASSWORD;
  const database = process.env.SUPABASE_DB_NAME;

  if (!host || !user || !password || !database) return null;
  const port = portRaw ? Number(portRaw) : undefined;
  return { host, port, user, password, database };
}

function parsePgUrl(urlString) {
  let u;
  try {
    u = new URL(urlString);
  } catch {
    return null;
  }

  if (u.protocol !== 'postgres:' && u.protocol !== 'postgresql:') return null;

  const port = u.port ? Number(u.port) : undefined;
  const database = (u.pathname || '/').replace(/^\//, '') || undefined;

  return {
    host: u.hostname,
    port,
    user: decodeURIComponent(u.username || ''),
    password: decodeURIComponent(u.password || ''),
    database,
  };
}

function maybePrintEnotfoundHelp(dbUrl, err) {
  if (!err || err.code !== 'ENOTFOUND') return;

  const host = err.hostname || '';
  const isSupabaseDbHost = typeof host === 'string' && host.startsWith('db.') && host.endsWith('.supabase.co');
  const mentionsDbHost = typeof dbUrl === 'string' && dbUrl.includes('@db.') && dbUrl.includes('.supabase.co');

  if (!isSupabaseDbHost && !mentionsDbHost) return;

  console.error('\nLikely cause: Windows cannot resolve IPv6-only Supabase DB host (db.<ref>.supabase.co often has only AAAA record).');
  console.error('Fix options:');
  console.error('  1) Use the Supabase "Connection pooling" (pooler) connection string (host ends with .pooler.supabase.com)');
  console.error('  2) Or enable IPv6 on your Windows network adapter');
  console.error('Then update SUPABASE_DB_URL in .env.local and re-run: npm run db:schema');
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  loadEnv();

  const dbUrl = getDbUrl();
  const parts = getDbConfigFromParts();
  if (!dbUrl && !parts) {
    console.error(
      [
        'Missing DB connection string.',
        'Set SUPABASE_DB_URL (or DATABASE_URL) in .env.local, OR set SUPABASE_DB_HOST/USER/PASSWORD/NAME',
        'Example:',
        '  SUPABASE_DB_URL=postgresql://postgres:<PASSWORD>@db.<ref>.supabase.co:5432/postgres?sslmode=require',
      ].join('\n')
    );
    process.exitCode = 1;
    return;
  }

  const schemaPath = path.resolve('supabase_schema.sql');
  if (!(await fileExists(schemaPath))) {
    console.error(`Could not find supabase_schema.sql at: ${schemaPath}`);
    process.exitCode = 1;
    return;
  }

  const sql = await fs.readFile(schemaPath, 'utf8');

  const parsed = dbUrl ? parsePgUrl(dbUrl) : null;
  const finalConfig = parsed || parts;

  if (!finalConfig) {
    console.error('DB config is invalid.');
    process.exitCode = 1;
    return;
  }

  const client = new pg.Client({
    ...finalConfig,
    // Force ssl settings explicitly so connection-string sslmode can't override behavior.
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    await client.query({ text: sql, queryMode: 'simple' });

    // Best-effort: refresh PostgREST schema cache so REST endpoints see new tables immediately.
    try {
      await client.query("notify pgrst, 'reload schema';");
    } catch {
      // ignore (may require elevated permissions depending on platform/config)
    }

    const check = await client.query(
      "select to_regclass('public.profiles') as profiles, to_regclass('public.servers') as servers"
    );

    const row = check.rows?.[0] ?? {};
    console.log('Schema applied. Detected tables:');
    console.log(`  profiles: ${row.profiles ?? null}`);
    console.log(`  servers:  ${row.servers ?? null}`);
  } catch (err) {
    console.error('Failed to apply schema.');
    console.error(String(err?.message || err));
    maybePrintEnotfoundHelp(dbUrl, err);
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => undefined);
  }
}

await main();
