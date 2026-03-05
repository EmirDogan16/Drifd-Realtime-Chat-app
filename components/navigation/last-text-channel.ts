export const LAST_TEXT_CHANNEL_PREFIX = 'drifd:lastTextChannel:';

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function getLastTextChannelId(serverId: string): string | null {
  if (typeof window === 'undefined') return null;
  if (!serverId || !isUuid(serverId)) return null;
  try {
    const raw = window.localStorage.getItem(`${LAST_TEXT_CHANNEL_PREFIX}${serverId}`);
    if (!raw) return null;
    const trimmed = raw.trim();
    // Validate that the stored channel ID is a valid UUID before returning it
    if (!trimmed || !isUuid(trimmed)) return null;
    return trimmed;
  } catch {
    return null;
  }
}

export function setLastTextChannelId(serverId: string, channelId: string) {
  if (typeof window === 'undefined') return;
  if (!serverId || !channelId || !isUuid(serverId) || !isUuid(channelId)) return;
  try {
    window.localStorage.setItem(`${LAST_TEXT_CHANNEL_PREFIX}${serverId}`, channelId);
  } catch {
    // ignore
  }
}
