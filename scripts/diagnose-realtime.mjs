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

async function diagnoseRealtime() {
  console.log('🔍 Diagnosing Supabase Realtime Configuration...\n');

  try {
    // Check replica identity
    console.log('1️⃣ Checking REPLICA IDENTITY for messages...');
    const { data: messagesRI, error: messagesRIError } = await supabase
      .rpc('exec_sql', {
        sql: `
          SELECT relname, relreplident 
          FROM pg_class 
          WHERE relname IN ('messages', 'dm_channel_messages') 
          AND relnamespace = 'public'::regnamespace;
        `
      });
    
    if (messagesRIError) {
      console.log('   ⚠️  Cannot check via RPC, trying query...');
      
      // Try alternative query
      const { data: altCheck, error: altError } = await supabase
        .from('messages')
        .select('id')
        .limit(1);
      
      if (!altError) {
        console.log('   ✅ messages table accessible');
      }
    } else {
      console.log('   ✅ Replica identity check passed');
      console.log('   Data:', messagesRI);
    }

    // Check if tables are published
    console.log('\n2️⃣ Checking if tables are in supabase_realtime publication...');
    const { data: pubCheck, error: pubError } = await supabase
      .rpc('exec_sql', {
        sql: `
          SELECT schemaname, tablename 
          FROM pg_publication_tables 
          WHERE pubname = 'supabase_realtime' 
          AND tablename IN ('messages', 'dm_channel_messages');
        `
      });
    
    if (pubError) {
      console.log('   ⚠️  Cannot check publication via RPC');
    } else {
      console.log('   Publication tables:', pubCheck);
      if (!pubCheck || pubCheck.length === 0) {
        console.log('   ❌ PROBLEM: Tables NOT in supabase_realtime publication!');
        console.log('\n   📝 Run this SQL in Supabase Dashboard:');
        console.log('   ALTER PUBLICATION supabase_realtime ADD TABLE messages;');
        console.log('   ALTER PUBLICATION supabase_realtime ADD TABLE dm_channel_messages;');
      } else {
        console.log('   ✅ Tables are in publication');
      }
    }

    // Try to insert a test message and listen for it
    console.log('\n3️⃣ Testing real-time INSERT...');
    
    const testChannelId = 'test-realtime-' + Date.now();
    const testMemberId = 'test-member-' + Date.now();
    
    console.log('   Creating test subscription...');
    const channel = supabase.channel('test-channel');
    
    let receivedInsert = false;
    
    channel
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages'
        },
        (payload) => {
          console.log('   ✅ RECEIVED INSERT EVENT:', payload);
          receivedInsert = true;
        }
      )
      .subscribe((status) => {
        console.log('   Subscription status:', status);
      });

    // Wait for subscription
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('   Inserting test message...');
    const { data: insertData, error: insertError } = await supabase
      .from('messages')
      .insert({
        channelid: testChannelId,
        memberid: testMemberId,
        content: 'Test message for realtime',
        deleted: false
      })
      .select();

    if (insertError) {
      console.log('   ❌ Insert failed:', insertError.message);
    } else {
      console.log('   ✅ Message inserted:', insertData);
    }

    // Wait to see if we receive the event
    console.log('   Waiting 3 seconds for realtime event...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    if (receivedInsert) {
      console.log('\n   ✅✅✅ REALTIME IS WORKING! ✅✅✅');
    } else {
      console.log('\n   ❌❌❌ REALTIME NOT WORKING - NO INSERT EVENT RECEIVED ❌❌❌');
      console.log('\n   🔧 SOLUTION:');
      console.log('   1. Go to Supabase Dashboard → Database → Publications');
      console.log('   2. Toggle ON the "messages" (public schema) table');
      console.log('   3. Toggle ON the "dm_channel_messages" table');
      console.log('   4. Wait 10 seconds for changes to propagate');
      console.log('   5. Close browser completely and reopen');
    }

    // Cleanup
    await supabase.removeChannel(channel);
    if (insertData && insertData.length > 0) {
      await supabase.from('messages').delete().eq('id', insertData[0].id);
    }

    console.log('\n✅ Diagnostic complete!');

  } catch (error) {
    console.error('❌ Diagnostic error:', error.message);
  }
}

diagnoseRealtime();
