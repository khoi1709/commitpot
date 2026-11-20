import { describe, expect, it, vi } from 'vitest';
import type { Address, PublicClient, WalletClient } from 'viem';
import { DomainError, StageAwareError, toStageAwareError, type ChainContext, type OperationStage, type TxHash } from '../../src/domain';
import { AvalanchePotRepository } from '../../src/infrastructure/avalanche/repository';

const account = '0x0000000000000000000000000000000000000001' as const;
const hash: TxHash = `0x${'12'.repeat(32)}`;
const chainContext: ChainContext = {
  chainId: 31337,
  mode: 'local',
  coreAddress: '0x0000000000000000000000000000000000002000',
  token: '0x0000000000000000000000000000000000001000',
};

// Public constructor injection only: these inert clients cannot contact a wallet or RPC.
function repositoryFixture() {
  const publicClient = {
    getChainId: vi.fn(async () => chainContext.chainId),
    simulateContract: vi.fn(async () => ({ request: {} })),
    waitForTransactionReceipt: vi.fn(),
  };
  const walletClient = {
    getChainId: vi.fn(async () => chainContext.chainId),
    getAddresses: vi.fn(async (): Promise<Address[]> => [account]),
    writeContract: vi.fn(async () => hash),
  };
  const repository = new AvalanchePotRepository(
    publicClient as unknown as PublicClient,
    walletClient as unknown as WalletClient,
    chainContext,
  );
  return { repository, publicClient, walletClient };
}

describe('public toStageAwareError classification', () => {
  it.each([4001, '4001'])('recognizes nested rejection code %j without marking a send', providerCode => {
    const cause = { code: -32603, cause: { error: { data: { originalError: { code: providerCode } } } } };
    const error = toStageAwareError(cause, 'submitting', 'unknown');
    expect(error).toBeInstanceOf(StageAwareError);
    expect(error).toBeInstanceOf(DomainError);
    expect(error).toMatchObject({ code: 'WALLET_REJECTED', stage: 'submitting', submitted: false, originalCode: 4001 });
    expect(error.cause).toBe(cause);
  });

  it('keeps a signing transport failure pre-broadcast', () => {
    const cause = { name: 'HttpRequestError', cause: { code: 'ECONNRESET' } };
    const error = toStageAwareError(cause, 'signing', false);
    expect(error).toMatchObject({ code: 'WALLET_UNAVAILABLE', stage: 'signing', submitted: false, originalCode: 'ECONNRESET' });
    expect(error.cause).toBe(cause);
  });

  it.each([
    ['ERC20InsufficientAllowance', 'INSUFFICIENT_ALLOWANCE'],
    ['SafeERC20FailedOperation', 'TRANSFER_FAILED'],
  ])('classifies structured token revert %s at preflight without submission', (errorName, code) => {
    const cause = { cause: { name: 'ContractFunctionRevertedError', data: { errorName } } };
    const error = toStageAwareError(cause, 'preflight', false);
    expect(error).toMatchObject({ code, stage: 'preflight', submitted: false });
    expect(error.cause).toBe(cause);
  });

  it.each([
    'execution reverted: ERC20InsufficientBalance',
    'User rejected the transaction',
  ])('keeps an unstructured wallet-send failure unknown (fixture %s)', message => {
    const cause = new Error(message);
    const error = toStageAwareError(cause, 'submitting', 'unknown');
    expect(error).toMatchObject({ code: 'SUBMISSION_UNKNOWN', stage: 'submitting', submitted: 'unknown' });
    expect(error.originalCode).toBeUndefined();
    expect(error.cause).toBe(cause);
  });

  it.each([-32000, 'ETIMEDOUT'])('preserves original provider code %j and cause identity', code => {
    const providerError = { code };
    const cause = { cause: providerError };
    const error = toStageAwareError(cause, 'submitting', 'unknown');
    expect(error).toMatchObject({ code: 'SUBMISSION_UNKNOWN', originalCode: code, stage: 'submitting', submitted: 'unknown' });
    expect(error.cause).toBe(cause);
    expect(cause.cause).toBe(providerError);
    expect(providerError.code).toBe(code);
  });

  it('keeps a confirmation transport error submitted when a hash is known', () => {
    const cause = { name: 'HttpRequestError', code: 'ETIMEDOUT' };
    const error = toStageAwareError(cause, 'confirming', true);
    expect(error).toMatchObject({ code: 'CONFIRMATION_UNAVAILABLE', stage: 'confirming', submitted: true, originalCode: 'ETIMEDOUT' });
    expect(error.cause).toBe(cause);
  });

  it('does not let a nested 4001 erase known submission during confirmation', () => {
    const cause = { cause: { code: 4001 } };
    const error = toStageAwareError(cause, 'confirming', true);
    expect(error).toMatchObject({ code: 'WALLET_REJECTED', stage: 'confirming', submitted: true, originalCode: 4001 });
    expect(error.cause).toBe(cause);
  });
});

describe('exported repository stage callback boundary', () => {
  it('allows a preflight callback to block simulation and wallet submission', async () => {
    const { repository, publicClient, walletClient } = repositoryFixture();
    const stages: OperationStage[] = [];
    const callbackFailure = new DomainError('STORAGE_CORRUPT');
    const operation = repository.joinPot(1n, {
      account,
      chainId: chainContext.chainId,
      onStage(stage) {
        stages.push(stage);
        if (stage === 'preflight') throw callbackFailure;
      },
    });
    await expect(operation).rejects.toMatchObject({ code: 'STORAGE_CORRUPT', stage: 'preflight', submitted: false, cause: callbackFailure });
    expect(stages).toEqual(['preparing', 'preflight']);
    expect(publicClient.simulateContract).not.toHaveBeenCalled();
    expect(walletClient.writeContract).not.toHaveBeenCalled();
  });

  it('rechecks account and chain after the submitting callback before wallet send', async () => {
    const { repository, publicClient, walletClient } = repositoryFixture();
    let reads = 0;
    walletClient.getAddresses.mockImplementation(async () => {
      reads++;
      return reads < 4 ? [account] : ['0x0000000000000000000000000000000000000002'];
    });
    await expect(repository.joinPot(1n, { account, chainId: chainContext.chainId })).rejects.toMatchObject({ code: 'ACCOUNT_CHANGED', stage: 'submitting', submitted: false });
    expect(publicClient.simulateContract).toHaveBeenCalledTimes(1);
    expect(walletClient.writeContract).not.toHaveBeenCalled();
  });

  it('returns the exact wallet hash despite a confirming callback exception', async () => {
    const { repository, publicClient, walletClient } = repositoryFixture();
    const stages: OperationStage[] = [];
    const callbackFailure = new DomainError('STORAGE_CORRUPT');
    await expect(repository.joinPot(1n, {
      account,
      chainId: chainContext.chainId,
      onStage(stage) {
        stages.push(stage);
        if (stage === 'confirming') throw callbackFailure;
      },
    })).resolves.toBe(hash);
    expect(stages).toEqual(['preparing', 'preflight', 'submitting', 'confirming']);
    expect(publicClient.simulateContract).toHaveBeenCalledTimes(1);
    expect(walletClient.writeContract).toHaveBeenCalledTimes(1);
  });

  it('classifies unavailable receipt lookup for an actual supplied hash as submitted', async () => {
    const { repository, publicClient, walletClient } = repositoryFixture();
    const cause = { code: 'ETIMEDOUT' };
    publicClient.waitForTransactionReceipt.mockRejectedValueOnce(cause);
    await expect(repository.waitForTransaction(hash)).rejects.toMatchObject({
      code: 'CONFIRMATION_UNAVAILABLE', stage: 'confirming', submitted: true, originalCode: 'ETIMEDOUT', cause,
    });
    expect(publicClient.waitForTransactionReceipt).toHaveBeenCalledWith(expect.objectContaining({ hash }));
    expect(walletClient.writeContract).not.toHaveBeenCalled();
  });
});
