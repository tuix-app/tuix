// Next.js diagnoses accidental imports into a Client Component at build time.
import 'server-only';
export { signIdentity } from './index.js';
export type { TrustedUser, SignedIdentity, SigningOptions } from './index.js';
