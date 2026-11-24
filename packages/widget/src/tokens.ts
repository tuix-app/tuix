/**
 * Pinned notes design tokens for everything inside the widget's shadow root.
 * Values mirror the tuix design system; the widget follows the visitor's own
 * light or dark setting. Declared on the shadow root's top-level children (and
 * `.tuix-app` for isolated mounts) so host-page custom properties never leak in.
 */
// Selects draw their own chevron, in each theme's --tx-muted (a data URL cannot read a variable).
const chevron = (ink: string) => `--tx-chevron:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%23${ink}' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`;
const light = `--tx-bg:#f3f0fb;--tx-surface:#fff;--tx-raised:#f6f3fc;--tx-line:#d6cfea;--tx-line-soft:#e5dff2;--tx-line-control:#8b83ab;--tx-ink:#231d3d;--tx-muted:#5d5680;--tx-peach:#f0906a;--tx-on-peach:#2b1812;--tx-pin-ring:#fff;--tx-focus:#8a3d1f;--tx-err:#a3322a;--tx-accent-soft:rgba(240,144,106,.14);--tx-hl-fill:rgba(240,144,106,.12);--tx-pick:#fde6dc;--tx-shadow:0 4px 16px rgba(35,29,61,.08);--tx-shadow-panel:-12px 0 32px -16px rgba(35,29,61,.12);--tx-scheme:light;${chevron('5d5680')}`;
const dark = `--tx-bg:#1c1830;--tx-surface:#262041;--tx-raised:#30294f;--tx-line:#453b70;--tx-line-soft:#322a55;--tx-line-control:#7b70a8;--tx-ink:#efeaff;--tx-muted:#b2a9d6;--tx-peach:#ffb38f;--tx-on-peach:#2b1812;--tx-pin-ring:#1c1830;--tx-focus:#ffd3bf;--tx-err:#ffb0a3;--tx-accent-soft:rgba(255,179,143,.14);--tx-hl-fill:rgba(255,179,143,.12);--tx-pick:#493850;--tx-shadow:0 4px 16px rgba(0,0,0,.28);--tx-shadow-panel:-12px 0 32px -16px rgba(0,0,0,.4);--tx-scheme:dark;${chevron('b2a9d6')}`;
/** Crisp text. Declared in the shared token rule (inherited by everything) and again after each `all:initial`, which resets it. */
export const crisp = '-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility';
const shared = `--tx-hairline:1px;${crisp};--tx-ease:cubic-bezier(.22,1,.36,1);--tx-font:'Tuix Karla',system-ui,-apple-system,'Segoe UI',sans-serif;--tx-mono:ui-monospace,SFMono-Regular,Consolas,monospace`;
const scope = ':host>*,.tuix-app';

// Chat borders are one hairline: 1px, and half a pixel where the screen has two or more device pixels per CSS pixel.
export const tokenCss = `${scope}{${shared};${light};color-scheme:light}@media(min-resolution:2dppx){${scope}{--tx-hairline:.5px}}@media(prefers-color-scheme:dark){${scope}{${dark};color-scheme:dark}}`;

/** Screenshot highlight: stroked onto the captured image of the host page, whatever the visitor's theme, so it uses the light peach. */
export const outlineColor = '#f0906a';
