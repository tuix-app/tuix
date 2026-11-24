import { expect, it } from 'vitest';
import { actionsOf, normalizeState, stateOf } from '../src/states';

it('reads every vocabulary as the four stored states', () => {
  expect(['open', 'in_progress', 'acknowledged', 'fixed_awaiting_deploy', 'in_review', 'fix_ready', 'awaiting_verification', 'done', 'fixed', 'resolved', 'closed', 'wont_fix', 'sending'].map(normalizeState))
    .toEqual(['open', 'open', 'open', 'open', 'in_review', 'in_review', 'in_review', 'done', 'done', 'done', 'closed', 'closed', 'sending']);
});

it('prefers state_name, then state, then the legacy status', () => {
  expect(stateOf({ state_name: 'fix_ready', state: 'open', status: 'open' })).toBe('in_review');
  expect(stateOf({ state: 'done', status: 'open' })).toBe('done');
  expect(stateOf({ state: null, status: 'resolved' })).toBe('done');
  expect(stateOf({ status: 'acknowledged' })).toBe('open');
});

it('takes `actions` as sent and derives them from allowed_states for an older server', () => {
  expect(actionsOf({ actions: ['reply', 'close'], allowed_states: ['done'] })).toEqual(['reply', 'close']);
  expect(actionsOf({ status: 'awaiting_verification', state: 'in_review', allowed_states: ['done', 'open', 'closed'] })).toEqual(['works', 'still_broken', 'close']);
  expect(actionsOf({ status: 'resolved', allowed_states: ['open', 'closed'] })).toEqual(['reopen', 'close']);
  expect(actionsOf({ status: 'open', can_be_fixer: true, allowed_states: ['in_progress', 'in_review', 'closed'] })).toEqual(['fix_ready', 'close']);
  expect(actionsOf({ status: 'open' })).toEqual([]);
});
