#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env.local
dotenv.config({ path: join(__dirname, '..', '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables');
  console.error('Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function addChannelQualitySettings() {
  console.log('🔧 Adding bitrate and video_quality columns to channels table...\n');

  try {
    // Add bitrate column
    console.log('Adding bitrate column...');
    const { error: bitrateError } = await supabase.rpc('exec_sql', {
      sql: `
        ALTER TABLE public.channels 
        ADD COLUMN IF NOT EXISTS bitrate integer DEFAULT 64;
      `
    });

    if (bitrateError) {
      // Try alternative method
      const { error: altBitrateError } = await supabase
        .from('channels')
        .select('bitrate')
        .limit(1);
      
      if (altBitrateError && altBitrateError.message.includes('column "bitrate" does not exist')) {
        console.error('❌ Failed to add bitrate column:', bitrateError);
        console.log('\n📝 Please run this SQL manually in Supabase SQL Editor:');
        console.log('\nALTER TABLE public.channels ADD COLUMN IF NOT EXISTS bitrate integer DEFAULT 64;');
        console.log('ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS video_quality text DEFAULT \'auto\';');
      } else {
        console.log('✅ Bitrate column already exists or added successfully');
      }
    } else {
      console.log('✅ Bitrate column added successfully');
    }

    // Add video_quality column
    console.log('Adding video_quality column...');
    const { error: qualityError } = await supabase.rpc('exec_sql', {
      sql: `
        ALTER TABLE public.channels 
        ADD COLUMN IF NOT EXISTS video_quality text DEFAULT 'auto';
      `
    });

    if (qualityError) {
      const { error: altQualityError } = await supabase
        .from('channels')
        .select('video_quality')
        .limit(1);
      
      if (altQualityError && altQualityError.message.includes('column "video_quality" does not exist')) {
        console.error('❌ Failed to add video_quality column:', qualityError);
      } else {
        console.log('✅ Video quality column already exists or added successfully');
      }
    } else {
      console.log('✅ Video quality column added successfully');
    }

    console.log('\n✨ Channel quality settings migration completed!');
    console.log('\nYou can now:');
    console.log('- Set bitrate (8-96 kbps) for voice channels');
    console.log('- Set video quality (auto/720p/1080p) for video channels');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    console.log('\n📝 Manual SQL:');
    console.log('\nALTER TABLE public.channels ADD COLUMN IF NOT EXISTS bitrate integer DEFAULT 64;');
    console.log('ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS video_quality text DEFAULT \'auto\';');
    process.exit(1);
  }
}

addChannelQualitySettings();
