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
  port: parseInt(process.env.SUPABASE_DB_PORT),
  user: process.env.SUPABASE_DB_USER,
  password: process.env.SUPABASE_DB_PASSWORD,
  database: process.env.SUPABASE_DB_NAME,
  ssl: { rejectUnauthorized: false }
};

console.log('Connection config:', {
  ...connectionConfig,
  password: '***'
});

const client = new Client(connectionConfig);

const migrationSQL = `
-- Discord-style friendships and DM system
DO $$ BEGIN
  CREATE TYPE public.friendship_status AS ENUM ('PENDING', 'ACCEPTED', 'BLOCKED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS public.friendships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  addressee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status public.friendship_status NOT NULL DEFAULT 'PENDING',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (requester_id <> addressee_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS friendships_user_pair_unique
ON public.friendships (
  least(requester_id::text, addressee_id::text),
  greatest(requester_id::text, addressee_id::text)
);

CREATE TABLE IF NOT EXISTS public.dm_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_one_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  profile_two_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (profile_one_id <> profile_two_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS dm_channels_user_pair_unique
ON public.dm_channels (
  least(profile_one_id::text, profile_two_id::text),
  greatest(profile_one_id::text, profile_two_id::text)
);

CREATE TABLE IF NOT EXISTS public.dm_channel_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content text NOT NULL,
  fileurl text,
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  dm_channel_id uuid NOT NULL REFERENCES public.dm_channels(id) ON DELETE CASCADE,
  deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS set_updated_at_friendships ON public.friendships;
CREATE TRIGGER set_updated_at_friendships
BEFORE UPDATE ON public.friendships
FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_dm_channels ON public.dm_channels;
CREATE TRIGGER set_updated_at_dm_channels
BEFORE UPDATE ON public.dm_channels
FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_dm_channel_messages ON public.dm_channel_messages;
CREATE TRIGGER set_updated_at_dm_channel_messages
BEFORE UPDATE ON public.dm_channel_messages
FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

-- Update last_message_at when new DM is sent
CREATE OR REPLACE FUNCTION public.update_dm_channel_last_message()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.dm_channels
  SET last_message_at = new.created_at
  WHERE id = new.dm_channel_id;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS update_dm_channel_last_message_trigger ON public.dm_channel_messages;
CREATE TRIGGER update_dm_channel_last_message_trigger
AFTER INSERT ON public.dm_channel_messages
FOR EACH ROW EXECUTE PROCEDURE public.update_dm_channel_last_message();

-- RLS policies
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dm_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dm_channel_messages ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS friendships_select_own ON public.friendships;
DROP POLICY IF EXISTS friendships_insert_as_requester ON public.friendships;
DROP POLICY IF EXISTS friendships_update_as_addressee ON public.friendships;
DROP POLICY IF EXISTS friendships_delete_own ON public.friendships;
DROP POLICY IF EXISTS dm_channels_select_participant ON public.dm_channels;
DROP POLICY IF EXISTS dm_channels_insert_participant ON public.dm_channels;
DROP POLICY IF EXISTS dm_messages_select_participant ON public.dm_channel_messages;
DROP POLICY IF EXISTS dm_messages_insert_participant ON public.dm_channel_messages;
DROP POLICY IF EXISTS dm_messages_update_own ON public.dm_channel_messages;

-- Friendships policies
CREATE POLICY friendships_select_own
ON public.friendships
FOR SELECT
USING (requester_id = auth.uid() OR addressee_id = auth.uid());

CREATE POLICY friendships_insert_as_requester
ON public.friendships
FOR INSERT
WITH CHECK (requester_id = auth.uid());

CREATE POLICY friendships_update_as_addressee
ON public.friendships
FOR UPDATE
USING (addressee_id = auth.uid() OR requester_id = auth.uid())
WITH CHECK (addressee_id = auth.uid() OR requester_id = auth.uid());

CREATE POLICY friendships_delete_own
ON public.friendships
FOR DELETE
USING (requester_id = auth.uid() OR addressee_id = auth.uid());

-- DM Channels policies
CREATE POLICY dm_channels_select_participant
ON public.dm_channels
FOR SELECT
USING (profile_one_id = auth.uid() OR profile_two_id = auth.uid());

CREATE POLICY dm_channels_insert_participant
ON public.dm_channels
FOR INSERT
WITH CHECK (profile_one_id = auth.uid() OR profile_two_id = auth.uid());

-- DM Messages policies
CREATE POLICY dm_messages_select_participant
ON public.dm_channel_messages
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.dm_channels dc
    WHERE dc.id = dm_channel_messages.dm_channel_id
      AND (dc.profile_one_id = auth.uid() OR dc.profile_two_id = auth.uid())
  )
);

CREATE POLICY dm_messages_insert_participant
ON public.dm_channel_messages
FOR INSERT
WITH CHECK (
  author_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.dm_channels dc
    WHERE dc.id = dm_channel_id
      AND (dc.profile_one_id = auth.uid() OR dc.profile_two_id = auth.uid())
  )
);

CREATE POLICY dm_messages_update_own
ON public.dm_channel_messages
FOR UPDATE
USING (author_id = auth.uid())
WITH CHECK (author_id = auth.uid());

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_friendships_requester ON public.friendships(requester_id);
CREATE INDEX IF NOT EXISTS idx_friendships_addressee ON public.friendships(addressee_id);
CREATE INDEX IF NOT EXISTS idx_friendships_status ON public.friendships(status);
CREATE INDEX IF NOT EXISTS idx_dm_channels_profile_one ON public.dm_channels(profile_one_id);
CREATE INDEX IF NOT EXISTS idx_dm_channels_profile_two ON public.dm_channels(profile_two_id);
CREATE INDEX IF NOT EXISTS idx_dm_channels_last_message ON public.dm_channels(last_message_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_dm_messages_channel_created ON public.dm_channel_messages(dm_channel_id, created_at DESC);
`;

async function main() {
  try {
    await client.connect();
    console.log('🔄 Applying friends & DM tables migration...');
    
    await client.query(migrationSQL);
    
    console.log('✅ Migration complete!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    console.error('Stack:', error.stack);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
