import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createPublicClient, createWalletClient, http } from 'viem';
import { foundry } from 'viem/chains';
const rpc = 'http://127.0.0.1:8545';
const client = createPublicClient({ chain: foundry, transport: http(rpc), pollingInterval: 100 });
if (await client.getChainId() !== 31337) throw new Error('Refusing nonlocal chain');
const wallet = createWalletClient({ chain: foundry, transport: http(rpc) });
const accounts = await wallet.getAddresses();
async function artifact(name) { return JSON.parse(await readFile(resolve(process.cwd(), `../../packages/contracts/out/${name}.sol/${name}.json`), 'utf8')); }
async function deploy(name, args = []) {
  const art = await artifact(name);
  const hash = await wallet.deployContract({ account: accounts[0], chain: foundry, abi: art.abi, bytecode: art.bytecode.object, args });
  const receipt = await client.waitForTransactionReceipt({ hash, pollingInterval: 100 });
  if (receipt.status !== 'success' || !receipt.contractAddress) throw new Error('Deployment failed');
  return receipt.contractAddress;
}
const token = await deploy('LocalTestUSDC');
const helper = await deploy('EIP712AttendanceVerifier');
const strategy = await deploy('EqualSplitStrategy');
const core = await deploy('CommitPot', [token, helper, strategy]);
const art = await artifact('LocalTestUSDC');
for (const account of accounts.slice(0, 5)) {
  const hash = await wallet.writeContract({ account: accounts[0], chain: foundry, address: token, abi: art.abi, functionName: 'mint', args: [account, 100_000_000n] });
  if ((await client.waitForTransactionReceipt({ hash, pollingInterval: 100 })).status !== 'success') throw new Error('Funding failed');
}
const output = resolve(process.cwd(), '../../output/verification/local-browser');
await mkdir(output, { recursive: true });
await writeFile(resolve(output, 'deployment.json'), JSON.stringify({ chainId: 31337, rpc, token, core, helper, strategy, accounts: accounts.slice(0, 6), localFixtureOnly: true }, null, 2));
console.log(JSON.stringify({ output, core, token }));
