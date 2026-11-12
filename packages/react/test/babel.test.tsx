import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { transformSync } from '@babel/core';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { afterAll, describe, expect, it } from 'vitest';
import { locate } from '../../widget/src/locators.js';
import plugin from '../src/babel.js';

const options = (filename: string) => ({
  filename, configFile: false, babelrc: false,
  parserOpts: { plugins: [/\.tsx?$/.test(filename) ? 'typescript' as const : 'jsx' as const, ...(/\.tsx$/.test(filename) ? ['jsx' as const] : [])] },
  plugins: [plugin],
});
const stamp = (code: string, filename = 'App.jsx') => transformSync(code, options(filename))!.code!;
/** The component names stamped, in source order. */
const stamped = (code: string, filename?: string) => [...stamp(code, filename).matchAll(/data-tuix-component="([^"]*)"/g)].map(m => m[1]);

describe('which components are stamped', () => {
  it('function declarations and expressions', () => {
    expect(stamp('function Button() { return <button>x</button>; }')).toContain('<button data-tuix-component="Button">');
    expect(stamped('const Card = function () { return <div />; };')).toEqual(['Card']);
    expect(stamped('export default function Page() { return <main />; }')).toEqual(['Page']);
  });
  it('arrow functions with a block or an expression body', () => {
    expect(stamped('const A = () => { return <p />; };')).toEqual(['A']);
    expect(stamped('const B = () => <p />;')).toEqual(['B']);
    expect(stamped('const C = () => (\n  <p>\n    x\n  </p>\n);')).toEqual(['C']);
  });
  it('memo and forwardRef, bare and on React, named after the variable', () => {
    expect(stamped('const A = memo(() => <i />);')).toEqual(['A']);
    expect(stamped('const B = React.memo(function Inner() { return <i />; });')).toEqual(['B']);
    expect(stamped('const C = forwardRef((props, ref) => <i ref={ref} />);')).toEqual(['C']);
    expect(stamped('const D = React.forwardRef(function (props, ref) { return <i />; });')).toEqual(['D']);
    expect(stamped('const E = memo(forwardRef((p, r) => <i />));')).toEqual(['E']);
    expect(stamped('export default memo(function Named() { return <i />; });')).toEqual(['Named']);
  });
  it('classes with a render method, named after the class', () => {
    expect(stamped('class Panel extends React.Component { render() { return <section />; } }')).toEqual(['Panel']);
    expect(stamped('const Box = class extends Component { render() { return <div />; } };')).toEqual(['Box']);
    expect(stamped('class Plain { other() { return <div />; } }')).toEqual([]);
    expect(stamped('class Static { static render() { return <div />; } }')).toEqual([]);
  });
  it('skips lowercase functions, anonymous default exports and non-component wrappers', () => {
    expect(stamped('function helper() { return <div />; }\nconst thing = () => <div />;')).toEqual([]);
    expect(stamped('export default function () { return <div />; }')).toEqual([]);
    expect(stamped('export default () => <div />;')).toEqual([]);
    expect(stamped('const A = useMemo(() => <div />, []);\nconst B = wrap(() => <div />);')).toEqual([]);
  });
});

describe('which elements are stamped', () => {
  it('conditional and logical roots stamp each host branch', () => {
    expect(stamped('const A = ({ x }) => x ? <a /> : <b />;')).toEqual(['A', 'A']);
    expect(stamped('const B = ({ x }) => x && <a />;')).toEqual(['B']);
    expect(stamped('const C = ({ x }) => x || <a />;')).toEqual(['C']);
    expect(stamped('const D = ({ x }) => x ?? <a />;')).toEqual(['D']);
    expect(stamped('const E = ({ x, y }) => { return x ? <a /> : y ? <b /> : null; };')).toEqual(['E', 'E']);
  });
  it('early returns with different roots are all stamped', () => {
    const code = stamp('function List({ items }) { if (!items.length) return <p>none</p>;\n return <ul>{items.map(i => <li key={i}>{i}</li>)}</ul>; }');
    expect(code).toContain('<p data-tuix-component="List">');
    expect(code).toContain('<ul data-tuix-component="List">');
    expect(code).toContain('<li key={i}>');
  });
  it('leaves fragments, components and non-JSX returns alone', () => {
    expect(stamped('const A = () => <><div /></>;')).toEqual([]);
    expect(stamped('const B = () => <Fragment><div /></Fragment>;')).toEqual([]);
    expect(stamped('const C = () => <React.Fragment><div /></React.Fragment>;')).toEqual([]);
    expect(stamped('const D = () => <Foo><div /></Foo>;')).toEqual([]);
    expect(stamped('const E = () => <foo.Bar />;')).toEqual([]);
    expect(stamped('const F = () => <svg:rect />;')).toEqual([]);
    expect(stamped('const G = () => null;\nfunction H() { return "text"; }')).toEqual([]);
  });
  it('leaves returns of nested callbacks and functions alone', () => {
    const code = stamp('function A({ items }) { const row = i => { return <li>{i}</li>; };\n function inner() { return <b />; }\n return <ol>{items.map(row)}</ol>; }');
    expect(code.match(/data-tuix-component/g)).toHaveLength(1);
    expect(code).toContain('<ol data-tuix-component="A">');
    expect(stamped('const A = () => { items.forEach(i => { return <li />; }); return null; };')).toEqual([]);
  });
  it('stamps only the root, not children', () => {
    expect(stamped('const A = () => <div><span /><button /></div>;')).toEqual(['A']);
  });
  it('keeps an existing attribute, and puts its own first so a later spread or attribute wins', () => {
    expect(stamp('const A = () => <div data-tuix-component="Mine" />;')).toBe('const A = () => <div data-tuix-component="Mine" />;');
    expect(stamp('const A = (p) => <div className="x" {...p} />;')).toBe('const A = p => <div data-tuix-component="A" className="x" {...p} />;');
  });
  it('skips names the widget would reject', () => {
    expect(stamped('const $Foo = () => <div />;\nconst Über = () => <div />;')).toEqual([]);
    expect(stamped(`const A${'b'.repeat(100)} = () => <div />;`)).toEqual([]); // 101 characters
    expect(stamped(`const A${'b'.repeat(99)} = () => <div />;`)).toHaveLength(1); // 100 is the limit
    expect(stamped('const A_b1 = () => <div />;')).toEqual(['A_b1']);
  });
  it('handles TypeScript and TSX input', () => {
    const code = `import type { FC } from 'react';
interface Props { n: number }
export const Counter: FC<Props> = ({ n }) => <output>{n as number}</output>;
export function Label<T extends string>({ text }: { text: T }): JSX.Element { return <label>{text}</label>; }
const Wrapped = memo(((p: Props) => <i />) as FC<Props>);
class Tab extends Component<Props> { render(): ReactNode { return <nav />; } }`;
    expect(stamped(code, 'App.tsx')).toEqual(['Counter', 'Label', 'Wrapped', 'Tab']);
    expect(stamped('export const A = (x: number) => <T,>(y: T) => y;', 'a.ts')).toEqual([]);
  });
  it('does not touch files under node_modules', () => {
    const code = 'const A = () => <div />;';
    expect(stamp(code, '/app/node_modules/lib/index.jsx')).toBe(code);
    expect(stamp(code, 'C:\\app\\node_modules\\lib\\index.jsx')).toBe(code);
    expect(stamped(code, '/app/src/node_modules_like/a.jsx')).toEqual(['A']);
    // Other plugins in the same pass still run on that file.
    const other = () => ({ visitor: { JSXElement(path: { replaceWith(n: unknown): void }) { path.replaceWith({ type: 'NullLiteral' }); } } });
    expect(transformSync(code, { ...options('/app/node_modules/lib/index.jsx'), plugins: [plugin, other] })!.code).toBe('const A = () => null;');
  });
  it('stamps before other plugins rewrite components, whatever their order', () => {
    // As React Refresh does in development: `memo(() => ...)` becomes `memo(_c = () => ...)` when the declaration is visited.
    const register = ({ types: t }: { types: any }) => ({ visitor: { VariableDeclarator(path: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      const init = path.node.init;
      if (init?.type === 'CallExpression' && init.arguments[0]?.type === 'ArrowFunctionExpression') init.arguments[0] = t.assignmentExpression('=', t.identifier('_c'), init.arguments[0]);
    } } });
    const code = 'const A = memo(() => <i />);';
    for (const plugins of [[register, plugin], [plugin, register]]) {
      expect(transformSync(code, { ...options('App.jsx'), plugins })!.code).toBe('const A = memo(_c = () => <i data-tuix-component="A" />);');
    }
  });
  it('is idempotent, deterministic and adds nothing else', () => {
    const code = 'import { memo } from "react";\nexport const A = memo(() => <div>x</div>);\nclass B extends Component { render() { return this.p ? <a /> : <b />; } }';
    const once = stamp(code);
    expect(stamp(once)).toBe(once);
    expect(stamp(code)).toBe(once);
    expect(once.replace(/ data-tuix-component="\w+"/g, '')).toBe(transformSync(code, { ...options('App.jsx'), plugins: [] })!.code);
    expect(once).not.toMatch(/import .*tuix|require\(/i);
    expect(once.match(/^import /gm)).toHaveLength(1);
  });
});

// The transformed source is real JSX, so it is written out and imported like application code.
const dir = mkdtempSync(join(import.meta.dirname, '.stamped-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
let counter = 0;
async function load(code: string) {
  const file = join(dir, `m${counter++}.jsx`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, stamp(code, file));
  return await import(/* @vite-ignore */ file);
}
function render(element: ReturnType<typeof createElement>) {
  const host = document.createElement('div');
  document.body.append(host);
  flushSync(() => createRoot(host).render(element));
  return host;
}

describe('rendered', () => {
  it('puts the attributes into the DOM, with a spread after the stamp winning', async () => {
    const m = await load(`import React, { memo, forwardRef } from 'react';
export const Plain = () => <button>Pay</button>;
export const Memo = memo(() => <p />);
export const Ref = forwardRef((props, ref) => <i ref={ref} />);
export function Spread(props) { return <span {...props} />; }
export class Klass extends React.Component { render() { return this.props.on ? <a /> : <b />; } }`);
    const host = render(createElement('div', null,
      createElement(m.Plain), createElement(m.Memo), createElement(m.Ref),
      createElement(m.Spread), createElement(m.Spread, { 'data-tuix-component': 'FromProps' }),
      createElement(m.Klass, { on: true }), createElement(m.Klass)));
    expect(Array.from(host.querySelectorAll('[data-tuix-component]')).map(e => `${e.tagName.toLowerCase()}=${e.getAttribute('data-tuix-component')}`))
      .toEqual(['button=Plain', 'p=Memo', 'i=Ref', 'span=Spread', 'span=FromProps', 'a=Klass', 'b=Klass']);
  });

  it('gives the widget a nearest-first chain of component names', async () => {
    const m = await load(`import React from 'react';
export const Page = () => <main><Form /></main>;
const Form = () => <form><Pay /></form>;
const Pay = () => <button type="submit"><span>Pay now</span></button>;
export { Form, Pay };`);
    const host = render(createElement(m.Page));
    expect(locate(host.querySelector('span')!).components).toEqual(['Pay', 'Form', 'Page']);
  });
});
