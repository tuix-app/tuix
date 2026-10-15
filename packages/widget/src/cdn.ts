import { tuix, openFromLoader, settingsFromLoader } from './index';
type Command = 'init' | 'config' | 'identify' | 'open' | 'close' | 'destroy';
const scope = window as Window & { tuix?: { (command: Command, value?: never): unknown; q?: IArguments[]; loaded?: boolean } };
const pending = scope.tuix?.q ?? [];
try { document.querySelector('tuix-widget[data-tuix-bootstrap]')?.remove(); } catch { /* Host DOM failures stay local. */ }
scope.tuix = (command, value) => {
  try {
    if (Object.prototype.hasOwnProperty.call(tuix, command)) return (tuix[command] as (value?: never) => unknown).call(tuix, value);
  } catch { /* Includes malformed untyped command input. */ }
};
scope.tuix.loaded = true;
for (const args of pending) {
  try {
    // A queued `tuix('open', filter)` keeps its filter (Show, Involving, Pages) across the lazy load.
    if (args[0] === 'open') void openFromLoader(args[2], 'reports', args[1]);
    else if (args[0] === 'comment') void openFromLoader(args[2], 'comment');
    else if (args[0] === 'settings') settingsFromLoader();
    else scope.tuix(args[0], args[1]);
  } catch { /* One malformed queued call must not skip later calls. */ }
}
