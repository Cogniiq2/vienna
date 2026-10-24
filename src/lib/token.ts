/** Lokaler Demo-Token (nur ohne Supabase oder im Dev-Server). */
export const DEMO_TOKEN = 'demo';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{24,128}$/;

export function isValidTokenFormat(token: string): boolean {
  return TOKEN_PATTERN.test(token);
}

/** Liest den Token aus /trip/<token>. */
export function parseTripToken(pathname: string): string | null {
  const match = /^\/trip\/([^/?#]+)\/?$/.exec(pathname);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}
