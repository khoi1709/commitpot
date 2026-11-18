import { createPublicClient, createWalletClient, custom, defineChain, http } from 'viem';
type BrowserProvider = { request(args: { method: string; params?: unknown }): Promise<unknown> };
import { DomainError, normalizeAddress } from '../../domain';
import type { AppRuntime } from '../../application/runtime';
import { AvalanchePotRepository } from './repository';

export async function createBrowserRuntime(): Promise<AppRuntime> {
  const mode = process.env.NEXT_PUBLIC_CHAIN_MODE;
  const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID);
  const rpc = process.env.NEXT_PUBLIC_RPC_URL;
  if ((mode !== 'local' && mode !== 'fuji') || (mode === 'local' ? chainId !== 31337 : chainId !== 43113) || !rpc) throw new DomainError('INVALID_CONFIG', 'Configure a supported local or Fuji chain');
  const url = new URL(rpc);
  if (mode === 'local' ? !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) : url.protocol !== 'https:') throw new DomainError('INVALID_CONFIG', 'Unsafe RPC configuration');
  const coreAddress = normalizeAddress(process.env.NEXT_PUBLIC_COMMITPOT_ADDRESS);
  const token = normalizeAddress(process.env.NEXT_PUBLIC_USDC_ADDRESS);
  const chain = defineChain({ id: chainId, name: mode === 'local' ? 'CommitPot local test chain' : 'Avalanche Fuji', nativeCurrency: { name: 'AVAX', symbol: 'AVAX', decimals: 18 }, rpcUrls: { default: { http: [rpc] } } });
  const injected = (window as unknown as { ethereum?: BrowserProvider }).ethereum;
  // A disconnected read-only runtime needs no browser extension. Writes reject until connected.
  const unavailable: BrowserProvider = { request: async ({ method }) => { if (method === 'eth_accounts') return []; if (method === 'eth_chainId') return `0x${chainId.toString(16)}`; throw new DomainError('ACCOUNT_NOT_CONNECTED', 'Install or open an injected Ethereum wallet'); } };
  let disconnected = false;
  const provider = injected ?? unavailable;
  const gated: BrowserProvider = { request: async args => disconnected && args.method === 'eth_accounts' ? [] : provider.request(args) };
  const publicClient = createPublicClient({ chain, transport: http(rpc) });
  const walletClient = createWalletClient({ chain, transport: custom(gated) });
  const repository = new AvalanchePotRepository(publicClient, walletClient, { mode, chainId, coreAddress, token });
  await repository.validateDeployment();
  return {
    repository, wallet: repository,
    connect: async () => { if (!injected) throw new DomainError('ACCOUNT_NOT_CONNECTED'); await injected.request({ method: 'eth_requestAccounts' }); const walletChain = await walletClient.getChainId(); if (walletChain !== chainId) await injected.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: `0x${chainId.toString(16)}` }] }); disconnected = false; },
    disconnect: async () => { disconnected = true; },
  };
}
