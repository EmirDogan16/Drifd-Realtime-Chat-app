import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function createTestUser() {
  const username = 'mrmonica';
  const email = 'mrmonica@test.local';
  const password = 'Monica123!';

  console.log('\n🔄 Creating test user...\n');

  // Create user with admin API
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: email,
    password: password,
    email_confirm: true, // Auto-confirm email
    user_metadata: {
      username: username
    }
  });

  if (authError) {
    console.error('❌ Error creating user:', authError.message);
    process.exit(1);
  }

  console.log('✅ Test user created!\n');
  console.log('═══════════════════════════════════════');
  console.log('📝 Test Account Details:');
  console.log('═══════════════════════════════════════');
  console.log(`Username:  ${username}`);
  console.log(`Email:     ${email}`);
  console.log(`Password:  ${password}`);
  console.log(`User ID:   ${authData.user.id}`);
  console.log('═══════════════════════════════════════');
  console.log('\n🎯 Login at: http://localhost:3000\n');
}

createTestUser();
