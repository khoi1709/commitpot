/** Documentary snapshot, not an RPC response or a receipt manifest. */
export const historicalAnvil = {
  kind: 'historical-report',
  sourceCommit: 'fea386bdde0bf6051af1116790f0762609dcf891',
  sourceLabel: 'FEA386',
  chainId: 31337,
  network: 'Anvil',
  potId: '3',
  contracts: {
    core: '0xcd8a1c3ba11cf5ecfa6267617243239504a98d90',
    token: '0x1291be112d480055dafd8a610b7d1e203891c274',
    helper: '0x5f3f1dbd7b74c6b46e8c44f98792a1daf8d69154',
    strategy: '0xb7278a61aa25c888815afc32ad3cc52ff24fe575',
  },
  depositCount: 5,
  deposit: '10',
  attendanceCount: 4,
  payoutCount: 4,
  payout: '12.5',
  residual: '0',
  actualChainTransactions: true,
  syntheticWalletProvider: true,
  // The saved report does not retain full hashes or block identities. Never invent them.
  receipts: [],
  sources: [
    { path: 'output/verification/local-browser/browser-report.json', sha256: '3d25e519b74f7c1e934a4cdbe687b1aa8b3fb7061d2b26b6d4501bf3dbb1f360' },
    { path: 'output/verification/local-browser/deployment.json', sha256: '2f4d552ddf7ec78a276a75f14297a4fbf0b53d575c7abc02ee036bd8c59db0b8' },
    { path: 'output/verification/CLOSING_SOURCE_MANIFEST.json', sha256: '64545d6635f6546d7f9f139e912dfb64b0c406b4c5732dd8fe1f43489fe2da71' },
  ],
} as const;

export function historicalSourceUrl(path: string): string {
  return `https://github.com/khoi1709/commitpot/blob/${historicalAnvil.sourceCommit}/${path}`;
}
