-- Enable Realtime for messages and dm_channel_messages tables
-- Run this in Supabase SQL Editor

-- Enable Realtime for messages table (server channel messages)
alter publication supabase_realtime add table messages;

-- Enable Realtime for dm_channel_messages table (direct messages)
alter publication supabase_realtime add table dm_channel_messages;

-- Verify the publication includes these tables
select * from pg_publication_tables where pubname = 'supabase_realtime';
