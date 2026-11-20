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
  OperationContext,
  OperationIntent,
} from "./types";

export interface IPotRepository {
  getPot(id: PotId): Promise<PotSummary>;
  getParticipantStatus(id: PotId, participant: Address): Promise<ParticipantStatus>;
  getTokenInfo(): Promise<TokenInfo>;
  getChainTimestamp(): Promise<number>;
  listPots(): Promise<PotSummary[]>;
  getChainContext(): Promise<ChainContext>;
  createPot(config: PotConfig, context?: OperationContext): Promise<TxHash>;
  joinPot(id: PotId, context?: OperationContext): Promise<TxHash>;
  submitCheckIn(proof: CheckInProof, context?: OperationContext): Promise<TxHash>;
  finalizePot(id: PotId, context?: OperationContext): Promise<TxHash>;
  claimPayout(id: PotId, beneficiary: Address, context?: OperationContext): Promise<TxHash>;
  waitForTransaction(hash: TxHash, intent?: OperationIntent): Promise<TransactionReceipt>;
}

export interface IWalletPort {
  getConnection(): Promise<WalletConnection>;
  getTokenBalance(address?: Address): Promise<bigint>;
  /** Native base units; null means unavailable, never a fabricated estimate. */
  getNativeBalance(address?: Address): Promise<bigint | null>;
  getTokenAllowance(owner?: Address, spender?: Address): Promise<bigint>;
  approveToken(amount: bigint, context?: OperationContext): Promise<TxHash>;
  signCheckIn(input: CheckInSigningInput, context?: OperationContext): Promise<CheckInProof>;
}
