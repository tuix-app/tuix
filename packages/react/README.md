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
or Phoenix signer). It contains `id`, `name`, `hash`, optional verified `email` and, for a project that keeps groups apart, the signed `group` and `group_name`.
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
Project settings → Installation → Content Security Policy lists the exact sources,
including the screenshot style hash and the storage origin for uploads.

## Component names

Every report can carry the names of the components around the reported element, if their
root elements have a `data-tuix-component="Name"` attribute (see "Component names" in the
`@tuix/widget` README). `@tuix/react/babel` is a Babel plugin that adds it at build time to
the root host element of each component: function and arrow components whose name starts
with a capital letter (also inside `memo` and `forwardRef`) and classes with a `render()`
method. The name is the function, variable or class name. Fragments, other components and
non-JSX returns are left alone, because the child component stamps itself; so are elements
that already have the attribute. The attribute comes first, so one you write later on the
element, or in a `{...props}` spread, wins. The output is the same on the server and in the
browser, and nothing else in your code changes. Files under `node_modules` are skipped.
There are no options. To leave one component out, write `data-tuix-component={undefined}`
on its root element. The plugin stamps every lowercase tag, so leave out roots that are not
DOM elements, such as react-three-fiber's `<mesh>` or `<primitive>`.

With Vite 8 and `@vitejs/plugin-react` 6, which no longer runs Babel itself, add
`@rolldown/plugin-babel` (`npm install -D @rolldown/plugin-babel @babel/core`) and list it
before `react()`:

```js
// vite.config.js
import babel from '@rolldown/plugin-babel';
import react from '@vitejs/plugin-react';

export default {
  plugins: [babel({ plugins: ['@tuix/react/babel'] }), react()],
};
```

With `@vitejs/plugin-react` 5 or earlier, which has a `babel` option:

```js
plugins: [react({ babel: { plugins: ['@tuix/react/babel'] } })],
```

With any other Babel setup:

```js
// babel.config.js
module.exports = { plugins: ['@tuix/react/babel'] };
```

With the React Compiler, list `@tuix/react/babel` before `babel-plugin-react-compiler`; the
plugin finds nothing to stamp in code the compiler has already rewritten.

Install `@babel/core` as usual (7 or 8; it is an optional peer dependency and only the
build needs it). Babel 7 loads the plugin with `require`, which needs Node.js 20.19 or
22.12 or later.

Next.js 16 picks up a `babel.config.js` that uses the preset `next/babel`
(`{ presets: ['next/babel'], plugins: ['@tuix/react/babel'] }`) and, with Turbopack (its
default), keeps SWC for everything else. With `--webpack`, a Babel configuration turns SWC off
entirely and `next/font` then fails to build; do not add one there. Toolchains
that do not run Babel are not covered: `@vitejs/plugin-react-swc` and esbuild-only setups.
There, add `data-tuix-component` by hand on the components that matter.

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

## Version history

- **0.2.0**: adds the Babel plugin `@tuix/react/babel`, which adds `data-tuix-component` to components' root elements at build time.
- **0.1.1**: passes `group` and `group_name` from the signed identity on to the widget (identify v3, needs a Tuix server with identify v3). Pass the result of `signIdentity` as is; do not add a `group` of your own to the identity.
