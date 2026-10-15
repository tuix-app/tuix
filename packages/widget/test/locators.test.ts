import { describe, it, expect } from 'vitest';
import { locate, resolve, routeKey } from '../src/locators';

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
