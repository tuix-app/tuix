import { Api, ApiError } from './api';
import { tuix } from './index';
import type { Config } from './types';

export interface StorefrontBoot {
  project: string; api?: string; invitation?: string; session?: string;
  template: string; handle: string; nonce?: string; signIn?: boolean;
}
interface ReviewerResponse {
  token: string; session?: string; expires_at: string; user: { id: string; name: string }; settings?: Partial<Config>;
}
type ShopifyWindow = Window & {
  Shopify?: { designMode?: boolean; tuix?: { template: string; handle: string } };
  ShopifyAnalytics?: { meta?: { page?: { pageType?: string }; product?: { handle?: string } } };
};

/** Liquid metadata preserves long merchant handles and normalizes localized paths to one route. */
export function storefrontRoute(template: string, handle: string): string {
  const routes: Record<string, string> = { product: 'products', collection: 'collections', page: 'pages', blog: 'blogs', article: 'blogs' };
  if (routes[template] && handle) return '/' + routes[template] + '/' + handle.split('/').map(encodeURIComponent).join('/');
  if (template === 'index') return '/';
  if (template === 'list-collections') return '/collections';
  return '/' + (/^[a-z][a-z_-]{0,39}$/.test(template) ? template : 'unknown');
}

export type RecoveryReason = 'signin' | 'expired' | 'unavailable';

export async function activateStorefront(boot: StorefrontBoot, recover?: (reason: RecoveryReason) => void): Promise<boolean> {
  const scope = window as ShopifyWindow;
  if (scope.Shopify?.designMode || !/^[a-zA-Z0-9_-]{1,128}$/.test(boot.project)) return false;
  if (boot.signIn) { recover?.('signin'); return false; }
  const credential = boot.invitation || boot.session;
  if (!credential || !/^[a-zA-Z0-9_-]{43}$/.test(credential)) return false;
  const config = { project: boot.project, api: boot.api, environment: 'production', nonce: boot.nonce };
  let api: Api | undefined;
  const cookieName = '__Host-tuix_review_' + boot.project;
  try {
    api = new Api(config, { id: 'bootstrap', name: 'Reviewer' });
    const result = await api.request<ReviewerResponse>('/shopify/reviewer/' + (boot.invitation ? 'consume' : 'refresh'), 'POST', { token: credential }, false);
    const session = boot.invitation ? result.session : boot.session;
    const remaining = Math.min(2_592_000, Math.floor((Date.parse(result.expires_at) - Date.now()) / 1000));
    if (!session || !/^[a-zA-Z0-9_-]{43}$/.test(session) || !Number.isFinite(remaining) || remaining <= 0 ||
        typeof result.user?.id !== 'string' || typeof result.user?.name !== 'string') { recover?.('unavailable'); return false; }
    document.cookie = `${cookieName}=${session}; Path=/; Max-Age=${remaining}; Secure; SameSite=Lax`;
    // Capture starts only after core loads server settings; Shopify projects default diagnostics off.
    const display = result.settings;
    tuix.init({ ...config,
      position: display?.position === 'bottom-left' ? 'bottom-left' : 'bottom-right',
      showPinsOnLoad: display?.showPinsOnLoad === true,
      route: () => {
      const metadata = scope.Shopify?.tuix;
      const template = metadata?.template || scope.ShopifyAnalytics?.meta?.page?.pageType || boot.template;
      const handle = metadata?.handle || scope.ShopifyAnalytics?.meta?.product?.handle || boot.handle;
      return storefrontRoute(template, handle);
    } });
    tuix.identify({ id: result.user.id, name: result.user.name, reviewerSession: session });
    return true;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401 && boot.invitation && boot.session) {
      return activateStorefront({ ...boot, invitation: undefined }, recover);
    }
    if (error instanceof ApiError && [401, 403].includes(error.status)) {
      document.cookie = `${cookieName}=; Path=/; Max-Age=0; Secure; SameSite=Lax`;
    }
    recover?.(error instanceof ApiError && error.status === 401 ? 'expired' : 'unavailable');
    return false;
  } finally { api?.destroy(); }
}
