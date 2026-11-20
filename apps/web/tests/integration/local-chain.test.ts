import { expect, test } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createPublicClient, createWalletClient, http, erc20Abi, hashTypedData, type Address, type Abi, type Hex } from 'viem';
import type { OperationContext, OperationIntent } from '../../src/domain';
import { foundry } from 'viem/chains';
import { AvalanchePotRepository, checkInTypedData } from '../../src/infrastructure/avalanche/repository';
import { commitPotAbi } from '../../src/generated/commitPotAbi';

async function artifact(name: string) {
  return JSON.parse(await readFile(resolve(process.cwd(), `../../packages/contracts/out/${name}.sol/${name}.json`), 'utf8')) as { abi: Abi; bytecode: { object: Hex } };
}

const operationContext = (account: Address): OperationContext => ({ account, chainId: 31337 });

async function confirmed(
  repository: AvalanchePotRepository,
  action: () => Promise<`0x${string}`>,
  intent: OperationIntent,
) {
  const hash = await action();
  const receipt = await repository.waitForTransaction(hash, intent);
  expect(receipt.status, `${intent.kind} receipt must bind the complete expected intent`).toBe('success');
  expect(receipt.hash).toBe(hash);
  expect(receipt.operation).toBe(intent.kind);
  expect(receipt.from?.toLowerCase()).toBe(intent.account.toLowerCase());
  expect(receipt.chainId).toBe(intent.chainId);
  expect(receipt.coreAddress?.toLowerCase()).toBe(intent.core.toLowerCase());
  return { hash, receipt };
}

test('real isolated local chain: five deposits, four typed check-ins, exact claims and cross-core replay rejection', async () => {
  const rpc = process.env.COMMITPOT_LOCAL_RPC;
  if (!rpc) throw new Error('Set COMMITPOT_LOCAL_RPC from the owned loopback Anvil runner; no default listener is adopted');
  const url = new URL(rpc);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw new Error('Local test refuses a remote RPC');
  const client = createPublicClient({ chain: foundry, transport: http(rpc), pollingInterval: 100 });
  expect(await client.getChainId()).toBe(31337);
  const rpcWallet = createWalletClient({ chain: foundry, transport: http(rpc) });
  const accounts = await rpcWallet.getAddresses();
  expect(accounts.length).toBeGreaterThanOrEqual(7);
  const deployer = createWalletClient({ account: accounts[0], chain: foundry, transport: http(rpc) });
  const deploy = async (name: string, args: readonly unknown[] = []) => {
    const art = await artifact(name);
    const hash = await deployer.deployContract({ abi: art.abi, bytecode: art.bytecode.object, args, account: accounts[0], chain: foundry });
    const receipt = await client.waitForTransactionReceipt({ hash, pollingInterval: 100 });
    expect(receipt.status).toBe('success'); expect(receipt.contractAddress).toBeTruthy(); return receipt.contractAddress!;
  };
  const token = await deploy('LocalTestUSDC');
  const verifierHelper = await deploy('EIP712AttendanceVerifier');
  const strategy = await deploy('EqualSplitStrategy');
  const core = await deploy('CommitPot', [token, verifierHelper, strategy]);
  const secondCore = await deploy('CommitPot', [token, verifierHelper, strategy]);
  const context = { chainId: 31337, mode: 'local' as const, coreAddress: core, token };
  const repositories = accounts.slice(0, 6).map(account => new AvalanchePotRepository(client, createWalletClient({ account, chain: foundry, transport: http(rpc) }), context));
  const verifier = repositories[5];
  const verifierAccount = accounts[5];
  await repositories[0].validateDeployment();

  // Exercise the final public-reader seam against the owned loopback deployment only.
  // The injected-provider getter is a trap: a server/public reader must never touch it.
  const publicEnv = {
    NEXT_PUBLIC_CHAIN_MODE: process.env.NEXT_PUBLIC_CHAIN_MODE,
    NEXT_PUBLIC_CHAIN_ID: process.env.NEXT_PUBLIC_CHAIN_ID,
    NEXT_PUBLIC_RPC_URL: process.env.NEXT_PUBLIC_RPC_URL,
    NEXT_PUBLIC_COMMITPOT_ADDRESS: process.env.NEXT_PUBLIC_COMMITPOT_ADDRESS,
    NEXT_PUBLIC_USDC_ADDRESS: process.env.NEXT_PUBLIC_USDC_ADDRESS,
  };
  Object.assign(process.env, { NEXT_PUBLIC_CHAIN_MODE: 'local', NEXT_PUBLIC_CHAIN_ID: '31337', NEXT_PUBLIC_RPC_URL: rpc, NEXT_PUBLIC_COMMITPOT_ADDRESS: core, NEXT_PUBLIC_USDC_ADDRESS: token });
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  let windowReads = 0;
  let injectedRequests = 0;
  Object.defineProperty(globalThis, 'window', { configurable: true, get: () => { windowReads++; return { ethereum: { request: async () => { injectedRequests++; throw new Error('Injected provider must not be used by public reader'); } } }; } });
  try {
    const { createPublicBrowserReader } = await import('../../src/infrastructure/avalanche/browser');
    const publicReader = await createPublicBrowserReader();
    expect(await publicReader.repository.getChainContext()).toMatchObject({ mode: 'local', chainId: 31337, coreAddress: core, token });
    expect(await publicReader.publicClient.getChainId()).toBe(31337);
    expect(windowReads).toBe(0);
    expect(injectedRequests).toBe(0);
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else delete (globalThis as unknown as { window?: unknown }).window;
    for (const [key, value] of Object.entries(publicEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  const tokenArt = await artifact('LocalTestUSDC');
  for (const account of accounts.slice(0, 5)) {
    const hash = await deployer.writeContract({ address: token, abi: tokenArt.abi, functionName: 'mint', args: [account, 100_000_000n], account: accounts[0], chain: foundry });
    const receipt = await client.waitForTransactionReceipt({ hash, pollingInterval: 100 });
    expect(receipt.status).toBe('success');
  }
  const now = await repositories[0].getChainTimestamp();
  const config = { token, verifier: verifierAccount, stakeAmount: 10_000_000n, registrationClose: now + 120, checkInOpen: now + 130, checkInClose: now + 500 };
  const base = { account: accounts[0], chainId: 31337, core };
  const createIntent: OperationIntent = { ...base, kind: 'create', token, amount: String(config.stakeAmount), config: { ...config, stakeAmount: String(config.stakeAmount) } };
  const created = await confirmed(repositories[0], () => repositories[0].createPot(config, operationContext(accounts[0])), createIntent);
  expect(created.receipt.createdPotId).toBe(1n);
  const potId = created.receipt.createdPotId!;

  for (const [index, repo] of repositories.slice(0, 5).entries()) {
    const account = accounts[index];
    const approvalIntent: OperationIntent = { account, chainId: 31337, core, kind: 'approve', token, amount: String(config.stakeAmount) };
    const approval = await confirmed(repo, () => repo.approveToken(config.stakeAmount, operationContext(account)), approvalIntent);
    expect(approval.receipt.amount).toBe(config.stakeAmount);
    expect(await repo.getTokenAllowance()).toBe(config.stakeAmount);
    const joinIntent: OperationIntent = { account, chainId: 31337, core, kind: 'join', potId: String(potId), token, amount: String(config.stakeAmount) };
    await confirmed(repo, () => repo.joinPot(potId, operationContext(account)), joinIntent);
  }
  expect(await client.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [core] })).toBe(50_000_000n);
  for (const account of accounts.slice(0, 5)) {
    expect(await client.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [account] })).toBe(90_000_000n);
  }

  // Only a disposable local chain receives timestamp controls, never Fuji.
  await client.request({ method: 'evm_setNextBlockTimestamp' as never, params: [config.checkInOpen] as never });
  await client.request({ method: 'evm_mine' as never });
  for (let i = 0; i < 4; i++) {
    const input = { potId, participant: accounts[i], nonce: BigInt(i + 20), deadline: config.checkInClose };
    const expectedDigest = hashTypedData(checkInTypedData(context, input));
    expect(await client.readContract({ address: core, abi: commitPotAbi, functionName: 'hashCheckIn', args: [potId, input.participant, input.nonce, BigInt(input.deadline)] })).toBe(expectedDigest);
    const verifierContext = operationContext(verifierAccount);
    const proof = await verifier.signCheckIn(input, verifierContext);
    const checkInIntent: OperationIntent = {
      account: verifierAccount, chainId: 31337, core, kind: 'checkIn', potId: String(potId), token,
      beneficiary: input.participant,
      proof: { participant: input.participant, nonce: String(input.nonce), deadline: input.deadline },
    };
    if (i === 0) {
      const forged = { ...proof, participant: accounts[1] };
      await expect(verifier.submitCheckIn(forged, verifierContext)).rejects.toMatchObject({ code: 'INVALID_PROOF' });
      // A second core sharing the exact same helper must not recognize the first core's digest.
      const secondDigest = await client.readContract({ address: secondCore, abi: commitPotAbi, functionName: 'hashCheckIn', args: [potId, input.participant, input.nonce, BigInt(input.deadline)] });
      expect(secondDigest).not.toBe(expectedDigest);
      const helper = await artifact('EIP712AttendanceVerifier');
      expect(await client.readContract({ address: verifierHelper, abi: helper.abi, functionName: 'verify', args: [verifierAccount, secondDigest, proof.signature] })).toBe(false);
    }
    const checked = await confirmed(verifier, () => verifier.submitCheckIn(proof, verifierContext), checkInIntent);
    expect(checked.receipt.beneficiary?.toLowerCase()).toBe(input.participant.toLowerCase());
    expect(checked.receipt.potId).toBe(potId);

    if (i === 0) {
      const mismatches: OperationIntent[] = [
        { ...checkInIntent, potId: '2' },
        { ...checkInIntent, account: accounts[0] },
        { ...checkInIntent, beneficiary: accounts[4], proof: { ...checkInIntent.proof!, participant: accounts[4] } },
        { ...checkInIntent, proof: { ...checkInIntent.proof!, nonce: String(input.nonce + 1n) } },
      ];
      for (const wrongIntent of mismatches) {
        const mismatch = await verifier.waitForTransaction(checked.hash, wrongIntent);
        expect(mismatch.status).toBe('failure');
        expect(mismatch.error?.code).toBe('RECEIPT_MISMATCH');
        const underlying = await client.getTransactionReceipt({ hash: checked.hash });
        expect(underlying.status).toBe('success');
        expect(underlying.transactionHash).toBe(checked.hash);
      }
      await expect(verifier.waitForTransaction(checked.hash, { ...checkInIntent, core: secondCore })).rejects.toMatchObject({ code: 'RECEIPT_MISMATCH' });
      const underlying = await client.getTransactionReceipt({ hash: checked.hash });
      expect(underlying.status).toBe('success');
    }
  }
  expect((await repositories[0].getPot(potId)).checkedInCount).toBe(4n);
  await client.request({ method: 'evm_setNextBlockTimestamp' as never, params: [config.checkInClose + 1] as never });
  await client.request({ method: 'evm_mine' as never });
  const finalizeIntent: OperationIntent = { account: verifierAccount, chainId: 31337, core, kind: 'finalize', potId: String(potId), token };
  await confirmed(verifier, () => verifier.finalizePot(potId, operationContext(verifierAccount)), finalizeIntent);
  expect((await verifier.getPot(potId)).payoutPerWinner).toBe(12_500_000n);

  let firstClaim: { hash: `0x${string}`; intent: OperationIntent } | undefined;
  for (const account of accounts.slice(0, 4)) {
    const claimIntent: OperationIntent = { account: verifierAccount, chainId: 31337, core, kind: 'claim', potId: String(potId), token, beneficiary: account, amount: '12500000' };
    const claim = await confirmed(verifier, () => verifier.claimPayout(potId, account, operationContext(verifierAccount)), claimIntent);
    expect(claim.receipt.beneficiary?.toLowerCase()).toBe(account.toLowerCase());
    expect(claim.receipt.amount).toBe(12_500_000n);
    if (!firstClaim) firstClaim = { hash: claim.hash, intent: claimIntent };
    expect(await client.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [account] })).toBe(102_500_000n);
  }
  const noShowIntent: OperationIntent = { account: verifierAccount, chainId: 31337, core, kind: 'claim', potId: String(potId), token, beneficiary: accounts[4] };
  await expect(verifier.claimPayout(potId, accounts[4], operationContext(verifierAccount))).rejects.toMatchObject({ code: 'NOT_ELIGIBLE' });
  expect((await verifier.getParticipantStatus(potId, accounts[4])).claimed).toBe(false);

  // A known historical claim receipt remains a success; a new claim request is AlreadyClaimed.
  expect(firstClaim).toBeDefined();
  const historical = await verifier.waitForTransaction(firstClaim!.hash, firstClaim!.intent);
  expect(historical.status).toBe('success');
  expect(historical.hash).toBe(firstClaim!.hash);
  await expect(verifier.claimPayout(potId, accounts[0], operationContext(verifierAccount))).rejects.toMatchObject({ code: 'ALREADY_CLAIMED' });
  expect((await verifier.getParticipantStatus(potId, accounts[0])).claimed).toBe(true);
  expect(await client.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [core] })).toBe(0n);
  console.log(JSON.stringify({ chainId: 31337, token, core, verifierHelper, strategy, createdPotId: String(potId), joined: 5, checkedIn: 4, eachPayout: '12500000', residual: '0', trueUnderlyingCheckInRetainedAfterIntentMismatches: true, realTransactions: true }));
});
