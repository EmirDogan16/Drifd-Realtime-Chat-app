import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});

async function addChannelPosition() {
  console.log('Adding position field to channels table...');

  // Check if position column already exists
  const { data: columns, error: columnCheckError } = await supabase.rpc('exec_sql', {
    sql: `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = 'channels' 
        AND column_name = 'position'
    `
  });

  if (columnCheckError) {
    console.log('Trying direct approach...');
    // Try direct ALTER TABLE
    const { error: alterError } = await supabase.rpc('exec_sql', {
      sql: 'ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS position INTEGER NOT NULL DEFAULT 0'
    });

    if (alterError) {
      console.error('Error adding position column:', alterError);
      console.log('\nPlease run this SQL manually in Supabase Dashboard:');
      console.log('ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS position INTEGER NOT NULL DEFAULT 0;');
      console.log('\nThen update existing channel positions:');
      console.log(`UPDATE public.channels SET position = 0 WHERE position IS NULL OR position = 0;`);
      process.exit(1);
    }
  }

  console.log('✓ Position field added successfully');

  // Update existing channels to have sequential positions
  const { error: updateError } = await supabase.rpc('exec_sql', {
    sql: `
      WITH numbered_channels AS (
        SELECT id, serverid, type,
               ROW_NUMBER() OVER (PARTITION BY serverid, type ORDER BY created_at) - 1 AS new_position
        FROM public.channels
      )
      UPDATE public.channels c
      SET position = nc.new_position
      FROM numbered_channels nc
      WHERE c.id = nc.id
    `
  });

  if (updateError) {
    console.error('Error updating positions:', updateError);
    console.log('\nPlease run this SQL manually in Supabase Dashboard:');
    console.log(`
WITH numbered_channels AS (
  SELECT id, serverid, type,
         ROW_NUMBER() OVER (PARTITION BY serverid, type ORDER BY created_at) - 1 AS new_position
  FROM public.channels
)
UPDATE public.channels c
SET position = nc.new_position
FROM numbered_channels nc
WHERE c.id = nc.id;
    `);
    process.exit(1);
  }

  console.log('✓ Existing channel positions updated');
  console.log('\nMigration complete!');
}

addChannelPosition().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
