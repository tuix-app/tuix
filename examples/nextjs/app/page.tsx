import { Tuix } from '@tuix/react';
import { signIdentity } from '@tuix/server/next';
import { getCurrentUser } from '../lib/auth';

// Identity is request-specific. This example deliberately does not cache it in a
// shared layout, a static page, unstable_cache or a "use cache" function.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function Page() {
  const currentUser = await getCurrentUser();
  const project = process.env.TUIX_PROJECT_KEY;
  const secret = process.env.TUIX_SECRET_KEY;
  const identity = currentUser && project && secret ? signIdentity({
    id: currentUser.id,
    name: currentUser.name,
    // Only sign an email address the host application has verified.
    email: currentUser.emailVerified ? currentUser.email : undefined,
  }, { secret }) : null;

  return <main>
    <h1>Tuix for Next.js</h1>
    <p>Feedback is available to authenticated users after the server integration is configured.</p>
    {project && <Tuix config={{
      project,
      api: process.env.TUIX_API_URL ?? 'https://tuix.app',
      environment: process.env.TUIX_ENVIRONMENT ?? 'uat',
    }} user={identity} />}
  </main>;
}
