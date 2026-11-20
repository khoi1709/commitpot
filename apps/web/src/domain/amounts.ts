import { DomainError } from './errors';

export const MAX_UINT256 = (1n << 256n) - 1n;

function validateDecimals(decimals: number): void {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) {
    throw new DomainError('INVALID_ARGUMENT', 'Invalid token decimals');
  }
}

export function parseTokenAmount(text: string, decimals: number): bigint {
  validateDecimals(decimals);
  if (typeof text !== 'string' || text.length > 335 || !/^(?:0|[1-9]\d*)(?:\.\d+)?(?![\s\S])/.test(text)) {
    throw new DomainError('INVALID_ARGUMENT', 'Use an unsigned decimal amount');
  }
  const [whole, fraction = ''] = text.split('.');
  if (fraction.length > decimals) throw new DomainError('INVALID_ARGUMENT', 'Too many decimal places');
  const amount = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, '0') || '0');
  if (amount > MAX_UINT256) throw new DomainError('INVALID_ARGUMENT', 'Amount exceeds uint256');
  return amount;
}

export function formatTokenAmount(amount: bigint, decimals: number): string {
  validateDecimals(decimals);
  if (typeof amount !== 'bigint' || amount < 0n || amount > MAX_UINT256) {
    throw new DomainError('INVALID_ARGUMENT', 'Invalid token amount');
  }
  if (!decimals) return amount.toString();
  const text = amount.toString().padStart(decimals + 1, '0');
  const fractional = text.slice(-decimals).replace(/0+$/, '');
  return text.slice(0, -decimals) + (fractional ? `.${fractional}` : '');
}

export function parsePotId(text: string): bigint {
  if (typeof text !== 'string' || !/^[1-9]\d{0,77}(?![\s\S])/.test(text)) {
    throw new DomainError('INVALID_ARGUMENT', 'Invalid pot ID');
  }
  const id = BigInt(text);
  if (id > MAX_UINT256) throw new DomainError('INVALID_ARGUMENT', 'Pot ID exceeds uint256');
  return id;
}

export function potIdToString(id: bigint): string {
  if (typeof id !== 'bigint' || id <= 0n || id > MAX_UINT256) throw new DomainError('INVALID_ARGUMENT', 'Invalid pot ID');
  return id.toString();
}
