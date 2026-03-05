-- Channel Quality Settings Migration
-- Run this SQL in your Supabase SQL Editor

-- Add bitrate column (default 64 kbps)
ALTER TABLE public.channels 
ADD COLUMN IF NOT EXISTS bitrate integer DEFAULT 64;

-- Add video_quality column (default 'auto')
ALTER TABLE public.channels 
ADD COLUMN IF NOT EXISTS video_quality text DEFAULT 'auto';

-- Verify the columns were added
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'channels' 
AND column_name IN ('bitrate', 'video_quality');
