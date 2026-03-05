#!/usr/bin/env node
import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env.local explicitly
dotenv.config({ path: join(__dirname, '..', '.env.local') });

const { Client } = pg;

// Use connection object instead of URL to avoid encoding issues
const connectionConfig = {
  host: process.env.SUPABASE_DB_HOST,
  port: parseInt(process.env.SUPABASE_DB_PORT || '5432'),
  user: process.env.SUPABASE_DB_USER,
  password: process.env.SUPABASE_DB_PASSWORD,
  database: process.env.SUPABASE_DB_NAME,
  ssl: { rejectUnauthorized: false }
};

const client = new Client(connectionConfig);

const migration = `
-- Drop old policy if exists
DROP POLICY IF EXISTS "servers_select_by_invitecode" ON public.servers;

-- Allow anyone to view server info by invite code (for invite page)
CREATE POLICY "servers_select_by_invitecode"
ON public.servers
FOR SELECT
USING (invitecode IS NOT NULL);
`;

async function main() {
  try {
    console.log('🔄 Adding invite code policy to servers table...');
    await client.connect();
    await client.query(migration);
    console.log('✅ Policy added successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
