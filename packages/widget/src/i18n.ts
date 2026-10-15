import { normalizeState } from './states';
const en = {
  pickingTouch: 'Tap an element to select it, then tap Comment here. Tap tuix. to exit.', commentHere: 'Comment here', parentElement: 'Select parent',
  involving: 'Involving', everyone: 'Everyone', mine: 'Me', noOwnReports: 'Nothing that involves you matches these filters.',
  updates: 'Updates on your reports', markAllRead: 'Mark all as read', noUpdates: 'No new updates.', emailUpdates: 'Email me when my reports change status', emailSchedule: 'How often to email me', emailSchedules: { immediately: 'Immediately', every_15_minutes: 'Every 15 minutes', hourly: 'Every hour', twice_daily: 'Twice a day (09:00 and 16:00)', daily: 'Daily (09:00)' } as Record<string, string>, emailSaveError: 'Could not save your email preference. Please retry.', updateUnavailable: 'Report no longer available',
  // Notification kinds (`state_kind`), also those a linked fixer hears as a member; a legacy `kind` from an older server is read through `normalizeState`.
  updateKinds: { member_reply: 'New reply', end_user_reply: 'New reply', in_progress: 'In progress', in_review: 'Ready for you to verify', done: 'Done', wont_fix: 'Won’t fix', closed: 'Closed', reopened: 'Reopened', auto_closed: 'Closed automatically', assigned: 'Assigned to you', unassigned: 'No longer assigned to you', mentioned: 'Mentioned you' } as Record<string, string>,
  mentionHint: 'Type @ to mention someone.', mentionList: 'People to mention', mentionCount: 'Suggestions: {count}', mentionNone: 'No one found', mentionLimit: 'You can mention up to 10 people.',
  openApp: 'Open tuix.app', openingApp: 'Opening tuix.app…', linkSent: 'We emailed you a sign-in link for tuix.app.', linkNeedsEmail: 'Your app has not shared your email address, so tuix cannot send you a sign-in link.', linkError: 'Could not open tuix.app. Please retry.', appNotOpened: 'No new tab?', continueApp: 'Continue to tuix.app',
  summaryLabel: 'Reports waiting for you', summaryVerify: 'To verify', summaryOpen: 'Open', summaryVerifyLabel: 'To verify {count}: your reports waiting for your check', summaryOpenLabel: 'Open {count}: reports assigned to you',
  settings: 'Feedback settings', reports: 'Reports', pages: 'Pages', keepMarkers: 'Keep visible when closed', hideClosed: 'Hide closed',
  selectedElement: 'Selected', changeElement: 'Change element', captureDisabled: 'Screenshot capture is disabled.',
  noScreenshot: 'No screenshot was attached.', restrictedScreenshot: 'Screenshot is not available in this environment.', unavailableScreenshot: 'Screenshot unavailable.',
  allReports: 'See all reports', thisPage: 'This page', moreReports: 'Load more reports', noPageReports: 'No reports match these filters.',
  markers: 'Markers', markerDots: 'Dots', markerOutlines: 'Outlines', markersClosed: 'When closed', markersHidden: 'Hidden', markersVisible: 'Visible',
  show: 'Show', statusAll: 'All', statusOpen: 'Open', statusVerify: 'To verify',
  fixer: 'Fixer', noFixer: 'No fixer yet', you: 'you', assignToMe: 'Assign to me', assignError: 'Could not assign this report to you. Please retry.',
  actionReopen: 'Reopen', actionDone: 'Done', actionClose: 'Close', actionStart: 'Start', actionReview: 'Ready for review', actionWontFix: 'Won’t fix',
  wontFixNote: 'Why won’t this be fixed?', stateSaved: 'Status changed to {status}.', stateError: 'Could not change the status. Your note is kept; check the report status and retry.',
  fixPending: 'Fix waiting for deploy',
  previewUnavailable: 'Preview unavailable. Open screenshot.',
  replyPages: 'Conversation pages', latestReplies: 'Latest replies', olderReplies: 'Older replies',
  reportUnavailable: 'This report is no longer available in this environment.',
  reviewChanged: 'The report status changed. Check the latest discussion before continuing.',
  verify: 'Verify', verifyTitle: 'Verify this fix', stillBroken: 'Still broken', reviewNote: 'What is still broken?', sendReview: 'Reopen report', verified: 'Fix verified. Thank you.', reopened: 'Report reopened with your review.', verifyError: 'Could not save your decision. Your note is kept; check the report status and retry.', developerNote: 'Developer’s note', originalEvidence: 'Original screenshot', reviewEvidence: 'Latest review screenshot', noOriginal: 'No original screenshot is available.', compareLive: 'Compare the original report with the live page before deciding.', orphanVerify: 'The original element could not be found. Compare the screenshot with the current page.', reviewCapture: 'New screenshot', retake: 'Retake screenshot',
  markFixed: 'Mark fixed', fixNote: 'What did you fix?', fixHelp: 'Reviewers will verify this after it is deployed to UAT.', fixSaved: 'Fix recorded. Waiting for deployment to UAT.', fixError: 'Could not record the fix. Your note is kept; check the report status and retry.', recordingFix: 'Recording fix…', fixBuild: 'Build reference', noFixBuild: 'No build reference supplied by this app.',
  editorSetup: 'Set your local project folder in Editor settings to open this file.', source: 'Local source', openEditor: 'Open in editor', editorSettings: 'Editor settings', editorTemplate: 'Editor link template', saveEditor: 'Save on this browser', editorSaved: 'Editor setting saved on this browser.', editorInvalid: 'Use a supported editor template. Browser storage must be available.', editorHelp: 'Use {path} and {line}. Add your local project folder before {path} for relative paths. This setting and source paths stay in your browser.',

  production: 'Production', replyError: 'Could not send your reply. Please retry.', title: 'Feedback on this page', add: 'Add comment', close: 'Close feedback', empty: 'Nothing reported here yet.', emptyHelp: 'Point at something that needs attention.',
  picking: 'Click an element to comment', pickingHelp: 'Hold Alt to select its parent. Escape cancels.', cancel: 'Cancel', report: 'Leave a comment', body: 'What needs attention?',
  type: 'Type', bug: 'Bug', ux: 'UX issue', question: 'Question', idea: 'Idea', severity: 'Severity', optional: 'Not specified', blocking: 'Blocking', major: 'Major', minor: 'Minor',
  attach: 'What we attach', screenshot: 'Screenshot', remove: 'Remove screenshot', capturing: 'Preparing screenshot…', skipped: 'Screenshot unavailable. You can still send this report.',
  send: 'Send comment', sending: 'Sending…', error: 'Could not send. Your text is kept; please retry.', retry: 'Retry', loading: 'Loading feedback…', loadError: 'Could not load feedback. Please retry.',
  back: 'All reports', reply: 'Reply', replyLabel: 'Add a reply', team: 'Team', moved: 'Element moved', sent: 'Comment sent.',
  console: 'Console entries', network: 'Failed requests', env: 'Environment', all: 'All environments', defaults: 'UAT + production', local: 'Local only', disabled: 'Feedback is disabled for this project.',
  iframe: 'This report points to an embedded frame. Its contents are not captured.', status: 'Status', details: 'Report details',
};
const pl: typeof en = {
  pickingTouch: 'Stuknij element, aby go wybrać, a potem Skomentuj. Stuknij tuix., aby wyjść.', commentHere: 'Skomentuj', parentElement: 'Wybierz rodzica',
  involving: 'Dotyczy', everyone: 'Wszystkich', mine: 'Mnie', noOwnReports: 'Nic, co Cię dotyczy, nie pasuje do tych filtrów.',
  updates: 'Zmiany w Twoich zgłoszeniach', markAllRead: 'Oznacz wszystkie jako przeczytane', noUpdates: 'Brak nowych zmian.', emailUpdates: 'Wysyłaj mi e-mail, gdy status moich zgłoszeń się zmieni', emailSchedule: 'Jak często wysyłać mi e-maile', emailSchedules: { immediately: 'Od razu', every_15_minutes: 'Co 15 minut', hourly: 'Co godzinę', twice_daily: 'Dwa razy dziennie (9:00 i 16:00)', daily: 'Raz dziennie (9:00)' }, emailSaveError: 'Nie udało się zapisać ustawienia e-mail. Spróbuj ponownie.', updateUnavailable: 'Zgłoszenie jest już niedostępne',
  updateKinds: { member_reply: 'Nowa odpowiedź', end_user_reply: 'Nowa odpowiedź', in_progress: 'W toku', in_review: 'Gotowe do sprawdzenia', done: 'Gotowe', wont_fix: 'Bez poprawki', closed: 'Zamknięte', reopened: 'Otwarte ponownie', auto_closed: 'Zamknięte automatycznie', assigned: 'Przypisane do Ciebie', unassigned: 'Już nie przypisane do Ciebie', mentioned: 'Wspomniano o Tobie' } as Record<string, string>,
  mentionHint: 'Wpisz @, aby wspomnieć o kimś.', mentionList: 'Osoby, o których możesz wspomnieć', mentionCount: 'Podpowiedzi: {count}', mentionNone: 'Nikogo nie znaleziono', mentionLimit: 'Możesz wspomnieć o najwyżej 10 osobach.',
  openApp: 'Otwórz tuix.app', openingApp: 'Otwieranie tuix.app…', linkSent: 'Wysłaliśmy Ci e-mail z linkiem do logowania w tuix.app.', linkNeedsEmail: 'Twoja aplikacja nie przekazała adresu e-mail, więc tuix nie może wysłać linku do logowania.', linkError: 'Nie udało się otworzyć tuix.app. Spróbuj ponownie.', appNotOpened: 'Nie otworzyła się nowa karta?', continueApp: 'Przejdź do tuix.app',
  summaryLabel: 'Zgłoszenia czekające na Ciebie', summaryVerify: 'Do sprawdzenia', summaryOpen: 'Otwarte', summaryVerifyLabel: 'Do sprawdzenia {count}: Twoje zgłoszenia czekają na sprawdzenie', summaryOpenLabel: 'Otwarte {count}: zgłoszenia przypisane do Ciebie',
  settings: 'Ustawienia uwag', reports: 'Zgłoszenia', pages: 'Strony', keepMarkers: 'Widoczne po zamknięciu', hideClosed: 'Ukryj zamknięte',
  selectedElement: 'Wybrany element', changeElement: 'Zmień element', captureDisabled: 'Zrzuty ekranu są wyłączone.',
  noScreenshot: 'Nie dołączono zrzutu ekranu.', restrictedScreenshot: 'Zrzut ekranu nie jest dostępny w tym środowisku.', unavailableScreenshot: 'Zrzut ekranu jest niedostępny.',
  allReports: 'Wszystkie zgłoszenia', thisPage: 'Ta strona', moreReports: 'Wczytaj więcej zgłoszeń', noPageReports: 'Brak zgłoszeń pasujących do filtrów.',
  markers: 'Znaczniki', markerDots: 'Kropki', markerOutlines: 'Obramowania', markersClosed: 'Po zamknięciu', markersHidden: 'Ukryte', markersVisible: 'Widoczne',
  show: 'Pokaż', statusAll: 'Wszystkie', statusOpen: 'Otwarte', statusVerify: 'Do sprawdzenia',
  fixer: 'Naprawia', noFixer: 'Nikt jeszcze nie naprawia', you: 'Ty', assignToMe: 'Przypisz do mnie', assignError: 'Nie udało się przypisać zgłoszenia do Ciebie. Spróbuj ponownie.',
  actionReopen: 'Otwórz ponownie', actionDone: 'Gotowe', actionClose: 'Zamknij', actionStart: 'Rozpocznij', actionReview: 'Gotowe do sprawdzenia', actionWontFix: 'Bez poprawki',
  wontFixNote: 'Dlaczego nie będzie poprawki?', stateSaved: 'Zmieniono status na: {status}.', stateError: 'Nie udało się zmienić statusu. Notatka została zachowana; sprawdź status zgłoszenia i spróbuj ponownie.',
  fixPending: 'Poprawka czeka na wdrożenie',
  previewUnavailable: 'Podgląd niedostępny. Otwórz zrzut.',
  replyPages: 'Strony rozmowy', latestReplies: 'Najnowsze odpowiedzi', olderReplies: 'Starsze odpowiedzi',
  reportUnavailable: 'To zgłoszenie nie jest już dostępne w tym środowisku.',
  reviewChanged: 'Status zgłoszenia się zmienił. Sprawdź najnowszą dyskusję, zanim przejdziesz dalej.',
  verify: 'Sprawdź', verifyTitle: 'Sprawdź poprawkę', stillBroken: 'Nadal nie działa', reviewNote: 'Co nadal nie działa?', sendReview: 'Otwórz ponownie', verified: 'Poprawka potwierdzona. Dziękujemy.', reopened: 'Zgłoszenie otwarto ponownie z Twoją opinią.', verifyError: 'Nie udało się zapisać decyzji. Notatka została zachowana; sprawdź status i spróbuj ponownie.', developerNote: 'Notatka dewelopera', originalEvidence: 'Pierwotny zrzut ekranu', reviewEvidence: 'Ostatni zrzut z weryfikacji', noOriginal: 'Pierwotny zrzut ekranu jest niedostępny.', compareLive: 'Przed podjęciem decyzji porównaj zgłoszenie z aktualną stroną.', orphanVerify: 'Nie znaleziono pierwotnego elementu. Porównaj zrzut z aktualną stroną.', reviewCapture: 'Nowy zrzut ekranu', retake: 'Powtórz zrzut',
  markFixed: 'Oznacz jako naprawione', fixNote: 'Co zostało naprawione?', fixHelp: 'Recenzenci sprawdzą poprawkę po wdrożeniu na UAT.', fixSaved: 'Zapisano poprawkę. Oczekiwanie na wdrożenie na UAT.', fixError: 'Nie udało się zapisać poprawki. Notatka została zachowana; sprawdź status zgłoszenia i spróbuj ponownie.', recordingFix: 'Zapisywanie poprawki…', fixBuild: 'Wersja poprawki', noFixBuild: 'Aplikacja nie podała wersji poprawki.',
  editorSetup: 'Ustaw lokalny folder projektu w ustawieniach edytora, aby otworzyć plik.', source: 'Lokalny kod', openEditor: 'Otwórz w edytorze', editorSettings: 'Ustawienia edytora', editorTemplate: 'Szablon odnośnika do edytora', saveEditor: 'Zapisz w tej przeglądarce', editorSaved: 'Ustawienie edytora zapisano w tej przeglądarce.', editorInvalid: 'Użyj obsługiwanego szablonu edytora. Pamięć przeglądarki musi być dostępna.', editorHelp: 'Użyj {path} i {line}. Dla ścieżek względnych dodaj lokalny folder projektu przed {path}. Ustawienie i ścieżki kodu zostają w przeglądarce.',

  production: 'Produkcja', replyError: 'Nie udało się wysłać odpowiedzi. Spróbuj ponownie.', title: 'Uwagi do tej strony', add: 'Dodaj komentarz', close: 'Zamknij uwagi', empty: 'Nie ma tu jeszcze zgłoszeń.', emptyHelp: 'Wskaż element, który wymaga uwagi.',
  picking: 'Kliknij element, aby dodać komentarz', pickingHelp: 'Przytrzymaj Alt, aby wybrać rodzica. Escape anuluje.', cancel: 'Anuluj', report: 'Zostaw komentarz', body: 'Co wymaga uwagi?',
  type: 'Typ', bug: 'Błąd', ux: 'Problem UX', question: 'Pytanie', idea: 'Pomysł', severity: 'Ważność', optional: 'Nie określono', blocking: 'Blokujący', major: 'Poważny', minor: 'Drobny',
  attach: 'Co dołączamy', screenshot: 'Zrzut ekranu', remove: 'Usuń zrzut', capturing: 'Przygotowywanie zrzutu…', skipped: 'Zrzut jest niedostępny. Nadal możesz wysłać zgłoszenie.',
  send: 'Wyślij komentarz', sending: 'Wysyłanie…', error: 'Nie udało się wysłać. Treść została zachowana; spróbuj ponownie.', retry: 'Ponów', loading: 'Wczytywanie uwag…', loadError: 'Nie udało się wczytać uwag. Spróbuj ponownie.',
  back: 'Wszystkie zgłoszenia', reply: 'Odpowiedz', replyLabel: 'Dodaj odpowiedź', team: 'Zespół', moved: 'Element został przeniesiony', sent: 'Komentarz wysłany.',
  console: 'Wpisy konsoli', network: 'Nieudane żądania', env: 'Środowisko', all: 'Wszystkie środowiska', defaults: 'UAT + produkcja', local: 'Tylko lokalne', disabled: 'Uwagi są wyłączone dla tego projektu.',
  iframe: 'Zgłoszenie wskazuje osadzoną ramkę. Jej zawartość nie jest przechwytywana.', status: 'Status', details: 'Szczegóły zgłoszenia',
};
export const translations = (lang?: string) => (lang ?? navigator.language).startsWith('pl') ? pl : en;

const statuses: Record<string, [string, string]> = {
  open: ['Open', 'Otwarte'], in_progress: ['In progress', 'W toku'], in_review: ['In review', 'Do sprawdzenia'],
  done: ['Done', 'Gotowe'], wont_fix: ['Won’t fix', 'Bez poprawki'], closed: ['Closed', 'Zamknięte'], sending: ['Sending…', 'Wysyłanie…'],
};
/** Labels the six states; legacy status names from older servers are mapped first. */
export function statusLabel(status: string, lang?: string) {
  const polish = (lang ?? navigator.language).startsWith('pl');
  return statuses[normalizeState(status)]?.[polish ? 1 : 0] ?? (polish ? 'Status niedostępny' : 'Status unavailable');
}
