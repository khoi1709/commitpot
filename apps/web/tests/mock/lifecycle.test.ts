import { describe, expect, it } from 'vitest';
import { createMockPotEnvironment, createMockClock, MemoryMockStorage, MockPotRepository, MOCK_TOKEN_INFO, MOCK_DEMO_VERIFIER, MOCK_DEMO_ACCOUNTS } from '../../src/infrastructure/mock';
async function fixture(k = 4, storage = new MemoryMockStorage()) {
  const env = createMockPotEnvironment({ storage, clock: createMockClock(100), latencyMs: 0 });
  const hash = await env.repository.createPot({ token: MOCK_TOKEN_INFO.address, verifier: env.verifier, stakeAmount: 10_000_000n, registrationClose: 110, checkInOpen: 120, checkInClose: 220 });
  const id = (await env.repository.waitForTransaction(hash)).createdPotId!;
  for (const account of env.accounts) { env.repository.setAccount(account); await env.repository.approveToken(10_000_000n); await env.repository.joinPot(id); }
  env.clock.set(120); env.repository.setAccount(env.verifier);
  for (let i = 0; i < k; i++) { const proof = await env.repository.signCheckIn({ potId: id, participant: env.accounts[i], nonce: BigInt(i), deadline: 150 }); await env.repository.submitCheckIn(proof); }
  env.clock.set(221); await env.repository.finalizePot(id);
  return { ...env, id, storage };
}
describe('complete labelled mock lifecycle', () => {
  it('pays four eligible wallets 12.5 from five deposits and rejects no-show', async () => {
    const env = await fixture();
    expect((await env.repository.getPot(env.id)).payoutPerWinner).toBe(12_500_000n);
    for (const account of env.accounts.slice(0, 4)) { await env.repository.claimPayout(env.id, account); expect(await env.repository.getTokenBalance(account)).toBe(102_500_000n); }
    await expect(env.repository.claimPayout(env.id, env.accounts[4])).rejects.toMatchObject({ code: 'NOT_ELIGIBLE' });
    await expect(env.repository.claimPayout(env.id, env.accounts[0])).rejects.toMatchObject({ code: 'ALREADY_CLAIMED' });
  });
  it('settles deterministic base-unit remainder', async () => {
    const env = await fixture(3); const amounts: bigint[] = [];
    for (const account of env.accounts.slice(0, 3)) amounts.push((await env.repository.getParticipantStatus(env.id, account)).claimable);
    expect(amounts).toEqual([16_666_667n, 16_666_667n, 16_666_666n]);
    expect(amounts.reduce((a, b) => a + b, 0n)).toBe(50_000_000n);
  });
  it('refunds everyone when nobody checks in and reloads without duplicate claims', async () => {
    const env = await fixture(0);
    for (const account of env.accounts) { await env.repository.claimPayout(env.id, account); expect(await env.repository.getTokenBalance(account)).toBe(100_000_000n); }
    const reloaded = new MockPotRepository({ storage: env.storage, latencyMs: 0 });
    expect((await reloaded.getParticipantStatus(env.id, env.accounts[0])).claimed).toBe(true);
    await expect(reloaded.claimPayout(env.id, env.accounts[0])).rejects.toMatchObject({ code: 'ALREADY_CLAIMED' });
  });
  it('requires approval, membership, authorized proofs and exact times', async () => {
    const env = createMockPotEnvironment({ clock: createMockClock(100), latencyMs: 0 });
    const hash = await env.repository.createPot({ token: MOCK_TOKEN_INFO.address, verifier: env.verifier, stakeAmount: 1n, registrationClose: 110, checkInOpen: 120, checkInClose: 220 });
    const id = (await env.repository.waitForTransaction(hash)).createdPotId!;
    await expect(env.repository.joinPot(id)).rejects.toMatchObject({ code: 'INSUFFICIENT_ALLOWANCE' });
    await env.repository.approveToken(1n); await env.repository.joinPot(id);
    await expect(env.repository.joinPot(id)).rejects.toMatchObject({ code: 'ALREADY_JOINED' });
    await expect(env.repository.signCheckIn({ potId: id, participant: env.accounts[0], nonce: 0n, deadline: 150 })).rejects.toMatchObject({ code: 'WRONG_VERIFIER' });
    env.clock.set(120); env.repository.setAccount(env.verifier);
    const proof = await env.repository.signCheckIn({ potId: id, participant: env.accounts[0], nonce: 0n, deadline: 150 });
    await expect(env.repository.submitCheckIn({ ...proof, signature: '0xdead' })).rejects.toMatchObject({ code: 'INVALID_PROOF' });
    await env.repository.submitCheckIn(proof);
    await expect(env.repository.submitCheckIn(proof)).rejects.toMatchObject({ code: 'ALREADY_CHECKED_IN' });
    env.clock.set(220); await expect(env.repository.finalizePot(id)).rejects.toBeDefined();
    env.clock.set(221); await env.repository.finalizePot(id);
  });
  it('preserves invalid saved bytes and fails atomic storage writes', async () => {
    const storage = new MemoryMockStorage(); storage.setItem('commitpot-demo-v1', '{bad');
    expect(() => new MockPotRepository({ storage })).toThrow(); expect(storage.getItem('commitpot-demo-v1')).toBe('{bad');
    const future = '{"version":999}'; storage.setItem('commitpot-demo-v1', future);
    expect(() => new MockPotRepository({ storage })).toThrow(); expect(storage.getItem('commitpot-demo-v1')).toBe(future);
    const failing = new MockPotRepository({ latencyMs: 0, storage: { getItem: () => null, setItem: () => { throw new Error('quota'); } } });
    await expect(failing.approveToken(1n)).rejects.toMatchObject({ code: 'TRANSFER_FAILED' });
    expect(await failing.getTokenAllowance()).toBe(0n);
  });
});
