import { decodeEventLog, decodeFunctionData, encodeFunctionData, erc20Abi, getAddress, type PublicClient, type WalletClient, type Transaction, type TransactionReceipt as ViemReceipt } from 'viem';
import { commitPotAbi } from '../../generated/commitPotAbi';
import { DomainError, MAX_UINT256, calculateClaimAmount, normalizeAddress, operationIntentsMatch, toDomainError, toStageAwareError, validateOperationIntent, validatePotConfig, validateTimestamp, type Address, type ChainContext, type CheckInProof, type CheckInSigningInput, type IPotRepository, type IWalletPort, type OperationContext, type OperationIntent, type OperationStage, type PotConfig, type PotSummary, type TokenInfo, type TransactionReceipt, type TxHash } from '../../domain';

export const checkInTypes = { CheckIn: [{ name: 'potId', type: 'uint256' }, { name: 'participant', type: 'address' }, { name: 'nonce', type: 'uint256' }, { name: 'deadline', type: 'uint64' }] } as const;
export function checkInTypedData(context: ChainContext, input: CheckInSigningInput) {
  return { domain: { name: 'CommitPot', version: '1', chainId: context.chainId, verifyingContract: context.coreAddress }, types: checkInTypes, primaryType: 'CheckIn' as const, message: { potId: input.potId, participant: input.participant, nonce: input.nonce, deadline: BigInt(input.deadline) } };
}
const safeTime = (value: bigint) => { if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new DomainError('INVALID_CONFIG', 'Timestamp exceeds frontend range'); const time = Number(value); validateTimestamp(time); return time; };
const wireConfig = (config: PotConfig) => ({ ...config, registrationClose: BigInt(config.registrationClose), checkInOpen: BigInt(config.checkInOpen), checkInClose: BigInt(config.checkInClose) });
const sameAddress = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
const assertUint = (value: bigint, positive = false) => { if (typeof value !== 'bigint' || value < (positive ? 1n : 0n) || value > MAX_UINT256) throw new DomainError('INVALID_ARGUMENT'); };
const assertProof = (input: CheckInSigningInput) => { assertUint(input.potId, true); assertUint(input.nonce); normalizeAddress(input.participant); validateTimestamp(input.deadline); };
const mismatch = () => new DomainError('RECEIPT_MISMATCH', 'Receipt does not match the expected operation');
const operationMetadata = (operation: { createdPotId?: bigint; potId?: bigint; amount?: bigint; beneficiary?: Address }) => ({
  ...(operation.createdPotId === undefined ? {} : { createdPotId: operation.createdPotId }),
  ...(operation.potId === undefined ? {} : { potId: operation.potId }),
  ...(operation.amount === undefined ? {} : { amount: operation.amount }),
  ...(operation.beneficiary === undefined ? {} : { beneficiary: operation.beneficiary }),
});

export class AvalanchePotRepository implements IPotRepository, IWalletPort {
  readonly context: ChainContext;
  constructor(readonly publicClient: PublicClient, readonly walletClient: WalletClient | null, context: ChainContext) {
    if (!Number.isSafeInteger(context.chainId) || context.chainId <= 0 || context.mode === 'mock') throw new DomainError('INVALID_CONFIG');
    this.context = Object.freeze({ ...context, coreAddress: normalizeAddress(context.coreAddress), token: normalizeAddress(context.token) });
  }
  async validateDeployment(): Promise<void> {
    try {
      await this.assertPublicChain();
      const [core, token, configured] = await Promise.all([this.publicClient.getCode({ address: this.context.coreAddress }), this.publicClient.getCode({ address: this.context.token }), this.publicClient.readContract({ address: this.context.coreAddress, abi: commitPotAbi, functionName: 'supportedToken' })]);
      if (!core || core === '0x' || !token || token === '0x' || !sameAddress(configured, this.context.token)) throw new DomainError('INVALID_CONFIG');
      const info = await this.getTokenInfo(); if (info.decimals !== 6) throw new DomainError('INVALID_CONFIG', 'Only the configured six-decimal token is supported');
    } catch (error) { throw toDomainError(error); }
  }
  private async assertPublicChain(): Promise<void> {
    if (await this.publicClient.getChainId() !== this.context.chainId) throw new DomainError('WRONG_CHAIN');
  }
  private requireWallet(): WalletClient {
    if (!this.walletClient) throw new DomainError('WALLET_UNAVAILABLE', 'This public reader has no wallet client');
    return this.walletClient;
  }
  private async account(expected?: { account: Address; chainId: number }): Promise<Address> {
    const wallet = this.requireWallet();
    if (expected && (!Number.isSafeInteger(expected.chainId) || expected.chainId !== this.context.chainId)) throw new DomainError('WRONG_CHAIN');
    if (await wallet.getChainId() !== this.context.chainId) throw new DomainError('WRONG_CHAIN');
    // A local signer is explicit. For JSON-RPC wallets always re-read eth_accounts;
    // a cached walletClient.account must not hide an injected-wallet account change.
    const addresses = wallet.account ? [wallet.account.address] : await wallet.getAddresses();
    if (!addresses.length) throw new DomainError('ACCOUNT_NOT_CONNECTED');
    const address = wallet.account?.address ?? addresses[0];
    if (!addresses.some(value => sameAddress(value, address))) throw new DomainError('ACCOUNT_CHANGED');
    const normalized = normalizeAddress(address);
    if (expected && normalized !== normalizeAddress(expected.account)) throw new DomainError('ACCOUNT_CHANGED');
    if (wallet.account?.type === 'local' && !sameAddress(wallet.account.address, normalized)) throw new DomainError('ACCOUNT_CHANGED');
    return normalized;
  }
  async getConnection() {
    try {
      const wallet = this.requireWallet();
      const [addresses, chainId] = await Promise.all([wallet.account ? [wallet.account.address] : wallet.getAddresses(), wallet.getChainId()]);
      const address = addresses[0];
      return { connected: !!address, address: address ? normalizeAddress(address) : null, chainId, mode: this.context.mode };
    } catch { return { connected: false, address: null, chainId: null, mode: this.context.mode }; }
  }
  private async potAt(id: bigint, blockNumber?: bigint): Promise<PotSummary> {
    assertUint(id, true);
    const data = await this.publicClient.readContract({ address: this.context.coreAddress, abi: commitPotAbi, functionName: 'getPot', args: [id], ...(blockNumber === undefined ? {} : { blockNumber }) });
    return { id, config: { token: data.config.token, verifier: data.config.verifier, stakeAmount: data.config.stakeAmount, registrationClose: safeTime(data.config.registrationClose), checkInOpen: safeTime(data.config.checkInOpen), checkInClose: safeTime(data.config.checkInClose) }, status: data.status === 0 ? 'OPEN' : 'FINALIZED', participantCount: data.participantCount, checkedInCount: data.checkedInCount, payoutPerWinner: data.payoutPerWinner, dustAmount: data.dustAmount };
  }
  async getPot(id: bigint): Promise<PotSummary> { try { return await this.potAt(id); } catch (error) { throw toDomainError(error); } }
  async getParticipantStatus(id: bigint, participant: Address) {
    try {
      assertUint(id, true);
      const [member, claimable] = await Promise.all([this.publicClient.readContract({ address: this.context.coreAddress, abi: commitPotAbi, functionName: 'getParticipantStatus', args: [id, getAddress(participant)] }), this.publicClient.readContract({ address: this.context.coreAddress, abi: commitPotAbi, functionName: 'claimable', args: [id, getAddress(participant)] })]);
      return { joined: member[0], checkedIn: member[1], claimed: member[2], order: member[3], claimable };
    } catch (error) { throw toDomainError(error); }
  }
  async getTokenInfo(): Promise<TokenInfo> {
    try {
      const [symbol, decimals] = await Promise.all([this.publicClient.readContract({ address: this.context.token, abi: erc20Abi, functionName: 'symbol' }), this.publicClient.readContract({ address: this.context.token, abi: erc20Abi, functionName: 'decimals' })]);
      return { address: this.context.token, symbol, decimals };
    } catch (error) { throw toDomainError(error); }
  }
  async getChainContext(): Promise<ChainContext> { await this.assertPublicChain(); return { ...this.context }; }
  async getChainTimestamp(): Promise<number> { try { await this.assertPublicChain(); return safeTime((await this.publicClient.getBlock()).timestamp); } catch (error) { throw toDomainError(error); } }
  async listPots(): Promise<PotSummary[]> {
    try {
      const next = await this.publicClient.readContract({ address: this.context.coreAddress, abi: commitPotAbi, functionName: 'nextPotId' });
      const first = next > 30n ? next - 30n : 1n;
      return await Promise.all(Array.from({ length: Number(next - first) }, (_, i) => this.getPot(next - 1n - BigInt(i))));
    } catch (error) { throw toDomainError(error); }
  }
  async getTokenBalance(address?: Address): Promise<bigint> {
    try { return await this.publicClient.readContract({ address: this.context.token, abi: erc20Abi, functionName: 'balanceOf', args: [getAddress(address ? normalizeAddress(address) : await this.account())] }); }
    catch (error) { throw toDomainError(error); }
  }
  async getNativeBalance(address?: Address): Promise<bigint | null> {
    // An explicit public address never requires an injected wallet or authorization.
    const target = address ? normalizeAddress(address) : (await this.getConnection()).address;
    if (!target) return null;
    try { await this.assertPublicChain(); return await this.publicClient.getBalance({ address: target }); }
    catch { return null; }
  }
  async getTokenAllowance(owner?: Address, spender?: Address): Promise<bigint> {
    try { return await this.publicClient.readContract({ address: this.context.token, abi: erc20Abi, functionName: 'allowance', args: [getAddress(owner ? normalizeAddress(owner) : await this.account()), getAddress(spender ? normalizeAddress(spender) : this.context.coreAddress)] }); }
    catch (error) { throw toDomainError(error); }
  }
  private async write(functionName: 'createPot' | 'joinPot' | 'checkIn' | 'finalize' | 'claim' | 'approve', prepare: () => Promise<readonly unknown[]> | readonly unknown[], context?: OperationContext): Promise<TxHash> {
    let stage: OperationStage = 'preparing'; let sendStarted = false;
    // Snapshot the requested account/chain before any awaited work or callback.
    const expected = context ? { account: context.account, chainId: context.chainId } : undefined;
    try {
      const wallet = this.requireWallet();
      context?.onStage?.(stage);
      const account = await this.account(expected);
      const bound = Object.freeze({ account, chainId: this.context.chainId });
      await this.assertPublicChain();
      const args = await prepare();
      const request = { address: functionName === 'approve' ? this.context.token : this.context.coreAddress, abi: functionName === 'approve' ? erc20Abi : commitPotAbi, functionName, args, account, chain: wallet.chain };
      stage = 'preflight'; context?.onStage?.(stage);
      // Stage observers are application code; ensure their synchronous mutations cannot
      // change the captured intent or wallet identity used by the pending write.
      await this.assertPublicChain(); await this.account(bound);
      await this.publicClient.simulateContract(request as Parameters<PublicClient['simulateContract']>[0]);
      await this.assertPublicChain(); await this.account(bound);
      stage = 'submitting'; context?.onStage?.(stage);
      // Recheck after the callback and at the last asynchronous boundary before send.
      await this.assertPublicChain(); await this.account(bound);
      const requestArgs = { ...request, ...(wallet.account ? { account: wallet.account } : {}) };
      sendStarted = true;
      const hash = await wallet.writeContract(requestArgs as Parameters<WalletClient['writeContract']>[0]);
      // Storage/UI callbacks must never hide a hash that the wallet already returned.
      try { context?.onStage?.('confirming'); } catch { /* caller receives hash to retain in memory */ }
      return hash;
    } catch (error) { throw toStageAwareError(error, stage, sendStarted ? 'unknown' : false); }
  }
  async createPot(config: PotConfig, context?: OperationContext): Promise<TxHash> {
    const copy = { ...config };
    return this.write('createPot', async () => { validatePotConfig(copy, await this.getChainTimestamp(), this.context.token); return [wireConfig(copy)]; }, context);
  }
  async joinPot(id: bigint, context?: OperationContext): Promise<TxHash> { return this.write('joinPot', () => { assertUint(id, true); return [id]; }, context); }
  async submitCheckIn(proof: CheckInProof, context?: OperationContext): Promise<TxHash> {
    const copy = { ...proof };
    return this.write('checkIn', () => { assertProof(copy); if (!/^0x(?:[0-9a-fA-F]{2})+$/.test(copy.signature)) throw new DomainError('INVALID_PROOF'); return [{ ...copy, deadline: BigInt(copy.deadline) }]; }, context);
  }
  async finalizePot(id: bigint, context?: OperationContext): Promise<TxHash> { return this.write('finalize', () => { assertUint(id, true); return [id]; }, context); }
  async claimPayout(id: bigint, beneficiary: Address, context?: OperationContext): Promise<TxHash> { return this.write('claim', () => { assertUint(id, true); return [id, normalizeAddress(beneficiary)]; }, context); }
  async approveToken(amount: bigint, context?: OperationContext): Promise<TxHash> { return this.write('approve', () => { assertUint(amount); return [this.context.coreAddress, amount]; }, context); }
  async signCheckIn(input: CheckInSigningInput, context?: OperationContext): Promise<CheckInProof> {
    const copy = { ...input }; const expected = context ? { account: context.account, chainId: context.chainId } : undefined;
    let stage: OperationStage = 'preparing';
    try {
      const wallet = this.requireWallet();
      context?.onStage?.(stage); assertProof(copy);
      const account = await this.account(expected); const bound = Object.freeze({ account, chainId: this.context.chainId });
      await this.assertPublicChain(); const pot = await this.getPot(copy.potId);
      if (!sameAddress(pot.config.verifier, account)) throw new DomainError('WRONG_VERIFIER');
      await this.account(bound); await this.assertPublicChain();
      stage = 'signing'; context?.onStage?.(stage);
      // Revalidate after observer code and pass an explicit local signer object through viem.
      await this.assertPublicChain(); await this.account(bound);
      const signature = await wallet.signTypedData({ ...checkInTypedData(this.context, copy), account: wallet.account ?? account });
      await this.account(bound); await this.assertPublicChain();
      return { ...copy, signature };
    } catch (error) { throw toStageAwareError(error, stage, false); }
  }

  /** Decode the actual transaction, then bind every application event argument. */
  private async receiptOperation(transaction: Transaction, receipt: ViemReceipt, allowRevert = false): Promise<{ intent: OperationIntent; createdPotId?: bigint; potId?: bigint; amount?: bigint; beneficiary?: Address }> {
    const base = { account: normalizeAddress(transaction.from), chainId: this.context.chainId, core: this.context.coreAddress };
    if (transaction.value !== 0n || (transaction.chainId !== undefined && transaction.chainId !== this.context.chainId)) throw mismatch();
    if (sameAddress(transaction.to, this.context.token)) {
      const decoded = decodeFunctionData({ abi: erc20Abi, data: transaction.input });
      const canonical = encodeFunctionData({ abi: erc20Abi, functionName: decoded.functionName, args: decoded.args } as Parameters<typeof encodeFunctionData>[0]);
      if (canonical.toLowerCase() !== transaction.input.toLowerCase() || decoded.functionName !== 'approve' || !sameAddress(decoded.args[0], this.context.coreAddress)) throw mismatch();
      const amount = decoded.args[1];
      if (allowRevert) return { intent: { ...base, kind: 'approve', token: this.context.token, amount: String(amount) }, amount };
      const events = receipt.logs.flatMap(log => {
        if (!sameAddress(log.address, this.context.token)) return [];
        try { const event = decodeEventLog({ abi: erc20Abi, data: log.data, topics: log.topics, strict: true }); return event.eventName === 'Approval' ? [event] : []; } catch { return []; }
      });
      if (events.length !== 1 || !sameAddress(events[0].args.owner, base.account) || !sameAddress(events[0].args.spender, base.core) || events[0].args.value !== amount) throw mismatch();
      return { intent: { ...base, kind: 'approve', token: this.context.token, amount: String(amount) }, amount };
    }
    if (!sameAddress(transaction.to, this.context.coreAddress)) throw mismatch();
    const decoded = decodeFunctionData({ abi: commitPotAbi, data: transaction.input });
    const canonical = encodeFunctionData({ abi: commitPotAbi, functionName: decoded.functionName, args: decoded.args } as Parameters<typeof encodeFunctionData>[0]);
    if (canonical.toLowerCase() !== transaction.input.toLowerCase()) throw mismatch();
    if (allowRevert) {
      let intent: OperationIntent;
      let revertMetadata: { amount?: bigint } = {};
      if (decoded.functionName === 'createPot') {
        const config = decoded.args[0];
        const publicConfig = { ...config, stakeAmount: String(config.stakeAmount), registrationClose: safeTime(config.registrationClose), checkInOpen: safeTime(config.checkInOpen), checkInClose: safeTime(config.checkInClose) };
        intent = validateOperationIntent({ ...base, kind: 'create', token: config.token, amount: String(config.stakeAmount), config: publicConfig });
        revertMetadata = { amount: config.stakeAmount };
      } else if (decoded.functionName === 'joinPot' || decoded.functionName === 'finalize') {
        const id = decoded.args[0];
        let extras: { token?: Address; amount?: string } = { token: this.context.token };
        try {
          const pot = await this.potAt(id, receipt.blockNumber);
          if (!sameAddress(pot.config.token, this.context.token)) throw mismatch();
          extras = { token: pot.config.token, ...(decoded.functionName === 'joinPot' ? { amount: String(pot.config.stakeAmount) } : {}) };
        } catch (error) { if (decoded.functionName === 'joinPot' && error instanceof DomainError && error.code === 'POT_NOT_FOUND') extras = {}; else if (!(error instanceof DomainError && error.code === 'POT_NOT_FOUND')) throw error; }
        intent = { ...base, kind: decoded.functionName === 'joinPot' ? 'join' : 'finalize', potId: String(id), ...extras };
      } else if (decoded.functionName === 'checkIn') {
        const proof = decoded.args[0]; const beneficiary = normalizeAddress(proof.participant);
        intent = { ...base, kind: 'checkIn', potId: String(proof.potId), token: this.context.token, beneficiary, proof: { participant: beneficiary, nonce: String(proof.nonce), deadline: safeTime(proof.deadline) } };
      } else if (decoded.functionName === 'claim') {
        const [id, beneficiary] = decoded.args;
        const who = normalizeAddress(beneficiary);
        let extras: { token?: Address; amount?: string } = { token: this.context.token };
        try {
          const pot = await this.potAt(id, receipt.blockNumber);
          if (!sameAddress(pot.config.token, this.context.token)) throw mismatch();
          const member = await this.publicClient.readContract({ address: this.context.coreAddress, abi: commitPotAbi, functionName: 'getParticipantStatus', args: [id, who], blockNumber: receipt.blockNumber });
          const amount = calculateClaimAmount(pot, { joined: member[0], checkedIn: member[1], claimed: false, order: member[3], claimable: 0n });
          extras = { token: pot.config.token, amount: String(amount) };
        } catch (error) { if (!(error instanceof DomainError && error.code === 'POT_NOT_FOUND')) throw error; extras = {}; }
        intent = { ...base, kind: 'claim', potId: String(id), beneficiary: who, ...extras };
      } else throw mismatch();
      return { intent, ...revertMetadata, ...(intent.amount !== undefined ? { amount: BigInt(intent.amount) } : {}), ...(intent.kind !== 'create' ? { potId: BigInt(intent.potId!) } : {}), ...(intent.kind === 'claim' || intent.kind === 'checkIn' ? { beneficiary: intent.kind === 'claim' ? intent.beneficiary : intent.proof.participant } : {}) };
    }
    const eventName = { createPot: 'PotCreated', joinPot: 'PotJoined', checkIn: 'CheckedIn', finalize: 'PotFinalized', claim: 'PayoutClaimed' }[decoded.functionName as string];
    if (!eventName) throw mismatch();
    const events = receipt.logs.flatMap(log => {
      if (!sameAddress(log.address, this.context.coreAddress)) return [];
      try { const event = decodeEventLog({ abi: commitPotAbi, data: log.data, topics: log.topics, strict: true }); return event.eventName === eventName ? [event] : []; } catch { return []; }
    });
    if (events.length !== 1) throw mismatch();
    const event = events[0];
    if (decoded.functionName === 'createPot' && event.eventName === 'PotCreated') {
      const config = decoded.args[0]; const args = event.args;
      if (args.potId < 1n || !sameAddress(args.creator, base.account) || !sameAddress(args.verifier, config.verifier) || !sameAddress(args.token, config.token) || !sameAddress(config.token, this.context.token) || args.stakeAmount !== config.stakeAmount) throw mismatch();
      const publicConfig = { ...config, stakeAmount: String(config.stakeAmount), registrationClose: safeTime(config.registrationClose), checkInOpen: safeTime(config.checkInOpen), checkInClose: safeTime(config.checkInClose) };
      const intent = validateOperationIntent({ ...base, kind: 'create', token: config.token, amount: String(config.stakeAmount), config: publicConfig });
      const pot = await this.potAt(args.potId, receipt.blockNumber);
      const stored = validateOperationIntent({ ...base, kind: 'create', config: { ...pot.config, stakeAmount: String(pot.config.stakeAmount) } });
      if (!operationIntentsMatch(intent, stored)) throw mismatch();
      return { intent, createdPotId: args.potId, potId: args.potId, amount: args.stakeAmount };
    }
    if (decoded.functionName === 'joinPot' && event.eventName === 'PotJoined') {
      const id = decoded.args[0]; if (event.args.potId !== id || !sameAddress(event.args.participant, base.account)) throw mismatch();
      const pot = await this.potAt(id, receipt.blockNumber);
      if (!sameAddress(pot.config.token, this.context.token)) throw mismatch();
      return { intent: { ...base, kind: 'join', potId: String(id), token: this.context.token, amount: String(pot.config.stakeAmount) }, potId: id, amount: pot.config.stakeAmount };
    }
    if (decoded.functionName === 'checkIn' && event.eventName === 'CheckedIn') {
      const proof = decoded.args[0]; const args = event.args;
      if (args.potId !== proof.potId || !sameAddress(args.participant, proof.participant) || args.order < 1n) throw mismatch();
      const member = await this.publicClient.readContract({ address: base.core, abi: commitPotAbi, functionName: 'getParticipantStatus', args: [proof.potId, proof.participant], blockNumber: receipt.blockNumber });
      if (!member[0] || !member[1] || member[3] !== args.order) throw mismatch();
      const beneficiary = normalizeAddress(proof.participant);
      return { intent: { ...base, kind: 'checkIn', potId: String(proof.potId), token: this.context.token, beneficiary, proof: { participant: beneficiary, nonce: String(proof.nonce), deadline: safeTime(proof.deadline) } }, potId: proof.potId, beneficiary };
    }
    if (decoded.functionName === 'finalize' && event.eventName === 'PotFinalized') {
      const id = decoded.args[0]; const args = event.args; if (args.potId !== id) throw mismatch();
      const pot = await this.potAt(id, receipt.blockNumber);
      if (pot.status !== 'FINALIZED' || !sameAddress(pot.config.token, this.context.token) || args.participantCount !== pot.participantCount || args.checkedInCount !== pot.checkedInCount || args.payoutPerWinner !== pot.payoutPerWinner || args.dustAmount !== pot.dustAmount) throw mismatch();
      return { intent: { ...base, kind: 'finalize', potId: String(id), token: this.context.token }, potId: id };
    }
    if (decoded.functionName === 'claim' && event.eventName === 'PayoutClaimed') {
      const [id, address] = decoded.args; const args = event.args;
      if (args.potId !== id || !sameAddress(args.beneficiary, address)) throw mismatch();
      const pot = await this.potAt(id, receipt.blockNumber);
      const member = await this.publicClient.readContract({ address: base.core, abi: commitPotAbi, functionName: 'getParticipantStatus', args: [id, address], blockNumber: receipt.blockNumber });
      const amount = calculateClaimAmount(pot, { joined: member[0], checkedIn: member[1], claimed: false, order: member[3], claimable: 0n });
      if (!member[2] || !sameAddress(pot.config.token, this.context.token) || amount === 0n || args.amount !== amount) throw mismatch();
      const beneficiary = normalizeAddress(address);
      return { intent: { ...base, kind: 'claim', potId: String(id), token: this.context.token, beneficiary, amount: String(amount) }, potId: id, beneficiary, amount };
    }
    throw mismatch();
  }
  async waitForTransaction(hash: TxHash, intent?: OperationIntent): Promise<TransactionReceipt> {
    try {
      if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new DomainError('INVALID_HASH');
      const expected = intent === undefined ? undefined : validateOperationIntent(intent);
      await this.assertPublicChain();
      if (expected && (expected.chainId !== this.context.chainId || !sameAddress(expected.core, this.context.coreAddress) || (expected.token && !sameAddress(expected.token, this.context.token)))) throw mismatch();
      let replacement: { reason: string; original: Transaction } | undefined;
      const receipt = await this.publicClient.waitForTransactionReceipt({ hash, timeout: 60_000, pollingInterval: 500, onReplaced: value => { replacement = { reason: value.reason, original: value.replacedTransaction }; } });
      const base: TransactionReceipt = { hash: receipt.transactionHash, status: 'failure', blockNumber: receipt.blockNumber, chainId: this.context.chainId, coreAddress: this.context.coreAddress };
      const failed = (error: DomainError, metadata: Partial<TransactionReceipt> = {}): TransactionReceipt => ({ ...base, ...metadata, error: toStageAwareError(error, 'confirming', true) });
      if (replacement?.reason === 'cancelled') return failed(new DomainError('TRANSACTION_CANCELLED'));
      if (replacement && replacement.reason !== 'repriced') return failed(new DomainError('TRANSACTION_REPLACED'));
      const transaction = await this.publicClient.getTransaction({ hash: receipt.transactionHash });
      if (transaction.hash.toLowerCase() !== receipt.transactionHash.toLowerCase() || transaction.blockNumber !== receipt.blockNumber || !sameAddress(transaction.from, receipt.from) || !sameAddress(transaction.to, receipt.to)) return failed(mismatch());
      const repriced = receipt.transactionHash.toLowerCase() !== hash.toLowerCase();
      if (repriced) {
        const original = replacement?.original;
        if (!original || original.hash.toLowerCase() !== hash.toLowerCase() || !sameAddress(original.from, transaction.from) || !sameAddress(original.to, transaction.to) || original.input.toLowerCase() !== transaction.input.toLowerCase() || original.value !== transaction.value || original.nonce !== transaction.nonce) return failed(new DomainError('TRANSACTION_REPLACED'));
      }
      if (receipt.status !== 'success') {
        // A mined revert is only safe to clear when its actual calldata and sender
        // exactly match the persisted intent; an unrelated revert is a mismatch.
        if (!expected) return failed(mismatch());
        try {
          const operation = await this.receiptOperation(transaction, receipt, true);
          const actual = validateOperationIntent(operation.intent);
          if (!operationIntentsMatch(actual, expected)) return failed(mismatch());
          const block = await this.publicClient.getBlock({ blockNumber: receipt.blockNumber });
          if (block.hash !== receipt.blockHash) return failed(mismatch());
          await this.assertPublicChain();
          return failed(new DomainError('TRANSACTION_REVERTED'), { from: normalizeAddress(transaction.from), to: normalizeAddress(transaction.to), operation: actual.kind, requestedHash: hash, blockTimestamp: safeTime(block.timestamp), ...operationMetadata(operation) });
        } catch (error) {
          if (error instanceof DomainError && error.code === 'RECEIPT_MISMATCH') return failed(error);
          if (error instanceof DomainError && ['INVALID_ARGUMENT', 'INVALID_ADDRESS', 'INVALID_CONFIG'].includes(error.code)) return failed(mismatch());
          throw error;
        }
      }
      let operation: Awaited<ReturnType<AvalanchePotRepository['receiptOperation']>>;
      try { operation = await this.receiptOperation(transaction, receipt); }
      catch (error) {
        if (error instanceof DomainError && error.code === 'RECEIPT_MISMATCH') return failed(error);
        // ABI decode/validation failure is a mismatch; RPC failure remains unconfirmed.
        if (error instanceof DomainError && ['INVALID_ARGUMENT', 'INVALID_ADDRESS', 'INVALID_CONFIG'].includes(error.code)) return failed(mismatch());
        if (error instanceof Error && /^(Abi|Decode|InvalidAbi)/.test(error.name)) return failed(mismatch());
        throw error;
      }
      const actual = validateOperationIntent(operation.intent);
      if (expected && !operationIntentsMatch(actual, expected)) return failed(mismatch());
      const block = await this.publicClient.getBlock({ blockNumber: receipt.blockNumber });
      if (block.hash !== receipt.blockHash) return failed(mismatch());
      await this.assertPublicChain();
      const { intent: _intent, ...metadata } = operation;
      return { ...base, ...metadata, from: normalizeAddress(transaction.from), to: normalizeAddress(transaction.to), operation: actual.kind, ...(repriced ? { requestedHash: hash } : {}), blockTimestamp: safeTime(block.timestamp), status: 'success' };
    } catch (error) { throw toStageAwareError(error, 'confirming', true); }
  }
}
