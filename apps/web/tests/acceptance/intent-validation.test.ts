import { describe, expect, it } from 'vitest';
import {
  DomainError,
  operationIntentsMatch,
  validateOperationIntent,
  type OperationIntent,
} from '../../src/domain';

const account = '0x00000000000000000000000000000000000000aa' as const;
const core = '0x00000000000000000000000000000000000000bb' as const;
const token = '0x00000000000000000000000000000000000000cc' as const;
const verifier = '0x00000000000000000000000000000000000000dd' as const;
const beneficiary = '0x00000000000000000000000000000000000000ee' as const;
const other = '0x00000000000000000000000000000000000000ff' as const;
const zeroAddress = '0x0000000000000000000000000000000000000000';
const base = { account, core, chainId: 31337 };
const config = { token, verifier, stakeAmount: '10000000', registrationClose: 100, checkInOpen: 110, checkInClose: 200 };
const proof = { participant: beneficiary, nonce: '0', deadline: 190 };
// Complete required arguments come from PROTOCOL_API, not from a permissive stub.
const intents = {
  create: { ...base, kind: 'create', config },
  approve: { ...base, kind: 'approve', token, amount: '10000000' },
  join: { ...base, kind: 'join', potId: '1' },
  checkIn: { ...base, kind: 'checkIn', potId: '1', proof },
  finalize: { ...base, kind: 'finalize', potId: '1' },
  claim: { ...base, kind: 'claim', potId: '1', beneficiary },
} satisfies Record<OperationIntent['kind'], OperationIntent>;
const maxUint256 = ((1n << 256n) - 1n).toString();
const overflowUint256 = (1n << 256n).toString();
const nonCanonical = ['', '00', '01', '-1', '+1', '1.0', '1e2', '0x1', ' 1', '1 ', overflowUint256, '9'.repeat(79), 1, 1n, null];

function rejects(value: unknown, label?: string): void {
  expect(() => validateOperationIntent(value), label).toThrow(DomainError);
}

function upperAddresses(intent: OperationIntent): OperationIntent {
  return JSON.parse(JSON.stringify(intent, (_key, value) =>
    typeof value === 'string' && /^0x[0-9a-f]{40}$/.test(value)
      ? `0x${value.slice(2).toUpperCase()}` : value));
}

describe('published OperationIntent validation and matching', () => {
  it('accepts all six complete kinds as normalized, detached, JSON-safe copies', () => {
    for (const expected of Object.values(intents)) {
      const input = upperAddresses(expected);
      const before = JSON.stringify(input);
      const normalized = validateOperationIntent(input);
      expect(normalized).toEqual(expected);
      expect(normalized).not.toBe(input);
      if (normalized.kind === 'create') expect(normalized.config).not.toBe(input.config);
      if (normalized.kind === 'checkIn') expect(normalized.proof).not.toBe(input.proof);
      expect(JSON.parse(JSON.stringify(normalized))).toEqual(expected);
      expect(JSON.stringify(input)).toBe(before);
    }
  });

  it('rejects every missing required common, per-kind, config, and proof argument', () => {
    for (const intent of Object.values(intents)) {
      for (const key of Object.keys(intent)) {
        const incomplete: Record<string, unknown> = { ...intent };
        delete incomplete[key];
        rejects(incomplete, `${intent.kind} missing ${key}`);
      }
    }
    for (const key of Object.keys(config)) {
      const incomplete: Record<string, unknown> = { ...config };
      delete incomplete[key];
      rejects({ ...intents.create, config: incomplete }, `create.config missing ${key}`);
    }
    for (const key of Object.keys(proof)) {
      const incomplete: Record<string, unknown> = { ...proof };
      delete incomplete[key];
      rejects({ ...intents.checkIn, proof: incomplete }, `checkIn.proof missing ${key}`);
    }
  });

  it('rejects invalid envelopes, unknown kinds, addresses, and chain identities', () => {
    for (const value of [null, undefined, [], false, 'join', {}, { ...intents.join, kind: 'refund' }]) rejects(value);
    for (const chainId of [0, -1, 1.5, '31337', 31337n, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity]) {
      rejects({ ...intents.join, chainId });
    }
    for (const key of ['account', 'core']) {
      for (const address of [zeroAddress, '0x1234', '', 42, null]) rejects({ ...intents.join, [key]: address });
    }
  });

  it('rejects terminal newlines, address coercion objects, accessors, symbols, and secret properties', () => {
    for (const value of ['1\n', '1\r', '1\u2028', '1\u2029']) {
      rejects({ ...intents.join, potId: value });
      rejects({ ...intents.approve, amount: value });
      rejects({ ...intents.checkIn, proof: { ...proof, nonce: value } });
    }
    for (const value of [new String(account), [account], { toString: () => account }, null]) {
      rejects({ ...intents.join, account: value });
      rejects({ ...intents.claim, beneficiary: value });
    }
    const accessor = { ...intents.join };
    Object.defineProperty(accessor, 'account', { enumerable: true, get: () => account });
    rejects(accessor);
    const symbolSecret = { ...intents.join, [Symbol('privateKey')]: 'synthetic-not-a-secret' };
    rejects(symbolSecret);
  });

  it('rejects unknown and secret fields at the envelope, config, and proof boundaries', () => {
    for (const key of ['unexpected', 'signature', 'privateKey', 'privatekey']) {
      for (const intent of Object.values(intents)) rejects({ ...intent, [key]: 'synthetic-not-a-secret' });
      rejects({ ...intents.create, config: { ...config, [key]: 'synthetic-not-a-secret' } });
      rejects({ ...intents.checkIn, proof: { ...proof, [key]: 'synthetic-not-a-secret' } });
    }
  });

  it('rejects known arguments that belong to a different operation kind', () => {
    const misplaced = [
      [intents.create, { potId: '1', proof, beneficiary }],
      [intents.approve, { potId: '1', config, proof, beneficiary }],
      [intents.join, { config, proof, beneficiary }],
      [intents.checkIn, { config, amount: '1' }],
      [intents.finalize, { config, proof, beneficiary, amount: '1' }],
      [intents.claim, { config, proof }],
    ] as const;
    for (const [intent, fields] of misplaced) {
      for (const [key, value] of Object.entries(fields)) rejects({ ...intent, [key]: value }, `${intent.kind}.${key}`);
    }
  });

  it('requires positive canonical decimal uint256 pot IDs without number coercion', () => {
    for (const intent of [intents.join, intents.checkIn, intents.finalize, intents.claim]) {
      for (const potId of ['1', '9007199254740993', maxUint256]) {
        expect(validateOperationIntent({ ...intent, potId }).potId).toBe(potId);
      }
      for (const potId of ['0', ...nonCanonical]) rejects({ ...intent, potId });
    }
  });

  it('bounds amount, stake, and nonce strings exactly while preserving permitted zero', () => {
    const withDecimal = [
      (value: unknown) => ({ ...intents.approve, amount: value }),
      (value: unknown) => ({ ...intents.create, config: { ...config, stakeAmount: value } }),
      (value: unknown) => ({ ...intents.checkIn, proof: { ...proof, nonce: value } }),
      (value: unknown) => ({ ...intents.join, amount: value }),
      (value: unknown) => ({ ...intents.claim, amount: value }),
    ];
    for (const makeIntent of withDecimal) {
      expect(validateOperationIntent(makeIntent(maxUint256))).toEqual(makeIntent(maxUint256));
      for (const value of nonCanonical) rejects(makeIntent(value));
    }
    expect(validateOperationIntent({ ...intents.approve, amount: '0' }).amount).toBe('0');
    expect(validateOperationIntent(intents.checkIn).proof?.nonce).toBe('0');
    rejects({ ...intents.create, config: { ...config, stakeAmount: '0' } });
  });

  it('enforces config ordering, nonzero nested identities, and safe timestamp boundaries', () => {
    expect(validateOperationIntent({ ...intents.create, config: { ...config, checkInOpen: 100 } }).config?.checkInOpen).toBe(100);
    for (const change of [{ registrationClose: 0 }, { registrationClose: 111 }, { checkInClose: 110 }, { checkInClose: 109 }]) {
      rejects({ ...intents.create, config: { ...config, ...change } });
    }
    for (const key of ['registrationClose', 'checkInOpen', 'checkInClose']) {
      for (const value of [-1, 1.5, '100', Number.MAX_SAFE_INTEGER + 1, NaN, Infinity]) {
        rejects({ ...intents.create, config: { ...config, [key]: value } });
      }
    }
    for (const deadline of [-1, 1.5, '190', Number.MAX_SAFE_INTEGER + 1, NaN, Infinity]) {
      rejects({ ...intents.checkIn, proof: { ...proof, deadline } });
    }
    for (const address of [zeroAddress, '0x1234', null]) {
      rejects({ ...intents.create, config: { ...config, token: address } });
      rejects({ ...intents.create, config: { ...config, verifier: address } });
      rejects({ ...intents.approve, token: address });
      rejects({ ...intents.checkIn, proof: { ...proof, participant: address } });
      rejects({ ...intents.claim, beneficiary: address });
    }
  });

  it('binds redundant metadata to known arguments without forbidding beneficiary-safe relays', () => {
    const create = { ...intents.create, token, amount: config.stakeAmount };
    expect(validateOperationIntent(upperAddresses(create))).toEqual(create);
    rejects({ ...create, token: other });
    rejects({ ...create, amount: '10000001' });
    const checkIn = { ...intents.checkIn, token, beneficiary };
    expect(validateOperationIntent(upperAddresses(checkIn))).toEqual(checkIn);
    rejects({ ...checkIn, beneficiary: other });
    // Sender and beneficiary are deliberately different; neither relay operation requires equality.
    expect(account).not.toBe(beneficiary);
    expect(validateOperationIntent(intents.claim)).toEqual(intents.claim);
    expect(validateOperationIntent(intents.checkIn)).toEqual(intents.checkIn);
    for (const intent of [intents.join, intents.checkIn, intents.finalize, intents.claim]) {
      rejects({ ...intent, token: zeroAddress });
    }
  });

  it('matches normalized semantics but detects every common and required argument change', () => {
    for (const expected of Object.values(intents)) {
      expect(operationIntentsMatch(upperAddresses(expected), expected)).toBe(true);
      expect(operationIntentsMatch({ ...expected, account: other }, expected)).toBe(false);
      expect(operationIntentsMatch({ ...expected, core: other }, expected)).toBe(false);
      expect(operationIntentsMatch({ ...expected, chainId: 43113 }, expected)).toBe(false);
    }
    expect(operationIntentsMatch(intents.finalize, intents.join)).toBe(false);
    for (const change of [{ token: other }, { verifier: other }, { stakeAmount: '10000001' }, { registrationClose: 101 }, { checkInOpen: 111 }, { checkInClose: 201 }]) {
      expect(operationIntentsMatch({ ...intents.create, config: { ...config, ...change } }, intents.create)).toBe(false);
    }
    for (const intent of [intents.join, intents.checkIn, intents.finalize, intents.claim]) {
      expect(operationIntentsMatch({ ...intent, potId: '2' }, intent)).toBe(false);
    }
    for (const change of [{ token: other }, { amount: '10000001' }]) {
      expect(operationIntentsMatch({ ...intents.approve, ...change }, intents.approve)).toBe(false);
    }
    for (const change of [{ participant: other }, { nonce: '1' }, { deadline: 191 }]) {
      expect(operationIntentsMatch({ ...intents.checkIn, proof: { ...proof, ...change } }, intents.checkIn)).toBe(false);
    }
    expect(operationIntentsMatch({ ...intents.claim, beneficiary: other }, intents.claim)).toBe(false);
    const reordered = { ...intents.create, config: { checkInClose: 200, checkInOpen: 110, registrationClose: 100, stakeAmount: '10000000', verifier, token } };
    expect(operationIntentsMatch(reordered, intents.create)).toBe(true);
  });

  it('preserves optional expected token, amount, and beneficiary meaning asymmetrically', () => {
    const join = { ...intents.join, token, amount: '10000000' };
    expect(operationIntentsMatch(join, intents.join)).toBe(true);
    expect(operationIntentsMatch(intents.join, join)).toBe(false);
    expect(operationIntentsMatch({ ...join, token: other }, join)).toBe(false);
    expect(operationIntentsMatch({ ...join, amount: '10000001' }, join)).toBe(false);
    expect(operationIntentsMatch({ ...intents.join, token }, join)).toBe(false);
    expect(operationIntentsMatch({ ...intents.join, amount: join.amount }, join)).toBe(false);
    const checkIn = { ...intents.checkIn, beneficiary };
    expect(operationIntentsMatch(checkIn, intents.checkIn)).toBe(true);
    expect(operationIntentsMatch(intents.checkIn, checkIn)).toBe(false);
    const claim = { ...intents.claim, token, amount: '0' };
    expect(operationIntentsMatch(upperAddresses(claim), claim)).toBe(true);
    expect(operationIntentsMatch(claim, intents.claim)).toBe(true);
    expect(operationIntentsMatch(intents.claim, claim)).toBe(false);
    expect(operationIntentsMatch({ ...claim, amount: '1' }, claim)).toBe(false);
    expect(operationIntentsMatch({ ...claim, token: other }, claim)).toBe(false);
  });

  it('validates both matching operands instead of accepting partial or secret-bearing intent', () => {
    for (const valid of Object.values(intents)) {
      const invalid: Record<string, unknown>[] = [{ ...valid, signature: 'synthetic-not-a-secret' }];
      for (const key of Object.keys(valid)) {
        const missing: Record<string, unknown> = { ...valid };
        delete missing[key];
        invalid.push(missing);
      }
      for (const value of invalid) {
        // Persisted data is untrusted at runtime even when the matcher has a typed signature.
        const malformed = value as unknown as OperationIntent;
        expect(() => operationIntentsMatch(malformed, valid)).toThrow(DomainError);
        expect(() => operationIntentsMatch(valid, malformed)).toThrow(DomainError);
      }
    }
  });
});
