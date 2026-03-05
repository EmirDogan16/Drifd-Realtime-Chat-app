'use client';

import { FormEvent, useState } from 'react';
import { useModalStore } from '@/hooks/use-modal-store';
import { createClient } from '@/utils/supabase/client';
import type { TablesInsert } from '@/types/supabase';

export function CreateServerModal() {
  const { isOpen, type, close } = useModalStore();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  if (!isOpen || type !== 'createServer') {
    return null;
  }

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    setErrorText(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setErrorText('Please sign in first.');
      setLoading(false);
      return;
    }

    // Ensure the `profiles` row exists (needed for FK servers.profileid -> profiles.id).
    // This uses a server route backed by SUPABASE_SERVICE_ROLE_KEY.
    try {
      const ensureRes = await fetch('/api/profile/ensure', {
        method: 'POST',
        credentials: 'include',
      });
      const ensureJson = (await ensureRes.json()) as { ok?: boolean; error?: string };
      if (!ensureRes.ok || ensureJson.ok !== true) {
        setErrorText(ensureJson.error || 'Failed to ensure profile');
        setLoading(false);
        return;
      }
    } catch (e) {
      setErrorText(e instanceof Error ? e.message : 'Failed to ensure profile');
      setLoading(false);
      return;
    }

    // IMPORTANT (RLS): servers SELECT is member-only. If we do `.insert(...).select('id')`
    // right away, it can fail because membership doesn't exist yet.
    // Workaround: generate the UUID client-side and insert with explicit `id`.
    const serverId = crypto.randomUUID();
    const inviteCode = crypto.randomUUID().slice(0, 8);
    const serverPayload: TablesInsert<'servers'> = {
      id: serverId,
      name: name.trim(),
      invitecode: inviteCode,
      profileid: user.id,
    };

    const { error: serverInsertError } = await supabase
      .schema('public')
      .from('servers')
      .insert(serverPayload);

    if (serverInsertError) {
      setErrorText(serverInsertError.message);
      setLoading(false);
      return;
    }

    const memberPayload: TablesInsert<'members'> = {
      serverid: serverId,
      profileid: user.id,
      role: 'ADMIN',
    };

    const { error: memberInsertError } = await supabase
      .schema('public')
      .from('members')
      .insert(memberPayload);

    if (memberInsertError) {
      setErrorText(memberInsertError.message);
      setLoading(false);
      return;
    }

    // Best-effort: create a default text channel so the user lands directly in chat.
    const defaultChannelId = crypto.randomUUID();
    const channelPayload: TablesInsert<'channels'> = {
      id: defaultChannelId,
      name: 'general',
      type: 'TEXT',
      serverid: serverId,
      profileid: user.id,
    };

    const { error: channelInsertError } = await supabase
      .schema('public')
      .from('channels')
      .insert(channelPayload);

    if (channelInsertError) {
      // Not fatal; user can still land in the server.
      // Keep a soft hint for debugging.
      // eslint-disable-next-line no-console
      console.warn('default channel insert failed', channelInsertError.message);
    }

    // Best-effort: also create a default voice channel.
    const voiceChannelPayload: TablesInsert<'channels'> = {
      id: crypto.randomUUID(),
      name: 'voice',
      type: 'AUDIO',
      serverid: serverId,
      profileid: user.id,
    };

    const { error: voiceChannelInsertError } = await supabase
      .schema('public')
      .from('channels')
      .insert(voiceChannelPayload);

    if (voiceChannelInsertError) {
      // Not fatal.
      // eslint-disable-next-line no-console
      console.warn('default voice channel insert failed', voiceChannelInsertError.message);
    }

    setName('');
    close();
    window.location.href = channelInsertError
      ? `/servers/${serverId}`
      : `/servers/${serverId}/channels/${defaultChannelId}`;

    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-lg border border-drifd-divider bg-drifd-secondary p-6 shadow-2xl">
        <h2 className="mb-2 text-xl font-bold text-white">Create Server</h2>
        <p className="mb-5 text-sm text-drifd-muted">Yeni bir sunucu oluştur ve ekibini davet et.</p>

        <form className="space-y-4" onSubmit={handleCreate}>
          <input
            className="w-full rounded-md border border-drifd-divider bg-drifd-tertiary px-3 py-2 text-sm text-drifd-text outline-none focus:border-drifd-primary"
            placeholder="Server name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="rounded-md px-4 py-2 text-sm text-drifd-muted hover:bg-drifd-hover"
              onClick={close}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-md bg-drifd-primary px-4 py-2 text-sm font-semibold text-black disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create'}
            </button>
          </div>

          {errorText ? <p className="text-xs text-drifd-muted">Error: {errorText}</p> : null}
        </form>
      </div>
    </div>
  );
}
