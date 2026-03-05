-- Check if channels table has bitrate and video_quality columns
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'channels'
ORDER BY ordinal_position;
