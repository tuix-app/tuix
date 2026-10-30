import { describe, it, expect, vi } from 'vitest';
import { locate, resolve, createResolver, routeKey } from '../src/locators';

describe('locators across deployments', () => {
  it('prefers the Shopify section when surrounding layout and duplicate names change', () => {
    document.body.innerHTML = '<main><section id="shopify-section-template--123__product"><button>Buy</button></section></main>';
    const locator = locate(document.querySelector('button')!);
    document.body.innerHTML = '<button>Buy</button><article><div><section id="shopify-section-template--123__product"><button>Buy now</button></section></div></article>';
    for (const local of [false, true]) {
      const result = resolve(locator, document, local);
      expect(result.method).toBe('section');
      expect(result.element).toBe(document.querySelector('section button'));
    }
  });
  it('anchors the section itself and the nearest nested section', () => {
    document.body.innerHTML = '<section id="shopify-section-outer"><section id="shopify-section-inner"><button>Buy</button></section></section>';
    const section = document.querySelector('section')!;
    expect(resolve(locate(section))).toMatchObject({ method: 'section', element: section });
    expect(locate(document.querySelector('button')!).section?.id).toBe('shopify-section-inner');
  });
  it('rejects duplicate section anchors and changed element structure', () => {
    document.body.innerHTML = '<section id="shopify-section-product"><button>Buy</button></section>';
    const original = locate(document.querySelector('button')!);
    const locator = { ...original, testid: undefined, aria: undefined, text: undefined, css: '' };
    document.body.innerHTML += document.body.innerHTML;
    expect(resolve(locator).orphaned).toBe(true);
    document.body.innerHTML = '<section id="shopify-section-product"><a href="/">Buy</a></section>';
    expect(resolve(locator).orphaned).toBe(true);
  });
  it('does not retain masked section ids or masked target content', () => {
    document.body.innerHTML = '<section id="shopify-section-secret" data-tuix-mask><button>Private</button></section>';
    const locator = locate(document.querySelector('button')!);
    expect(locator.section).toBeUndefined();
    expect(JSON.stringify(locator)).not.toMatch(/secret|Private/);
  });
  it('survives restructuring and class churn using test ids', () => {
    document.body.innerHTML = '<main><button data-testid="save" class="css-ab123">Save</button></main>';
    const locator = locate(document.querySelector('button')!);
    document.body.innerHTML = '<article><section><button data-testid="save" class="new">Zapisz</button></section></article>';
    expect(resolve(locator).method).toBe('testid');
  });
  it('falls back to an accessible name without test ids', () => {
    document.body.innerHTML = '<div><button>Save</button></div>';
    const locator = locate(document.querySelector('button')!);
    document.body.innerHTML = '<main><section><button aria-label="Save"><span>✓</span></button></section></main>';
    expect(resolve(locator).method).toBe('aria');
  });
  it('shares candidate scans within a refresh and reads changed names on the next refresh', () => {
    document.body.innerHTML = '<main><button>Save</button><button>Cancel</button></main>';
    const [save, cancel] = document.querySelectorAll('button');
    const first = locate(save), second = locate(cancel);
    const scan = vi.spyOn(document, 'querySelectorAll');
    try {
      const resolveMarker = createResolver();
      expect(resolveMarker(first).element).toBe(save);
      expect(resolveMarker(second).element).toBe(cancel);
      expect(scan).toHaveBeenCalledTimes(1);
      save.textContent = 'Changed';
      const next = createResolver();
      expect(next({ ...first, text: undefined, css: '' }).orphaned).toBe(true);
      expect(scan).toHaveBeenCalledTimes(2);
    } finally { scan.mockRestore(); }
  });
  it('refuses ambiguous and fingerprint-mismatched fallback matches', () => {
    document.body.innerHTML = '<main><button>Save</button></main>';
    const locator = locate(document.querySelector('button')!);
    document.body.innerHTML = '<article><button>Save</button><button>Save</button></article>';
    expect(resolve(locator).orphaned).toBe(true);
  });
  it('never captures masked descendants or form values in text anchors', () => {
    document.body.innerHTML = '<section>Hello <span data-tuix-mask>secret</span><input value="password"></section>';
    expect(locate(document.querySelector('section')!).text?.text).toBe('Hello');
    expect(JSON.stringify(locate(document.querySelector('input')!))).not.toContain('password');
    expect(locate(document.querySelector('span')!).text).toBeUndefined();
  });
  it('reads public text without cloning host subtrees or including private descendants', () => {
    document.body.innerHTML = '<section>  Public <b>text</b><span data-tuix-mask>secret</span><textarea>private</textarea><script>secret()</script><style>secret</style><tuix-widget>private reply</tuix-widget>\n  continues </section>';
    const section = document.querySelector('section')!;
    const clone = vi.spyOn(Element.prototype, 'cloneNode');
    try {
      expect(locate(section).text?.text).toBe('Public text continues');
      expect(clone).not.toHaveBeenCalled();
      expect(section.querySelector('textarea')!.value).toBe('private');
    } finally { clone.mockRestore(); }
  });
  it('stops reading after the locator text prefix, preserving whitespace across nodes', () => {
    document.body.innerHTML = '<section>  First <b> words </b><span>' + 'a'.repeat(100) + '</span><i>unused</i></section>';
    const section = document.querySelector('section')!;
    const tail = section.querySelector('i')!;
    const read = vi.spyOn(tail, 'textContent', 'get');
    try {
      expect(locate(section).text?.text).toBe(('First words ' + 'a'.repeat(100)).slice(0, 80));
      expect(read).not.toHaveBeenCalled();
    } finally { read.mockRestore(); }
  });
  it('does not throw on invalid selectors from old data', () => {
    document.body.innerHTML = '<div>Example</div>';
    const locator = locate(document.querySelector('div')!);
    expect(resolve({ ...locator, testid: '[', css: '[', text: undefined }).orphaned).toBe(true);
  });
  it('normalizes routes across hosts and preserves only opted-in queries', () => {
    expect(routeKey('https://uat.example/invoices/123?secret=x')).toBe('/invoices/:param');
    expect(routeKey('http://localhost:4000/invoices/987?tab=open&secret=x', ['tab'])).toBe('/invoices/:param?tab=open');
    expect(routeKey('/users/9f4c4314-d2e1-4dfb-9a5f-70a171a0162c')).toBe('/users/:param');
  });
});

it('treats malformed persisted locator bundles as orphaned rather than throwing', () => {
  for (const value of [null, {}, {frames: 'invalid'}, {frames: [null]}, {css: {bad: true}}]) {
    expect(resolve(value as never).orphaned).toBe(true);
  }
});
