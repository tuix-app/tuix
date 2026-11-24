import { readPreferences, savePreferences, preferenceEvent, type OpenFilter } from './preferences';
import { readMarkers, saveMarkers, type MarkerStyle } from './markers';
import { translations } from './i18n';
import { tokenCss, crisp } from './tokens';
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
  style.textContent = tokenCss + `.tuix-menu-dot{all:initial;${crisp};box-sizing:border-box;position:fixed;${side}:20px;width:36px;height:36px;border-radius:50%;background:var(--tx-surface);color:var(--tx-ink);border:1px solid var(--tx-line-control);display:grid;place-items:center;cursor:pointer;pointer-events:none;opacity:0;visibility:hidden;transform:translateY(var(--from));transition:opacity .2s var(--tx-ease) var(--out,0s),transform .18s var(--tx-ease) var(--out,0s),visibility 0s linear calc(.18s + var(--out,0s)),border-color .2s;z-index:11}.tuix-menu-dot svg{width:18px;height:18px;display:block}.tuix-reports-button{bottom:calc(68px + env(safe-area-inset-bottom,0px) + var(--tuix-lift,0px));--from:8px;--out:.04s}.tuix-settings-button{bottom:calc(112px + env(safe-area-inset-bottom,0px) + var(--tuix-lift,0px));--from:8px;--in:.05s}.tuix-menu-dot.revealed,.tuix-menu-dot[aria-expanded=true]{pointer-events:auto;opacity:1;visibility:visible;transform:none;transition-delay:var(--in,0s),var(--in,0s),0s,0s,0s}.tuix-menu-dot:hover,.tuix-menu-dot[aria-expanded=true]{border-color:var(--tx-ink)}.tuix-menu-dot:focus-visible,.tuix-settings :focus-visible{outline:2px solid var(--tx-focus);outline-offset:3px}.tuix-menu-dot:focus-visible,.tuix-summary button:focus-visible{box-shadow:0 0 0 6px var(--tx-surface)}.tuix-menu-dot:after{content:attr(data-label);position:absolute;${other === 'left' ? 'right' : 'left'}:calc(100% + 10px);top:0;bottom:0;height:fit-content;margin:auto 0;white-space:nowrap;padding:6px 8px;border-radius:8px;background:var(--tx-surface);color:var(--tx-ink);border:var(--tx-hairline) solid var(--tx-line-soft);font:600 13px/20px var(--tx-font);opacity:0;transition:opacity .15s;pointer-events:none}.tuix-menu-dot:hover:after,.tuix-menu-dot:focus-visible:after{opacity:1}.tuix-menu-dot[aria-expanded=true]:after{opacity:0}.tuix-settings{box-sizing:border-box;position:fixed;bottom:calc(16px + env(safe-area-inset-bottom,0px) + var(--tuix-lift,0px));${side}:72px;width:min(280px,calc(100vw - 88px));padding:20px;background:var(--tx-surface);color:var(--tx-ink);border:var(--tx-hairline) solid var(--tx-line-soft);border-radius:16px;box-shadow:var(--tx-shadow);pointer-events:auto;font:450 13px/20px var(--tx-font);z-index:10;max-height:calc(100vh - 32px);overflow:auto;overscroll-behavior:contain;scrollbar-color:var(--tx-line) transparent;}.tuix-settings[hidden]{display:none}.tuix-settings button,.tuix-settings select{font:inherit;font-weight:600;color:inherit;cursor:pointer;min-height:44px;padding:8px 12px;border:1px solid var(--tx-line-control);border-radius:8px;background:transparent;color-scheme:var(--tx-scheme)}.tuix-settings select{border-radius:10px;background:var(--tx-bg)}.tuix-settings button[aria-pressed=true]{background:var(--tx-pick);border-color:var(--tx-ink);color:var(--tx-ink)}.tuix-settings fieldset{border:0;padding:0;margin:0 0 20px;min-width:0;display:flex;flex-wrap:wrap;gap:8px}.tuix-settings legend{padding:0;margin-bottom:8px;font-weight:600;color:var(--tx-muted)}.tuix-settings label{display:block;margin:0 0 20px}.tuix-settings select{display:block;width:100%;margin-top:8px;appearance:none;background-image:var(--tx-chevron);background-repeat:no-repeat;background-size:10px 6px;background-position:right 12px center;padding-right:32px}.tuix-settings .tuix-setting-group{font-weight:600;color:var(--tx-muted)}.tuix-settings .tuix-setting-group select{color:var(--tx-ink)}.tuix-settings-updates{display:block;margin:0;padding-top:20px;border-top:var(--tx-hairline) solid var(--tx-line-soft)}.tuix-settings-updates:empty{display:none}@media(prefers-reduced-motion:reduce){.tuix-menu-dot{transition:none}}@media(pointer:coarse){.tuix-summary button{min-height:44px}}@media(hover:none) and (pointer:coarse){.tuix-menu-dot{width:44px;height:44px;bottom:calc(20px + env(safe-area-inset-bottom,0px) + var(--tuix-lift,0px));transform:translateX(calc(${left ? -1 : 1} * var(--from)))}.tuix-reports-button{${side}:68px}.tuix-settings-button{${side}:120px}.tuix-menu-dot:after{display:none}.tuix-settings{bottom:calc(72px + env(safe-area-inset-bottom,0px) + var(--tuix-lift,0px));${side}:16px;width:min(300px,calc(100vw - 32px));max-height:calc(100vh - 88px)}}`;
  const button = document.createElement('button'), panel = document.createElement('section'), browse = document.createElement('button');
  const slot = document.createElement('div'), capsule = document.createElement('div');
  // One capsule beside the launcher: aqua "To verify", peach "Open", each opening Reports filtered to the caller.
  style.textContent += `.tuix-summary{box-sizing:border-box;position:fixed;${side}:68px;bottom:calc(20px + env(safe-area-inset-bottom,0px) + var(--tuix-lift,0px));display:flex;align-items:center;padding:0;background:var(--tx-surface);border:1px solid var(--tx-line-control);border-radius:999px;pointer-events:auto;z-index:9;font:600 13px/20px var(--tx-font);}.tuix-summary button{all:initial;${crisp};box-sizing:border-box;display:inline-flex;align-items:center;gap:8px;min-height:36px;padding:0 6px 0 14px;border-radius:999px;cursor:pointer;font:inherit;color:var(--tx-ink);white-space:nowrap}.tuix-summary button:hover{background:var(--tx-raised)}.tuix-summary button:focus-visible{outline:2px solid var(--tx-focus);outline-offset:2px}.tuix-summary b{box-sizing:border-box;min-width:24px;height:24px;padding:0 8px;border-radius:999px;display:inline-grid;place-items:center;font-size:13px;line-height:24px;background:var(--tx-peach);color:var(--tx-on-peach)}`;
  style.textContent += `
    .tuix-settings input[role=switch]{appearance:none;box-sizing:border-box;position:relative;display:inline-block;cursor:pointer;width:34px;height:20px;vertical-align:middle;margin:0 8px 0 0;border:1px solid var(--tx-line-control);border-radius:12px;background:var(--tx-bg)}
    .tuix-settings input[role=switch]:after{content:"";position:absolute;top:2px;left:2px;width:13px;height:13px;border-radius:50%;background:var(--tx-muted);transition:transform .16s var(--tx-ease)}
    .tuix-settings input[role=switch]:checked{background:var(--tx-ink);border-color:var(--tx-ink)}
    .tuix-settings input[role=switch]:checked:after{transform:translateX(14px);background:var(--tx-surface)}
    .tuix-settings-section{margin:0 0 20px}
    .tuix-settings-section + .tuix-settings-section{border-top:var(--tx-hairline) solid var(--tx-line-soft);padding-top:20px}
    .tuix-settings-section h3{font-size:14px;line-height:20px;margin:0 0 8px;color:var(--tx-ink)}
    .tuix-settings .tuix-setting-help{font-size:13px;line-height:20px;color:var(--tx-muted);margin:0 0 16px}
    .tuix-settings .tuix-marker-toggle{display:flex;align-items:flex-start;gap:8px;margin:0 0 8px;font-weight:600}
    .tuix-settings .tuix-marker-toggle input{flex-shrink:0;margin:2px 0 0}
    .tuix-settings-section>:last-child{margin-bottom:0}
    .tuix-settings .widget-version{margin:12px 0 0;font:450 13px/20px var(--tx-font);color:var(--tx-muted)}
  `;
  browse.id = 'tuix-reports-toggle'; browse.className = 'tuix-menu-dot tuix-reports-button'; browse.type = 'button'; browse.dataset.action = 'reports';
  browse.setAttribute('aria-label', t.reports); browse.dataset.label = t.reports;
  browse.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M9 7h11M9 12h11M9 17h11M4.5 7h.01M4.5 12h.01M4.5 17h.01"/></svg>';
  button.id = 'tuix-settings-toggle'; button.className = 'tuix-menu-dot tuix-settings-button'; button.type = 'button'; button.setAttribute('aria-label', t.settings); button.dataset.label = t.settings;
  // Sliders read as "adjust how this looks", which is what these preferences do.
  button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2.2"/><circle cx="9" cy="17" r="2.2"/></svg>';
  panel.className = 'tuix-settings settings-flyout'; panel.id = 'tuix-settings'; panel.setAttribute('aria-label', t.settings); panel.hidden = true;
  button.setAttribute('aria-controls', panel.id); button.setAttribute('aria-expanded', 'false');
  slot.className = 'tuix-settings-updates';
  capsule.className = 'tuix-summary'; capsule.hidden = true; capsule.setAttribute('role', 'group'); capsule.setAttribute('aria-label', t.summaryLabel);
  let waiting = 0;
  // One number: the conversations waiting for the viewer (their turn, fixes to check included). It opens Reports on Your turn.
  { const segment = document.createElement('button'), count = document.createElement('b');
    segment.type = 'button'; segment.dataset.summary = 'turn'; segment.append(t.summaryTurn, count);
    segment.onclick = () => onFilter?.({ scope: 'all', show: 'turn' });
    capsule.append(segment); }
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Touch has no hover: there the control stays visible while feedback is open.
  let touchActive = false, feedbackActive = false;
  const touch = () => { try { return matchMedia('(hover: none) and (pointer: coarse)').matches; } catch { return false; } };
  /** The capsule steps aside while the menu dots, the flyout or a feedback panel are showing. */
  function sync() {
    capsule.hidden = !(waiting > 0) || button.classList.contains('revealed') || !panel.hidden || feedbackActive;
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
    function segments(parent: HTMLElement, label: string, values: [string, string][], value: string, change: (value: string) => void, setting: string) {
      const group = document.createElement('fieldset'), legend = document.createElement('legend'); legend.textContent = label; group.append(legend);
      for (const [key, text] of values) { const item = document.createElement('button'); item.dataset.setting = setting; item.dataset.value = key; item.textContent = text; item.setAttribute('aria-pressed', String(key === value)); item.onclick = () => { change(key); for (const peer of group.querySelectorAll('button')) peer.setAttribute('aria-pressed', String(peer === item)); }; group.append(item); }
      parent.append(group);
    }
    function toggle(parent: HTMLElement, text: string, setting: string, checked: boolean, change: (value: boolean) => void) {
      const label = document.createElement('label'), input = document.createElement('input'); input.type = 'checkbox'; input.setAttribute('role', 'switch'); input.checked = checked;
      input.dataset.setting = setting; input.onchange = () => change(input.checked);
      input.id = 'tuix-marker-visibility'; input.setAttribute('aria-describedby', 'tuix-marker-visibility-help');
      const textNode = document.createElement('span'); textNode.textContent = text;
      label.className = 'tuix-marker-toggle'; label.append(input, textNode); parent.append(label);
      const help = document.createElement('p'); help.id = 'tuix-marker-visibility-help'; help.className = 'tuix-setting-help'; help.textContent = t.markerVisibilityHelp; parent.append(help);
    }
    function section(title: string, help: string, id: string) {
      const group = document.createElement('section'), heading = document.createElement('h3'), description = document.createElement('p');
      group.className = 'tuix-settings-section'; group.setAttribute('aria-labelledby', id);
      heading.id = id; heading.textContent = title; description.className = 'tuix-setting-help'; description.textContent = help;
      group.append(heading, description); panel.append(group); return group;
    }
    // Report-list filters live together above the list. Markers have their own scope.
    const markers = section(t.pageMarkers, t.markerHelp, 'tuix-page-markers-title');
    segments(markers, t.markerAppearance, [['dot', t.markerDots], ['border', t.markerOutlines], ['fill', t.markerFills]], m.style, value => { saveMarkers(config.project, { ...readMarkers(config.project), style: value as MarkerStyle }); changed(); }, 'markers');
    toggle(markers, t.keepMarkers, 'pinned', m.pinned, value => { saveMarkers(config.project, { ...readMarkers(config.project), pinned: value }); changed(); });
    if ((config.environment ?? (['localhost', '127.0.0.1'].includes(location.hostname) ? 'local' : 'production')) === 'local') {
      const developer = section(t.developerOptions, t.environmentHelp, 'tuix-developer-options-title');
      const label = document.createElement('label'), select = document.createElement('select'); label.className = 'tuix-setting-group'; label.textContent = t.env;
      select.dataset.setting = 'environment';
      for (const [value, text] of [['', t.defaults], ['all', t.all], ['local', t.local], ['uat', 'UAT'], ['production', t.production]]) { const option = document.createElement('option'); option.value = value; option.textContent = text; select.append(option); }
      select.value = p.environment; select.onchange = () => { savePreferences(config.project, { environment: select.value as typeof p.environment }); onEnvironment?.(); }; label.append(select); developer.append(label);
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
    const values: Record<string, string> = { markers: m.style };
    panel.querySelectorAll<HTMLButtonElement>('button[data-setting]').forEach(item =>
      item.setAttribute('aria-pressed', String(values[item.dataset.setting!] === item.dataset.value)));
    const pin = panel.querySelector<HTMLInputElement>('[data-setting=pinned]');
    if (pin) pin.checked = m.pinned;
    const environment = panel.querySelector<HTMLSelectElement>('[data-setting=environment]');
    if (environment) environment.value = p.environment;
  };
  window.addEventListener(preferenceEvent, refresh);
  return { slot, open: () => { draw(); visible(true); }, close: () => { visible(false); leave(); },
    active: (value: boolean) => { feedbackActive = value; touchActive = value && touch(); reveal(touchActive || button.classList.contains('revealed')); if (!value) leave(); },
    /** Counts from `/me/summary`: `waiting` (older servers: their two counts added, which never overlap); zero hides the capsule and lets the launcher rest. */
    summary: (value: Summary) => {
      const whole = (number: unknown) => Math.max(0, Math.floor(Number(number)) || 0);
      waiting = value?.waiting !== undefined ? whole(value.waiting) : whole(value?.to_verify) + whole(value?.assigned_active);
      const segment = capsule.querySelector('button')!;
      segment.lastChild!.textContent = String(waiting);
      segment.setAttribute('aria-label', t.summaryTurnLabel.replace('{count}', String(waiting)));
      // The launcher comes up while something waits for the viewer.
      if (waiting > 0) launcher.dataset.waiting = String(waiting); else delete launcher.dataset.waiting;
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
