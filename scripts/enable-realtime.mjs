import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function enableRealtime() {
  console.log('Enabling Realtime for messages and dm_channel_messages tables...');

  try {
    // Enable realtime for messages table
    const { error: messagesError } = await supabase.rpc('exec_sql', {
      sql: `
        alter publication supabase_realtime add table messages;
      `
    });

    if (messagesError) {
      console.log('Messages table realtime error (may already be enabled):', messagesError.message);
    } else {
      console.log('✓ Realtime enabled for messages table');
    }

    // Enable realtime for dm_channel_messages table
    const { error: dmMessagesError } = await supabase.rpc('exec_sql', {
      sql: `
        alter publication supabase_realtime add table dm_channel_messages;
      `
    });

    if (dmMessagesError) {
      console.log('DM messages table realtime error (may already be enabled):', dmMessagesError.message);
    } else {
      console.log('✓ Realtime enabled for dm_channel_messages table');
    }

    console.log('\n✓ Realtime setup complete!');
    console.log('\nNote: If errors occurred, Realtime may already be enabled for these tables.');
    console.log('You can verify in Supabase Dashboard > Database > Replication');

  } catch (error) {
    console.error('Error enabling realtime:', error);
    console.log('\nAlternative: Enable Realtime manually in Supabase Dashboard:');
    console.log('1. Go to Database > Replication');
    console.log('2. Enable replication for "messages" and "dm_channel_messages" tables');
    process.exit(1);
  }
}

enableRealtime();
