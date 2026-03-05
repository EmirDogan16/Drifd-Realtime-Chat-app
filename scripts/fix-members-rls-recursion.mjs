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

async function main() {
  loadEnv();

  const dbUrl = getDbUrl();
  const parts = getDbConfigFromParts();
  if (!dbUrl && !parts) {
    console.error(
      [
        'Missing DB connection string.',
        'Set SUPABASE_DB_URL (or DATABASE_URL) in .env.local, OR set SUPABASE_DB_HOST/USER/PASSWORD/NAME',
      ].join('\n')
    );
    process.exitCode = 1;
    return;
  }

  const parsed = dbUrl ? parsePgUrl(dbUrl) : null;
  const finalConfig = parsed || parts;
  if (!finalConfig) {
    console.error('DB config is invalid.');
    process.exitCode = 1;
    return;
  }

  const sql = `
begin;

create or replace function public.is_server_member(p_serverid uuid, p_profileid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.members
    where serverid = p_serverid
      and profileid = p_profileid
  );
$$;

create or replace function public.is_server_admin_or_mod(p_serverid uuid, p_profileid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.members
    where serverid = p_serverid
      and profileid = p_profileid
      and role in ('ADMIN', 'MODERATOR')
  );
$$;

create or replace function public.is_server_owner(p_serverid uuid, p_profileid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.servers
    where id = p_serverid
      and profileid = p_profileid
  );
$$;

grant execute on function public.is_server_member(uuid, uuid) to authenticated;
grant execute on function public.is_server_admin_or_mod(uuid, uuid) to authenticated;
grant execute on function public.is_server_owner(uuid, uuid) to authenticated;

drop policy if exists "members_select_server_member" on public.members;
drop policy if exists "members_insert_self_or_admin" on public.members;

create policy "members_select_server_member"
on public.members
for select
using (
  public.is_server_member(members.serverid, auth.uid())
);

create policy "members_insert_self_or_admin"
on public.members
for insert
with check (
  profileid = auth.uid()
  or public.is_server_admin_or_mod(members.serverid, auth.uid())
  or public.is_server_owner(members.serverid, auth.uid())
);

commit;
`;

  const client = new pg.Client({
    ...finalConfig,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    await client.query({ text: sql, queryMode: 'simple' });

    // Best-effort: refresh PostgREST schema cache.
    try {
      await client.query("notify pgrst, 'reload schema';");
    } catch {
      // ignore
    }

    console.log('Fixed members RLS recursion (policies recreated).');
  } catch (err) {
    console.error('Failed to fix members RLS recursion.');
    console.error(String(err?.message || err));
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => undefined);
  }
}

await main();
