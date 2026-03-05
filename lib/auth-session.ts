export const REMEMBER_STORAGE_KEY = 'drifd_remember_until';
export const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export function rememberForThirtyDays() {
  if (typeof window === 'undefined') return;
  localStorage.setItem(REMEMBER_STORAGE_KEY, String(Date.now() + THIRTY_DAYS_MS));
}

export function clearRememberSession() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(REMEMBER_STORAGE_KEY);
}

export function isRememberExpired() {
  if (typeof window === 'undefined') return false;
  const raw = localStorage.getItem(REMEMBER_STORAGE_KEY);
  if (!raw) return false;
  const until = Number(raw);
  if (!Number.isFinite(until)) return false;
  return Date.now() > until;
}
