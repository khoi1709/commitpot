import { describe, expect, it } from 'vitest';
import { calculatePayout, parseTokenAmount, formatTokenAmount, parsePotId, getPotTimeState, validatePotConfig, MAX_UINT256, type PotSummary } from '../../src/domain';
import { decodeParticipantQr, encodeParticipantQr } from '../../src/infrastructure/qr';
const token = '0x0000000000000000000000000000000000001000' as const;
const verifier = '0x0000000000000000000000000000000000000006' as const;
const pot: PotSummary = { id: 1n, config: { token, verifier, stakeAmount: 10_000_000n, registrationClose: 110, checkInOpen: 120, checkInClose: 220 }, status: 'OPEN', participantCount: 5n, checkedInCount: 4n, payoutPerWinner: 0n, dustAmount: 0n };
describe('exact financial rules', () => {
  it('calculates demo and genuine dust without floating point', () => {
    expect(calculatePayout(5n, 4n, 10_000_000n)).toEqual({ base: 12_500_000n, dust: 0n });
    expect(calculatePayout(5n, 3n, 10_000_000n)).toEqual({ base: 16_666_666n, dust: 2n });
    expect(calculatePayout(5n, 0n, 10_000_000n)).toEqual({ base: 10_000_000n, dust: 0n });
    expect(calculatePayout(0n, 0n, 0n)).toEqual({ base: 0n, dust: 0n });
    expect(() => calculatePayout(1n, 2n, 1n)).toThrow();
    expect(() => calculatePayout(2n, 1n, MAX_UINT256)).toThrow();
  });
  it('parses and formats exact token units', () => {
    expect(parseTokenAmount('12.500001', 6)).toBe(12_500_001n);
    expect(formatTokenAmount(16_666_667n, 6)).toBe('16.666667');
    for (const invalid of ['-1', '+1', '1e6', ' 1', '01', '1.0000001', '.5', '1.']) expect(() => parseTokenAmount(invalid, 6)).toThrow();
    expect(() => parsePotId('0')).toThrow(); expect(() => parsePotId('01')).toThrow();
    expect(parsePotId('1')).toBe(1n);
  });
  it('preserves exact timestamp endpoint semantics', () => {
    expect(getPotTimeState(pot, 109)).toBe('REGISTRATION');
    expect(getPotTimeState(pot, 110)).toBe('WAITING');
    expect(getPotTimeState(pot, 119)).toBe('WAITING');
    expect(getPotTimeState(pot, 120)).toBe('CHECK_IN');
    expect(getPotTimeState(pot, 220)).toBe('CHECK_IN');
    expect(getPotTimeState(pot, 221)).toBe('AWAITING_FINALIZATION');
    expect(() => validatePotConfig({ ...pot.config, checkInClose: 120 }, 100, token)).toThrow();
    expect(() => validatePotConfig(pot.config, 110, token)).toThrow();
  });
});
describe('personal QR identifier', () => {
  it('round trips and rejects wrong context and untrusted payloads', () => {
    const data = encodeParticipantQr({ potId: '1', participant: verifier });
    expect(decodeParticipantQr(data, { expectedPotId: '1' }).participant).toBe(verifier);
    expect(() => decodeParticipantQr(data, { expectedPotId: '2' })).toThrow();
    for (const bad of ['https://example.com', '{"v":2}', 'x'.repeat(1025), JSON.stringify({ v: 1, potId: '01', participant: verifier }), JSON.stringify({ v: 1, potId: '1', participant: verifier, url: 'bad' }), JSON.stringify({ v: 1, potId: '1', participant: '0x' + '0'.repeat(40) })]) expect(() => decodeParticipantQr(bad)).toThrow();
  });
});
