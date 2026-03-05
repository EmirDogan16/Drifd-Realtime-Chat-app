import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const sql = readFileSync(join(__dirname, 'add-category-order.sql'), 'utf-8');

console.log('Adding category_order column to servers table...');

const { data, error } = await supabase.rpc('exec_sql', {
  sql_string: sql,
});

if (error) {
  console.error('Error:', error);
  process.exit(1);
}

console.log('✓ Successfully added category_order column');
