import { describe, expect, it, vi } from 'vitest';
import { encodeAbiParameters, encodeEventTopics, encodeFunctionData, erc20Abi, type Address, type PublicClient, type Transaction, type TransactionReceipt as ViemReceipt } from 'viem';
import { createRecoveryController, type RecoveryStorage } from '../../src/application/recovery';
import { DomainError, type ChainContext, type OperationIntent, type TransactionReceipt, type TxHash } from '../../src/domain';
import { AvalanchePotRepository } from '../../src/infrastructure/avalanche/repository';

const account = '0x0000000000000000000000000000000000000001' as const;
const otherAccount = '0x0000000000000000000000000000000000000002' as const;
const core = '0x0000000000000000000000000000000000002000' as const;
const token = '0x0000000000000000000000000000000000001000' as const;
const otherTarget = '0x0000000000000000000000000000000000003000' as const;
const requestedHash = `0x${'12'.repeat(32)}` as TxHash;
const replacementHash = `0x${'34'.repeat(32)}` as TxHash;
const blockHash = `0x${'56'.repeat(32)}` as const;
const intent: OperationIntent = { kind: 'approve', account, chainId: 31337, core, token, amount: '10000000' };
const context: ChainContext = { chainId: 31337, mode: 'local', coreAddress: core, token };
const calldata = (amount: bigint) => encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [core, amount] });
const approvalLog = (owner: Address, amount: bigint) => ({
  address: token,
  topics: encodeEventTopics({ abi: erc20Abi, eventName: 'Approval', args: { owner, spender: core } }),
  data: encodeAbiParameters([{ type: 'uint256' }], [amount]),
});

type TxFields = { hash: TxHash; from: Address; to: Address; input: ReturnType<typeof calldata>; value: bigint; nonce: number; blockNumber: bigint; blockHash: typeof blockHash; chainId: number };
function transaction(fields: Partial<TxFields> = {}): Transaction {
  return {
    hash: requestedHash, from: account, to: token, input: calldata(10_000_000n), value: 0n, nonce: 7,
    blockNumber: 8n, blockHash, chainId: 31337, ...fields,
  } as unknown as Transaction;
}
function receipt(fields: { hash?: TxHash; from?: Address; to?: Address; status?: 'success' | 'reverted'; logs?: ReturnType<typeof approvalLog>[] } = {}): ViemReceipt {
  return {
    transactionHash: fields.hash ?? requestedHash, blockNumber: 8n, blockHash,
    from: fields.from ?? account, to: fields.to ?? token, status: fields.status ?? 'success',
    logs: fields.logs ?? [approvalLog(account, 10_000_000n)],
  } as unknown as ViemReceipt;
}

type Replacement = { reason: 'repriced' | 'cancelled' | 'replaced'; replacedTransaction: Transaction; transaction: Transaction; transactionReceipt: ViemReceipt };
function fixture(options: { transaction?: Transaction; receipt?: ViemReceipt; replacement?: Replacement; receiptError?: unknown } = {}) {
  const publicClient = {
    getChainId: vi.fn(async () => context.chainId),
    waitForTransactionReceipt: vi.fn(async (args: { onReplaced?: (value: Replacement) => void }) => {
      if (options.replacement) args.onReplaced?.(options.replacement);
      if (options.receiptError) throw options.receiptError;
      return options.receipt ?? receipt();
    }),
    getTransaction: vi.fn(async () => options.transaction ?? transaction()),
    getBlock: vi.fn(async () => ({ hash: blockHash, timestamp: 1_700_000_000n })),
  };
  const repository = new AvalanchePotRepository(publicClient as unknown as PublicClient, null, context);
  return { repository, publicClient };
}
function replacement(reason: Replacement['reason'], original: Transaction, actual: Transaction, actualReceipt: ViemReceipt): Replacement {
  return { reason, replacedTransaction: original, transaction: actual, transactionReceipt: actualReceipt };
}
function memoryStorage(): RecoveryStorage {
  const values = new Map<string, string>();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: key => { values.delete(key); },
  };
}

describe('Avalanche receipt binding with inert viem clients', () => {
  it('accepts the original canonical approval only with its matching Approval event and block', async () => {
    const canonicalReceipt = receipt({ logs: [approvalLog(account, 10_000_000n)] });
    const { repository, publicClient } = fixture({ transaction: transaction(), receipt: canonicalReceipt });
    const result = await repository.waitForTransaction(requestedHash, intent);
    expect(result).toMatchObject({ hash: requestedHash, status: 'success', operation: 'approve', from: account, to: token, amount: 10_000_000n, chainId: 31337, coreAddress: core, blockTimestamp: 1_700_000_000 });
    expect(publicClient.getBlock).toHaveBeenCalledWith({ blockNumber: 8n });
  });

  it('accepts an equivalent repriced approval and lets recovery settle the original pending hash', async () => {
    const original = transaction();
    const actual = transaction({ hash: replacementHash });
    const actualReceipt = receipt({ hash: replacementHash });
    const { repository } = fixture({ transaction: actual, receipt: actualReceipt, replacement: replacement('repriced', original, actual, actualReceipt) });
    const result = await repository.waitForTransaction(requestedHash, intent);
    expect(result).toMatchObject({ hash: replacementHash, requestedHash, status: 'success', operation: 'approve', amount: 10_000_000n });

    const controller = createRecoveryController(memoryStorage());
    const pending = controller.begin(intent);
    controller.setHash(pending.id, requestedHash);
    expect(controller.complete(pending.id, result)).toMatchObject({ pending: null, confirmed: { hash: replacementHash, requestedHash, status: 'success' } });
  });

  it('refuses repriced transactions when calldata, nonce, sender or destination changed', async () => {
    const original = transaction();
    const changed = [
      [transaction({ hash: replacementHash, input: calldata(11_000_000n) }), receipt({ hash: replacementHash })],
      [transaction({ hash: replacementHash, nonce: 8 }), receipt({ hash: replacementHash })],
      [transaction({ hash: replacementHash, from: otherAccount }), receipt({ hash: replacementHash, from: otherAccount })],
      [transaction({ hash: replacementHash, to: otherTarget }), receipt({ hash: replacementHash, to: otherTarget })],
    ] as const;
    for (const [actual, actualReceipt] of changed) {
      const { repository } = fixture({ transaction: actual, receipt: actualReceipt, replacement: replacement('repriced', original, actual, actualReceipt) });
      await expect(repository.waitForTransaction(requestedHash, intent)).resolves.toMatchObject({ status: 'failure', error: { code: 'TRANSACTION_REPLACED', stage: 'confirming', submitted: true } });
    }
  });

  it('does not let a cancellation settle or clear the hash-bound pending operation', async () => {
    const original = transaction();
    const cancelled = transaction({ hash: replacementHash, to: account, input: '0x' as ReturnType<typeof calldata> });
    const cancelledReceipt = receipt({ hash: replacementHash, to: account, logs: [] });
    const { repository } = fixture({ transaction: cancelled, receipt: cancelledReceipt, replacement: replacement('cancelled', original, cancelled, cancelledReceipt) });
    const result = await repository.waitForTransaction(requestedHash, intent);
    expect(result.error).toBeInstanceOf(DomainError);
    expect(result).toMatchObject({ status: 'failure', error: { code: 'TRANSACTION_CANCELLED' } });

    const storage = memoryStorage();
    const controller = createRecoveryController(storage);
    const pending = controller.begin(intent);
    controller.setHash(pending.id, requestedHash);
    const bytesBefore = storage.getItem('commitpot-pending-v1');
    expect(() => controller.complete(pending.id, result)).toThrowError(expect.objectContaining({ code: 'RECEIPT_MISMATCH' }));
    expect(controller.load().pending).toMatchObject({ id: pending.id, hash: requestedHash });
    expect(storage.getItem('commitpot-pending-v1')).toBe(bytesBefore);
  });

  it('records a reverted exact approval as a known contextual failure', async () => {
    const revertedReceipt = receipt({ status: 'reverted', logs: [] });
    const { repository } = fixture({ transaction: transaction(), receipt: revertedReceipt });
    const result = await repository.waitForTransaction(requestedHash, intent);
    expect(result).toMatchObject({ hash: requestedHash, status: 'failure', from: account, to: token, operation: 'approve', amount: 10_000_000n, requestedHash, error: { code: 'TRANSACTION_REVERTED', stage: 'confirming', submitted: true } });

    const controller = createRecoveryController(memoryStorage());
    const pending = controller.begin(intent);
    controller.setHash(pending.id, requestedHash);
    expect(controller.complete(pending.id, result)).toMatchObject({ pending: null, confirmed: { status: 'failure', error: { code: 'TRANSACTION_REVERTED' } } });
  });

  it.each([
    ['wrong amount', transaction({ input: calldata(11_000_000n) })],
    ['wrong sender', transaction({ from: otherAccount })],
    ['wrong target', transaction({ to: otherTarget })],
  ] as const)('rejects an unrelated reverted approval with %s', async (_reason, actual) => {
    const revertedReceipt = receipt({ status: 'reverted', from: actual.from ?? account, to: actual.to ?? token, logs: [] });
    const { repository } = fixture({ transaction: actual, receipt: revertedReceipt });
    const result = await repository.waitForTransaction(requestedHash, intent);
    expect(result).toMatchObject({ status: 'failure', error: { code: 'RECEIPT_MISMATCH', stage: 'confirming', submitted: true } });
  });

  it('keeps pending intent when an actual reverted receipt is unrelated to it', async () => {
    const actual = transaction({ from: otherAccount });
    const revertedReceipt = receipt({ status: 'reverted', from: otherAccount, logs: [] });
    const { repository } = fixture({ transaction: actual, receipt: revertedReceipt });
    const result = await repository.waitForTransaction(requestedHash, intent);
    const storage = memoryStorage();
    const controller = createRecoveryController(storage);
    const pending = controller.begin(intent);
    controller.setHash(pending.id, requestedHash);
    const bytesBefore = storage.getItem('commitpot-pending-v1');
    expect(result).toMatchObject({ status: 'failure', error: { code: 'RECEIPT_MISMATCH' } });
    expect(() => controller.complete(pending.id, result)).toThrowError(expect.objectContaining({ code: 'RECEIPT_MISMATCH' }));
    expect(controller.load().pending).toMatchObject({ id: pending.id, hash: requestedHash });
    expect(storage.getItem('commitpot-pending-v1')).toBe(bytesBefore);
  });

  it('leaves an unavailable receipt lookup submitted and unconfirmed', async () => {
    const unavailable = { code: 'ETIMEDOUT' };
    const { repository, publicClient } = fixture({ receiptError: unavailable });
    await expect(repository.waitForTransaction(requestedHash, intent)).rejects.toMatchObject({ code: 'CONFIRMATION_UNAVAILABLE', stage: 'confirming', submitted: true, originalCode: 'ETIMEDOUT', cause: unavailable });
    expect(publicClient.getTransaction).not.toHaveBeenCalled();
  });
});
