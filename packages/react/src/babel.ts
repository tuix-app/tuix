/**
 * Babel plugin: stamps `data-tuix-component="Name"` on the root host element of each
 * React component, so the Tuix widget can report component names without hand-written
 * attributes. Build time only; it shares nothing with the client runtime in index.ts.
 *
 * Nodes are typed structurally on purpose: the package must not need @babel/core (or its
 * types) for people who only use <Tuix>. The plugin only uses the `types` helpers Babel
 * passes in.
 */
interface Node { type: string; [key: string]: any } // eslint-disable-line @typescript-eslint/no-explicit-any
interface Path { node: Node; parentPath: Path | null; traverse(visitor: object): void; skip(): void }
interface Babel { types: { jsxAttribute(name: unknown, value: unknown): Node; jsxIdentifier(name: string): Node; stringLiteral(value: string): Node } }

/** The widget's rule for a valid component name; keep in step with `componentName` in packages/widget/src/locators.ts. Not imported: this runs at build time and must not load the widget. */
const COMPONENT_NAME = /^[A-Za-z_][A-Za-z0-9_.:/-]{0,99}$/;
const ATTRIBUTE = 'data-tuix-component';
const WRAPPERS = new Set(['memo', 'forwardRef']);
/** Expressions that only wrap another one: parentheses (when Babel keeps them) and TypeScript assertions. */
const TRANSPARENT = new Set(['ParenthesizedExpression', 'TSAsExpression', 'TSSatisfiesExpression', 'TSNonNullExpression', 'TSTypeAssertion']);

const isFunction = (node: Node) => node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression';
const isWrapperCall = (node: Node) => {
  if (node.type !== 'CallExpression') return false;
  const { callee } = node;
  if (callee.type === 'Identifier') return WRAPPERS.has(callee.name);
  return callee.type === 'MemberExpression' && !callee.computed && callee.object.type === 'Identifier' && callee.object.name === 'React'
    && callee.property.type === 'Identifier' && WRAPPERS.has(callee.property.name);
};

/** The name a function or class goes by: its own id for declarations, else the variable it (or its memo/forwardRef wrapper) is assigned to. */
function nameOf(path: Path): string | undefined {
  const { node } = path;
  if (node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') return node.id?.name;
  let current = path;
  for (;;) {
    const parent = current.parentPath;
    if (!parent) break;
    const wrapper = TRANSPARENT.has(parent.node.type) && parent.node.expression === current.node
      || isWrapperCall(parent.node) && parent.node.arguments[0] === current.node;
    if (!wrapper) {
      if (parent.node.type === 'VariableDeclarator' && parent.node.init === current.node && parent.node.id.type === 'Identifier') return parent.node.id.name;
      break;
    }
    current = parent;
  }
  // `export default memo(function Button() {})`: no variable, so the function's own name.
  return node.id?.name;
}

/** Stamps the host elements an expression can evaluate to as a component's root. */
function stamp(t: Babel['types'], expression: Node | null | undefined, name: string): void {
  if (!expression) return;
  switch (expression.type) {
    case 'ConditionalExpression':
      stamp(t, expression.consequent, name);
      stamp(t, expression.alternate, name);
      return;
    case 'LogicalExpression': // &&, || and ?? alike: the JSX may sit on either side
      stamp(t, expression.left, name);
      stamp(t, expression.right, name);
      return;
    case 'JSXElement': {
      const opening = expression.openingElement;
      // Host elements only: a lowercase tag. Components stamp themselves; fragments have no attributes.
      if (opening.name.type !== 'JSXIdentifier' || !/^[a-z]/.test(opening.name.name)) return;
      if (opening.attributes.some((a: Node) => a.type === 'JSXAttribute' && a.name.type === 'JSXIdentifier' && a.name.name === ATTRIBUTE)) return;
      // First, so an explicit attribute or a spread that comes later in the source wins.
      opening.attributes.unshift(t.jsxAttribute(t.jsxIdentifier(ATTRIBUTE), t.stringLiteral(name)));
      return;
    }
    default:
      if (TRANSPARENT.has(expression.type)) stamp(t, expression.expression, name);
  }
}

/** Stamps the roots of one function: its expression body, or the argument of each return that is its own. */
function stampFunction(t: Babel['types'], path: Path, name: string): void {
  const { body } = path.node;
  if (body.type !== 'BlockStatement') return stamp(t, body, name);
  path.traverse({
    Function(inner: Path) { inner.skip(); }, // returns of callbacks are not the component's
    ReturnStatement(ret: Path) { stamp(t, ret.node.argument, name); },
  });
}

export default function tuixComponents({ types: t }: Babel) {
  const visit = (path: Path) => {
    const { node } = path;
    const name = nameOf(path);
    if (!name || !/^[A-Z]/.test(name) || !COMPONENT_NAME.test(name)) return;
    if (isFunction(node)) return stampFunction(t, path, name);
    const render = node.body.body.find((m: Node) => m.type === 'ClassMethod' && m.kind === 'method' && !m.static && !m.computed
      && m.key.type === 'Identifier' && m.key.name === 'render');
    if (render) path.traverse({ ClassMethod(method: Path) { if (method.node === render) { stampFunction(t, method, name); method.skip(); } } });
  };
  return {
    name: 'tuix-component-names',
    visitor: {
      // One traversal of its own on entering the program: it runs before the visitors of other plugins in the same pass
      // rewrite components (React Refresh's `_c = memo(...)` registrations, the React Compiler when listed after this
      // plugin). A file under node_modules is left alone by returning; `path.skip()` here would stop every other plugin too.
      Program(path: Path, state: { filename?: string | null }) {
        if (/[\\/]node_modules[\\/]/.test(state.filename ?? '')) return;
        path.traverse({ Function: visit, Class: visit });
      },
    },
  };
}
