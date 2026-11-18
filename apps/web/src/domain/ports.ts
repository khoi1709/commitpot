import type {
  Address,
  TxHash,
  PotId,
  PotConfig,
  PotSummary,
  ParticipantStatus,
  TokenInfo,
  ChainContext,
  CheckInProof,
  TransactionReceipt,
  WalletConnection,
  CheckInSigningInput,
} from "./types";

export interface IPotRepository {
  getPot(id: PotId): Promise<PotSummary>;
  getParticipantStatus(id: PotId, participant: Address): Promise<ParticipantStatus>;
  getTokenInfo(): Promise<TokenInfo>;
  getChainTimestamp(): Promise<number>;
  listPots(): Promise<PotSummary[]>;
  getChainContext(): Promise<ChainContext>;
  createPot(config: PotConfig): Promise<TxHash>;
  joinPot(id: PotId): Promise<TxHash>;
  submitCheckIn(proof: CheckInProof): Promise<TxHash>;
  finalizePot(id: PotId): Promise<TxHash>;
  claimPayout(id: PotId, beneficiary: Address): Promise<TxHash>;
  waitForTransaction(hash: TxHash): Promise<TransactionReceipt>;
}

export interface IWalletPort {
  getConnection(): Promise<WalletConnection>;
  getTokenBalance(address?: Address): Promise<bigint>;
  getTokenAllowance(owner?: Address, spender?: Address): Promise<bigint>;
  approveToken(amount: bigint): Promise<TxHash>;
  signCheckIn(input: CheckInSigningInput): Promise<CheckInProof>;
}
