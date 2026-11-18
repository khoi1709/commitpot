export type Address = `0x${string}`;
export type TxHash = `0x${string}`;
export type PotId = bigint;

export type PotStatus = 'OPEN' | 'FINALIZED';
export type RuntimeMode = 'mock' | 'local' | 'fuji';

export interface PotConfig {
  token: Address;
  verifier: Address;
  stakeAmount: bigint;
  registrationClose: number;
  checkInOpen: number;
  checkInClose: number;
}

export interface PotSummary {
  id: PotId;
  config: PotConfig;
  status: PotStatus;
  participantCount: bigint;
  checkedInCount: bigint;
  payoutPerWinner: bigint;
  dustAmount: bigint;
}

export interface ParticipantStatus {
  joined: boolean;
  checkedIn: boolean;
  claimed: boolean;
  order: bigint;
  claimable: bigint;
}

export interface CheckInProof {
  potId: PotId;
  participant: Address;
  nonce: bigint;
  deadline: number;
  signature: `0x${string}`;
}

export interface TokenInfo {
  address: Address;
  symbol: string;
  decimals: number;
}

export interface ChainContext {
  chainId: number;
  coreAddress: Address;
  token: Address;
  mode: RuntimeMode;
}

export interface WalletConnection {
  connected: boolean;
  address: Address | null;
  chainId: number | null;
  mode: RuntimeMode;
}

export interface TransactionReceipt {
  hash: TxHash;
  status: 'success' | 'failure';
  blockNumber: bigint;
  createdPotId?: PotId;
  error?: import('./errors').DomainError;
}

export interface CheckInSigningInput {
  potId: PotId;
  participant: Address;
  nonce: bigint;
  deadline: number;
}

export interface ICheckInSignatureVerifier {
  verify(expectedSigner: Address, proof: CheckInProof, context: ChainContext): boolean;
}
