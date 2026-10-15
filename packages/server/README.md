# @tuix/server

Server-only identity signing for the existing Tuix widget. Requires Node.js 22.12+.
Browser builds cannot resolve its main entry point. MIT licensed.

```sh
npm install @tuix/server
```

```ts
import { signIdentity } from '@tuix/server';

const user = await getAuthenticatedUser(); // Your server's session lookup.
const identity = signIdentity(user && {
  id: user.id,
  name: user.name,
  email: user.emailVerified ? user.email : undefined,
}, { secret: process.env.TUIX_SECRET_KEY! });
```

Send only `identity` to the client. Never expose the secret through public environment
variables, client props or request logs. Never sign user IDs or emails taken directly
from a browser request. Signed emails are treated as verified addresses by Tuix;
omit email when the host cannot verify it. This helper does not authenticate users.

`signIdentity(user, { secret })` returns `{ id, name, hash, email? }`; null/undefined
users return null. IDs can be strings, safe integers or bigint (converted to strings).
The secret must contain at least 32 UTF-8 bytes. Invalid identities/configuration throw
`TypeError` without echoing their values. The input is not mutated and extra fields
are discarded. Limits match the Rails integration: ID/name 200 bytes, email 254 bytes.

Without an email, HMAC-SHA256 signs the exact ID (v1). With email, it signs the ID,
a newline and the trimmed, lowercased email (v2). Hashes are lowercase hex. Names
are display data, not signed claims. Shared test vectors verify the protocol across
Node, Rails and Phoenix. These hashes are stable identity proofs, not expiring sessions;
the host must clear browser identity at sign-out.

## Next.js

Use the guarded entry from a Server Component or server module, on the Node runtime:

```ts
import { signIdentity } from '@tuix/server/next';
```

It imports `server-only`, so Next.js reports accidental Client Component imports at
build time. Do not use `'use server'` to expose an arbitrary signing function as a
Server Action. Sign a trusted session identity on the server and pass the result to
`@tuix/react`. The plain entry is for Node servers, workers and scripts; this package
does not target the Edge runtime. See the repository's `examples/nextjs`.

## Checks

From the repository root, `npm test -w @tuix/server` checks signing and validation. `npm run typecheck -w
@tuix/server` checks TypeScript. The preparation command also verifies the packed
entry point and refuses browser bundling; it publishes nothing.
