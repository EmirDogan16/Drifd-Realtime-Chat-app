-- ========================================
-- APPLY THIS IN SUPABASE SQL EDITOR
-- ========================================

-- Step 1: Add category_names column to servers table
ALTER TABLE public.servers 
ADD COLUMN IF NOT EXISTS category_names JSONB DEFAULT '{}'::jsonb;

-- Step 2: Add categoryid column to channels table  
ALTER TABLE public.channels
ADD COLUMN IF NOT EXISTS categoryid TEXT;

-- Step 3: Create index for performance
CREATE INDEX IF NOT EXISTS idx_channels_categoryid 
ON public.channels(categoryid);

-- Step 4: Initialize existing servers
UPDATE public.servers 
SET category_names = '{}'::jsonb 
WHERE category_names IS NULL;

-- Step 5: Verify the changes
SELECT 
  'servers.category_names' as column_check,
  COUNT(*) as exists
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'servers' 
  AND column_name = 'category_names';

SELECT 
  'channels.categoryid' as column_check,
  COUNT(*) as exists
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'channels' 
  AND column_name = 'categoryid';
