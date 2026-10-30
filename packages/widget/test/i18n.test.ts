// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { statusLabel, translations } from '../src/i18n';
it('labels the five states in English and Polish, and the optimistic sending state', () => {
  expect(['open', 'in_progress', 'in_review', 'done', 'closed'].map(state => statusLabel(state, 'en'))).toEqual(['Open', 'In progress', 'In review', 'Done', 'Closed']);
  expect(['open', 'in_progress', 'in_review', 'done', 'closed'].map(state => statusLabel(state, 'pl'))).toEqual(['Otwarte', 'W toku', 'Do sprawdzenia', 'Gotowe', 'Zamknięte']);
  expect(statusLabel('sending', 'pl')).not.toBe(statusLabel('sending', 'en'));
});
it('reads legacy statuses from older servers in the new vocabulary', () => {
  expect(['acknowledged', 'fixed_awaiting_deploy', 'awaiting_verification', 'resolved', 'wont_fix'].map(status => statusLabel(status, 'en'))).toEqual(['In progress', 'In progress', 'In review', 'Done', 'Closed']);
  expect(statusLabel('mystery', 'en')).toBe('Status unavailable');
});
it('names every new notification kind in both languages', () => {
  const en = translations('en').updateKinds, pl = translations('pl').updateKinds;
  for (const kind of ['member_reply', 'end_user_reply', 'in_progress', 'in_review', 'done', 'closed', 'reopened', 'auto_closed', 'assigned', 'unassigned', 'mentioned', 'turn_returned']) {
    expect(en[kind], kind).toBeTruthy();
    expect(pl[kind], kind).toBeTruthy();
    expect(pl[kind]).not.toBe(en[kind]);
  }
  expect(Object.keys(pl).sort()).toEqual(Object.keys(en).sort());
  expect([en.turn_returned, pl.turn_returned]).toEqual(['Back with you', 'Wróciło do Ciebie']);
  // The retired status names are not part of the vocabulary.
  for (const legacy of ['acknowledged', 'fixed_awaiting_deploy', 'awaiting_verification', 'resolved']) expect(en[legacy], legacy).toBeUndefined();
});
it('names the reply choices in both languages', () => {
  for (const key of ['reply', 'replyPass', 'replyPassHint', 'replyKeepHint'] as const) { expect(translations('en')[key], key).toBeTruthy(); expect(translations('pl')[key], key).toBeTruthy(); expect(translations('pl')[key]).not.toBe(translations('en')[key]); }
  expect(translations('pl').replyPass).toBe('Odpowiedz i przekaż');
});
