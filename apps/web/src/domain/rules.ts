import { DomainError } from './errors';
import { MAX_UINT256 } from './amounts';
import type { Address, ParticipantStatus, PotConfig, PotSummary } from './types';

export function normalizeAddress(value: unknown): Address {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{40}(?![\s\S])/.test(value) || /^0x0{40}(?![\s\S])/i.test(value)) {
    throw new DomainError('INVALID_ADDRESS', 'A nonzero wallet address is required');
  }
  return value.toLowerCase() as Address;
}

export function validateTimestamp(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new DomainError('INVALID_ARGUMENT', 'Invalid Unix timestamp');
}

export function validatePotConfig(config: PotConfig, now: number, supportedToken?: Address): void {
  validateTimestamp(now);
  normalizeAddress(config.token);
  normalizeAddress(config.verifier);
  if (supportedToken && normalizeAddress(config.token) !== normalizeAddress(supportedToken)) {
    throw new DomainError('INVALID_CONFIG', 'Unsupported token');
  }
  if (typeof config.stakeAmount !== 'bigint' || config.stakeAmount <= 0n || config.stakeAmount > MAX_UINT256) {
    throw new DomainError('INVALID_CONFIG', 'Deposit must be positive');
  }
  [config.registrationClose, config.checkInOpen, config.checkInClose].forEach(validateTimestamp);
  if (!(now < config.registrationClose && config.registrationClose <= config.checkInOpen && config.checkInOpen < config.checkInClose)) {
    throw new DomainError('INVALID_CONFIG', 'Registration must close before check-in ends');
  }
}

export function calculatePayout(n: bigint, k: bigint, stake: bigint): { base: bigint; dust: bigint } {
  if ([n, k, stake].some(value => typeof value !== 'bigint' || value < 0n || value > MAX_UINT256) || k > n || (n > 0n && stake === 0n)) {
    throw new DomainError('INVALID_ARGUMENT', 'Invalid payout inputs');
  }
  if (!n) return { base: 0n, dust: 0n };
  if (n > MAX_UINT256 / stake) throw new DomainError('INVALID_ARGUMENT', 'Pool exceeds uint256');
  if (!k) return { base: stake, dust: 0n };
  const pool = n * stake;
  return { base: pool / k, dust: pool % k };
}

export type PotTimeState = 'REGISTRATION' | 'WAITING' | 'CHECK_IN' | 'AWAITING_FINALIZATION' | 'FINALIZED';

export function getPotTimeState(pot: PotSummary, now: number): PotTimeState {
  validateTimestamp(now);
  if (pot.status === 'FINALIZED') return 'FINALIZED';
  if (now < pot.config.registrationClose) return 'REGISTRATION';
  if (now < pot.config.checkInOpen) return 'WAITING';
  if (now <= pot.config.checkInClose) return 'CHECK_IN';
  return 'AWAITING_FINALIZATION';
}

export const isJoinAllowed = (pot: PotSummary, now: number): boolean => getPotTimeState(pot, now) === 'REGISTRATION';
export const isCheckInAllowed = (pot: PotSummary, now: number): boolean => getPotTimeState(pot, now) === 'CHECK_IN';
export const isFinalizeAllowed = (pot: PotSummary, now: number): boolean => getPotTimeState(pot, now) === 'AWAITING_FINALIZATION';

export function isClaimEligible(pot: PotSummary, participant: ParticipantStatus): boolean {
  return pot.status === 'FINALIZED' && participant.joined && !participant.claimed && (pot.checkedInCount === 0n || participant.checkedIn);
}

export function calculateClaimAmount(pot: PotSummary, participant: ParticipantStatus): bigint {
  if (!isClaimEligible(pot, participant)) return 0n;
  if (!pot.checkedInCount) return pot.config.stakeAmount;
  return pot.payoutPerWinner + (participant.order > 0n && participant.order <= pot.dustAmount ? 1n : 0n);
}
