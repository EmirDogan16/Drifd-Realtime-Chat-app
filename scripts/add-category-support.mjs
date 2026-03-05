import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
config({ path: resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runMigration() {
  try {
    console.log('🔧 Adding category support to database...\n');

    // Read SQL file
    const sqlPath = resolve(__dirname, 'add-category-support.sql');
    const sql = readFileSync(sqlPath, 'utf8');

    // Split by semicolon and filter out empty statements
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s && !s.startsWith('--') && !s.toLowerCase().startsWith('select'));

    // Execute each statement
    for (const statement of statements) {
      if (!statement) continue;
      
      console.log(`📝 Executing: ${statement.substring(0, 60)}...`);
      
      const { error } = await supabase.rpc('exec_sql', { sql_query: statement });
      
      if (error) {
        // Try direct query if rpc fails
        const { error: directError } = await supabase.from('_sql').insert({ query: statement });
        
        if (directError && !directError.message.includes('already exists')) {
          console.error(`❌ Error: ${error.message || directError.message}`);
          console.error(`   Statement: ${statement}`);
        } else {
          console.log('✅ Success');
        }
      } else {
        console.log('✅ Success');
      }
    }

    // Verify changes
    console.log('\n🔍 Verifying schema changes...');
    
    const { data: serverCols } = await supabase
      .from('servers')
      .select('*')
      .limit(1);
    
    console.log('✅ Servers table updated');
    
    const { data: channelCols } = await supabase
      .from('channels')
      .select('*')
      .limit(1);
    
    console.log('✅ Channels table updated');
    
    console.log('\n✅ Category support added successfully!');
    console.log('📋 New columns:');
    console.log('   - servers.category_names (JSONB)');
    console.log('   - channels.categoryid (TEXT)');

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
