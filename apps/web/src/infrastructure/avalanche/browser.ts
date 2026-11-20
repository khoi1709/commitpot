import { createPublicClient, createWalletClient, custom, defineChain, http } from 'viem';
type BrowserProvider = { request(args: { method: string; params?: unknown }): Promise<unknown> };
import { DomainError, normalizeAddress, toDomainError } from '../../domain';
import type { AppRuntime } from '../../application/runtime';
import type { PublicClient } from 'viem';
import { AvalanchePotRepository } from './repository';

function configuration() {
  const mode = process.env.NEXT_PUBLIC_CHAIN_MODE;
  const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID);
  const rpc = process.env.NEXT_PUBLIC_RPC_URL;
  if ((mode !== 'local' && mode !== 'fuji') || (mode === 'local' ? chainId !== 31337 : chainId !== 43113) || !rpc) throw new DomainError('INVALID_CONFIG', 'Configure a supported local or Fuji chain');
  const url = new URL(rpc);
  if (mode === 'local' ? !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) : url.protocol !== 'https:') throw new DomainError('INVALID_CONFIG', 'Unsafe RPC configuration');
  const coreAddress = normalizeAddress(process.env.NEXT_PUBLIC_COMMITPOT_ADDRESS);
  const token = normalizeAddress(process.env.NEXT_PUBLIC_USDC_ADDRESS);
  const chain = defineChain({ id: chainId, name: mode === 'local' ? 'CommitPot local test chain' : 'Avalanche Fuji', nativeCurrency: { name: 'AVAX', symbol: 'AVAX', decimals: 18 }, rpcUrls: { default: { http: [rpc] } } });
  return { mode, chainId, rpc, chain, coreAddress, token, context: { mode, chainId, coreAddress, token } as const };
}

/** Server-safe public reader. Does not inspect window or construct any wallet client. */
export async function createPublicBrowserReader(): Promise<{ repository: AvalanchePotRepository; publicClient: PublicClient }> {
  const config = configuration();
  const publicClient = createPublicClient({ chain: config.chain, transport: http(config.rpc) });
  const repository = new AvalanchePotRepository(publicClient, null, config.context);
  await repository.validateDeployment();
  return { repository, publicClient };
}

export async function createBrowserRuntime(): Promise<AppRuntime> {
  const { mode, chainId, rpc, chain, coreAddress, token, context } = configuration();
  const injected = (window as unknown as { ethereum?: BrowserProvider }).ethereum;
  // A disconnected read-only runtime needs no browser extension. Writes reject until connected.
  const unavailable: BrowserProvider = { request: async ({ method }) => { if (method === 'eth_accounts') return []; if (method === 'eth_chainId') return `0x${chainId.toString(16)}`; throw new DomainError('ACCOUNT_NOT_CONNECTED', 'Install or open an injected Ethereum wallet'); } };
  let disconnected = false;
  const provider = injected ?? unavailable;
  const gated: BrowserProvider = { request: async args => disconnected && args.method === 'eth_accounts' ? [] : provider.request(args) };
  const publicClient = createPublicClient({ chain, transport: http(rpc) });
  const walletClient = createWalletClient({ chain, transport: custom(gated) });
  const repository = new AvalanchePotRepository(publicClient, walletClient, context);
  await repository.validateDeployment();
  return {
    repository, wallet: repository,
    connect: async () => {
      try {
        if (!injected) throw new DomainError('ACCOUNT_NOT_CONNECTED');
        await injected.request({ method: 'eth_requestAccounts' });
        if (await walletClient.getChainId() !== chainId) await injected.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: `0x${chainId.toString(16)}` }] });
        // A resolved switch request is not evidence that the wallet actually switched.
        if (await walletClient.getChainId() !== chainId) throw new DomainError('WRONG_CHAIN');
        const addresses = await injected.request({ method: 'eth_accounts' });
        if (!Array.isArray(addresses) || !addresses.length) throw new DomainError('ACCOUNT_NOT_CONNECTED');
        normalizeAddress(addresses[0]); disconnected = false;
      } catch (error) { throw toDomainError(error, 'WALLET_UNAVAILABLE'); }
    },
    disconnect: async () => { disconnected = true; },
  };
}
