import { expect, test } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createPublicClient, createWalletClient, http, erc20Abi, hashTypedData, type Address, type Abi, type Hex } from 'viem';
import { foundry } from 'viem/chains';
import { AvalanchePotRepository, checkInTypedData } from '../../src/infrastructure/avalanche/repository';
import { commitPotAbi } from '../../src/generated/commitPotAbi';

async function artifact(name: string) {
  return JSON.parse(await readFile(resolve(process.cwd(), `../../packages/contracts/out/${name}.sol/${name}.json`), 'utf8')) as { abi: Abi; bytecode: { object: Hex } };
}

test('real isolated local chain: five deposits, four typed check-ins, exact claims and cross-core replay rejection', async () => {
  const rpc = process.env.COMMITPOT_LOCAL_RPC ?? 'http://127.0.0.1:8545';
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
  await repositories[0].validateDeployment();
  const tokenArt = await artifact('LocalTestUSDC');
  for (const account of accounts.slice(0, 5)) {
    const hash = await deployer.writeContract({ address: token, abi: tokenArt.abi, functionName: 'mint', args: [account, 100_000_000n], account: accounts[0], chain: foundry });
    await client.waitForTransactionReceipt({ hash, pollingInterval: 100 });
  }
  const now = await repositories[0].getChainTimestamp();
  const config = { token, verifier: accounts[5], stakeAmount: 10_000_000n, registrationClose: now + 120, checkInOpen: now + 130, checkInClose: now + 500 };
  const created = await repositories[0].waitForTransaction(await repositories[0].createPot(config));
  expect(created.status).toBe('success'); expect(created.createdPotId).toBe(1n);
  for (const repo of repositories.slice(0, 5)) {
    const approval = await repo.waitForTransaction(await repo.approveToken(config.stakeAmount)); expect(approval.status).toBe('success');
    expect(await repo.getTokenAllowance()).toBe(config.stakeAmount);
    const join = await repo.waitForTransaction(await repo.joinPot(1n)); expect(join.status).toBe('success');
  }
  expect(await client.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [core] })).toBe(50_000_000n);
  // Only a disposable local chain receives timestamp controls, never Fuji.
  await client.request({ method: 'evm_setNextBlockTimestamp' as never, params: [config.checkInOpen] as never });
  await client.request({ method: 'evm_mine' as never });
  for (let i = 0; i < 4; i++) {
    const input = { potId: 1n, participant: accounts[i], nonce: BigInt(i + 20), deadline: config.checkInClose };
    const expectedDigest = hashTypedData(checkInTypedData(context, input));
    expect(await client.readContract({ address: core, abi: commitPotAbi, functionName: 'hashCheckIn', args: [1n, input.participant, input.nonce, BigInt(input.deadline)] })).toBe(expectedDigest);
    const proof = await verifier.signCheckIn(input);
    if (i === 0) {
      const forged = { ...proof, participant: accounts[1] };
      await expect(verifier.submitCheckIn(forged)).rejects.toMatchObject({ code: 'INVALID_PROOF' });
      // A second core sharing the exact same helper must not recognize the first core's digest.
      const secondDigest = await client.readContract({ address: secondCore, abi: commitPotAbi, functionName: 'hashCheckIn', args: [1n, input.participant, input.nonce, BigInt(input.deadline)] });
      expect(secondDigest).not.toBe(expectedDigest);
      const helper = await artifact('EIP712AttendanceVerifier');
      expect(await client.readContract({ address: verifierHelper, abi: helper.abi, functionName: 'verify', args: [accounts[5], secondDigest, proof.signature] })).toBe(false);
    }
    const checked = await verifier.waitForTransaction(await verifier.submitCheckIn(proof)); expect(checked.status).toBe('success');
  }
  expect((await repositories[0].getPot(1n)).checkedInCount).toBe(4n);
  await client.request({ method: 'evm_setNextBlockTimestamp' as never, params: [config.checkInClose + 1] as never });
  await client.request({ method: 'evm_mine' as never });
  expect((await verifier.waitForTransaction(await verifier.finalizePot(1n))).status).toBe('success');
  expect((await verifier.getPot(1n)).payoutPerWinner).toBe(12_500_000n);
  for (const account of accounts.slice(0, 4)) {
    expect((await verifier.getParticipantStatus(1n, account)).claimable).toBe(12_500_000n);
    expect((await verifier.waitForTransaction(await verifier.claimPayout(1n, account))).status).toBe('success');
    expect(await verifier.getTokenBalance(account)).toBe(102_500_000n);
  }
  await expect(verifier.claimPayout(1n, accounts[4])).rejects.toMatchObject({ code: 'NOT_ELIGIBLE' });
  await expect(verifier.claimPayout(1n, accounts[0])).rejects.toMatchObject({ code: 'ALREADY_CLAIMED' });
  expect(await client.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [core] })).toBe(0n);
  console.log(JSON.stringify({ chainId: 31337, token, core, verifierHelper, strategy, createdPotId: String(created.createdPotId), joined: 5, checkedIn: 4, eachPayout: '12500000', residual: '0', realTransactions: true }));
});
