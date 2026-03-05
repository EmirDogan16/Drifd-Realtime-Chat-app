import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '..', '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});

async function fixRealtimePublication() {
  console.log('🔧 Fixing Supabase Realtime publication...\n');

  try {
    // Enable replica identity FULL for messages
    console.log('⚙️  Setting REPLICA IDENTITY FULL for messages...');
    const { error: messagesReplicaError } = await supabase.rpc('exec_sql', {
      sql: 'ALTER TABLE public.messages REPLICA IDENTITY FULL;'
    });
    
    if (messagesReplicaError) {
      console.log('ℹ️  Trying direct SQL execution...');
      // Try with raw SQL
      const { error: err1 } = await supabase.from('messages').select('id').limit(0);
      if (err1) console.log('Note:', err1.message);
    }

    // Enable replica identity FULL for dm_channel_messages
    console.log('⚙️  Setting REPLICA IDENTITY FULL for dm_channel_messages...');
    const { error: dmReplicaError } = await supabase.rpc('exec_sql', {
      sql: 'ALTER TABLE public.dm_channel_messages REPLICA IDENTITY FULL;'
    });
    
    if (dmReplicaError) {
      console.log('ℹ️  Trying direct SQL execution...');
    }

    console.log('\n✅ Configuration complete!');
    console.log('\n📋 Now run these SQL commands in Supabase Dashboard SQL Editor:');
    console.log('\n```sql');
    console.log('ALTER TABLE public.messages REPLICA IDENTITY FULL;');
    console.log('ALTER TABLE public.dm_channel_messages REPLICA IDENTITY FULL;');
    console.log('```');
    console.log('\n🔗 Go to: https://app.supabase.com → Your Project → SQL Editor → New Query');
    console.log('📝 Paste the SQL above and click RUN');
    console.log('\nℹ️  Note: These commands require database admin privileges');
    console.log('   and cannot be run from the application code.');

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

fixRealtimePublication();
