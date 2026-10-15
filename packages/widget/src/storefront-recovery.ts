import { Api } from './api';
import type { StorefrontBoot, RecoveryReason } from './storefront';
import css from './widget.css?inline';
import { tokenCss } from './tokens';
import { isolateKeys } from './keys';
import fontUrl from '@fontsource-variable/karla/files/karla-latin-wght-normal.woff2?url';
import fontExtendedUrl from '@fontsource-variable/karla/files/karla-latin-ext-wght-normal.woff2?url';

const copy = {
  en: {
    title: 'Sign in to review', close: 'Close', open: 'Open reviewer sign-in', email: 'Invited email address',
    signin: 'Use the email address invited by this store’s team. Review mode is for invited reviewers only.',
    expired: 'Your reviewer link or session is no longer valid. Request a new sign-in link.',
    unavailable: 'Review mode could not start. Request a new sign-in link when your connection is available.',
    send: 'Send a sign-in link', sending: 'Sending…',
    accepted: 'If this address has an active invitation, a sign-in link will arrive by email. Check your inbox and spam folder.',
    error: 'The request could not be sent. Check your connection and try again. Your email is still here.',
  },
  pl: {
    title: 'Zaloguj się do recenzji', close: 'Zamknij', open: 'Otwórz logowanie recenzenta', email: 'Zaproszony adres e-mail',
    signin: 'Użyj adresu e-mail zaproszonego przez zespół sklepu. Tryb recenzji jest dostępny tylko dla zaproszonych osób.',
    expired: 'Link lub sesja recenzenta nie są już ważne. Poproś o nowy link do logowania.',
    unavailable: 'Nie udało się uruchomić trybu recenzji. Poproś o nowy link, gdy połączenie będzie dostępne.',
    send: 'Wyślij link do logowania', sending: 'Wysyłanie…',
    accepted: 'Jeśli ten adres ma aktywne zaproszenie, otrzymasz e-mail z linkiem do logowania. Sprawdź skrzynkę odbiorczą i spam.',
    error: 'Nie udało się wysłać prośby. Sprawdź połączenie i spróbuj ponownie. Adres e-mail został zachowany.',
  },
};

/** Review intent only: this never identifies a reviewer or loads capture/pin modules. */
export function mountStorefrontRecovery(config: Pick<StorefrontBoot, 'project' | 'api' | 'nonce'>, reason: RecoveryReason) {
  const text = navigator.language.startsWith('pl') ? copy.pl : copy.en;
  const previousFocus = document.activeElement as HTMLElement | null;
  const host = document.createElement('tuix-review-signin');
  host.style.cssText = 'all:initial!important;position:fixed!important;inset:0!important;z-index:2147483646!important;pointer-events:none!important;';
  const root = host.attachShadow({ mode: 'closed' }); isolateKeys(root);
  const style = document.createElement('style');
  if (config.nonce) style.nonce = config.nonce;
  style.textContent = tokenCss + css + ".tuix-app .review-launcher{position:fixed;right:16px;bottom:calc(16px + env(safe-area-inset-bottom,0px));width:44px;min-height:44px;height:44px;padding:0;border-radius:50%;font:700 13px/1 system-ui,-apple-system,'Segoe UI',sans-serif;letter-spacing:-.04em;box-shadow:0 12px 28px -10px rgba(0,0,0,.55),0 0 22px 2px var(--tx-glow)}.tuix-app .review-message{margin-top:16px}.tuix-app .review-message.error{color:var(--tx-err)}";
  const fonts: FontFace[] = [];
  if (typeof FontFace !== 'undefined') {
    for (const url of [fontUrl, fontExtendedUrl]) {
      const font = new FontFace('Tuix Karla', `url('${url}')`, { weight: '200 800', unicodeRange: url === fontUrl ? 'U+0000-00FF,U+2000-206F,U+20AC' : 'U+0100-1EFF,U+20A0-20FF' });
      document.fonts.add(font); fonts.push(font); void font.load().catch(() => {});
    }
  }
  const app = document.createElement('div'); app.className = 'tuix-app';
  const panel = document.createElement('section'); panel.className = 'panel'; panel.setAttribute('aria-labelledby', 'review-signin-title');
  const header = document.createElement('header');
  const title = document.createElement('h2'); title.id = 'review-signin-title'; title.textContent = text.title;
  const close = document.createElement('button'); close.type = 'button'; close.textContent = text.close;
  const content = document.createElement('div'); content.className = 'content';
  const explanation = document.createElement('p'); explanation.textContent = text[reason];
  const form = document.createElement('form');
  const label = document.createElement('label'); label.textContent = text.email;
  const email = document.createElement('input'); email.type = 'email'; email.name = 'email'; email.autocomplete = 'email'; email.required = true; email.maxLength = 254;
  label.append(email);
  const submit = document.createElement('button'); submit.type = 'submit'; submit.className = 'primary'; submit.textContent = text.send;
  const status = document.createElement('p'); status.className = 'review-message'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const launcher = document.createElement('button'); launcher.type = 'button'; launcher.className = 'review-launcher primary'; launcher.textContent = 'tuix.'; launcher.setAttribute('aria-label', text.open); launcher.setAttribute('aria-expanded', 'true');
  let alive = true, pending: Api | undefined;
  const hide = () => { panel.hidden = true; launcher.setAttribute('aria-expanded', 'false'); launcher.focus(); };
  close.onclick = hide;
  launcher.onclick = () => { panel.hidden = false; launcher.setAttribute('aria-expanded', 'true'); email.focus(); };
  root.addEventListener('keydown', event => { if ((event as KeyboardEvent).key === 'Escape' && !panel.hidden) { event.preventDefault(); hide(); } });
  form.onsubmit = async event => {
    event.preventDefault();
    if (pending || !form.checkValidity()) return;
    submit.disabled = true; submit.textContent = text.sending; status.textContent = ''; status.classList.remove('error');
    try {
      pending = new Api({ ...config, environment: 'production' }, { id: 'signin', name: 'Reviewer' });
      await pending.request('/shopify/reviewer/request-link', 'POST', { email: email.value.trim() }, false);
      if (alive) { email.value = ''; status.textContent = text.accepted; }
    } catch {
      if (alive) { status.textContent = text.error; status.classList.add('error'); }
    } finally {
      pending?.destroy(); pending = undefined;
      if (alive) { submit.disabled = false; submit.textContent = text.send; }
    }
  };
  header.append(title, close); form.append(label, submit); content.append(explanation, form, status); panel.append(header, content); app.append(panel, launcher); root.append(style, app);
  (document.body ?? document.documentElement).append(host); email.focus();
  return () => { alive = false; pending?.destroy(); host.remove(); for (const font of fonts) document.fonts.delete(font); if (previousFocus?.isConnected) previousFocus.focus(); };
}
