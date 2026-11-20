import { keccak256, type PublicClient } from 'viem';
import { parsePotId, type Address, type IPotRepository, type OperationIntent, type TransactionReceipt, type TxHash } from '../../domain';
import { commitPotAbi } from '../../generated/commitPotAbi';
import { contractRoles, parseReleaseManifest, readerAbiHash, type ReceiptReference, type ReleaseManifest } from './manifest';

export interface PublicProofReader {
  repository: Pick<IPotRepository, 'getChainContext' | 'getPot' | 'getTokenInfo' | 'getChainTimestamp' | 'waitForTransaction'>;
  publicClient: PublicClient;
}
export type ClaimSimulation = 'would-succeed' | 'AlreadyClaimed' | 'NotEligible' | 'NotJoined' | 'PotNotFinalized' | 'unavailable' | 'other-revert';
export interface ReceiptProof {
  reference: ReceiptReference;
  status: 'matched' | 'mismatch' | 'unavailable';
  observed?: {
    hash: TxHash;
    blockNumber: string;
    blockHash: TxHash;
    sender: Address;
    destination: Address;
    core: Address;
    operation: OperationIntent['kind'];
    potId?: string;
    beneficiary?: Address;
    amount?: string;
    blockTimestamp?: number;
  };
  amount?: string;
  beneficiary?: Address;
  blockTimestamp?: number;
  simulation?: ClaimSimulation;
}
export interface PotRead {
  id: string; status: 'OPEN' | 'FINALIZED'; token: Address; verifier: Address; stakeAmount: string;
  registrationClose: number; checkInOpen: number; checkInClose: number;
  participantCount: string; checkedInCount: string; payoutPerWinner: string; dustAmount: string;
}
export interface ProofSnapshot {
  status: 'unconfigured' | 'invalid-manifest' | 'invalid-pot' | 'unavailable' | 'mismatch' | 'matched';
  reason: 'missing-manifest' | 'invalid-manifest' | 'invalid-pot' | 'reader-unavailable' | 'identity-mismatch' | 'pot-unavailable' | 'receipt-incomplete' | 'matched';
  requestedPotId?: string;
  manifest?: ReleaseManifest;
  observedBlock?: string;
  observedBlockHash?: string;
  chainTimestamp?: number;
  pot?: PotRead;
  receipts: ReceiptProof[];
}
class IdentityMismatch extends Error {}
const same = (a: string | undefined | null, b: string) => typeof a === 'string' && a.toLowerCase() === b.toLowerCase();
const requireMatch = (value: boolean) => { if (!value) throw new IdentityMismatch(); };

async function checkIdentity(reader: PublicProofReader, manifest: ReleaseManifest) {
  const { repository, publicClient: client } = reader;
  const [context, chainId, token, head] = await Promise.all([repository.getChainContext(), client.getChainId(), repository.getTokenInfo(), client.getBlock()]);
  requireMatch(context.mode === manifest.network && context.chainId === manifest.chainId && chainId === manifest.chainId && same(context.coreAddress, manifest.contracts.core.address) && same(context.token, manifest.contracts.token.address));
  requireMatch(token.decimals === 6 && same(token.address, manifest.contracts.token.address) && manifest.abiHash === readerAbiHash);
  requireMatch(head.number !== null && head.hash !== null && head.number >= BigInt(manifest.deployment.blockNumber));
  const blockNumber = head.number!;
  const deployment = await client.getBlock({ blockNumber: BigInt(manifest.deployment.blockNumber) });
  requireMatch(same(deployment.hash, manifest.deployment.blockHash));
  // Hash full on-chain bytes, including substituted immutables. No placeholder comparison or masking.
  await Promise.all(contractRoles.map(async role => {
    const identity = manifest.contracts[role];
    const [then, now] = await Promise.all([
      client.getCode({ address: identity.address, blockNumber: BigInt(manifest.deployment.blockNumber) }),
      client.getCode({ address: identity.address, blockNumber }),
    ]);
    requireMatch(!!then && then !== '0x' && !!now && now !== '0x');
    requireMatch(keccak256(then!) === identity.deployedRuntimeHash && keccak256(now!) === identity.deployedRuntimeHash);
  }));
  const address = manifest.contracts.core.address;
  const [tokenArg, helperArg, strategyArg] = await Promise.all([
    client.readContract({ address, abi: commitPotAbi, functionName: 'supportedToken', blockNumber }),
    client.readContract({ address, abi: commitPotAbi, functionName: 'attendanceVerifier', blockNumber }),
    client.readContract({ address, abi: commitPotAbi, functionName: 'payoutStrategy', blockNumber }),
  ]);
  requireMatch(same(tokenArg, manifest.immutableArgs.supportedToken) && same(helperArg, manifest.immutableArgs.attendanceVerifier) && same(strategyArg, manifest.immutableArgs.payoutStrategy));
  return { blockNumber, blockHash: head.hash!, chainTimestamp: Number(head.timestamp) };
}

async function simulateClaim(client: PublicClient, reference: ReceiptReference, blockNumber: bigint): Promise<ClaimSimulation> {
  if (reference.intent.kind !== 'claim') return 'unavailable';
  try {
    await client.simulateContract({ address: reference.intent.core, abi: commitPotAbi, functionName: 'claim', args: [BigInt(reference.potId), reference.intent.beneficiary], account: reference.intent.account, blockNumber });
    return 'would-succeed';
  } catch (error) {
    let node: unknown = error;
    for (let depth = 0; depth < 10 && node && typeof node === 'object'; depth++) {
      const item = node as { data?: { errorName?: string }; cause?: unknown };
      const name = item.data?.errorName;
      if (name === 'AlreadyClaimed' || name === 'NotEligible' || name === 'NotJoined' || name === 'PotNotFinalized') return name;
      if (name) return 'other-revert';
      node = item.cause;
    }
    return 'unavailable';
  }
}

async function checkReceipt(reader: PublicProofReader, reference: ReceiptReference, head: bigint): Promise<ReceiptProof> {
  const proof: ReceiptProof = { reference, status: 'unavailable' };
  try {
    // Immediate getter first: a missing receipt never becomes a fabricated pending/success record.
    const raw = await reader.publicClient.getTransactionReceipt({ hash: reference.hash });
    const block = await reader.publicClient.getBlock({ blockNumber: BigInt(reference.blockNumber) });
    requireMatch(raw.status === 'success' && same(raw.transactionHash, reference.hash) && raw.blockNumber === BigInt(reference.blockNumber) && raw.blockNumber <= head && same(raw.blockHash, reference.blockHash) && same(block.hash, reference.blockHash));
    const receipt: TransactionReceipt = await reader.repository.waitForTransaction(reference.hash, reference.intent);
    requireMatch(receipt.status === 'success' && same(receipt.hash, reference.hash) && receipt.blockNumber === BigInt(reference.blockNumber) && receipt.chainId === reference.intent.chainId && same(receipt.coreAddress, reference.intent.core) && same(receipt.from, reference.intent.account) && receipt.operation === reference.intent.kind);
    if (reference.intent.kind !== 'approve') requireMatch((receipt.potId ?? receipt.createdPotId)?.toString() === reference.potId);
    if (reference.intent.kind === 'claim') requireMatch(same(receipt.beneficiary, reference.intent.beneficiary) && receipt.amount !== undefined);
    proof.status = 'matched';
    proof.observed = { hash: receipt.hash, blockNumber: receipt.blockNumber.toString(), blockHash: raw.blockHash, sender: receipt.from!, destination: receipt.to!, core: receipt.coreAddress!, operation: receipt.operation!, ...(receipt.potId === undefined && receipt.createdPotId === undefined ? {} : { potId: (receipt.potId ?? receipt.createdPotId)!.toString() }), ...(receipt.beneficiary ? { beneficiary: receipt.beneficiary } : {}), ...(receipt.amount === undefined ? {} : { amount: receipt.amount.toString() }), ...(receipt.blockTimestamp === undefined ? {} : { blockTimestamp: receipt.blockTimestamp }) };
    proof.amount = receipt.amount?.toString();
    proof.beneficiary = receipt.beneficiary;
    proof.blockTimestamp = receipt.blockTimestamp;
  } catch (error) { proof.status = error instanceof IdentityMismatch ? 'mismatch' : 'unavailable'; }
  // A present-state eth_call is separate from the historical successful receipt, never a replay.
  if (reference.intent.kind === 'claim') proof.simulation = await simulateClaim(reader.publicClient, reference, head);
  return proof;
}

/** Reads only. No storage, mock fallback, wallet request, transaction send, or business-state authority. */
export async function loadProof(options: { manifestJson?: string; potId?: string; createReader: () => Promise<PublicProofReader> }): Promise<ProofSnapshot> {
  let requestedPotId: string | undefined;
  try { if (options.potId !== undefined) requestedPotId = parsePotId(options.potId).toString(); }
  catch { return { status: 'invalid-pot', reason: 'invalid-pot', receipts: [] }; }
  if (!options.manifestJson) return { status: 'unconfigured', reason: 'missing-manifest', requestedPotId, receipts: [] };
  let manifest: ReleaseManifest;
  try { manifest = parseReleaseManifest(options.manifestJson); }
  catch { return { status: 'invalid-manifest', reason: 'invalid-manifest', requestedPotId, receipts: [] }; }
  requestedPotId ??= manifest.potId;
  const base = { manifest, requestedPotId, receipts: [] as ReceiptProof[] };
  let reader: PublicProofReader;
  let identity: Awaited<ReturnType<typeof checkIdentity>>;
  try { reader = await options.createReader(); identity = await checkIdentity(reader, manifest); }
  catch (error) { return { ...base, status: error instanceof IdentityMismatch ? 'mismatch' : 'unavailable', reason: error instanceof IdentityMismatch ? 'identity-mismatch' : 'reader-unavailable' }; }
  const observed = { observedBlock: identity.blockNumber.toString(), observedBlockHash: identity.blockHash, chainTimestamp: identity.chainTimestamp };
  let pot: PotRead;
  try {
    const value = await reader.repository.getPot(BigInt(requestedPotId));
    requireMatch(value.id.toString() === requestedPotId && same(value.config.token, manifest.contracts.token.address));
    pot = { id: value.id.toString(), status: value.status, token: value.config.token, verifier: value.config.verifier, stakeAmount: value.config.stakeAmount.toString(), registrationClose: value.config.registrationClose, checkInOpen: value.config.checkInOpen, checkInClose: value.config.checkInClose, participantCount: value.participantCount.toString(), checkedInCount: value.checkedInCount.toString(), payoutPerWinner: value.payoutPerWinner.toString(), dustAmount: value.dustAmount.toString() };
  } catch (error) { return { ...base, ...observed, status: error instanceof IdentityMismatch ? 'mismatch' : 'unavailable', reason: error instanceof IdentityMismatch ? 'identity-mismatch' : 'pot-unavailable' }; }
  const receipts = await Promise.all(manifest.receipts.filter(reference => reference.potId === requestedPotId).map(reference => checkReceipt(reader, reference, identity.blockNumber)));
  // Detect a chain reset/reorg during the read, rather than combine incompatible snapshots.
  try { requireMatch(same((await reader.publicClient.getBlock({ blockNumber: identity.blockNumber })).hash, identity.blockHash)); }
  catch (error) { return { ...base, status: error instanceof IdentityMismatch ? 'mismatch' : 'unavailable', reason: error instanceof IdentityMismatch ? 'identity-mismatch' : 'reader-unavailable' }; }
  const incomplete = receipts.some(receipt => receipt.status !== 'matched');
  return { ...base, ...observed, pot, receipts, status: incomplete ? (receipts.some(receipt => receipt.status === 'mismatch') ? 'mismatch' : 'unavailable') : 'matched', reason: incomplete ? 'receipt-incomplete' : 'matched' };
}
