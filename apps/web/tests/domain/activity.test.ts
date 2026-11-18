import { expect, it } from 'vitest';
import { activityStorageKey, parseActivity } from '../../src/application/activity';
it('retains only valid confirmed activity and scopes history to chain and core', () => {
  const entry = { kind: 'claim', hash: '0x' + 'a'.repeat(64), time: 12345 };
  expect(parseActivity(JSON.stringify([entry]))).toEqual([entry]);
  expect(parseActivity('{invalid')).toEqual([]);
  expect(parseActivity(JSON.stringify([{ ...entry, hash: 'bad' }, { ...entry, kind: 'fake' }]))).toEqual([]);
  expect(activityStorageKey({ chainId: 31337, coreAddress: '0x0000000000000000000000000000000000002000', token: '0x0000000000000000000000000000000000001000', mode: 'local' })).toBe('commitpot-activity-v1:31337:0x0000000000000000000000000000000000002000');
});
