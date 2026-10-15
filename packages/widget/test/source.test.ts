import { afterEach, expect, it, vi } from 'vitest';
import { sourceLocation, editorLink, readEditor, saveEditor, defaultEditor } from '../src/source';
afterEach(() => { document.body.innerHTML = ''; localStorage.clear(); vi.restoreAllMocks(); });

it('finds the nearest enclosing HEEx component and skips closed siblings', () => {
  document.body.innerHTML = '<!-- <App.page> lib/page.html.heex:10 (app) --><main><!-- <App.old> lib/old.ex:2 --><button>Old</button><!-- </App.old> --><!-- <App.button> lib/buttons.ex:42 (app) --><button id="target"><span>Save</span></button><!-- </App.button> --></main><!-- </App.page> -->';
  expect(sourceLocation(document.querySelector('#target span'), 'local')).toEqual({ path: 'lib/buttons.ex', line: 42 });
  expect(sourceLocation(document.querySelector('#target span'), 'production')).toBeNull();
  expect(sourceLocation(document.querySelector('#target span'), 'uat')).toBeNull();
  document.querySelector('#target')!.previousSibling!.remove();
  document.querySelector('#target')!.nextSibling!.remove();
  expect(sourceLocation(document.querySelector('#target span'), 'local')).toEqual({ path: 'lib/page.html.heex', line: 10 });
});

it('requires paired annotations and never inspects sources outside local', () => {
  document.body.innerHTML = '<!-- <App.button> lib/buttons.ex:42 --><button>Save</button>';
  const button = document.querySelector('button')!;
  expect(sourceLocation(button, 'local')).toBeNull();
  const getter = vi.fn();
  Object.defineProperty(button, '__reactFiber$fixture', {get: getter});
  expect(sourceLocation(button, 'production')).toBeNull();
  expect(sourceLocation(button, 'uat')).toBeNull();
  expect(sourceLocation(button, 'local')).toBeNull();
  expect(getter).not.toHaveBeenCalled();
});

it('reads supported React debug owners without evaluating getters or following cycles', () => {
  const element = document.createElement('button');
  const owner = {_debugSource: {fileName: '/work/src/Button.tsx', lineNumber: 7}};
  Object.defineProperty(element, '__reactFiber$fixture', {value: {_debugOwner: owner}});
  expect(sourceLocation(element, 'local')).toEqual({path: '/work/src/Button.tsx', line: 7});
  const cyclic: Record<string, unknown> = {}; cyclic.return = cyclic;
  const other = document.createElement('button');
  Object.defineProperty(other, '__reactFiber$fixture', {value: cyclic});
  expect(sourceLocation(other, 'local')).toBeNull();
});

it('restricts editor protocols, encodes file paths, and stores only the developer template', () => {
  const source = {path: '/work/a?secret#x.tsx', line: 3};
  expect(editorLink(defaultEditor, {path: '/work/\ud800', line: 3})).toBeNull();
  expect(editorLink(defaultEditor, {path: 'lib/button.ex', line: 3})).toBeNull();
  expect(editorLink('vscode://file/work/project/{path}:{line}', {path: 'lib/button.ex', line: 3})).toBe('vscode://file/work/project/lib/button.ex:3');
  expect(editorLink(defaultEditor, source)).toBe('vscode://file//work/a%3Fsecret%23x.tsx:3');
  expect(editorLink('idea://open?file={path}&line={line}', source)).toBe('idea://open?file=%2Fwork%2Fa%3Fsecret%23x.tsx&line=3');
  for (const template of ['javascript:{path}', 'https://evil.test/{path}:{line}', 'vscode://command/{path}:{line}']) {
    expect(saveEditor(template)).toBe(false); expect(editorLink(template, source)).toBeNull();
  }
  expect(saveEditor('cursor://file/work/project/{path}:{line}')).toBe(true);
  expect(readEditor()).toBe('cursor://file/work/project/{path}:{line}');
  expect(localStorage.length).toBe(1);
});
