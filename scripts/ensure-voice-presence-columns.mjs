import process from 'node:process';

import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

function getDbUrl() {
  const raw = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || '';
  if (!raw) return '';
  return raw.replace(/\$\{([A-Z0-9_]+)\}/gi, (_m, name) => process.env[String(name)] ?? '');
}

function getDbConfigFromParts() {
  const host = process.env.SUPABASE_DB_HOST;
  const portRaw = process.env.SUPABASE_DB_PORT;
  const user = process.env.SUPABASE_DB_USER;
  const password = process.env.SUPABASE_DB_PASSWORD;
  const database = process.env.SUPABASE_DB_NAME;

  if (!host || !user || !password || !database) return null;

  return {
    host,
    port: portRaw ? Number(portRaw) : undefined,
    user,
    password,
    database,
  };
}

function parsePgUrl(urlString) {
  let u;
  try {
    u = new URL(urlString);
  } catch {
    return null;
  }

  if (u.protocol !== 'postgres:' && u.protocol !== 'postgresql:') return null;

  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : undefined,
    user: decodeURIComponent(u.username || ''),
    password: decodeURIComponent(u.password || ''),
    database: (u.pathname || '/').replace(/^\//, '') || undefined,
  };
}

async function main() {
  const dbUrl = getDbUrl();
  const parsed = dbUrl ? parsePgUrl(dbUrl) : null;
  const parts = getDbConfigFromParts();
  const finalConfig = parsed || parts;

  if (!finalConfig) {
    console.error('Missing DB config. Set SUPABASE_DB_URL or SUPABASE_DB_HOST/USER/PASSWORD/NAME in .env.local');
    process.exitCode = 1;
    return;
  }

  const client = new pg.Client({
    ...finalConfig,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();

    await client.query(`
      alter table if exists public.voice_channel_presence
      add column if not exists is_muted boolean not null default false;
    `);

    await client.query(`
      alter table if exists public.voice_channel_presence
      add column if not exists is_deafened boolean not null default false;
    `);

    await client.query(`
      create index if not exists voice_channel_presence_server_last_seen_idx
      on public.voice_channel_presence (serverid, last_seen desc);
    `);

    try {
      await client.query("notify pgrst, 'reload schema';");
    } catch {
      // ignore
    }

    const verify = await client.query(`
      select column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'voice_channel_presence'
        and column_name in ('is_muted', 'is_deafened')
      order by column_name;
    `);

    console.log('voice_channel_presence columns:', verify.rows.map((r) => r.column_name));
    console.log('Voice presence migration ensured successfully.');
  } catch (err) {
    console.error('Failed to ensure voice presence columns.');
    console.error(String(err?.message || err));
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => undefined);
  }
}

await main();
