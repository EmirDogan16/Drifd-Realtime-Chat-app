-- Add UPDATE and DELETE RLS policies for channels table
-- This fixes the issue where channel settings (name, bitrate, video_quality) cannot be updated
-- Run this SQL in Supabase Dashboard > SQL Editor

-- Add UPDATE policy (allows server owners and admins/moderators to update channels)
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

-- Add DELETE policy (allows server owners and admins/moderators to delete channels)
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

-- Verify policies were created successfully
SELECT schemaname, tablename, policyname, cmd 
FROM pg_policies 
WHERE tablename = 'channels'
ORDER BY cmd;
