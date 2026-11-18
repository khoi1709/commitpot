import { decodeEventLog, decodeFunctionData, erc20Abi, getAddress, type PublicClient, type WalletClient, type Address as ViemAddress } from 'viem';
import { commitPotAbi } from '../../generated/commitPotAbi';
import { DomainError, normalizeAddress, validatePotConfig, validateTimestamp, type Address, type ChainContext, type CheckInProof, type CheckInSigningInput, type IPotRepository, type IWalletPort, type PotConfig, type PotSummary, type TokenInfo, type TransactionReceipt, type TxHash } from '../../domain';

export const checkInTypes = { CheckIn: [{ name: 'potId', type: 'uint256' }, { name: 'participant', type: 'address' }, { name: 'nonce', type: 'uint256' }, { name: 'deadline', type: 'uint64' }] } as const;
export function checkInTypedData(context: ChainContext, input: CheckInSigningInput) {
  return { domain: { name: 'CommitPot', version: '1', chainId: context.chainId, verifyingContract: context.coreAddress }, types: checkInTypes, primaryType: 'CheckIn' as const, message: { potId: input.potId, participant: input.participant, nonce: input.nonce, deadline: BigInt(input.deadline) } };
}
const safeTime = (value: bigint) => { if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new DomainError('INVALID_CONFIG', 'Timestamp exceeds frontend range'); const time = Number(value); validateTimestamp(time); return time; };
const wireConfig = (config: PotConfig) => ({ ...config, registrationClose: BigInt(config.registrationClose), checkInOpen: BigInt(config.checkInOpen), checkInClose: BigInt(config.checkInClose) });

function translate(error: unknown): never {
  if (error instanceof DomainError) throw error;
  const names: Record<string, ConstructorParameters<typeof DomainError>[0]> = { PotNotFound: 'POT_NOT_FOUND', InvalidToken: 'INVALID_CONFIG', InvalidStake: 'INVALID_CONFIG', InvalidTimeWindow: 'INVALID_CONFIG', RegistrationClosed: 'REGISTRATION_CLOSED', AlreadyJoined: 'ALREADY_JOINED', NotJoined: 'NOT_JOINED', AlreadyCheckedIn: 'ALREADY_CHECKED_IN', NonceAlreadyUsed: 'NONCE_REUSED', CheckInNotOpen: 'CHECK_IN_NOT_OPEN', DeadlineExpired: 'PROOF_EXPIRED', InvalidSignature: 'INVALID_PROOF', AlreadyClaimed: 'ALREADY_CLAIMED', NotEligible: 'NOT_ELIGIBLE', PotNotFinalized: 'NOT_FINALIZED', PotAlreadyFinalized: 'POT_ALREADY_FINALIZED' };
  let node: unknown = error;
  for (let i = 0; node && typeof node === 'object' && i < 10; i++) {
    const item = node as { data?: { errorName?: string }; cause?: unknown; code?: number; name?: string };
    if (item.data?.errorName && names[item.data.errorName]) throw new DomainError(names[item.data.errorName]);
    // A rejected wallet request is known not to have been broadcast; preserve the rejection code.
    if (item.code === 4001 || item.name === 'UserRejectedRequestError') throw Object.assign(new Error('Wallet request rejected'), { code: 4001 });
    node = item.cause;
  }
  // Transport errors are not relabelled deterministic failures: the app preserves unknown outcomes.
  throw error;
}

export class AvalanchePotRepository implements IPotRepository, IWalletPort {
  constructor(readonly publicClient: PublicClient, readonly walletClient: WalletClient, readonly context: ChainContext) {
    if (!Number.isSafeInteger(context.chainId) || context.chainId <= 0 || context.mode === 'mock') throw new DomainError('INVALID_CONFIG');
    normalizeAddress(context.coreAddress); normalizeAddress(context.token);
  }
  async validateDeployment(): Promise<void> {
    const chain = await this.publicClient.getChainId();
    if (chain !== this.context.chainId) throw new DomainError('WRONG_CHAIN');
    const [core, token, configured] = await Promise.all([this.publicClient.getCode({ address: this.context.coreAddress }), this.publicClient.getCode({ address: this.context.token }), this.publicClient.readContract({ address: this.context.coreAddress, abi: commitPotAbi, functionName: 'supportedToken' })]);
    if (!core || core === '0x' || !token || token === '0x' || configured.toLowerCase() !== this.context.token.toLowerCase()) throw new DomainError('INVALID_CONFIG');
    const info = await this.getTokenInfo(); if (info.decimals !== 6) throw new DomainError('INVALID_CONFIG', 'Only the configured six-decimal token is supported');
  }
  private async account(): Promise<Address> {
    const chain = await this.walletClient.getChainId();
    if (chain !== this.context.chainId) throw new DomainError('WRONG_CHAIN');
    const address = this.walletClient.account?.address ?? (await this.walletClient.getAddresses())[0];
    if (!address) throw new DomainError('ACCOUNT_NOT_CONNECTED');
    return normalizeAddress(address);
  }
  async getConnection() {
    const [addresses, chainId] = await Promise.all([this.walletClient.getAddresses(), this.walletClient.getChainId()]);
    const address = this.walletClient.account?.address ?? addresses[0];
    return { connected: !!address, address: address ? normalizeAddress(address) : null, chainId, mode: this.context.mode };
  }
  async getPot(id: bigint): Promise<PotSummary> {
    try {
      const data = await this.publicClient.readContract({ address: this.context.coreAddress, abi: commitPotAbi, functionName: 'getPot', args: [id] });
      return { id, config: { token: data.config.token, verifier: data.config.verifier, stakeAmount: data.config.stakeAmount, registrationClose: safeTime(data.config.registrationClose), checkInOpen: safeTime(data.config.checkInOpen), checkInClose: safeTime(data.config.checkInClose) }, status: data.status === 0 ? 'OPEN' : 'FINALIZED', participantCount: data.participantCount, checkedInCount: data.checkedInCount, payoutPerWinner: data.payoutPerWinner, dustAmount: data.dustAmount };
    } catch (error) { return translate(error); }
  }
  async getParticipantStatus(id: bigint, participant: Address) {
    try {
      const [member, claimable] = await Promise.all([this.publicClient.readContract({ address: this.context.coreAddress, abi: commitPotAbi, functionName: 'getParticipantStatus', args: [id, getAddress(participant)] }), this.publicClient.readContract({ address: this.context.coreAddress, abi: commitPotAbi, functionName: 'claimable', args: [id, getAddress(participant)] })]);
      return { joined: member[0], checkedIn: member[1], claimed: member[2], order: member[3], claimable };
    } catch (error) { return translate(error); }
  }
  async getTokenInfo(): Promise<TokenInfo> {
    const [symbol, decimals] = await Promise.all([this.publicClient.readContract({ address: this.context.token, abi: erc20Abi, functionName: 'symbol' }), this.publicClient.readContract({ address: this.context.token, abi: erc20Abi, functionName: 'decimals' })]);
    return { address: this.context.token, symbol, decimals };
  }
  async getChainContext(): Promise<ChainContext> { return { ...this.context }; }
  async getChainTimestamp(): Promise<number> { return safeTime((await this.publicClient.getBlock()).timestamp); }
  async listPots(): Promise<PotSummary[]> {
    const next = await this.publicClient.readContract({ address: this.context.coreAddress, abi: commitPotAbi, functionName: 'nextPotId' });
    // Discovery is bounded. Older pots remain directly accessible by ID/share URL.
    const first = next > 30n ? next - 30n : 1n;
    return Promise.all(Array.from({ length: Number(next - first) }, (_, i) => this.getPot(next - 1n - BigInt(i))));
  }
  async getTokenBalance(address?: Address): Promise<bigint> { return this.publicClient.readContract({ address: this.context.token, abi: erc20Abi, functionName: 'balanceOf', args: [getAddress(address ?? await this.account())] }); }
  async getTokenAllowance(owner?: Address, spender?: Address): Promise<bigint> { return this.publicClient.readContract({ address: this.context.token, abi: erc20Abi, functionName: 'allowance', args: [getAddress(owner ?? await this.account()), getAddress(spender ?? this.context.coreAddress)] }); }
  private async write(kind: string, functionName: 'createPot' | 'joinPot' | 'checkIn' | 'finalize' | 'claim', args: readonly unknown[]): Promise<TxHash> {
    const account = await this.account();
    try {
      // The ABI and operation names come from the compiled contract. Simulation occurs before the wallet request.
      const request = { address: this.context.coreAddress as ViemAddress, abi: commitPotAbi, functionName, args, account, chain: this.walletClient.chain };
      await this.publicClient.simulateContract(request as Parameters<PublicClient['simulateContract']>[0]);
      const hash = await this.walletClient.writeContract(request as Parameters<WalletClient['writeContract']>[0]);
      return hash;
    } catch (error) { return translate(error); }
  }
  async createPot(config: PotConfig): Promise<TxHash> { validatePotConfig(config, await this.getChainTimestamp(), this.context.token); return this.write('create', 'createPot', [wireConfig(config)]); }
  async joinPot(id: bigint): Promise<TxHash> { return this.write('join', 'joinPot', [id]); }
  async submitCheckIn(proof: CheckInProof): Promise<TxHash> { return this.write('checkIn', 'checkIn', [{ ...proof, deadline: BigInt(proof.deadline) }]); }
  async finalizePot(id: bigint): Promise<TxHash> { return this.write('finalize', 'finalize', [id]); }
  async claimPayout(id: bigint, beneficiary: Address): Promise<TxHash> { return this.write('claim', 'claim', [id, normalizeAddress(beneficiary)]); }
  async approveToken(amount: bigint): Promise<TxHash> {
    const account = await this.account();
    try { return await this.walletClient.writeContract({ address: this.context.token, abi: erc20Abi, functionName: 'approve', args: [this.context.coreAddress, amount], account, chain: this.walletClient.chain }); }
    catch (error) { return translate(error); }
  }
  async signCheckIn(input: CheckInSigningInput): Promise<CheckInProof> {
    validateTimestamp(input.deadline);
    const account = await this.account(); const pot = await this.getPot(input.potId);
    if (pot.config.verifier.toLowerCase() !== account.toLowerCase()) throw new DomainError('WRONG_VERIFIER');
    try { const signature = await this.walletClient.signTypedData({ ...checkInTypedData(this.context, input), account }); return { ...input, signature }; }
    catch (error) { return translate(error); }
  }
  async waitForTransaction(hash: TxHash): Promise<TransactionReceipt> {
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash, timeout: 60_000, pollingInterval: 500 });
    if (receipt.status !== 'success') return { hash: receipt.transactionHash, status: 'failure', blockNumber: receipt.blockNumber, error: new DomainError('TRANSFER_FAILED', 'Transaction reverted') };
    const transaction = await this.publicClient.getTransaction({ hash: receipt.transactionHash });
    const isCore = transaction.to?.toLowerCase() === this.context.coreAddress.toLowerCase();
    const isToken = transaction.to?.toLowerCase() === this.context.token.toLowerCase();
    const failed = (): TransactionReceipt => ({ hash: receipt.transactionHash, status: 'failure', blockNumber: receipt.blockNumber, error: new DomainError('TRANSFER_FAILED', 'Receipt does not match a supported application operation') });
    if (!isCore && !isToken) return failed();
    try {
      if (isCore) {
        const decoded = decodeFunctionData({ abi: commitPotAbi, data: transaction.input });
        const expectedEvent: Record<string, string> = { createPot: 'PotCreated', joinPot: 'PotJoined', checkIn: 'CheckedIn', finalize: 'PotFinalized', claim: 'PayoutClaimed' };
        const eventName = expectedEvent[decoded.functionName];
        if (!eventName || !receipt.logs.some(log => {
          if (log.address.toLowerCase() !== this.context.coreAddress.toLowerCase()) return false;
          try { return decodeEventLog({ abi: commitPotAbi, data: log.data, topics: log.topics }).eventName === eventName; } catch { return false; }
        })) return failed();
      } else {
        const decoded = decodeFunctionData({ abi: erc20Abi, data: transaction.input });
        if (decoded.functionName !== 'approve' || decoded.args[0].toLowerCase() !== this.context.coreAddress.toLowerCase()) return failed();
      }
    } catch { return failed(); }
    let createdPotId: bigint | undefined;
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== this.context.coreAddress.toLowerCase()) continue;
      try {
        const event = decodeEventLog({ abi: commitPotAbi, data: log.data, topics: log.topics });
        if (event.eventName === 'PotCreated') createdPotId = event.args.potId;
      } catch { /* ERC20 and other unrelated logs are not core events. */ }
    }
    return { hash: receipt.transactionHash, status: 'success', blockNumber: receipt.blockNumber, ...(createdPotId ? { createdPotId } : {}) };
  }
}
