/**
 * Minimal admin gate for the /admin dashboard. A single shared secret in the
 * ADMIN_SECRET env var, sent by the dashboard as an `x-admin-secret` header and
 * checked here server-side. Suitable for a single trusted moderator over HTTPS.
 *
 * If ADMIN_SECRET is not set, admin is DISABLED entirely (fail closed) — there
 * is never an unprotected admin surface.
 */
export function adminConfigured(): boolean {
  return Boolean(process.env.ADMIN_SECRET);
}

export function isAdmin(req: Request): boolean {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return false;
  const provided = req.headers.get("x-admin-secret") ?? "";
  // Length check first, then compare — avoids leaking length via early return.
  if (provided.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < secret.length; i++) diff |= provided.charCodeAt(i) ^ secret.charCodeAt(i);
  return diff === 0;
}
