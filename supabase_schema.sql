create extension if not exists "pgcrypto";

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'role' and n.nspname = 'public'
  ) then
    create type public.role as enum ('ADMIN', 'MODERATOR', 'GUEST');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'channel_type' and n.nspname = 'public'
  ) then
    create type public.channel_type as enum ('TEXT', 'AUDIO', 'VIDEO');
  end if;
end $$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  imageurl text,
  email text not null unique,
  status text default 'online' check (status in ('online', 'idle', 'dnd', 'invisible')),
  last_seen timestamptz default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.servers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  imageurl text,
  invitecode text not null unique,
  profileid uuid not null references public.profiles(id) on delete cascade,
  category_order jsonb default '["category-text", "category-audio"]'::jsonb,
  category_names jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  role public.role not null default 'GUEST',
  serverid uuid not null references public.servers(id) on delete cascade,
  profileid uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (serverid, profileid)
);

create table if not exists public.channels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type public.channel_type not null default 'TEXT',
  serverid uuid not null references public.servers(id) on delete cascade,
  profileid uuid not null references public.profiles(id) on delete cascade,
  position integer not null default 0,
  categoryid text,
  bitrate integer default 64,
  video_quality text default 'auto',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (serverid, name)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  fileurl text,
  poll_data jsonb,
  memberid uuid not null references public.members(id) on delete cascade,
  channelid uuid not null references public.channels(id) on delete cascade,
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  memberoneid uuid not null references public.members(id) on delete cascade,
  membertwoid uuid not null references public.members(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (memberoneid <> membertwoid)
);

create unique index if not exists conversations_member_pair_unique
on public.conversations (
  least(memberoneid::text, membertwoid::text),
  greatest(memberoneid::text, membertwoid::text)
);

create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  fileurl text,
  memberid uuid not null references public.members(id) on delete cascade,
  conversationid uuid not null references public.conversations(id) on delete cascade,
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.banned_users (
  id uuid primary key default gen_random_uuid(),
  serverid uuid not null references public.servers(id) on delete cascade,
  profileid uuid not null references public.profiles(id) on delete cascade,
  banned_by uuid not null references public.profiles(id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  unique (serverid, profileid)
);

create table if not exists public.voice_channel_presence (
  id uuid primary key default gen_random_uuid(),
  serverid uuid not null references public.servers(id) on delete cascade,
  channelid uuid not null references public.channels(id) on delete cascade,
  profileid uuid not null references public.profiles(id) on delete cascade,
  is_muted boolean not null default false,
  is_deafened boolean not null default false,
  joined_at timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (serverid, profileid)
);

alter table public.voice_channel_presence
  add column if not exists is_muted boolean not null default false;

alter table public.voice_channel_presence
  add column if not exists is_deafened boolean not null default false;

create index if not exists idx_voice_presence_serverid on public.voice_channel_presence(serverid);
create index if not exists idx_voice_presence_channelid on public.voice_channel_presence(channelid);
create index if not exists idx_voice_presence_last_seen on public.voice_channel_presence(last_seen);

create trigger set_updated_at_profiles
before update on public.profiles
for each row execute procedure public.set_updated_at();

create trigger set_updated_at_servers
before update on public.servers
for each row execute procedure public.set_updated_at();

create trigger set_updated_at_members
before update on public.members
for each row execute procedure public.set_updated_at();

create trigger set_updated_at_channels
before update on public.channels
for each row execute procedure public.set_updated_at();

create trigger set_updated_at_messages
before update on public.messages
for each row execute procedure public.set_updated_at();

create trigger set_updated_at_conversations
before update on public.conversations
for each row execute procedure public.set_updated_at();

create trigger set_updated_at_direct_messages
before update on public.direct_messages
for each row execute procedure public.set_updated_at();

create trigger set_updated_at_voice_channel_presence
before update on public.voice_channel_presence
for each row execute procedure public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, imageurl, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1)),
      coalesce(
        new.raw_user_meta_data ->> 'imageUrl',
        new.raw_user_meta_data ->> 'avatar_url',
        new.raw_user_meta_data ->> 'picture'
      ),
    new.email
  )
  on conflict (id) do update
    set username = excluded.username,
        imageurl = excluded.imageurl,
        email = excluded.email,
        updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.servers enable row level security;
alter table public.members enable row level security;
alter table public.channels enable row level security;
alter table public.messages enable row level security;
alter table public.conversations enable row level security;
alter table public.direct_messages enable row level security;
alter table public.banned_users enable row level security;
alter table public.voice_channel_presence enable row level security;

create policy "profiles_select_authenticated"
on public.profiles
for select
using (auth.role() = 'authenticated');

create policy "profiles_update_own"
on public.profiles
for update
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "servers_select_member_only"
on public.servers
for select
using (
  exists (
    select 1
    from public.members m
    where m.serverid = servers.id
      and m.profileid = auth.uid()
  )
);

-- Allow anyone to view server info by invite code (for invite page)
create policy "servers_select_by_invitecode"
on public.servers
for select
using (invitecode is not null);

create policy "servers_insert_owner"
on public.servers
for insert
with check (profileid = auth.uid());

-- Allow server owner and admins to update server
create policy "servers_update_owner_or_admin"
on public.servers
for update
using (
  profileid = auth.uid() or
  exists (
    select 1
    from public.members m
    where m.serverid = servers.id
      and m.profileid = auth.uid()
      and m.role in ('ADMIN', 'MODERATOR')
  )
)
with check (
  profileid = auth.uid() or
  exists (
    select 1
    from public.members m
    where m.serverid = servers.id
      and m.profileid = auth.uid()
      and m.role in ('ADMIN', 'MODERATOR')
  )
);

-- Allow only server owner to delete server
create policy "servers_delete_owner_only"
on public.servers
for delete
using (profileid = auth.uid());

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

create policy "voice_presence_select_server_members"
on public.voice_channel_presence
for select
using (public.is_server_member(serverid));

create policy "voice_presence_insert_own"
on public.voice_channel_presence
for insert
with check (auth.uid() = profileid and public.is_server_member(serverid));

create policy "voice_presence_update_own"
on public.voice_channel_presence
for update
using (auth.uid() = profileid and public.is_server_member(serverid))
with check (auth.uid() = profileid and public.is_server_member(serverid));

create policy "voice_presence_delete_own"
on public.voice_channel_presence
for delete
using (auth.uid() = profileid and public.is_server_member(serverid));

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

-- Allow users to delete their own membership (leave server)
-- Note: Server owner should not be able to delete their membership
create policy "members_delete_self"
on public.members
for delete
using (
  profileid = auth.uid()
  and not public.is_server_owner(members.serverid, auth.uid())
);

create policy "channels_select_server_member"
on public.channels
for select
using (
  exists (
    select 1
    from public.members m
    where m.serverid = channels.serverid
      and m.profileid = auth.uid()
  )
);

create policy "channels_insert_server_admin"
on public.channels
for insert
with check (
  exists (
    select 1
    from public.members m
    where m.serverid = channels.serverid
      and m.profileid = auth.uid()
      and m.role in ('ADMIN', 'MODERATOR')
  )
);

create policy "channels_update_server_admin"
on public.channels
for update
using (
  exists (
    select 1
    from public.members m
    where m.serverid = channels.serverid
      and m.profileid = auth.uid()
      and m.role in ('ADMIN', 'MODERATOR')
  )
  or public.is_server_owner(channels.serverid, auth.uid())
)
with check (
  exists (
    select 1
    from public.members m
    where m.serverid = channels.serverid
      and m.profileid = auth.uid()
      and m.role in ('ADMIN', 'MODERATOR')
  )
  or public.is_server_owner(channels.serverid, auth.uid())
);

create policy "channels_delete_server_admin"
on public.channels
for delete
using (
  exists (
    select 1
    from public.members m
    where m.serverid = channels.serverid
      and m.profileid = auth.uid()
      and m.role in ('ADMIN', 'MODERATOR')
  )
  or public.is_server_owner(channels.serverid, auth.uid())
);

create policy "messages_select_channel_member"
on public.messages
for select
using (
  exists (
    select 1
    from public.channels c
    join public.members m on m.serverid = c.serverid
    where c.id = messages.channelid
      and m.profileid = auth.uid()
  )
);

create policy "messages_insert_channel_member"
on public.messages
for insert
with check (
  exists (
    select 1
    from public.members m
    where m.id = memberid
      and m.profileid = auth.uid()
      and m.serverid = (
        select c.serverid from public.channels c where c.id = channelid
      )
  )
);

create policy "messages_update_own"
on public.messages
for update
using (
  exists (
    select 1
    from public.members m
    where m.id = messages.memberid
      and m.profileid = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.members m
    where m.id = messages.memberid
      and m.profileid = auth.uid()
  )
);

-- Allow ADMINs and MODERATORs to update any message in their server
create policy "messages_update_admin_moderator"
on public.messages
for update
using (
  exists (
    select 1
    from public.channels c
    join public.members m on m.serverid = c.serverid
    where c.id = messages.channelid
      and m.profileid = auth.uid()
      and m.role in ('ADMIN', 'MODERATOR')
  )
)
with check (
  exists (
    select 1
    from public.channels c
    join public.members m on m.serverid = c.serverid
    where c.id = messages.channelid
      and m.profileid = auth.uid()
      and m.role in ('ADMIN', 'MODERATOR')
  )
);

-- Allow channel members to vote on polls
create policy "messages_update_poll_vote"
on public.messages
for update
using (
  poll_data is not null
  and exists (
    select 1
    from public.channels c
    join public.members m on m.serverid = c.serverid
    where c.id = messages.channelid
      and m.profileid = auth.uid()
  )
)
with check (
  poll_data is not null
  and exists (
    select 1
    from public.channels c
    join public.members m on m.serverid = c.serverid
    where c.id = messages.channelid
      and m.profileid = auth.uid()
  )
);

-- Global channel message pins
create table if not exists public.channel_message_pins (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  pinned_by_profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (message_id)
);

-- Global channel message reactions
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

create policy "conversations_select_participant"
on public.conversations
for select
using (
  exists (
    select 1
    from public.members m
    where m.id in (memberoneid, membertwoid)
      and m.profileid = auth.uid()
  )
);

create policy "conversations_insert_participant"
on public.conversations
for insert
with check (
  exists (
    select 1
    from public.members m
    where m.id in (memberoneid, membertwoid)
      and m.profileid = auth.uid()
  )
);

create policy "direct_messages_select_participant"
on public.direct_messages
for select
using (
  exists (
    select 1
    from public.conversations c
    join public.members m on m.id in (c.memberoneid, c.membertwoid)
    where c.id = direct_messages.conversationid
      and m.profileid = auth.uid()
  )
);

create policy "direct_messages_insert_participant"
on public.direct_messages
for insert
with check (
  exists (
    select 1
    from public.conversations c
    join public.members participant on participant.id in (c.memberoneid, c.membertwoid)
    where c.id = conversationid
      and participant.profileid = auth.uid()
      and participant.id = memberid
  )
);

create index if not exists idx_members_serverid on public.members(serverid);
create index if not exists idx_members_profileid on public.members(profileid);
create index if not exists idx_channels_serverid_type on public.channels(serverid, type);
create index if not exists idx_channels_categoryid on public.channels(categoryid);
create index if not exists idx_messages_channelid_created_at on public.messages(channelid, created_at desc);
create index if not exists idx_direct_messages_conversationid_created_at on public.direct_messages(conversationid, created_at desc);

-- Discord-style friendships and DM system
do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'friendship_status' and n.nspname = 'public'
  ) then
    create type public.friendship_status as enum ('PENDING', 'ACCEPTED', 'BLOCKED');
  end if;
end $$;

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status public.friendship_status not null default 'PENDING',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requester_id <> addressee_id)
);

create unique index if not exists friendships_user_pair_unique
on public.friendships (
  least(requester_id::text, addressee_id::text),
  greatest(requester_id::text, addressee_id::text)
);

create table if not exists public.dm_channels (
  id uuid primary key default gen_random_uuid(),
  profile_one_id uuid not null references public.profiles(id) on delete cascade,
  profile_two_id uuid not null references public.profiles(id) on delete cascade,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (profile_one_id <> profile_two_id)
);

create unique index if not exists dm_channels_user_pair_unique
on public.dm_channels (
  least(profile_one_id::text, profile_two_id::text),
  greatest(profile_one_id::text, profile_two_id::text)
);

create table if not exists public.dm_channel_messages (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  fileurl text,
  author_id uuid not null references public.profiles(id) on delete cascade,
  dm_channel_id uuid not null references public.dm_channels(id) on delete cascade,
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at_friendships
before update on public.friendships
for each row execute procedure public.set_updated_at();

create trigger set_updated_at_dm_channels
before update on public.dm_channels
for each row execute procedure public.set_updated_at();

create trigger set_updated_at_dm_channel_messages
before update on public.dm_channel_messages
for each row execute procedure public.set_updated_at();

-- Update last_message_at when new DM is sent
create or replace function public.update_dm_channel_last_message()
returns trigger
language plpgsql
as $$
begin
  update public.dm_channels
  set last_message_at = new.created_at
  where id = new.dm_channel_id;
  return new;
end;
$$;

create trigger update_dm_channel_last_message_trigger
after insert on public.dm_channel_messages
for each row execute procedure public.update_dm_channel_last_message();

-- RLS policies
alter table public.friendships enable row level security;
alter table public.dm_channels enable row level security;
alter table public.dm_channel_messages enable row level security;

-- Friendships policies
create policy "friendships_select_own"
on public.friendships
for select
using (requester_id = auth.uid() or addressee_id = auth.uid());

create policy "friendships_insert_as_requester"
on public.friendships
for insert
with check (requester_id = auth.uid());

create policy "friendships_update_as_addressee"
on public.friendships
for update
using (addressee_id = auth.uid() or requester_id = auth.uid())
with check (addressee_id = auth.uid() or requester_id = auth.uid());

create policy "friendships_delete_own"
on public.friendships
for delete
using (requester_id = auth.uid() or addressee_id = auth.uid());

-- DM Channels policies
create policy "dm_channels_select_participant"
on public.dm_channels
for select
using (profile_one_id = auth.uid() or profile_two_id = auth.uid());

create policy "dm_channels_insert_participant"
on public.dm_channels
for insert
with check (profile_one_id = auth.uid() or profile_two_id = auth.uid());

create policy "dm_channels_update_participant"
on public.dm_channels
for update
using (profile_one_id = auth.uid() or profile_two_id = auth.uid());

-- DM Messages policies
create policy "dm_messages_select_participant"
on public.dm_channel_messages
for select
using (
  exists (
    select 1
    from public.dm_channels dc
    where dc.id = dm_channel_messages.dm_channel_id
      and (dc.profile_one_id = auth.uid() or dc.profile_two_id = auth.uid())
  )
);

-- Storage policies for file uploads
-- Allow authenticated users to upload files
create policy "storage_objects_insert_authenticated"
on storage.objects
for insert
with check (
  bucket_id = 'files' 
  and auth.role() = 'authenticated'
);

-- Allow anyone to read files (public access)
create policy "storage_objects_select_all"
on storage.objects
for select
using (bucket_id = 'files');

-- Allow users to update their own files
create policy "storage_objects_update_own"
on storage.objects
for update
using (
  bucket_id = 'files' 
  and auth.role() = 'authenticated'
);

-- Allow users to delete their own files
create policy "storage_objects_delete_own"
on storage.objects
for delete
using (
  bucket_id = 'files' 
  and auth.role() = 'authenticated'
);

create policy "dm_messages_insert_participant"
on public.dm_channel_messages
for insert
with check (
  author_id = auth.uid()
  and exists (
    select 1
    from public.dm_channels dc
    where dc.id = dm_channel_id
      and (dc.profile_one_id = auth.uid() or dc.profile_two_id = auth.uid())
  )
);

create policy "dm_messages_update_own"
on public.dm_channel_messages
for update
using (author_id = auth.uid())
with check (author_id = auth.uid());

-- Banned users policies
create policy "banned_users_select_admin"
on public.banned_users
for select
using (
  exists (
    select 1 
    from public.members m
    join public.servers s on s.id = m.serverid
    where m.serverid = banned_users.serverid
      and m.profileid = auth.uid()
      and (m.role in ('ADMIN', 'MODERATOR') or s.profileid = auth.uid())
  )
);

create policy "banned_users_insert_admin"
on public.banned_users
for insert
with check (
  exists (
    select 1 
    from public.members m
    join public.servers s on s.id = m.serverid
    where m.serverid = serverid
      and m.profileid = auth.uid()
      and (m.role in ('ADMIN', 'MODERATOR') or s.profileid = auth.uid())
  )
);

create policy "banned_users_delete_admin"
on public.banned_users
for delete
using (
  exists (
    select 1 
    from public.members m
    join public.servers s on s.id = m.serverid
    where m.serverid = banned_users.serverid
      and m.profileid = auth.uid()
      and (m.role in ('ADMIN', 'MODERATOR') or s.profileid = auth.uid())
  )
);

-- Indexes for performance
create index if not exists idx_friendships_requester on public.friendships(requester_id);
create index if not exists idx_friendships_addressee on public.friendships(addressee_id);
create index if not exists idx_friendships_status on public.friendships(status);
create index if not exists idx_dm_channels_profile_one on public.dm_channels(profile_one_id);
create index if not exists idx_dm_channels_profile_two on public.dm_channels(profile_two_id);
create index if not exists idx_dm_channels_last_message on public.dm_channels(last_message_at desc nulls last);
create index if not exists idx_dm_messages_channel_created on public.dm_channel_messages(dm_channel_id, created_at desc);
create index if not exists idx_banned_users_server on public.banned_users(serverid);
create index if not exists idx_banned_users_profile on public.banned_users(profileid);
