import {
  DomainError, MAX_UINT256, calculateClaimAmount, calculatePayout, isCheckInAllowed,
  isFinalizeAllowed, isJoinAllowed, normalizeAddress, validatePotConfig, validateTimestamp,
  type Address, type ChainContext, type CheckInProof, type CheckInSigningInput,
  type IPotRepository, type IWalletPort, type ParticipantStatus, type PotConfig,
  type PotSummary, type TokenInfo, type TransactionReceipt, type TxHash,
} from '../../domain';

export const MOCK_TOKEN_INFO: TokenInfo = { address: '0x0000000000000000000000000000000000001000', symbol: 'Test USDC', decimals: 6 };
export const MOCK_CHAIN_CONTEXT: ChainContext = { chainId: 31337, coreAddress: '0x0000000000000000000000000000000000002000', token: MOCK_TOKEN_INFO.address, mode: 'mock' };
export const MOCK_DEMO_ACCOUNTS: Address[] = Array.from({ length: 5 }, (_, i) => `0x${(i + 1).toString(16).padStart(40, '0')}` as Address);
export const MOCK_DEMO_VERIFIER: Address = '0x0000000000000000000000000000000000000006';
export interface MockStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
export interface MockClock { now(): number; set(time: number): void; advance(seconds: number): void }
export class MemoryMockStorage implements MockStorage {
  private data = new Map<string, string>();
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  setItem(key: string, value: string): void { this.data.set(key, value); }
}
export function createMockClock(initial = Math.floor(Date.now() / 1000)): MockClock {
  let time = initial;
  validateTimestamp(time);
  return { now: () => time, set: value => { validateTimestamp(value); time = value; }, advance: seconds => { validateTimestamp(time + seconds); time += seconds; } };
}
type Member = Omit<ParticipantStatus, 'claimable'>;
type WireMember = Omit<Member, 'order'> & { order: string };
type WirePot = Omit<PotSummary, 'id' | 'config' | 'participantCount' | 'checkedInCount' | 'payoutPerWinner' | 'dustAmount'> & {
  id: string; config: Omit<PotConfig, 'stakeAmount'> & { stakeAmount: string };
  participantCount: string; checkedInCount: string; payoutPerWinner: string; dustAmount: string;
  members: Record<string, WireMember>; nonces: string[];
};
type WireReceipt = Omit<TransactionReceipt, 'blockNumber' | 'createdPotId' | 'error'> & { blockNumber: string; createdPotId?: string };
interface State { version: 1; clock: number; nextId: string; sequence: number; pots: Record<string, WirePot>; balances: Record<string, string>; allowances: Record<string, string>; proofs: Record<string, CheckInProof & { signer: Address }>; receipts: Record<string, WireReceipt> }
const emptyMember = (): Member => ({ joined: false, checkedIn: false, claimed: false, order: 0n });
const hashPattern = /^0x[0-9a-f]{64}$/;
const uint = (value: unknown): bigint => {
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,77})$/.test(value) || BigInt(value) > MAX_UINT256) throw new Error('Invalid uint');
  return BigInt(value);
};
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected record');
  return value as Record<string, unknown>;
};
function wireSummary(pot: WirePot): PotSummary {
  return { id: BigInt(pot.id), config: { ...pot.config, stakeAmount: BigInt(pot.config.stakeAmount) }, status: pot.status,
    participantCount: BigInt(pot.participantCount), checkedInCount: BigInt(pot.checkedInCount), payoutPerWinner: BigInt(pot.payoutPerWinner), dustAmount: BigInt(pot.dustAmount) };
}
function encodeState(state: State): string { return JSON.stringify(state, (_, value) => typeof value === 'bigint' ? value.toString() : value); }
function loadState(raw: string): State {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new DomainError('STORAGE_CORRUPT', 'Saved demo data is unreadable; original data was preserved'); }
  try {
    const root = record(parsed);
    if (root.version !== 1) throw new DomainError('STORAGE_VERSION', 'Unsupported demo data version; original data was preserved');
    validateTimestamp(root.clock as number);
    const next = uint(root.nextId);
    if (next < 1n || !Number.isSafeInteger(root.sequence) || (root.sequence as number) < 0) throw new Error('Invalid counters');
    for (const values of [root.balances, root.allowances]) for (const [address, value] of Object.entries(record(values))) { normalizeAddress(address); uint(value); }
    const pots = record(root.pots);
    for (const [id, value] of Object.entries(pots)) {
      if (uint(id) < 1n || BigInt(id) >= next) throw new Error('Invalid ID');
      const pot = record(value); const config = record(pot.config);
      if (pot.id !== id) throw new Error('ID mismatch');
      validatePotConfig({ ...config, stakeAmount: uint(config.stakeAmount) } as unknown as PotConfig, 0, MOCK_TOKEN_INFO.address);
      if (!['OPEN', 'FINALIZED'].includes(pot.status as string)) throw new Error('Invalid status');
      const n = uint(pot.participantCount); const k = uint(pot.checkedInCount);
      const members = record(pot.members); let count = 0n; const orders: bigint[] = [];
      for (const [address, value] of Object.entries(members)) {
        normalizeAddress(address); const member = record(value); const order = uint(member.order);
        if (member.joined !== true || typeof member.checkedIn !== 'boolean' || typeof member.claimed !== 'boolean') throw new Error('Invalid member');
        if (member.checkedIn ? order < 1n || order > k : order !== 0n) throw new Error('Invalid order');
        if (member.claimed && (pot.status !== 'FINALIZED' || (k > 0n && !member.checkedIn))) throw new Error('Invalid claim');
        count++; if (member.checkedIn) orders.push(order);
      }
      if (n !== count || k !== BigInt(orders.length) || new Set(orders.map(String)).size !== orders.length) throw new Error('Invalid counts');
      if (!Array.isArray(pot.nonces) || BigInt(pot.nonces.length) !== k || new Set(pot.nonces).size !== pot.nonces.length) throw new Error('Invalid nonce ledger');
      pot.nonces.forEach(uint);
      const payout = calculatePayout(n, k, uint(config.stakeAmount));
      if (pot.status === 'FINALIZED' ? uint(pot.payoutPerWinner) !== payout.base || uint(pot.dustAmount) !== payout.dust : uint(pot.payoutPerWinner) !== 0n || uint(pot.dustAmount) !== 0n) throw new Error('Invalid settlement');
    }
    for (const [hash, value] of Object.entries(record(root.receipts))) {
      const receipt = record(value);
      if (!hashPattern.test(hash) || receipt.hash !== hash || receipt.status !== 'success') throw new Error('Invalid receipt');
      uint(receipt.blockNumber); if (receipt.createdPotId !== undefined && !pots[String(receipt.createdPotId)]) throw new Error('Unknown receipt pot');
    }
    const proofs: State['proofs'] = {};
    for (const [signature, value] of Object.entries(record(root.proofs))) {
      const proof = record(value);
      if (!hashPattern.test(signature) || proof.signature !== signature || !pots[String(proof.potId)]) throw new Error('Invalid proof');
      normalizeAddress(proof.participant); normalizeAddress(proof.signer); validateTimestamp(proof.deadline as number);
      proofs[signature] = { ...proof, potId: uint(proof.potId), nonce: uint(proof.nonce) } as State['proofs'][string];
    }
    return { ...root, proofs } as unknown as State;
  } catch (error) {
    if (error instanceof DomainError && error.code === 'STORAGE_VERSION') throw error;
    throw new DomainError('STORAGE_SCHEMA', 'Saved demo data is invalid; original data was preserved');
  }
}

export class MockPotRepository implements IPotRepository, IWalletPort {
  readonly clock: MockClock;
  private state: State;
  private account: Address | null;
  private raw: string | null;
  private readonly storage?: MockStorage;
  private readonly storageKey: string;
  private readonly latencyMs: number;
  constructor(options: { clock?: MockClock; storage?: MockStorage; storageKey?: string; latencyMs?: number; account?: Address | null } = {}) {
    this.clock = options.clock ?? createMockClock(); this.storage = options.storage;
    this.storageKey = options.storageKey ?? 'commitpot-demo-v1'; this.latencyMs = options.latencyMs ?? 80;
    this.account = options.account === null ? null : normalizeAddress(options.account ?? MOCK_DEMO_ACCOUNTS[0]);
    this.raw = this.storage?.getItem(this.storageKey) ?? null;
    this.state = this.raw ? loadState(this.raw) : this.initialState();
    if (this.raw) this.clock.set(this.state.clock);
  }
  private initialState(): State {
    return { version: 1, clock: this.clock.now(), nextId: '1', sequence: 0, pots: {}, balances: Object.fromEntries([...MOCK_DEMO_ACCOUNTS, MOCK_DEMO_VERIFIER].map(a => [a, '100000000'])), allowances: {}, proofs: {}, receipts: {} };
  }
  setAccount(address: Address | null): void { this.account = address ? normalizeAddress(address) : null; }
  private actor(): Address { if (!this.account) throw new DomainError('ACCOUNT_NOT_CONNECTED'); return this.account; }
  private pot(id: bigint, state = this.state): WirePot { const pot = state.pots[id.toString()]; if (!pot) throw new DomainError('POT_NOT_FOUND'); return pot; }
  private member(pot: WirePot, address: Address): Member { const value = pot.members[normalizeAddress(address)]; return value ? { ...value, order: BigInt(value.order) } : emptyMember(); }
  private async write(action: (state: State) => bigint | void): Promise<TxHash> {
    await new Promise(resolve => setTimeout(resolve, this.latencyMs));
    if (this.storage && this.storage.getItem(this.storageKey) !== this.raw) throw new DomainError('STORAGE_SCHEMA', 'Demo changed in another tab; reload before continuing');
    const candidate = loadState(encodeState(this.state));
    const created = action(candidate);
    candidate.sequence++; candidate.clock = this.clock.now();
    const hash = `0x${candidate.sequence.toString(16).padStart(64, '0')}` as TxHash;
    candidate.receipts[hash] = { hash, status: 'success', blockNumber: String(candidate.sequence), ...(created ? { createdPotId: created.toString() } : {}) };
    const raw = encodeState(candidate);
    try { this.storage?.setItem(this.storageKey, raw); } catch { throw new DomainError('TRANSFER_FAILED', 'Demo could not save; no change was committed'); }
    this.state = candidate; this.raw = raw;
    return hash;
  }
  async getPot(id: bigint): Promise<PotSummary> { return wireSummary(this.pot(id)); }
  async getParticipantStatus(id: bigint, address: Address): Promise<ParticipantStatus> {
    const pot = this.pot(id); const member = this.member(pot, address);
    const status = { ...member, claimable: 0n }; status.claimable = calculateClaimAmount(wireSummary(pot), status); return status;
  }
  async getTokenInfo(): Promise<TokenInfo> { return { ...MOCK_TOKEN_INFO }; }
  async getChainContext(): Promise<ChainContext> { return { ...MOCK_CHAIN_CONTEXT }; }
  async getChainTimestamp(): Promise<number> { return this.clock.now(); }
  async listPots(): Promise<PotSummary[]> { return Object.values(this.state.pots).map(wireSummary).reverse(); }
  async getConnection() { return { connected: !!this.account, address: this.account, chainId: this.account ? MOCK_CHAIN_CONTEXT.chainId : null, mode: 'mock' as const }; }
  async getTokenBalance(address?: Address): Promise<bigint> { return BigInt(this.state.balances[normalizeAddress(address ?? this.actor())] ?? '0'); }
  async getTokenAllowance(owner?: Address, spender?: Address): Promise<bigint> {
    if (spender && normalizeAddress(spender) !== MOCK_CHAIN_CONTEXT.coreAddress) return 0n;
    return BigInt(this.state.allowances[normalizeAddress(owner ?? this.actor())] ?? '0');
  }
  async approveToken(amount: bigint): Promise<TxHash> {
    const account = this.actor(); if (amount < 0n || amount > MAX_UINT256) throw new DomainError('INVALID_ARGUMENT');
    return this.write(state => { state.allowances[account] = amount.toString(); });
  }
  async createPot(config: PotConfig): Promise<TxHash> {
    this.actor(); validatePotConfig(config, this.clock.now(), MOCK_TOKEN_INFO.address);
    return this.write(state => {
      validatePotConfig(config, this.clock.now(), MOCK_TOKEN_INFO.address);
      const id = BigInt(state.nextId); state.nextId = (id + 1n).toString();
      state.pots[String(id)] = { id: String(id), config: { ...config, token: normalizeAddress(config.token), verifier: normalizeAddress(config.verifier), stakeAmount: String(config.stakeAmount) }, status: 'OPEN', participantCount: '0', checkedInCount: '0', payoutPerWinner: '0', dustAmount: '0', members: {}, nonces: [] };
      return id;
    });
  }
  async joinPot(id: bigint): Promise<TxHash> {
    const account = this.actor();
    return this.write(state => {
      const pot = this.pot(id, state); const summary = wireSummary(pot);
      if (!isJoinAllowed(summary, this.clock.now())) throw new DomainError('REGISTRATION_CLOSED');
      if (pot.members[account]) throw new DomainError('ALREADY_JOINED');
      const stake = summary.config.stakeAmount; const balance = BigInt(state.balances[account] ?? '0'); const allowance = BigInt(state.allowances[account] ?? '0');
      if (allowance < stake) throw new DomainError('INSUFFICIENT_ALLOWANCE');
      if (balance < stake) throw new DomainError('INSUFFICIENT_BALANCE');
      state.balances[account] = String(balance - stake); state.allowances[account] = String(allowance - stake);
      pot.members[account] = { joined: true, checkedIn: false, claimed: false, order: '0' }; pot.participantCount = String(summary.participantCount + 1n);
    });
  }
  async signCheckIn(input: CheckInSigningInput): Promise<CheckInProof> {
    const actor = this.actor(); const pot = this.pot(input.potId);
    if (actor !== pot.config.verifier) throw new DomainError('WRONG_VERIFIER');
    normalizeAddress(input.participant); validateTimestamp(input.deadline);
    if (input.nonce < 0n || input.nonce > MAX_UINT256) throw new DomainError('INVALID_ARGUMENT');
    const issued = { ...input, participant: normalizeAddress(input.participant) };
    const hash = await this.write(state => {
      const signature = `0x${(state.sequence + 1).toString(16).padStart(64, '0')}` as TxHash;
      state.proofs[signature] = { ...issued, signature, signer: actor };
    });
    return { ...issued, signature: hash };
  }
  async submitCheckIn(proof: CheckInProof): Promise<TxHash> {
    this.actor();
    return this.write(state => {
      const pot = this.pot(proof.potId, state);
      if (!isCheckInAllowed(wireSummary(pot), this.clock.now())) throw new DomainError('CHECK_IN_NOT_OPEN');
      if (this.clock.now() > proof.deadline) throw new DomainError('PROOF_EXPIRED');
      const address = normalizeAddress(proof.participant); const member = pot.members[address];
      if (!member) throw new DomainError('NOT_JOINED');
      if (member.checkedIn) throw new DomainError('ALREADY_CHECKED_IN');
      if (pot.nonces.includes(String(proof.nonce))) throw new DomainError('NONCE_REUSED');
      const issued = state.proofs[proof.signature];
      if (!issued || issued.signer !== pot.config.verifier || issued.potId !== proof.potId || issued.participant !== address || issued.nonce !== proof.nonce || issued.deadline !== proof.deadline) throw new DomainError('INVALID_PROOF');
      pot.checkedInCount = String(BigInt(pot.checkedInCount) + 1n); member.checkedIn = true; member.order = pot.checkedInCount; pot.nonces.push(String(proof.nonce));
    });
  }
  async finalizePot(id: bigint): Promise<TxHash> {
    this.actor(); return this.write(state => {
      const pot = this.pot(id, state); const summary = wireSummary(pot);
      if (pot.status === 'FINALIZED') throw new DomainError('POT_ALREADY_FINALIZED');
      if (!isFinalizeAllowed(summary, this.clock.now())) throw new DomainError('CHECK_IN_NOT_OPEN');
      const payout = calculatePayout(summary.participantCount, summary.checkedInCount, summary.config.stakeAmount);
      pot.payoutPerWinner = String(payout.base); pot.dustAmount = String(payout.dust); pot.status = 'FINALIZED';
    });
  }
  async claimPayout(id: bigint, beneficiary: Address): Promise<TxHash> {
    this.actor(); const address = normalizeAddress(beneficiary);
    return this.write(state => {
      const pot = this.pot(id, state); const member = this.member(pot, address);
      if (pot.status !== 'FINALIZED') throw new DomainError('NOT_FINALIZED');
      if (member.claimed) throw new DomainError('ALREADY_CLAIMED');
      const amount = calculateClaimAmount(wireSummary(pot), { ...member, claimable: 0n });
      if (!amount) throw new DomainError('NOT_ELIGIBLE');
      pot.members[address].claimed = true; state.balances[address] = String(BigInt(state.balances[address] ?? '0') + amount);
    });
  }
  async waitForTransaction(hash: TxHash): Promise<TransactionReceipt> {
    const receipt = this.state.receipts[hash]; if (!receipt) throw new DomainError('TRANSACTION_NOT_FOUND');
    return { ...receipt, blockNumber: BigInt(receipt.blockNumber), ...(receipt.createdPotId ? { createdPotId: BigInt(receipt.createdPotId) } : {}) } as TransactionReceipt;
  }
  reset(): void {
    const fresh = this.initialState(); const raw = encodeState(fresh); this.storage?.setItem(this.storageKey, raw); this.state = fresh; this.raw = raw;
  }
}

export function createMockPotEnvironment(options: ConstructorParameters<typeof MockPotRepository>[0] = {}) {
  const repository = new MockPotRepository(options);
  return { repository, wallet: repository, clock: repository.clock, accounts: [...MOCK_DEMO_ACCOUNTS], verifier: MOCK_DEMO_VERIFIER };
}
