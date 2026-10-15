import type { Ref } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { statusLabel, type translations } from './i18n';
import { ThreadComments, ReplyForm, VerifyTools, CloseIcon } from './thread';
import type { Placement } from './chat-placement';
import type { Mention, EscapeRef } from './mentions';
import type { Api } from './api';
import type { Issue } from './types';

/** How many of the newest replies the window shows before "Show earlier". */
export const CHAT_REPLIES = 5;

type T = ReturnType<typeof translations>;
export interface ChatWindowProps {
  t: T; lang?: string; api: Api;
  /** The report as the marker list knows it (its title is there before the thread loads), and its thread once loaded. */
  issue: Pick<Issue, 'id' | 'number' | 'title'>; thread: Issue | null;
  /** The state key (`stateOf`), the colour class of the marker, and where the window sits. */
  state: string; turn: string | null; tone: string; place: Placement; windowRef: Ref<HTMLElement>;
  /** What the marker lost: its element is not on screen any more, or was found by its stored position only. */
  gone: boolean; moved: boolean;
  loading: boolean; error: string; notice: string; busy: boolean; closed: boolean;
  expanded: boolean; onExpand: () => void;
  reply: string; onReply: (value: string) => void; picks: Mention[]; onPick: (mention: Mention) => void; escape: EscapeRef; onSend: () => void;
  /** Done / Still broken, when the caller is the reporter of a report in review. */
  verify: null | { works: boolean; broken: boolean; reviewing: boolean; note: string; onNote: (value: string) => void; onWorks: () => void; onBroken: () => void; onCancel: () => void; onSend: () => void };
  onRetry: () => void; onFull: () => void; onClose: () => void;
}

/** A small thread beside the reported element: the newest replies, a reply form and the reporter's verify actions. Text nodes only. */
export function ChatWindow(p: ChatWindowProps) {
  const { t, thread, issue } = p, body = useRef<HTMLDivElement>(null);
  const comments = thread?.comments ?? [], hidden = p.expanded ? 0 : Math.max(0, comments.length - CHAT_REPLIES);
  const shown = hidden ? comments.slice(-CHAT_REPLIES) : comments;
  // Earlier replies on the server (a long thread) open in the side panel, which pages through them.
  const earlier = hidden > 0 || !!thread?.comments_older;
  // The newest reply is what a chat shows: the list sits scrolled to its end when replies arrive.
  // Keyed on the last reply, not the count: a thread past CHAT_REPLIES keeps showing that many while the newest changes.
  useEffect(() => { const list = body.current; if (list) list.scrollTop = list.scrollHeight; }, [shown[shown.length - 1]?.id, !!thread]);
  // "Show earlier" adds replies above: the list goes to its top, where they are, rather than staying put or jumping to the end.
  useEffect(() => { if (p.expanded && body.current) body.current.scrollTop = 0; }, [p.expanded]);
  const heading = `#${issue.number || '…'} ${issue.title}`;
  return <section ref={p.windowRef} id="tuix-chat" class="chat-window" role="dialog" aria-label={heading} tabIndex={-1} data-state={p.tone} data-side={p.place.side}
    style={{ left: p.place.left, top: p.place.top, maxHeight: p.place.maxHeight }}>
    <header>
      <div class="chat-title"><h2>{heading}</h2><span class="chat-status"><span class="status" data-status={p.state}>{statusLabel(p.state, p.lang)}</span>{p.turn && <span class="turn">{p.turn}</span>}</span></div>
      <button type="button" class="icon-button" data-action="close-chat" aria-label={t.closeChat} onClick={p.onClose}><CloseIcon/></button>
    </header>
    <div class="chat-body" ref={body}>
      {(p.gone || p.moved) && <p class="muted chat-moved" role="status">{p.gone ? t.elementGone : t.moved}</p>}
      {p.notice && <p class="notice" role="status">{p.notice}</p>}
      {p.error && <p class="error" role="alert">{p.error} {!thread && <button type="button" onClick={p.onRetry}>{t.retry}</button>}</p>}
      {p.loading && !thread && <p role="status">{t.loading}</p>}
      {thread && <>
        {earlier && <button type="button" class="text-button" data-action="show-earlier" disabled={p.loading || p.busy} onClick={hidden > 0 ? p.onExpand : p.onFull}>{t.showEarlier}</button>}
        {!earlier && thread.body && <p class="chat-report"><span class="muted">{thread.author.name}</span><br/>{thread.body}</p>}
        <ThreadComments comments={shown} lang={p.lang} t={t}/>
        {!comments.length && !earlier && <p class="muted">{t.noReplies}</p>}
        {p.verify && <VerifyTools t={t} thread={thread} busy={p.busy} reviewing={p.verify.reviewing} note={p.verify.note} works={p.verify.works} broken={p.verify.broken}
          onNote={p.verify.onNote} onWorks={p.verify.onWorks} onBroken={p.verify.onBroken} onCancel={p.verify.onCancel} onSend={p.verify.onSend}/>}
      </>}
    </div>
    <footer>
      {thread && !p.closed && !p.verify?.reviewing && <ReplyForm api={p.api} thread={thread} t={t} value={p.reply} onValue={p.onReply} busy={p.busy} picks={p.picks} onPick={p.onPick} escape={p.escape} onSubmit={p.onSend}/>}
      <button type="button" class="text-button" data-action="open-full-thread" onClick={p.onFull}>{t.openFullThread}</button>
    </footer>
  </section>;
}
