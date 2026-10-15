'use client';

import { useEffect } from 'react';
import type { Config } from '@tuix/widget';
import { loadWidget } from './runtime.js';

export type TuixConfig = Config;
export interface TuixIdentity { id: string; name: string; email?: string; hash: string }
export interface TuixProps {
  /** Keep this object stable (module scope or useMemo) to preserve open feedback across renders. */
  config: TuixConfig;
  /** Signed by your server. Pass null as soon as the host signs out or revokes access. */
  user: TuixIdentity | null;
  onError?: (error: Error) => void;
}

// The existing SDK is a singleton. An overlapping mount must never take another
// component's identity or destroy its widget during cleanup.
let owner: object | undefined;

/** Mount once in the authenticated application shell. Renders no server HTML. */
export function Tuix({ config, user, onError }: TuixProps): null {
  const id = user?.id, name = user?.name, email = user?.email, hash = user?.hash;
  const active = user != null && config.enabled !== false;
  useEffect(() => {
    if (!active) return;
    const report = (error: Error) => {
      try { onError?.(error); } catch { /* Host error reporting must not create unhandled loader rejections. */ }
    };
    if (!id || !name || !/^[a-f0-9]{64}$/.test(hash ?? '')) {
      report(new Error('Tuix requires an identity signed by the host server'));
      return;
    }
    if (owner) {
      report(new Error('Mount only one Tuix component per application'));
      return;
    }
    const lease = {};
    owner = lease;
    let widget: Awaited<ReturnType<typeof loadWidget>> | undefined;
    // Import only in an effect: SSR and anonymous pages never evaluate the SDK.
    void loadWidget().then(runtime => {
      if (owner !== lease) return;
      widget = runtime;
      runtime.destroy();
      runtime.init(config);
      runtime.identify({ id, name, ...(email === undefined ? {} : { email }), hash });
    }).catch(() => {
      if (owner === lease) report(new Error('Tuix widget could not be loaded'));
    });
    return () => {
      if (owner !== lease) return;
      owner = undefined;
      widget?.destroy();
    };
  // Scalar identity dependencies avoid restarting for equivalent server identity objects.
  }, [config, id, name, email, hash, onError, active]);
  return null;
}

