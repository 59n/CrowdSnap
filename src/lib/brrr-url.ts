const SECRET_RE = /^br_[a-z0-9]+_[A-Za-z0-9]+$/i;

/** Accept a brrr webhook URL or a pasted `br_usr_` / `br_dev_` secret. Reject anything else (SSRF). */
export function parseBrrrWebhook(raw: string): { secret: string } | null {
  const v = (raw || '').trim();
  if (!v) return null;
  if (SECRET_RE.test(v)) return { secret: v };

  let url: URL;
  try {
    url = new URL(v);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (url.hostname !== 'api.brrr.now') return null;
  if (url.port) return null;
  if (url.username || url.password) return null;

  const m = url.pathname.match(/^\/v1\/(br_[a-z0-9]+_[A-Za-z0-9]+)$/i);
  if (!m) return null;
  return { secret: m[1] };
}
