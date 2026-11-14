// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { placeVideos, sanitizeClone, videoStandIn } from '../src/screenshot';
describe('screenshot clone privacy', () => {
  it('replaces form values, masks, editable content and frames without changing the host', () => {
    document.body.innerHTML = '<main><div data-tuix-mask style="width:120px;height:30px"><span>private customer</span></div><input value="private input"><textarea>private note</textarea><select><option selected>private choice</option></select><p contenteditable>private editable</p><iframe srcdoc="private frame"></iframe><button onclick="alert(1)">Public button</button><tuix-widget>Feedback UI</tuix-widget></main>';
    const copy = document.querySelector('main')!.cloneNode(true) as Element;
    sanitizeClone(copy);
    expect(copy.textContent).toBe('Public button');
    expect(copy.innerHTML).not.toContain('private');
    expect(copy.querySelector('input,textarea,select,iframe,[contenteditable],[data-tuix-mask],tuix-widget,[onclick]')).toBeNull();
    expect(copy.querySelector('div')!.style.width).toBe('120px');
    expect(document.querySelector('input')!.value).toBe('private input');
    expect(document.querySelector('[data-tuix-mask]')!.textContent).toBe('private customer');
  });
});
describe('video stand-ins', () => {
  // The library's copy: every kept child once, in order; comments, styles, scripts and filtered nodes left out.
  function copy(parent: Element, skip: (node: Node) => boolean) {
    const cloned = parent.cloneNode(false), kept = new WeakSet<Node>();
    for (const child of parent.childNodes) {
      if (child.nodeType === 8 || /^(STYLE|SCRIPT)$/.test(child.nodeName) || skip(child)) continue;
      kept.add(child);
      cloned.appendChild(child.cloneNode(true));
    }
    return { cloned: cloned as Element, kept };
  }
  const mark = (video: Element) => Object.assign(document.createElement('img'), { alt: video.id });
  it('puts each stand-in where its video is among the copied siblings', () => {
    document.body.innerHTML = '<div id="p"><video id="a"></video>text<!-- note --><style>p{}</style><span>one</span><video id="b"></video><i data-skip>gone</i><video id="c"></video>tail<b>two</b><video id="d"></video></div>';
    const parent = document.querySelector('#p')!, videos = [...parent.querySelectorAll('video')];
    const { cloned, kept } = copy(parent, node => node.nodeName === 'VIDEO' || (node as Element).hasAttribute?.('data-skip'));
    const placed = placeVideos(parent, cloned, videos, kept, mark);
    expect(placed).toHaveLength(4);
    expect(cloned.innerHTML).toBe('<img alt="a">text<span>one</span><img alt="b"><img alt="c">tail<b>two</b><img alt="d">');
    expect(parent.querySelectorAll('video')).toHaveLength(4);
  });
  it('appends stand-ins for videos reached through a shadow root', () => {
    document.body.innerHTML = '<div id="host"></div>';
    const host = document.querySelector('#host')!, root = host.attachShadow({ mode: 'open' });
    root.innerHTML = '<span>label</span><video id="v"></video>';
    const cloned = host.cloneNode(false) as Element, kept = new WeakSet<Node>([root.firstChild!]);
    cloned.appendChild(root.firstChild!.cloneNode(true));
    placeVideos(host, cloned, [root.querySelector('video')!], kept, mark);
    expect(cloned.innerHTML).toBe('<span>label</span><img alt="v">');
  });
  it('keeps the box of a video and shows its poster without loading the video', () => {
    document.body.innerHTML = '<video src="https://cdn.example/clip.mp4" poster="https://cdn.example/poster.jpg" style="display:block;position:absolute;width:320px;height:180px;object-fit:cover"></video><video src="https://cdn.example/other.mp4" style="width:100px"></video>';
    const [first, second] = [...document.querySelectorAll('video')];
    const still = videoStandIn(first, { x: 0, y: 0, width: 800, height: 600 }, 1);
    expect(still.tagName).toBe('IMG');
    expect(still.src).toBe('https://cdn.example/poster.jpg');
    expect(still.style.position).toBe('absolute');
    expect(still.style.width).toBe('320px');
    expect(still.style.height).toBe('180px');
    expect(still.style.objectFit).toBe('cover');
    const empty = videoStandIn(second, null, 1);
    expect(empty.src).toMatch(/^data:image\/gif/);
    expect(empty.style.width).toBe('100px');
    expect(empty.style.backgroundColor).not.toBe('rgb(0, 0, 0)');
  });
});
