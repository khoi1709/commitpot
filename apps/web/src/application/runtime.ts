import type { Address, IPotRepository, IWalletPort } from '../domain';
import { createMockPotEnvironment, type MockClock } from '../infrastructure/mock';

export interface AppRuntime {
  repository: IPotRepository;
  wallet: IWalletPort;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  mock?: { accounts: Address[]; verifier: Address; clock: MockClock; setAccount(address: Address | null): void; reset(): void };
}

export function createDemoRuntime(): AppRuntime {
  const env = createMockPotEnvironment({ storage: window.localStorage, latencyMs: 120 });
  return {
    repository: env.repository, wallet: env.wallet,
    connect: async () => env.repository.setAccount(env.accounts[0]),
    disconnect: async () => env.repository.setAccount(null),
    mock: { accounts: env.accounts, verifier: env.verifier, clock: env.clock, setAccount: address => env.repository.setAccount(address), reset: () => env.repository.reset() },
  };
}
