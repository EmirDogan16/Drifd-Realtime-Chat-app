import process from 'node:process';

import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const rawDbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
const dbUrl = (rawDbUrl || '').replace(/\$\{([A-Z0-9_]+)\}/gi, (_m, name) => {
  const v = process.env[String(name)] ?? '';
  return String(v);
});

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

if (!dbUrl && !getDbConfigFromParts()) {
  console.error('Missing DB config. Set SUPABASE_DB_URL or SUPABASE_DB_HOST/USER/PASSWORD/NAME in .env.local');
  process.exit(1);
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

const parsed = dbUrl ? parsePgUrl(dbUrl) : null;
const parts = getDbConfigFromParts();
const finalConfig = parsed || parts;

if (!finalConfig) {
  console.error('DB config is invalid.');
  process.exit(1);
}

const client = new pg.Client({
  ...finalConfig,
  // Force ssl settings explicitly so connection-string sslmode can't override behavior.
  ssl: { rejectUnauthorized: false },
});

function maybePrintEnotfoundHelp(err) {
  if (!err || err.code !== 'ENOTFOUND') return;

  const host = err.hostname || '';
  const isSupabaseDbHost = typeof host === 'string' && host.startsWith('db.') && host.endsWith('.supabase.co');
  const mentionsDbHost = typeof dbUrl === 'string' && dbUrl.includes('@db.') && dbUrl.includes('.supabase.co');

  if (!isSupabaseDbHost && !mentionsDbHost) return;

  console.error('\nLikely cause: Windows cannot resolve IPv6-only Supabase DB host (db.<ref>.supabase.co often has only AAAA record).');
  console.error('Fix options:');
  console.error('  1) Use the Supabase "Connection pooling" (pooler) connection string (host ends with .pooler.supabase.com)');
  console.error('  2) Or enable IPv6 on your Windows network adapter');
  console.error('Then update SUPABASE_DB_URL in .env.local and re-run: npm run db:check');
}

try {
  await client.connect();
  const res = await client.query(
    "select to_regclass('public.profiles') as profiles, to_regclass('public.servers') as servers, to_regclass('public.members') as members"
  );

  console.log(res.rows[0]);
} catch (err) {
  console.error(String(err?.message || err));
  maybePrintEnotfoundHelp(err);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}
