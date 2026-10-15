import { activateStorefront, type StorefrontBoot } from './storefront';
import { mountStorefrontRecovery } from './storefront-recovery';
const script = document.querySelector<HTMLScriptElement & { tuixBoot?: StorefrontBoot }>('script[data-tuix-storefront]');
const boot = script?.tuixBoot;
if (script) delete script.tuixBoot;
if (boot) {
  void activateStorefront(boot, reason => {
    try { mountStorefrontRecovery({ project: boot.project, api: boot.api, nonce: boot.nonce }, reason); }
    catch { /* Review UI failures must not escape into the host storefront. */ }
  }).catch(() => {}).finally(() => { delete boot.invitation; delete boot.session; });
}
