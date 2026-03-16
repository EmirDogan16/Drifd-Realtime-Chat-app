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

  return raw.replace(/\$\{([A-Z0-9_]+)\}/gi, (_m, name) => String(process.env[String(name)] ?? ''));
}

function getDbConfigFromParts() {
  const host = process.env.SUPABASE_DB_HOST;
  const portRaw = process.env.SUPABASE_DB_PORT;
  const user = process.env.SUPABASE_DB_USER;
  const password = process.env.SUPABASE_DB_PASSWORD;
  const database = process.env.SUPABASE_DB_NAME;

  if (!host || !user || !password || !database) return null;
  return { host, port: portRaw ? Number(portRaw) : undefined, user, password, database };
}

function parsePgUrl(urlString) {
  try {
    const u = new URL(urlString);
    if (u.protocol !== 'postgres:' && u.protocol !== 'postgresql:') return null;
    return {
      host: u.hostname,
      port: u.port ? Number(u.port) : undefined,
      user: decodeURIComponent(u.username || ''),
      password: decodeURIComponent(u.password || ''),
      database: (u.pathname || '/').replace(/^\//, '') || undefined,
    };
  } catch {
    return null;
  }
}

async function main() {
  loadEnv();

  const sqlPath = path.resolve('scripts/add-voice-channel-presence.sql');
  const sql = await fs.readFile(sqlPath, 'utf8');

  const dbUrl = getDbUrl();
  const finalConfig = (dbUrl ? parsePgUrl(dbUrl) : null) || getDbConfigFromParts();

  if (!finalConfig) {
    console.error('Missing DB config. Set SUPABASE_DB_URL or SUPABASE_DB_HOST/USER/PASSWORD/NAME in .env.local');
    process.exit(1);
  }

  const client = new pg.Client({
    ...finalConfig,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    await client.query({ text: sql, queryMode: 'simple' });
    await client.query("notify pgrst, 'reload schema';").catch(() => undefined);
    const result = await client.query("select to_regclass('public.voice_channel_presence') as voice_channel_presence");
    console.log(result.rows?.[0] ?? {});
  } catch (error) {
    console.error(String(error?.message || error));
    process.exit(1);
  } finally {
    await client.end().catch(() => undefined);
  }
}

await main();
