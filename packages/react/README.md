# @tuix/react

React 19 integration around `@tuix/widget`, including Next.js App Router. It adds
no second widget implementation. React and the existing widget remain peer dependencies.
MIT licensed.

```tsx
import { Tuix, type TuixIdentity } from '@tuix/react';

// Module scope or useMemo keeps open feedback intact during unrelated renders.
const config = { project: 'PUBLIC_PROJECT_KEY', api: 'https://tuix.app', environment: 'uat' };

export function Feedback({ identity }: { identity: TuixIdentity | null }) {
  return <Tuix config={config} user={identity} onError={reportFeedbackError} />;
}
```

Obtain `identity` from your authenticated backend using `@tuix/server` (or the Rails
or Phoenix signer). It contains `id`, `name`, `hash` and optional verified `email`.
Never compute a signature in the browser. Configure the exact application origin
in Tuix project settings and keep signed identity required.

Mount one component in the application shell and pass null when feedback is not
permitted or the user signs out. Configuration uses the SDK's `Config` type, including
environment, release, position, capture controls and CSP nonce. `config.enabled: false`
also disables the integration. Keep `config` and `onError` references stable; changing
them intentionally tears down and reinitializes the widget. Equivalent identity
objects do not restart it.

The component returns no HTML. It imports the SDK only after a signed-in client
mounts; server rendering and anonymous pages do not evaluate it. Cleanup handles
Strict Mode, unmounts, identity changes, disabled feedback and logout. A pending import
cannot restore a retired identity. Overlapping mounts report an error without taking
over the active widget. Avoid another Tuix script, Rails helper or manual SDK owner
in the same document.

Optional `onError(error)` reports invalid identity, conflicting mounts and import
failures. After a failed import, remount the component (for example with a retry key)
to retry. Once loaded, the widget manages its own API errors. The adapter leaves
the host page usable when feedback cannot load.

## Next.js and logout

The published JavaScript preserves `'use client'`, so a Server Component can import
`Tuix` directly. Use `@tuix/server/next` on the server and pass serializable config
and signed identity across the boundary. Keep callback configuration (`route`,
`context`, `onError`) inside a Client Component; functions cannot cross the boundary.

See `examples/nextjs` for a complete App Router example. Keep identity request-specific:
do not cache it in a static page or a shared server cache. A reused layout does not
automatically refresh authentication on navigation. On client-initiated logout, clear
the client identity to null immediately, complete the host logout and call
`router.refresh()` so server-rendered identity agrees. Do the same for access removal.
The adapter cannot infer changes in a host session it has not been told about.

The SDK handles its browser runtime and lazy chunks through the host bundler. Allow
those chunks, Tuix HTTP/WebSocket endpoints and configured storage in the host's CSP.
Pass the current document nonce via `config.nonce` when styles require one. Tuix →
Project settings → Install tuix → Content Security Policy lists the exact sources,
including the screenshot style hash and the storage origin for uploads.

## Install

In a React 19 application, install the adapter with the widget, its peer dependency:

```sh
npm install @tuix/widget @tuix/react
```

With Node.js or Next.js, add `@tuix/server` too, to sign identities on the server.

## Checks

From the repository root, `npm test -w @tuix/react` covers lifecycle races, Strict
Mode and SSR. `npm run prepare:js` packs the three packages and checks them installed
as a consumer would; `npm run test:next` then exercises them in Next.js.
