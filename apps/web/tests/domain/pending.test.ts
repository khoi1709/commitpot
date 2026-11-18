import { expect, it } from 'vitest';
import { parsePendingOperation, matchesPendingContext } from '../../src/application/pending';
const core = '0x0000000000000000000000000000000000002000';
it('validates public recovery context and rejects malformed state', () => {
  const data = { kind: 'join', potId: '1', account: '0x0000000000000000000000000000000000000001', chainId: 31337, core, started: 123, hash: '0x' + '1'.repeat(64) };
  expect(parsePendingOperation(JSON.stringify(data))).toMatchObject(data);
  expect(matchesPendingContext(parsePendingOperation(JSON.stringify(data)), { chainId: 31337, coreAddress: core, token: core, mode: 'local' })).toBe(true);
  expect(matchesPendingContext(parsePendingOperation(JSON.stringify(data)), { chainId: 43113, coreAddress: core, token: core, mode: 'fuji' })).toBe(false);
  for (const invalid of [{ ...data, kind: 'transfer-anywhere' }, { ...data, hash: 'bad' }, { ...data, potId: '01' }, { ...data, account: 'bad' }, { ...data, chainId: -1 }]) expect(() => parsePendingOperation(JSON.stringify(invalid))).toThrow();
});
