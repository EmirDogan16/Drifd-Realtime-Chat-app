import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { readFileSync } from 'fs';

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

async function addAdminMessageDeletePolicy() {
  console.log('Adding ADMIN/MODERATOR message delete policy...');

  const sql = readFileSync(resolve(__dirname, 'add-admin-message-delete-policy.sql'), 'utf-8');

  try {
    // Try using rpc if available
    const { error } = await supabase.rpc('exec_sql', { sql });
    
    if (error) {
      throw error;
    }
    
    console.log('✅ Policy added successfully!');
  } catch (error) {
    console.error('⚠️  Error adding policy via script:', error.message);
    console.log('\n📋 Please run this SQL manually in Supabase Dashboard > SQL Editor:\n');
    console.log(sql);
    console.log('\n');
  }
}

addAdminMessageDeletePolicy();
