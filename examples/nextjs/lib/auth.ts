import 'server-only';

export interface AuthenticatedUser { id: string; name: string; email: string | null; emailVerified: boolean }

/** Replace this body with your application's authenticated server session lookup.
 * Keep the default anonymous until it is connected. Never read identity from
 * query strings or trust an unsigned cookie as an authenticated user.
 */
export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  return null;
}
