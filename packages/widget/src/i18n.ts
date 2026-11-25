import { normalizeState, turnOf, myTurn, teamViewer, unresolved } from './states';
const en = {
  pickingTouch: 'Tap an element to select it, then tap Comment here. Tap tuix. to exit.', commentHere: 'Comment here', parentElement: 'Select parent',
  updates: 'Updates on your reports', markAllRead: 'Mark all as read', noUpdates: 'No new updates.', emailUpdates: 'Email me when my conversations change', emailSchedule: 'How often to email me', emailSchedules: { immediately: 'Immediately', every_15_minutes: 'Every 15 minutes', hourly: 'Every hour', twice_daily: 'Twice a day (09:00 and 16:00)', daily: 'Daily (09:00)' } as Record<string, string>, emailSaveError: 'Could not save your email preference. Please retry.', updateUnavailable: 'Report no longer available',
  // Notification kinds (`state_kind`), also those a linked fixer hears as a member; a legacy `kind` from an older server is read through `normalizeState`.
  updateKinds: { your_turn: 'Your turn', fix_ready: 'Fix ready for you to check', member_reply: 'New reply', end_user_reply: 'New reply', in_review: 'Ready for you to verify', verify_reminder: 'Still waiting for you to verify', verify_last_call: 'Closes soon unless you check it', verify_nudge: 'Asked you to check the fix', done: 'Closed as fixed', closed: 'Closed', reopened: 'Reopened', auto_closed: 'Closed automatically', in_progress: 'In progress', assigned: 'Assigned to you', unassigned: 'No longer assigned to you', turn_returned: 'Back with you', mentioned: 'Mentioned you', turn_passed: 'Passed to you', turn_taken: 'Taken from you' } as Record<string, string>,
  mentionHint: 'Type @ to mention someone.', mentionList: 'People to mention', mentionCount: 'Suggestions: {count}', mentionNone: 'No one found', mentionLimit: 'You can mention up to 10 people.',
  openApp: 'Open tuix.app', openingApp: 'Opening tuix.app…', linkSent: 'We emailed you a sign-in link for tuix.app.', linkNeedsEmail: 'Your app has not shared your email address, so tuix cannot send you a sign-in link.', linkError: 'Could not open tuix.app. Please retry.', appNotOpened: 'No new tab?', continueApp: 'Continue to tuix.app',
  summaryLabel: 'Waiting for you', summaryTurn: 'Your turn', summaryTurnLabel: 'Your turn: {count} waiting for you',
  pageMarkers: 'Page markers', markerHelp: 'Markers show where unresolved reports are attached on this page, regardless of report-list filters.', markerAppearance: 'Appearance', markerVisibilityHelp: 'Keep these markers on the website after you close the feedback panel.', developerOptions: 'Developer options', environmentHelp: 'Choose which environments supply reports and page markers.', notifications: 'Notifications', allPages: 'All pages', showTurn: 'Your turn', showOpen: 'Open', showAll: 'All',
  settings: 'Feedback settings', reports: 'Reports', pages: 'Pages', keepMarkers: 'Show markers when the feedback panel is closed',
  selectedElement: 'Selected', changeElement: 'Change element', captureDisabled: 'Screenshot capture is disabled.',
  allReports: 'See all reports', thisPage: 'This page', moreReports: 'Load more reports', noPageReports: 'No reports match these filters.',
  markerDots: 'Dots', markerOutlines: 'Outlines', markerFills: 'Fills',

  you: 'you', takeIt: 'Take it', takeError: 'Could not take this report. Please retry.', sendTo: 'Send to', sendDefault: 'Default', keepWithMe: 'Keep with me', sendReply: 'Send', reporterTag: 'reporter',
  yourTurn: 'Your turn', waitingFor: 'Waiting for {name}', waitingTeam: 'Waiting for the team', waitingReporter: 'Waiting for the reporter', unclaimed: 'Unclaimed', closedFixed: 'Closed · Fixed', closedWord: 'Closed',
  sentTo: '→ {name}', sentYou: '→ you', sentKept: '→ kept', youActor: 'You',
  events: { turn_taken: '{name} took it', turn_passed: '{name} passed it to {to}', turn_unclaimed: '{name} left it unclaimed', urgent_set: '{name} marked it urgent', urgent_cleared: '{name} cleared urgent', fix_ready: '{name} marked the fix ready', fix_ready_release: 'The fix was released and is ready to check', works: '{name} confirmed the fix', still_broken: '{name} said it is still broken', closed: '{name} closed it', reopened: '{name} reopened it', auto_closed: 'Closed automatically after 14 days' } as Record<string, string>, someone: 'Someone',
  closedNoReply: 'This conversation is closed. Reopen it to reply.', closedOnly: 'This conversation is closed.', reopenWithNote: 'Reopen with a note', reopenNote: 'Add a note (optional)',
  actionReopen: 'Reopen', actionWorks: 'Works', actionClose: 'Mark as done', actionFixReady: 'Fix ready',
  stateSaved: 'Saved.', stateError: 'Could not save that. Your note is kept; check the conversation and retry.',
  fixPending: 'Fix waiting for deploy',
  verifyPrompt: 'Fix ready. Does it work now?', verifyPromptCheck: 'Check it', verifyPromptLater: 'Later', verifyPromptCount: '1 of {count}',
  previewUnavailable: 'Preview unavailable. Open screenshot.',
  replyPages: 'Conversation pages', latestReplies: 'Latest replies', olderReplies: 'Older replies',
  reportUnavailable: 'This report is no longer available in this environment.',
  reviewChanged: 'The report status changed. Check the latest discussion before continuing.',
  verify: 'Verify', verifyTitle: 'Verify this fix', stillBroken: 'Still broken', reviewNote: 'What is still broken?', verified: 'Thank you. Marked as fixed.', reopened: 'Sent back with your note.', verifyError: 'Could not save your decision. Your note is kept; check the report status and retry.', developerNote: 'Developer’s note', originalEvidence: 'Original screenshot', reviewEvidence: 'Latest review screenshot', noOriginal: 'No original screenshot is available.', compareLive: 'Compare the original report with the live page before deciding.', orphanVerify: 'The original element could not be found. Compare the screenshot with the current page.', reviewCapture: 'New screenshot', retake: 'Retake screenshot',
  markFixed: 'Mark fixed', fixNote: 'What did you fix?', fixHelp: 'Reviewers will verify this after it is deployed to UAT.', fixSaved: 'Fix recorded. Waiting for deployment to UAT.', fixError: 'Could not record the fix. Your note is kept; check the report status and retry.', recordingFix: 'Recording fix…', fixBuild: 'Build reference', noFixBuild: 'No build reference supplied by this app.',
  editorSetup: 'Set your local project folder in Editor settings to open this file.', source: 'Local source', openEditor: 'Open in editor', editorSettings: 'Editor settings', editorTemplate: 'Editor link template', saveEditor: 'Save on this browser', editorSaved: 'Editor setting saved on this browser.', editorInvalid: 'Use a supported editor template. Browser storage must be available.', editorHelp: 'Use {path} and {line}. Add your local project folder before {path} for relative paths. This setting and source paths stay in your browser.',

  production: 'Production', replyError: 'Could not send your reply. Please retry.', title: 'Feedback on this page', add: 'Add comment', close: 'Close feedback',
  picking: 'Click an element to comment', pickingHelp: 'Hold Alt to select its parent. Escape cancels.', cancel: 'Cancel', report: 'Leave a comment', body: 'What needs attention?',
  urgent: 'Urgent', urgentHint: 'The team hears about it at once.', markUrgent: 'Mark urgent', clearUrgent: 'Clear urgent', urgentError: 'Could not change urgent. Try again.',
  attach: 'What we attach', screenshot: 'Screenshot', remove: 'Remove screenshot', capturing: 'Preparing screenshot…', skipped: 'Screenshot unavailable. You can still send this report.',
  send: 'Send comment', sending: 'Sending…', error: 'Could not send. Your text is kept; please retry.', retry: 'Retry', loading: 'Loading feedback…', loadError: 'Could not load feedback. Please retry.',
  noReplies: 'No replies yet', unreadUpdates: 'New updates', design: 'Design', openInFigma: 'Open in Figma',
  closeChat: 'Hide conversation', showEarlier: 'Show earlier', openFullThread: 'Open full thread', elementGone: 'The element is no longer on the page. Open the full thread to see the report.',
  replyLabel: 'Add a reply', team: 'Team', moved: 'Element moved', sent: 'Comment sent.',
  console: 'Console entries', network: 'Failed requests', env: 'Environment', all: 'All environments', defaults: 'UAT + production', local: 'Local only', disabled: 'Feedback is disabled for this project.',
  iframe: 'This report points to an embedded frame. Its contents are not captured.', show: 'Show',
};
const pl: typeof en = {
  pickingTouch: 'Stuknij element, aby go wybrać, a potem Skomentuj. Stuknij tuix., aby wyjść.', commentHere: 'Skomentuj', parentElement: 'Wybierz rodzica',
  updates: 'Zmiany w Twoich zgłoszeniach', markAllRead: 'Oznacz wszystkie jako przeczytane', noUpdates: 'Brak nowych zmian.', emailUpdates: 'Wysyłaj mi e-mail, gdy coś zmieni się w moich rozmowach', emailSchedule: 'Jak często wysyłać mi e-maile', emailSchedules: { immediately: 'Od razu', every_15_minutes: 'Co 15 minut', hourly: 'Co godzinę', twice_daily: 'Dwa razy dziennie (9:00 i 16:00)', daily: 'Raz dziennie (9:00)' }, emailSaveError: 'Nie udało się zapisać ustawienia e-mail. Spróbuj ponownie.', updateUnavailable: 'Zgłoszenie jest już niedostępne',
  updateKinds: { your_turn: 'Twoja kolej', fix_ready: 'Poprawka gotowa do sprawdzenia', member_reply: 'Nowa odpowiedź', end_user_reply: 'Nowa odpowiedź', in_review: 'Gotowe do sprawdzenia', verify_reminder: 'Wciąż czeka, aż je sprawdzisz', verify_last_call: 'Wkrótce zostanie zamknięte, jeśli go nie sprawdzisz', verify_nudge: 'Poproszono o sprawdzenie poprawki', done: 'Zamknięte jako naprawione', closed: 'Zamknięte', reopened: 'Otwarte ponownie', auto_closed: 'Zamknięte automatycznie', in_progress: 'W toku', assigned: 'Przypisane do Ciebie', unassigned: 'Już nie przypisane do Ciebie', turn_returned: 'Wróciło do Ciebie', mentioned: 'Wspomniano o Tobie', turn_passed: 'Przekazano Tobie', turn_taken: 'Przejęte od Ciebie' } as Record<string, string>,
  mentionHint: 'Wpisz @, aby wspomnieć o kimś.', mentionList: 'Osoby, o których możesz wspomnieć', mentionCount: 'Podpowiedzi: {count}', mentionNone: 'Nikogo nie znaleziono', mentionLimit: 'Możesz wspomnieć o najwyżej 10 osobach.',
  openApp: 'Otwórz tuix.app', openingApp: 'Otwieranie tuix.app…', linkSent: 'Wysłaliśmy Ci e-mail z linkiem do logowania w tuix.app.', linkNeedsEmail: 'Twoja aplikacja nie przekazała adresu e-mail, więc tuix nie może wysłać linku do logowania.', linkError: 'Nie udało się otworzyć tuix.app. Spróbuj ponownie.', appNotOpened: 'Nie otworzyła się nowa karta?', continueApp: 'Przejdź do tuix.app',
  summaryLabel: 'Czeka na Ciebie', summaryTurn: 'Twoja kolej', summaryTurnLabel: 'Twoja kolej: czeka na Ciebie {count}',
  pageMarkers: 'Znaczniki na stronie', markerHelp: 'Znaczniki wskazują elementy z nierozwiązanymi zgłoszeniami na tej stronie, niezależnie od filtrów listy zgłoszeń.', markerAppearance: 'Wygląd', markerVisibilityHelp: 'Zostaw znaczniki na stronie po zamknięciu panelu uwag.', developerOptions: 'Opcje deweloperskie', environmentHelp: 'Wybierz środowiska, z których pochodzą zgłoszenia i znaczniki.', notifications: 'Powiadomienia', allPages: 'Wszystkie strony', showTurn: 'Twoja kolej', showOpen: 'Otwarte', showAll: 'Wszystkie',
  settings: 'Ustawienia uwag', reports: 'Zgłoszenia', pages: 'Strony', keepMarkers: 'Pokazuj znaczniki po zamknięciu panelu uwag',
  selectedElement: 'Wybrany element', changeElement: 'Zmień element', captureDisabled: 'Zrzuty ekranu są wyłączone.',
  allReports: 'Wszystkie zgłoszenia', thisPage: 'Ta strona', moreReports: 'Wczytaj więcej zgłoszeń', noPageReports: 'Brak zgłoszeń pasujących do filtrów.',
  markerDots: 'Kropki', markerOutlines: 'Obramowania', markerFills: 'Wypełnienia',

  you: 'Ciebie', takeIt: 'Przejmij', takeError: 'Nie udało się przejąć zgłoszenia. Spróbuj ponownie.', sendTo: 'Wyślij do', sendDefault: 'Domyślnie', keepWithMe: 'Zostaw u siebie', sendReply: 'Wyślij', reporterTag: 'zgłaszający',
  yourTurn: 'Twoja kolej', waitingFor: 'Czeka na: {name}', waitingTeam: 'Czeka na zespół', waitingReporter: 'Czeka na zgłaszającego', unclaimed: 'Nikt się tym jeszcze nie zajął', closedFixed: 'Zamknięte · Naprawione', closedWord: 'Zamknięte',
  sentTo: '→ {name}', sentYou: '→ Ty', sentKept: '→ zostaje', youActor: 'Ciebie',
  events: { turn_taken: 'Przejęte przez {name}', turn_passed: 'Przekazane do {to} przez {name}', turn_unclaimed: 'Zostawione bez właściciela przez {name}', urgent_set: 'Oznaczone jako pilne przez {name}', urgent_cleared: 'Zdjęte oznaczenie pilne przez {name}', fix_ready: 'Poprawka gotowa, zgłoszona przez {name}', fix_ready_release: 'Poprawka została wydana i czeka na sprawdzenie', works: 'Poprawka potwierdzona przez {name}', still_broken: 'Nadal nie działa, zgłoszone przez {name}', closed: 'Zamknięte przez {name}', reopened: 'Otwarte ponownie przez {name}', auto_closed: 'Zamknięte automatycznie po 14 dniach' } as Record<string, string>, someone: 'Ktoś',
  closedNoReply: 'Ta rozmowa jest zamknięta. Otwórz ją ponownie, aby odpowiedzieć.', closedOnly: 'Ta rozmowa jest zamknięta.', reopenWithNote: 'Otwórz ponownie z notatką', reopenNote: 'Dodaj notatkę (opcjonalnie)',
  actionReopen: 'Otwórz ponownie', actionWorks: 'Działa', actionClose: 'Oznacz jako załatwione', actionFixReady: 'Poprawka gotowa',
  stateSaved: 'Zapisano.', stateError: 'Nie udało się tego zapisać. Notatka została zachowana; sprawdź rozmowę i spróbuj ponownie.',
  fixPending: 'Poprawka czeka na wdrożenie',
  verifyPrompt: 'Poprawka gotowa. Czy już działa?', verifyPromptCheck: 'Sprawdź', verifyPromptLater: 'Później', verifyPromptCount: '1 z {count}',
  previewUnavailable: 'Podgląd niedostępny. Otwórz zrzut.',
  replyPages: 'Strony rozmowy', latestReplies: 'Najnowsze odpowiedzi', olderReplies: 'Starsze odpowiedzi',
  reportUnavailable: 'To zgłoszenie nie jest już dostępne w tym środowisku.',
  reviewChanged: 'Status zgłoszenia się zmienił. Sprawdź najnowszą dyskusję, zanim przejdziesz dalej.',
  verify: 'Sprawdź', verifyTitle: 'Sprawdź poprawkę', stillBroken: 'Nadal nie działa', reviewNote: 'Co nadal nie działa?', verified: 'Dziękujemy. Oznaczono jako naprawione.', reopened: 'Odesłano z Twoją notatką.', verifyError: 'Nie udało się zapisać decyzji. Notatka została zachowana; sprawdź status i spróbuj ponownie.', developerNote: 'Notatka dewelopera', originalEvidence: 'Pierwotny zrzut ekranu', reviewEvidence: 'Ostatni zrzut z weryfikacji', noOriginal: 'Pierwotny zrzut ekranu jest niedostępny.', compareLive: 'Przed podjęciem decyzji porównaj zgłoszenie z aktualną stroną.', orphanVerify: 'Nie znaleziono pierwotnego elementu. Porównaj zrzut z aktualną stroną.', reviewCapture: 'Nowy zrzut ekranu', retake: 'Powtórz zrzut',
  markFixed: 'Oznacz jako naprawione', fixNote: 'Co zostało naprawione?', fixHelp: 'Recenzenci sprawdzą poprawkę po wdrożeniu na UAT.', fixSaved: 'Zapisano poprawkę. Oczekiwanie na wdrożenie na UAT.', fixError: 'Nie udało się zapisać poprawki. Notatka została zachowana; sprawdź status zgłoszenia i spróbuj ponownie.', recordingFix: 'Zapisywanie poprawki…', fixBuild: 'Wersja poprawki', noFixBuild: 'Aplikacja nie podała wersji poprawki.',
  editorSetup: 'Ustaw lokalny folder projektu w ustawieniach edytora, aby otworzyć plik.', source: 'Lokalny kod', openEditor: 'Otwórz w edytorze', editorSettings: 'Ustawienia edytora', editorTemplate: 'Szablon odnośnika do edytora', saveEditor: 'Zapisz w tej przeglądarce', editorSaved: 'Ustawienie edytora zapisano w tej przeglądarce.', editorInvalid: 'Użyj obsługiwanego szablonu edytora. Pamięć przeglądarki musi być dostępna.', editorHelp: 'Użyj {path} i {line}. Dla ścieżek względnych dodaj lokalny folder projektu przed {path}. Ustawienie i ścieżki kodu zostają w przeglądarce.',

  production: 'Produkcja', replyError: 'Nie udało się wysłać odpowiedzi. Spróbuj ponownie.', title: 'Uwagi do tej strony', add: 'Dodaj komentarz', close: 'Zamknij uwagi',
  picking: 'Kliknij element, aby dodać komentarz', pickingHelp: 'Przytrzymaj Alt, aby wybrać rodzica. Escape anuluje.', cancel: 'Anuluj', report: 'Zostaw komentarz', body: 'Co wymaga uwagi?',
  urgent: 'Pilne', urgentHint: 'Zespół dowie się o tym od razu.', markUrgent: 'Oznacz jako pilne', clearUrgent: 'Zdejmij oznaczenie pilne', urgentError: 'Nie udało się zmienić oznaczenia. Spróbuj ponownie.',
  attach: 'Co dołączamy', screenshot: 'Zrzut ekranu', remove: 'Usuń zrzut', capturing: 'Przygotowywanie zrzutu…', skipped: 'Zrzut jest niedostępny. Nadal możesz wysłać zgłoszenie.',
  send: 'Wyślij komentarz', sending: 'Wysyłanie…', error: 'Nie udało się wysłać. Treść została zachowana; spróbuj ponownie.', retry: 'Ponów', loading: 'Wczytywanie uwag…', loadError: 'Nie udało się wczytać uwag. Spróbuj ponownie.',
  noReplies: 'Brak odpowiedzi', unreadUpdates: 'Nowe zmiany', design: 'Projekt', openInFigma: 'Otwórz w Figmie',
  closeChat: 'Ukryj rozmowę', showEarlier: 'Pokaż wcześniejsze', openFullThread: 'Otwórz pełną rozmowę', elementGone: 'Elementu nie ma już na stronie. Otwórz pełną rozmowę, aby zobaczyć zgłoszenie.',
  replyLabel: 'Dodaj odpowiedź', team: 'Zespół', moved: 'Element został przeniesiony', sent: 'Komentarz wysłany.',
  console: 'Wpisy konsoli', network: 'Nieudane żądania', env: 'Środowisko', all: 'Wszystkie środowiska', defaults: 'UAT + produkcja', local: 'Tylko lokalne', disabled: 'Uwagi są wyłączone dla tego projektu.',
  iframe: 'Zgłoszenie wskazuje osadzoną ramkę. Jej zawartość nie jest przechwytywana.', show: 'Pokaż',
};
const isPolish = (lang?: string) => (lang ?? navigator.language).startsWith('pl');
export const translations = (lang?: string) => isPolish(lang) ? pl : en;

const statuses: Record<string, [string, string]> = {
  open: ['Open', 'Otwarte'], in_review: ['Fix ready', 'Poprawka gotowa'],
  done: ['Fixed', 'Naprawione'], closed: ['Closed', 'Zamknięte'], sending: ['Sending…', 'Wysyłanie…'],
};
/** Labels the four states (Open, Fix ready, Fixed, Closed); other names (`in_progress`, legacy statuses, `state_name`) are mapped first. */
export function statusLabel(status: string, lang?: string) {
  const polish = isPolish(lang);
  return statuses[normalizeState(status)]?.[polish ? 1 : 0] ?? (polish ? 'Status niedostępny' : 'Status unavailable');
}

/** Fills `{name}` style placeholders. */
export const fill = (text: string, values: Record<string, string>) => text.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? '');

/**
 * The ONE turn line of a conversation, phrased for the viewer: "Your turn", "Waiting for Anna", "Waiting for the team", "Unclaimed" (only
 * team viewers: a reporter, and anyone else from the app, hears "Waiting for the team"), "Closed" or "Closed · Fixed". Null while the
 * server sends no turn at all (an older server before turns) or for a report still sending. Older servers' `turn` stands in for the
 * stored holder.
 */
export function turnLine(issue: { turn?: string | null; reporter?: boolean; fixer?: boolean; can_be_fixer?: boolean; can_take?: boolean; turn_options?: unknown[]; actions?: string[]; turn_holder?: { name: string | null; me: boolean; reporter: boolean } | null; state_name?: string | null; state?: string | null; status?: string }, lang?: string) {
  const t = translations(lang), state = normalizeState(issue.state_name || issue.state || issue.status);
  if (state === 'done') return t.closedFixed;
  if (state === 'closed') return t.closedWord;
  if (!unresolved.includes(state)) return null;
  if (myTurn(issue)) return t.yourTurn;
  const holder = issue.turn_holder;
  if (holder !== undefined) {
    if (holder) return issue.reporter ? t.waitingTeam : holder.name ? fill(t.waitingFor, { name: holder.name }) : holder.reporter ? t.waitingReporter : t.waitingTeam;
    return teamViewer(issue) && !issue.reporter ? t.unclaimed : t.waitingTeam;
  }
  const turn = turnOf(issue);
  if (!turn) return null;
  return !issue.reporter && turn !== 'team' ? t.waitingReporter : t.waitingTeam;
}

/** What a reply's arrow says: "→ Anna", "→ you", "→ kept"; null when the reply sent the turn nowhere the viewer may know. */
export function sentLine(comment: { sent_to?: { name: string | null; me?: boolean } | null; keeps?: boolean }, lang?: string) {
  const t = translations(lang);
  if (comment.keeps) return t.sentKept;
  const to = comment.sent_to;
  if (!to) return null;
  return to.me ? t.sentYou : to.name ? fill(t.sentTo, { name: to.name }) : null;
}

/** One small line for a timeline event, in words; null for a kind this widget does not know (a newer server) and for a pass a reply already says. */
export function eventLine(event: { kind: string; actor?: { name: string | null; me?: boolean } | null; to?: { name: string | null; me?: boolean } | null; with_reply?: boolean }, lang?: string) {
  const t = translations(lang);
  if (event.kind === 'turn_passed' && event.with_reply) return null;
  const nobody = !event.actor?.name && !event.actor?.me;
  const key = event.kind === 'turn_passed' && !event.to ? 'turn_unclaimed' : event.kind === 'fix_ready' && nobody ? 'fix_ready_release' : event.kind;
  const text = t.events[key];
  if (!text) return null;
  const person = (who?: { name: string | null; me?: boolean } | null) => who?.me ? t.youActor : who?.name || t.someone;
  return fill(text, { name: person(event.actor), to: event.to?.me ? t.you : person(event.to) });
}
