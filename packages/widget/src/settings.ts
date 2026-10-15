import { readPreferences, savePreferences, preferenceEvent, type OpenFilter } from './preferences';
import { readMarkers, saveMarkers } from './markers';
import { translations } from './i18n';
import { tokenCss } from './tokens';
import { VERSION } from './version';
import type { Config, Summary } from './types';

export interface SettingsOptions {
  /** Runs before the flyout opens; true when it dismissed a feedback panel (focus then stays on the toggle). */
  beforeOpen?: () => boolean | void;
  /** The flyout opened or closed. Opening lets the core render updates into `slot`. */
  onVisible?: (open: boolean) => void;
  /** A summary capsule segment was chosen. */
  onFilter?: (filter: OpenFilter) => void;
  /** The local Environment preference changed: the capsule counts follow the list it opens. */
  onEnvironment?: () => void;
}

/** Settings are deliberately independent of the API and diagnostic capture; the core fills `slot` with updates. */
export function mountSettings(root: ShadowRoot, launcher: HTMLButtonElement, config: Config, reports: () => void, changed: () => void, options: SettingsOptions = {}) {
  const { beforeOpen = () => {}, onVisible, onFilter, onEnvironment } = options;
  const t = translations(config.lang), left = config.position === 'bottom-left';
  const style = document.createElement('style');
  if (config.nonce) style.nonce = config.nonce;
  const side = left ? 'left' : 'right';
  const other = left ? 'right' : 'left';
  // The launcher opens a small menu on hover or focus: two dots rise out of it, Reports
  // nearest and Settings above. Only an explicit click opens the settings flyout.
  style.textContent = tokenCss + `.tuix-menu-dot{all:initial;box-sizing:border-box;position:fixed;${side}:20px;width:36px;height:36px;border-radius:50%;background:var(--tx-surface);color:var(--tx-ink);border:1px solid var(--tx-line);display:grid;place-items:center;cursor:pointer;pointer-events:none;opacity:0;visibility:hidden;transform:translateY(var(--from)) scale(.4);transition:opacity .2s ease-out var(--out,0s),transform .34s cubic-bezier(.3,1.35,.5,1) var(--out,0s),visibility 0s linear calc(.34s + var(--out,0s)),border-color .2s,box-shadow .2s;box-shadow:var(--tx-shadow-dot);z-index:11}.tuix-menu-dot svg{width:18px;height:18px;display:block}.tuix-reports-button{bottom:calc(68px + env(safe-area-inset-bottom,0px));--from:44px;--out:.04s}.tuix-settings-button{bottom:calc(112px + env(safe-area-inset-bottom,0px));--from:88px;--in:.05s}.tuix-menu-dot.revealed,.tuix-menu-dot[aria-expanded=true]{pointer-events:auto;opacity:1;visibility:visible;transform:none;transition-delay:var(--in,0s),var(--in,0s),0s,0s,0s}.tuix-menu-dot:hover,.tuix-menu-dot[aria-expanded=true]{border-color:var(--tx-peach);box-shadow:0 0 0 3px var(--tx-glow-soft),var(--tx-shadow-dot)}.tuix-menu-dot:focus-visible,.tuix-settings :focus-visible{outline:2px solid var(--tx-focus);outline-offset:3px}.tuix-menu-dot:after{content:attr(data-label);position:absolute;${other === 'left' ? 'right' : 'left'}:calc(100% + 10px);top:50%;transform:translateY(-50%);white-space:nowrap;padding:5px 9px;border-radius:8px;background:var(--tx-raised);color:var(--tx-ink);border:1px solid var(--tx-line);font:600 12px/1.2 var(--tx-font);opacity:0;transition:opacity .15s;pointer-events:none}.tuix-menu-dot:hover:after,.tuix-menu-dot:focus-visible:after{opacity:1}.tuix-menu-dot[aria-expanded=true]:after{opacity:0}.tuix-settings{box-sizing:border-box;position:fixed;bottom:calc(16px + env(safe-area-inset-bottom,0px));${side}:72px;width:min(280px,calc(100vw - 88px));padding:20px;background:var(--tx-surface);color:var(--tx-ink);border:1px solid var(--tx-line);border-radius:16px;box-shadow:var(--tx-shadow);pointer-events:auto;font:13px/1.5 var(--tx-font);z-index:10;max-height:calc(100vh - 32px);overflow:auto;overscroll-behavior:contain;scrollbar-color:var(--tx-line) transparent;animation:tuix-settings-in .3s cubic-bezier(.2,.8,.2,1)}.tuix-settings[hidden]{display:none}.tuix-settings button,.tuix-settings select{font:inherit;font-weight:600;color:inherit;cursor:pointer;padding:6px 11px;border:1.5px solid var(--tx-line-control);border-radius:999px;background:transparent;color-scheme:var(--tx-scheme)}.tuix-settings select{border-radius:10px;background:var(--tx-bg)}.tuix-settings button[aria-pressed=true]{background:var(--tx-s-open-bg);border-color:var(--tx-peach);color:var(--tx-ink)}.tuix-settings fieldset{border:0;padding:0;margin:0 0 20px;min-width:0;display:flex;flex-wrap:wrap;gap:6px}.tuix-settings legend{padding:0;margin-bottom:8px;font-weight:700;color:var(--tx-muted)}.tuix-settings label{display:block;margin:0 0 20px}.tuix-settings select{display:block;width:100%;margin-top:8px;appearance:none;background-image:var(--tx-chevron);background-repeat:no-repeat;background-size:10px 6px;background-position:right 12px center;padding-right:32px}.tuix-settings .tuix-setting-group{font-weight:700;color:var(--tx-muted)}.tuix-settings .tuix-setting-group select{color:var(--tx-ink)}.tuix-settings-updates{display:block;margin:0;padding-top:20px;border-top:1px solid var(--tx-line-soft)}.tuix-settings-updates:empty{display:none}@keyframes tuix-settings-in{from{opacity:0;transform:translateX(${left ? '-' : ''}10px)}to{opacity:1;transform:none}}@media(prefers-reduced-motion:reduce){.tuix-settings{animation:none}.tuix-menu-dot{transition:none}}@media(hover:none) and (pointer:coarse){.tuix-menu-dot{bottom:calc(20px + env(safe-area-inset-bottom,0px));transform:translateX(calc(${left ? -1 : 1} * var(--from))) scale(.4)}.tuix-reports-button{${side}:68px}.tuix-settings-button{${side}:112px}.tuix-menu-dot:after{display:none}.tuix-settings{bottom:calc(72px + env(safe-area-inset-bottom,0px));${side}:16px;width:min(300px,calc(100vw - 32px));max-height:calc(100vh - 88px)}}`;
  const button = document.createElement('button'), panel = document.createElement('section'), browse = document.createElement('button');
  const slot = document.createElement('div'), capsule = document.createElement('div');
  // One capsule beside the launcher: aqua "To verify", peach "Open", each opening Reports filtered to the caller.
  style.textContent += `.tuix-summary{box-sizing:border-box;position:fixed;${side}:68px;bottom:calc(20px + env(safe-area-inset-bottom,0px));display:flex;align-items:center;gap:2px;padding:3px;background:var(--tx-surface);border:1px solid var(--tx-line);border-radius:999px;box-shadow:var(--tx-shadow-dot);pointer-events:auto;z-index:9;font:700 12px/1 var(--tx-font);animation:tuix-summary-in .3s cubic-bezier(.2,.8,.2,1)}.tuix-summary button{all:initial;box-sizing:border-box;display:inline-flex;align-items:center;gap:6px;min-height:28px;padding:0 4px 0 10px;border-radius:999px;cursor:pointer;font:inherit;white-space:nowrap}.tuix-summary button:hover{background:var(--tx-raised)}.tuix-summary button:focus-visible{outline:2px solid var(--tx-focus);outline-offset:2px}.tuix-summary b{box-sizing:border-box;min-width:20px;height:20px;padding:0 6px;border-radius:999px;display:inline-grid;place-items:center;font-size:11.5px}.tuix-summary [data-summary=verify]{color:var(--tx-aqua-text)}.tuix-summary [data-summary=verify] b{background:var(--tx-aqua);color:var(--tx-on-aqua)}.tuix-summary [data-summary=open]{color:var(--tx-peach-text)}.tuix-summary [data-summary=open] b{background:var(--tx-peach);color:var(--tx-on-peach)}@keyframes tuix-summary-in{from{opacity:0;transform:translateX(${left ? '-' : ''}6px)}to{opacity:1;transform:none}}@media(prefers-reduced-motion:reduce){.tuix-summary{animation:none}}`;
  style.textContent += `
    .tuix-settings input[role=switch]{appearance:none;box-sizing:border-box;position:relative;display:inline-block;cursor:pointer;width:34px;height:20px;vertical-align:middle;margin:0 8px 0 0;border:1.5px solid var(--tx-line-control);border-radius:12px;background:var(--tx-bg)}
    .tuix-settings input[role=switch]:after{content:"";position:absolute;top:2px;left:2px;width:13px;height:13px;border-radius:50%;background:var(--tx-muted);transition:left .2s}
    .tuix-settings input[role=switch]:checked{background:var(--tx-aqua);border-color:var(--tx-aqua)}
    .tuix-settings input[role=switch]:checked:after{left:16px;background:var(--tx-on-aqua)}
    .tuix-settings .widget-version{margin:12px 0 0;font:11.5px/1.4 var(--tx-font);color:var(--tx-muted)}
  `;
  browse.id = 'tuix-reports-toggle'; browse.className = 'tuix-menu-dot tuix-reports-button'; browse.type = 'button'; browse.dataset.action = 'reports';
  browse.setAttribute('aria-label', t.reports); browse.dataset.label = t.reports;
  browse.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M9 7h11M9 12h11M9 17h11M4.5 7h.01M4.5 12h.01M4.5 17h.01"/></svg>';
  button.id = 'tuix-settings-toggle'; button.className = 'tuix-menu-dot tuix-settings-button'; button.type = 'button'; button.setAttribute('aria-label', t.settings); button.dataset.label = t.settings;
  // Sliders read as "adjust how this looks", which is what these preferences do.
  button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2.2"/><circle cx="9" cy="17" r="2.2"/></svg>';
  panel.className = 'tuix-settings settings-flyout'; panel.id = 'tuix-settings'; panel.setAttribute('aria-label', t.settings); panel.hidden = true;
  button.setAttribute('aria-controls', panel.id); button.setAttribute('aria-expanded', 'false');
  slot.className = 'tuix-settings-updates';
  capsule.className = 'tuix-summary'; capsule.hidden = true; capsule.setAttribute('role', 'group'); capsule.setAttribute('aria-label', t.summaryLabel);
  let counts: Summary = { to_verify: 0, assigned_active: 0 };
  for (const [show, label] of [['verify', t.summaryVerify], ['open', t.summaryOpen]] as const) {
    const segment = document.createElement('button'), count = document.createElement('b');
    segment.type = 'button'; segment.dataset.summary = show; segment.append(label, count);
    segment.onclick = () => onFilter?.({ scope: 'all', show, involving: 'me' });
    capsule.append(segment);
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Touch has no hover: there the control stays visible while feedback is open.
  let touchActive = false, feedbackActive = false;
  const touch = () => { try { return matchMedia('(hover: none) and (pointer: coarse)').matches; } catch { return false; } };
  /** The capsule steps aside while the menu dots, the flyout or a feedback panel are showing. */
  function sync() {
    capsule.hidden = !(counts.to_verify > 0 || counts.assigned_active > 0) || button.classList.contains('revealed') || !panel.hidden || feedbackActive;
    listen(button.classList.contains('revealed') || !panel.hidden);
  }
  function reveal(value: boolean) { for (const dot of [browse, button]) dot.classList.toggle('revealed', value || touchActive); sync(); }
  function visible(value: boolean) {
    clearTimeout(timer); timer = undefined;
    const was = !panel.hidden;
    if (value && panel.hidden) draw();
    panel.hidden = !value; button.setAttribute('aria-expanded', String(value)); if (value) reveal(true);
    sync();
    if (was !== value) onVisible?.(value);
  }
  function enter() { clearTimeout(timer); timer = undefined; reveal(true); }
  function leave() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      const focused = root.activeElement;
      if (!panel.hidden || panel.contains(focused) || focused === button || focused === browse || focused === launcher) return;
      reveal(false);
    }, 400);
  }
  function draw() {
    panel.replaceChildren();
    const p = readPreferences(config.project), m = readMarkers(config.project);
    function segments(label: string, values: [string, string][], value: string, change: (value: string) => void, setting: string) {
      const group = document.createElement('fieldset'), legend = document.createElement('legend'); legend.textContent = label; group.append(legend);
      for (const [key, text] of values) { const item = document.createElement('button'); item.dataset.setting = setting; item.dataset.value = key; item.textContent = text; item.setAttribute('aria-pressed', String(key === value)); item.onclick = () => { change(key); for (const peer of group.querySelectorAll('button')) peer.setAttribute('aria-pressed', String(peer === item)); }; group.append(item); }
      panel.append(group);
    }
    function toggle(text: string, setting: string, checked: boolean, change: (value: boolean) => void) {
      const label = document.createElement('label'), input = document.createElement('input'); input.type = 'checkbox'; input.setAttribute('role', 'switch'); input.checked = checked;
      input.dataset.setting = setting; input.onchange = () => change(input.checked);
      label.append(input, document.createTextNode(text)); panel.append(label);
    }
    // Show and Involving live in the reports panel; the flyout keeps page-level choices.
    segments(t.pages, [['page', t.thisPage], ['all', t.statusAll]], p.scope, value => savePreferences(config.project, { scope: value as 'page' | 'all' }), 'scope');
    // As on the dashboard: Done, Won't fix and Closed reports stay out of the report lists (markers never show them).
    toggle(t.hideClosed, 'hide-closed', p.hideClosed, value => savePreferences(config.project, { hideClosed: value }));
    segments(t.markers, [['dot', t.markerDots], ['border', t.markerOutlines]], m.style, value => { saveMarkers(config.project, { ...readMarkers(config.project), style: value as 'dot' | 'border' }); changed(); }, 'markers');
    toggle(t.keepMarkers, 'pinned', m.pinned, value => { saveMarkers(config.project, { ...readMarkers(config.project), pinned: value }); changed(); });
    if ((config.environment ?? (['localhost', '127.0.0.1'].includes(location.hostname) ? 'local' : 'production')) === 'local') {
      const label = document.createElement('label'), select = document.createElement('select'); label.className = 'tuix-setting-group'; label.textContent = t.env;
      for (const [value, text] of [['', t.defaults], ['all', t.all], ['local', t.local], ['uat', 'UAT'], ['production', t.production]]) { const option = document.createElement('option'); option.value = value; option.textContent = text; select.append(option); }
      select.value = p.environment; select.onchange = () => { savePreferences(config.project, { environment: select.value as typeof p.environment }); onEnvironment?.(); }; label.append(select); panel.append(label);
    }
    // Updates on your reports and Open tuix.app, rendered by the core; the node survives redraws.
    panel.append(slot);
    const version = document.createElement('p'); version.className = 'widget-version'; version.textContent = `tuix ${VERSION}`; panel.append(version);
  }
  draw();
  // Opening the flyout first dismisses any feedback panel: one surface at a time.
  button.onclick = () => { if (panel.hidden) { if (beforeOpen()) button.focus({ preventScroll: true }); } visible(panel.hidden); };
  browse.onclick = () => { visible(false); reports(); };
  const targets = [launcher, browse, button, panel];
  for (const target of targets) { target.addEventListener('mouseenter', enter); target.addEventListener('mouseleave', leave); target.addEventListener('focusin', enter); target.addEventListener('focusout', leave); }
  // A bootstrap launcher can be replaced while hovered. WebKit need not deliver
  // mouseleave to the replacement, so also track departure from our own bounds.
  const inside = (event: PointerEvent) => targets.some(target => {
    const box = target.getBoundingClientRect();
    return event.clientX >= box.left && event.clientX <= box.right &&
      event.clientY >= box.top && event.clientY <= box.bottom;
  });
  const pointerMove = (event: PointerEvent) => {
    if (!button.classList.contains('revealed') || !panel.hidden) return;
    if (inside(event)) { clearTimeout(timer); timer = undefined; } else if (!timer) leave();
  };
  const pointerDown = (event: PointerEvent) => { if (!panel.hidden && !inside(event)) { visible(false); leave(); } };
  const escape = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || panel.hidden) return;
    visible(false);
    launcher.focus();
  };
  /** Document listeners exist only while the dots or the flyout show: an idle page (and every mouse move on it) carries none. */
  function listen(on: boolean) {
    if (on) { document.addEventListener('pointermove', pointerMove); document.addEventListener('pointerdown', pointerDown); document.addEventListener('keydown', escape); }
    else { document.removeEventListener('pointermove', pointerMove); document.removeEventListener('pointerdown', pointerDown); document.removeEventListener('keydown', escape); }
  }
  root.append(style); if (config.launcher !== false) root.append(browse, button, panel, capsule);
  // Synchronize the shared controls without replacing focused DOM nodes.
  const refresh = () => {
    const p = readPreferences(config.project), m = readMarkers(config.project);
    const values: Record<string, string> = { scope: p.scope, markers: m.style };
    panel.querySelectorAll<HTMLButtonElement>('button[data-setting]').forEach(item =>
      item.setAttribute('aria-pressed', String(values[item.dataset.setting!] === item.dataset.value)));
    const pin = panel.querySelector<HTMLInputElement>('[data-setting=pinned]'), closed = panel.querySelector<HTMLInputElement>('[data-setting=hide-closed]');
    if (pin) pin.checked = m.pinned;
    if (closed) closed.checked = p.hideClosed;
    const environment = panel.querySelector('select');
    if (environment) environment.value = p.environment;
  };
  window.addEventListener(preferenceEvent, refresh);
  return { slot, open: () => { draw(); visible(true); }, close: () => { visible(false); leave(); },
    active: (value: boolean) => { feedbackActive = value; touchActive = value && touch(); reveal(touchActive || button.classList.contains('revealed')); if (!value) leave(); },
    /** Counts from `/me/summary`; zero segments stay hidden. */
    summary: (value: Summary) => {
      counts = { to_verify: Math.max(0, Math.floor(Number(value?.to_verify)) || 0), assigned_active: Math.max(0, Math.floor(Number(value?.assigned_active)) || 0) };
      const [verify, open] = capsule.querySelectorAll('button');
      verify.hidden = !counts.to_verify; open.hidden = !counts.assigned_active;
      verify.lastChild!.textContent = String(counts.to_verify); open.lastChild!.textContent = String(counts.assigned_active);
      verify.setAttribute('aria-label', t.summaryVerifyLabel.replace('{count}', String(counts.to_verify)));
      open.setAttribute('aria-label', t.summaryOpenLabel.replace('{count}', String(counts.assigned_active)));
      sync();
    },
    destroy: () => {
    clearTimeout(timer);
    listen(false);
    window.removeEventListener(preferenceEvent, refresh);
    for (const target of targets) {
      target.removeEventListener('mouseenter', enter); target.removeEventListener('mouseleave', leave);
      target.removeEventListener('focusin', enter); target.removeEventListener('focusout', leave);
    }
    style.remove(); panel.remove(); button.remove(); browse.remove(); capsule.remove();
  } };
}
