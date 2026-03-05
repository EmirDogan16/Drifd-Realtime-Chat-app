-- Add banned_users table for server bans
create table if not exists public.banned_users (
  id uuid primary key default gen_random_uuid(),
  serverid uuid not null references public.servers(id) on delete cascade,
  profileid uuid not null references public.profiles(id) on delete cascade,
  banned_by uuid not null references public.profiles(id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  unique (serverid, profileid)
);

-- Add RLS policies for banned_users
alter table public.banned_users enable row level security;

-- Server admins can view bans
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

-- Server admins can insert bans
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

-- Server admins can delete bans
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

-- Add indexes
create index if not exists idx_banned_users_server on public.banned_users(serverid);
create index if not exists idx_banned_users_profile on public.banned_users(profileid);
