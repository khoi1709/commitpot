import { keccak256, toBytes } from 'viem';
import { MAX_UINT256, normalizeAddress, parsePotId, validateOperationIntent, type Address, type OperationIntent, type TxHash } from '../../domain';
import { commitPotAbi } from '../../generated/commitPotAbi';

export const readerAbiHash = keccak256(toBytes(JSON.stringify(commitPotAbi)));
export const contractRoles = ['core', 'token', 'helper', 'strategy'] as const;
export type ContractRole = typeof contractRoles[number];
export interface ContractIdentity { address: Address; artifactSha256: string; deployedRuntimeHash: TxHash }
export interface ReceiptReference { hash: TxHash; blockNumber: string; blockHash: TxHash; potId: string; intent: OperationIntent }
export interface ReleaseManifest {
  version: 1;
  kind: 'release';
  network: 'local' | 'fuji';
  chainId: 31337 | 43113;
  sourceCommit: string;
  compiler: { version: string; optimizer: { enabled: boolean; runs: number }; evmVersion: string };
  abiHash: TxHash;
  contracts: Record<ContractRole, ContractIdentity>;
  immutableArgs: { supportedToken: Address; attendanceVerifier: Address; payoutStrategy: Address };
  deployment: { blockNumber: string; blockHash: TxHash };
  potId: string;
  receipts: ReceiptReference[];
}

function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid manifest object');
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some(key => !keys.includes(key)) || keys.some(key => !(key in record))) throw new Error('Invalid manifest fields');
  return record;
}
function text(value: unknown, pattern: RegExp): string {
  if (typeof value !== 'string' || !pattern.test(value)) throw new Error('Invalid manifest identity');
  return value;
}
const hash = (value: unknown): TxHash => text(value, /^0x[0-9a-fA-F]{64}$/).toLowerCase() as TxHash;
function uint(value: unknown): string {
  const result = text(value, /^(0|[1-9]\d{0,77})$/);
  if (BigInt(result) > MAX_UINT256) throw new Error('Manifest integer exceeds uint256');
  return result;
}
const potId = (value: unknown) => parsePotId(text(value, /^[1-9]\d{0,77}$/)).toString();
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** Strict, bounded input validation only. A parsed manifest is NOT chain verification. */
export function validateReleaseManifest(value: unknown): ReleaseManifest {
  const item = object(value, ['version', 'kind', 'network', 'chainId', 'sourceCommit', 'compiler', 'abiHash', 'contracts', 'immutableArgs', 'deployment', 'potId', 'receipts']);
  if (item.version !== 1 || item.kind !== 'release' || !((item.network === 'local' && item.chainId === 31337) || (item.network === 'fuji' && item.chainId === 43113))) throw new Error('Unsupported release network');
  const compiler = object(item.compiler, ['version', 'optimizer', 'evmVersion']);
  const optimizer = object(compiler.optimizer, ['enabled', 'runs']);
  if (typeof optimizer.enabled !== 'boolean' || !Number.isSafeInteger(optimizer.runs) || Number(optimizer.runs) < 0) throw new Error('Invalid compiler settings');
  const entries = object(item.contracts, [...contractRoles]);
  const contracts = Object.fromEntries(contractRoles.map(role => {
    const entry = object(entries[role], ['address', 'artifactSha256', 'deployedRuntimeHash']);
    return [role, { address: normalizeAddress(entry.address), artifactSha256: text(entry.artifactSha256, /^[0-9a-fA-F]{64}$/).toLowerCase(), deployedRuntimeHash: hash(entry.deployedRuntimeHash) }];
  })) as Record<ContractRole, ContractIdentity>;
  if (new Set(contractRoles.map(role => contracts[role].address)).size !== 4) throw new Error('Contract roles must be distinct');
  const args = object(item.immutableArgs, ['supportedToken', 'attendanceVerifier', 'payoutStrategy']);
  const immutableArgs = { supportedToken: normalizeAddress(args.supportedToken), attendanceVerifier: normalizeAddress(args.attendanceVerifier), payoutStrategy: normalizeAddress(args.payoutStrategy) };
  if (!same(immutableArgs.supportedToken, contracts.token.address) || !same(immutableArgs.attendanceVerifier, contracts.helper.address) || !same(immutableArgs.payoutStrategy, contracts.strategy.address)) throw new Error('Immutable address mismatch');
  const deployment = object(item.deployment, ['blockNumber', 'blockHash']);
  const deploymentBlock = uint(deployment.blockNumber);
  if (!Array.isArray(item.receipts) || item.receipts.length > 32) throw new Error('At most 32 receipt references are allowed');
  const receipts = item.receipts.map(value => {
    const receipt = object(value, ['hash', 'blockNumber', 'blockHash', 'potId', 'intent']);
    const intent = validateOperationIntent(receipt.intent);
    const id = potId(receipt.potId);
    const blockNumber = uint(receipt.blockNumber);
    if (intent.chainId !== item.chainId || !same(intent.core, contracts.core.address) || ('potId' in intent && intent.potId !== id) || (intent.token && !same(intent.token, contracts.token.address)) || (intent.kind === 'create' && !same(intent.config.token, contracts.token.address)) || BigInt(blockNumber) < BigInt(deploymentBlock)) throw new Error('Receipt scope mismatch');
    return { hash: hash(receipt.hash), blockNumber, blockHash: hash(receipt.blockHash), potId: id, intent };
  });
  if (new Set(receipts.map(receipt => receipt.hash)).size !== receipts.length) throw new Error('Duplicate receipt identity');
  return {
    version: 1, kind: 'release', network: item.network as ReleaseManifest['network'], chainId: item.chainId as ReleaseManifest['chainId'],
    sourceCommit: text(item.sourceCommit, /^[0-9a-fA-F]{40}$/).toLowerCase(),
    compiler: { version: text(compiler.version, /^\d+\.\d+\.\d+(?:\+commit\.[0-9a-fA-F]{8})?$/), optimizer: { enabled: optimizer.enabled, runs: optimizer.runs as number }, evmVersion: text(compiler.evmVersion, /^[a-zA-Z][a-zA-Z0-9]{0,31}$/) },
    abiHash: hash(item.abiHash), contracts, immutableArgs,
    deployment: { blockNumber: deploymentBlock, blockHash: hash(deployment.blockHash) }, potId: potId(item.potId), receipts,
  };
}

export function parseReleaseManifest(json: string): ReleaseManifest {
  if (json.length > 131_072) throw new Error('Manifest exceeds 128 KiB');
  return validateReleaseManifest(JSON.parse(json));
}
