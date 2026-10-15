# Next.js App Router example

This runnable example uses React 19, Next.js 16, `@tuix/react`, `@tuix/server/next`
and the existing widget. It starts anonymously until you connect your authentication.

From the repository root:

```sh
npm ci
npm run build -w @tuix/widget
npm run build:integrations
cp examples/nextjs/.env.example examples/nextjs/.env.local
npm run dev -w @tuix/nextjs-example
```

Fill `.env.local` with a Tuix project's public key, server secret, API URL and
environment. Add the host's exact origin to that project. Keep the secret server-only;
never use `NEXT_PUBLIC_TUIX_SECRET_KEY`.

Replace `lib/auth.ts` with your authenticated server session lookup. Return null
for anonymous or unauthorized users. Set `emailVerified` only after your host has
verified that address. The page signs that identity with the Node helper and sends
only the signature and public configuration to the React component. It uses the
Node runtime and dynamic rendering to avoid sharing signed identities through a cache.
No endpoint accepts arbitrary browser identities for signing.

`app/page.tsx` keeps the example's identity in a request-rendered page. For a persistent
authenticated layout, connect the component to your client auth state and clear its
identity immediately on logout/access removal, then refresh the Next.js router after
updating the server session. Reused layouts alone do not provide live auth state.

Production build: `npm run build -w @tuix/nextjs-example`; run with
`npm run start -w @tuix/nextjs-example`. To copy this example into another repository,
install its packages from npm there: `npm install @tuix/widget @tuix/react @tuix/server server-only`.

`npm run test:next` builds a temporary copy with packaged dependencies and fictional
test authentication, then uses Chromium to check signing, client navigation, logout,
secret isolation and the `server-only` boundary. Its API responses are local fixtures;
customer authentication, real report submission and production CSP still need a host
application rollout check. The test does not modify this example's safe anonymous default.
