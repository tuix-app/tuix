// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { statusLabel, translations } from '../src/i18n';
it('labels the four states in English and Polish, and the optimistic sending state', () => {
  expect(['open', 'in_review', 'done', 'closed'].map(state => statusLabel(state, 'en'))).toEqual(['Open', 'Fix ready', 'Fixed', 'Closed']);
  expect(['open', 'in_review', 'done', 'closed'].map(state => statusLabel(state, 'pl'))).toEqual(['Otwarte', 'Poprawka gotowa', 'Naprawione', 'Zamknięte']);
  expect(statusLabel('sending', 'pl')).not.toBe(statusLabel('sending', 'en'));
});
it('reads legacy statuses from older servers in the new vocabulary', () => {
  expect(['acknowledged', 'fixed_awaiting_deploy', 'awaiting_verification', 'resolved', 'wont_fix'].map(status => statusLabel(status, 'en'))).toEqual(['Open', 'Open', 'Fix ready', 'Fixed', 'Closed']);
  // The older stored name and the people-facing names read the same way.
  expect(['in_progress', 'fix_ready', 'fixed'].map(status => statusLabel(status, 'en'))).toEqual(['Open', 'Fix ready', 'Fixed']);
  expect(statusLabel('mystery', 'en')).toBe('Status unavailable');
});
it('names every new notification kind in both languages', () => {
  const en = translations('en').updateKinds, pl = translations('pl').updateKinds;
  for (const kind of ['your_turn', 'fix_ready', 'member_reply', 'end_user_reply', 'in_review', 'closed', 'reopened', 'auto_closed', 'mentioned', 'verify_reminder', 'verify_last_call', 'verify_nudge']) {
    expect(en[kind], kind).toBeTruthy();
    expect(pl[kind], kind).toBeTruthy();
    expect(pl[kind]).not.toBe(en[kind]);
  }
  expect(Object.keys(pl).sort()).toEqual(Object.keys(en).sort());
  // Stored notifications of kinds no server writes any more keep their words, as the server's own labels have them.
  expect([en.done, en.assigned, en.unassigned, en.turn_returned, en.turn_taken]).toEqual(['Closed as fixed', 'Assigned to you', 'No longer assigned to you', 'Back with you', 'Taken from you']);
  // The retired status names are not part of the vocabulary.
  for (const legacy of ['acknowledged', 'fixed_awaiting_deploy', 'awaiting_verification', 'resolved']) expect(en[legacy], legacy).toBeUndefined();
});
it('names the reply choices in both languages', () => {
  for (const key of ['sendReply', 'sendTo', 'keepWithMe', 'takeIt'] as const) { expect(translations('en')[key], key).toBeTruthy(); expect(translations('pl')[key], key).toBeTruthy(); expect(translations('pl')[key]).not.toBe(translations('en')[key]); }
  expect(translations('pl').sendTo).toBe('Wyślij do');
});
