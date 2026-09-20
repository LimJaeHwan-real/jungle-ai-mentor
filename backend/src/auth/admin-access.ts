export function isAdminEmail(email: string | undefined, allowlist: string | undefined): boolean {
  if (!email || !allowlist) return false;
  const normalized = email.trim().toLowerCase();
  return allowlist.split(',').some((allowed) => allowed.trim().toLowerCase() === normalized);
}
