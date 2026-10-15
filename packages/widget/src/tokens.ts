/**
 * Evening Light design tokens for everything inside the widget's shadow root.
 * Values mirror the tuix design system; the widget follows the visitor's own
 * light or dark setting. Declared on the shadow root's top-level children (and
 * `.tuix-app` for isolated mounts) so host-page custom properties never leak in.
 */
// Selects draw their own chevron, in each theme's --tx-muted (a data URL cannot read a variable).
const chevron = (ink: string) => `--tx-chevron:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%23${ink}' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`;
const light = `--tx-bg:#f3f0fb;--tx-surface:#fff;--tx-raised:#f6f3fc;--tx-line:#d6cfea;--tx-line-soft:#e5dff2;--tx-line-control:#8b83ab;--tx-ink:#231d3d;--tx-muted:#5d5680;--tx-faint:#665f88;--tx-peach:#f0906a;--tx-on-peach:#2b1812;--tx-peach-text:#a4461f;--tx-gold:#f2c14e;--tx-on-gold:#2b2310;--tx-aqua:#2aa392;--tx-on-aqua:#0b2622;--tx-aqua-text:#157a6c;--tx-pin-ring:#fff;--tx-focus:#8a3d1f;--tx-err:#a3322a;--tx-glow:rgba(240,144,106,.34);--tx-glow-soft:rgba(240,144,106,.14);--tx-glow-warm:rgba(242,193,78,.45);--tx-hl-fill:rgba(240,144,106,.12);--tx-s-open-bg:#fde6dc;--tx-s-open-ink:#8a3a1a;--tx-s-ack-bg:#fbf0cf;--tx-s-ack-ink:#6b5210;--tx-s-verify-bg:#d9f2ed;--tx-s-verify-ink:#0f5c52;--tx-s-done-bg:#ebe7f6;--tx-s-done-ink:#4c4570;--tx-shadow:0 30px 70px -40px rgba(60,40,110,.35);--tx-shadow-panel:-30px 0 60px -30px rgba(40,26,80,.3);--tx-scheme:light;${chevron('5d5680')}`;
const dark = `--tx-bg:#1c1830;--tx-surface:#262041;--tx-raised:#30294f;--tx-line:#453b70;--tx-line-soft:#322a55;--tx-line-control:#7b70a8;--tx-ink:#efeaff;--tx-muted:#b2a9d6;--tx-faint:#978ec0;--tx-peach:#ffb38f;--tx-on-peach:#2b1812;--tx-peach-text:#ffbd9e;--tx-gold:#f4d58d;--tx-on-gold:#2b2310;--tx-aqua:#86e0d0;--tx-on-aqua:#0f2723;--tx-aqua-text:#8fe6d6;--tx-pin-ring:#1c1830;--tx-focus:#ffd3bf;--tx-err:#ffb0a3;--tx-glow:rgba(255,179,143,.42);--tx-glow-soft:rgba(255,179,143,.14);--tx-glow-warm:rgba(244,213,141,.5);--tx-hl-fill:rgba(255,179,143,.12);--tx-s-open-bg:rgba(255,179,143,.16);--tx-s-open-ink:#ffc8ae;--tx-s-ack-bg:rgba(244,213,141,.16);--tx-s-ack-ink:#f6dc9c;--tx-s-verify-bg:rgba(134,224,208,.14);--tx-s-verify-ink:#9ae8da;--tx-s-done-bg:rgba(178,169,214,.14);--tx-s-done-ink:#d3ccf0;--tx-shadow:0 30px 80px -40px rgba(4,2,12,.9);--tx-shadow-panel:-30px 0 60px -30px rgba(0,0,0,.55);--tx-scheme:dark;${chevron('b2a9d6')}`;
const shared = "--tx-font:'Tuix Karla',system-ui,-apple-system,'Segoe UI',sans-serif;--tx-mono:ui-monospace,SFMono-Regular,Consolas,monospace;--tx-shadow-pin:0 6px 16px -6px rgba(0,0,0,.5);--tx-shadow-dot:0 10px 24px -12px rgba(0,0,0,.5)";
const scope = ':host>*,.tuix-app';

export const tokenCss = `${scope}{${shared};${light};color-scheme:light}@media(prefers-color-scheme:dark){${scope}{${dark};color-scheme:dark}}`;

/** Screenshot highlight: stroked onto the captured image of the host page, whatever the visitor's theme, so it uses the light peach. */
export const outlineColor = '#f0906a';
