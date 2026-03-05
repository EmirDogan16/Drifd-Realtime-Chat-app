-- Add category support to the database

-- Add category_names to servers table
alter table public.servers 
add column if not exists category_names jsonb default '{}'::jsonb;

-- Add categoryid to channels table
alter table public.channels
add column if not exists categoryid text;

-- Add index for faster category queries
create index if not exists channels_categoryid_idx on public.channels(categoryid);

-- Update existing servers to have empty category_names
update public.servers 
set category_names = '{}'::jsonb 
where category_names is null;

-- Verification queries
select 'servers table' as table_name, column_name, data_type 
from information_schema.columns 
where table_name = 'servers' and column_name in ('category_order', 'category_names');

select 'channels table' as table_name, column_name, data_type 
from information_schema.columns 
where table_name = 'channels' and column_name = 'categoryid';
