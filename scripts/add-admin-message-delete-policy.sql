-- Allow ADMINs and MODERATORs to update any message in their server
drop policy if exists "messages_update_admin_moderator" on public.messages;

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
