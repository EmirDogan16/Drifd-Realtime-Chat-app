-- Track active users in voice channels and when they joined.
create table if not exists public.voice_channel_presence (
  id uuid primary key default gen_random_uuid(),
  serverid uuid not null references public.servers(id) on delete cascade,
  channelid uuid not null references public.channels(id) on delete cascade,
  profileid uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (serverid, profileid)
);

create index if not exists idx_voice_presence_serverid on public.voice_channel_presence(serverid);
create index if not exists idx_voice_presence_channelid on public.voice_channel_presence(channelid);
create index if not exists idx_voice_presence_last_seen on public.voice_channel_presence(last_seen);

drop trigger if exists set_updated_at_voice_channel_presence on public.voice_channel_presence;
create trigger set_updated_at_voice_channel_presence
before update on public.voice_channel_presence
for each row execute procedure public.set_updated_at();

alter table public.voice_channel_presence enable row level security;

drop policy if exists "voice_presence_select_server_members" on public.voice_channel_presence;
create policy "voice_presence_select_server_members"
on public.voice_channel_presence
for select
using (public.is_server_member(serverid));

drop policy if exists "voice_presence_insert_own" on public.voice_channel_presence;
create policy "voice_presence_insert_own"
on public.voice_channel_presence
for insert
with check (auth.uid() = profileid and public.is_server_member(serverid));

drop policy if exists "voice_presence_update_own" on public.voice_channel_presence;
create policy "voice_presence_update_own"
on public.voice_channel_presence
for update
using (auth.uid() = profileid and public.is_server_member(serverid))
with check (auth.uid() = profileid and public.is_server_member(serverid));

drop policy if exists "voice_presence_delete_own" on public.voice_channel_presence;
create policy "voice_presence_delete_own"
on public.voice_channel_presence
for delete
using (auth.uid() = profileid and public.is_server_member(serverid));
