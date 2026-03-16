import process from 'node:process';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const raw = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || '';
const interpolated = raw.replace(/\$\{([A-Z0-9_]+)\}/gi, (_m, name) => String(process.env[String(name)] ?? ''));

if (!interpolated) {
  console.error('Missing SUPABASE_DB_URL or DATABASE_URL in .env.local/.env');
  process.exit(1);
}

const sql = `
create table if not exists public.channel_message_pins (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  pinned_by_profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (message_id)
);

create table if not exists public.channel_message_reactions (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  emoji text not null,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (message_id, emoji, profile_id)
);

create index if not exists idx_channel_message_pins_channel_id
on public.channel_message_pins(channel_id, created_at desc);

create index if not exists idx_channel_message_reactions_channel_id
on public.channel_message_reactions(channel_id, created_at desc);

alter table public.channel_message_pins enable row level security;
alter table public.channel_message_reactions enable row level security;

drop policy if exists "channel_message_pins_select_member" on public.channel_message_pins;
create policy "channel_message_pins_select_member"
on public.channel_message_pins
for select
using (
  exists (
    select 1
    from public.channels c
    join public.members m on m.serverid = c.serverid
    where c.id = channel_message_pins.channel_id
      and m.profileid = auth.uid()
  )
);

drop policy if exists "channel_message_pins_insert_member" on public.channel_message_pins;
create policy "channel_message_pins_insert_member"
on public.channel_message_pins
for insert
with check (
  pinned_by_profile_id = auth.uid()
  and exists (
    select 1
    from public.channels c
    join public.members m on m.serverid = c.serverid
    where c.id = channel_message_pins.channel_id
      and m.profileid = auth.uid()
  )
);

drop policy if exists "channel_message_pins_delete_member" on public.channel_message_pins;
create policy "channel_message_pins_delete_member"
on public.channel_message_pins
for delete
using (
  exists (
    select 1
    from public.channels c
    join public.members m on m.serverid = c.serverid
    where c.id = channel_message_pins.channel_id
      and m.profileid = auth.uid()
  )
);

drop policy if exists "channel_message_reactions_select_member" on public.channel_message_reactions;
create policy "channel_message_reactions_select_member"
on public.channel_message_reactions
for select
using (
  exists (
    select 1
    from public.channels c
    join public.members m on m.serverid = c.serverid
    where c.id = channel_message_reactions.channel_id
      and m.profileid = auth.uid()
  )
);

drop policy if exists "channel_message_reactions_insert_member" on public.channel_message_reactions;
create policy "channel_message_reactions_insert_member"
on public.channel_message_reactions
for insert
with check (
  profile_id = auth.uid()
  and exists (
    select 1
    from public.channels c
    join public.members m on m.serverid = c.serverid
    where c.id = channel_message_reactions.channel_id
      and m.profileid = auth.uid()
  )
);

drop policy if exists "channel_message_reactions_delete_member" on public.channel_message_reactions;
create policy "channel_message_reactions_delete_member"
on public.channel_message_reactions
for delete
using (
  profile_id = auth.uid()
  and exists (
    select 1
    from public.channels c
    join public.members m on m.serverid = c.serverid
    where c.id = channel_message_reactions.channel_id
      and m.profileid = auth.uid()
  )
);

notify pgrst, 'reload schema';
`;

const client = new pg.Client({
  connectionString: interpolated,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  await client.query({ text: sql, queryMode: 'simple' });
  console.log('channel engagement migration applied');
} catch (err) {
  console.error('failed to apply channel engagement migration');
  console.error(String(err?.message || err));
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}
