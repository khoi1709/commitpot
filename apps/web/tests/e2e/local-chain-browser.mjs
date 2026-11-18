import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createPublicClient, http, erc20Abi } from 'viem';
import { foundry } from 'viem/chains';
const output = resolve(process.cwd(), '../../output/verification/local-browser');
const manifest = JSON.parse(await readFile(resolve(output, 'deployment.json'), 'utf8'));
if (manifest.chainId !== 31337 || manifest.rpc !== 'http://127.0.0.1:8545') throw new Error('Local fixture refused');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
let account = manifest.accounts[0];
const requests = [];
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(error.message));
// A synthetic test wallet forwards only to the owned isolated node. No secrets enter the browser or public app.
await page.exposeBinding('__localWalletRpc', async (_source, args) => {
  const method = args.method;
  requests.push(method);
  if (method === 'eth_accounts' || method === 'eth_requestAccounts') return [account];
  if (method === 'eth_chainId') return '0x7a69';
  if (method === 'wallet_switchEthereumChain') return null;
  if (!['eth_sendTransaction', 'eth_signTypedData_v4', 'eth_estimateGas', 'eth_gasPrice', 'eth_getTransactionCount', 'eth_getBlockByNumber', 'eth_maxPriorityFeePerGas', 'eth_call', 'eth_getBalance'].includes(method)) throw new Error('Unsupported fixture wallet method ' + method);
  const response = await fetch(manifest.rpc, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: requests.length, method, params: args.params ?? [] }) });
  const result = await response.json();
  if (result.error) throw new Error(JSON.stringify(result.error));
  return result.result;
});
await page.addInitScript(() => { window.ethereum = { request: args => window.__localWalletRpc(args) }; });
const client = createPublicClient({ chain: foundry, transport: http(manifest.rpc) });
const steps = [];
const toInput = stamp => { const date = new Date(stamp * 1000); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
const clickAction = async name => {
  await page.getByRole('button', { name, exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('.notice.pending') && Array.from(document.querySelectorAll('.wallet-button')).every(button => !button.disabled), { timeout: 30000 });
  const alert = page.locator('.notice.error');
  if (await alert.count()) throw new Error('UI action failed: ' + await alert.innerText());
};
try {
  await page.goto('http://127.0.0.1:3101', { waitUntil: 'networkidle', timeout: 120000 });
  await page.getByRole('button', { name: 'Create a pot', exact: true }).first().waitFor();
  const listed = await client.readContract({ address: manifest.core, abi: (JSON.parse(await readFile(resolve(process.cwd(), '../../packages/contracts/out/CommitPot.sol/CommitPot.json'), 'utf8'))).abi, functionName: 'nextPotId' });
  const potId = listed.toString();
  // Each recheck creates a new pot with new confirmed transactions, never replays an uncertain write.
  const beforePool = await client.readContract({ address: manifest.token, abi: erc20Abi, functionName: 'balanceOf', args: [manifest.core] });
  const startingBalances = new Map();
  for (const wallet of manifest.accounts.slice(0, 5)) startingBalances.set(wallet, await client.readContract({ address: manifest.token, abi: erc20Abi, functionName: 'balanceOf', args: [wallet] }));
  if (await page.locator('.demo-banner').count()) throw new Error('Real chain app fell back to mock');
  const now = Number((await client.getBlock()).timestamp);
  const open = Math.ceil((now + 600) / 60) * 60;
  const close = open + 600;
  await page.getByRole('button', { name: 'Create a pot', exact: true }).first().click();
  await page.getByLabel('Deposit per person', { exact: true }).fill('10');
  await page.getByLabel('Verifier address', { exact: true }).fill(manifest.accounts[5]);
  await page.getByLabel('Registration closes', { exact: true }).fill(toInput(open));
  await page.getByLabel('Check-in opens', { exact: true }).fill(toInput(open));
  await page.getByLabel('Check-in closes', { exact: true }).fill(toInput(close));
  await page.getByRole('button', { name: 'Review commitment', exact: true }).click();
  await clickAction('Confirm and create');
  await page.getByRole('heading', { name: 'Commitment pot #' + potId }).waitFor();
  steps.push('Create through actual browser wallet transaction and decoded event');
  for (const wallet of manifest.accounts.slice(0, 5)) {
    account = wallet;
    await page.getByRole('button', { name: 'Refresh state', exact: true }).click();
    await page.locator('.personal-address').filter({ hasText: wallet.toLowerCase() }).waitFor();
    await clickAction('Approve deposit');
    await page.getByRole('button', { name: 'Join and deposit', exact: true }).waitFor();
    await clickAction('Join and deposit');
    await page.locator('.personal-state').filter({ hasText: 'Deposit received' }).waitFor();
  }
  expectValue(await client.readContract({ address: manifest.token, abi: erc20Abi, functionName: 'balanceOf', args: [manifest.core] }), beforePool + 50_000_000n, 'pool');
  steps.push('Five distinct wallets approve and deposit 10 through normal UI');
  await client.request({ method: 'evm_setNextBlockTimestamp', params: [open] });
  await client.request({ method: 'evm_mine' });
  account = manifest.accounts[5];
  await page.getByRole('button', { name: 'Refresh state', exact: true }).click();
  await page.locator('.personal-address').filter({ hasText: account.toLowerCase() }).waitFor();
  await page.getByRole('button', { name: 'Check-in desk', exact: true }).click();
  for (const participant of manifest.accounts.slice(0, 4)) {
    await page.getByLabel('Participant QR contents', { exact: true }).fill(JSON.stringify({ v: 1, potId, participant }));
    await page.getByRole('button', { name: 'Check participant', exact: true }).click();
    await page.getByRole('checkbox', { name: 'I confirm this person is physically present' }).check();
    await clickAction('Sign and record attendance');
    await page.locator('.candidate').waitFor({ state: 'detached' });
  }
  steps.push('Four actual EIP712 wallet signatures and check-in transactions');
  await page.screenshot({ path: resolve(output, 'desktop-checkins.png'), fullPage: true });
  await client.request({ method: 'evm_setNextBlockTimestamp', params: [close + 1] });
  await client.request({ method: 'evm_mine' });
  await page.getByRole('button', { name: 'Commitment', exact: true }).click();
  await page.getByRole('button', { name: 'Refresh state', exact: true }).click();
  await page.getByRole('button', { name: 'Finalize results', exact: true }).waitFor();
  await clickAction('Finalize results');
  for (const wallet of manifest.accounts.slice(0, 4)) {
    account = wallet;
    await page.getByRole('button', { name: 'Refresh state', exact: true }).click();
    await page.locator('.personal-address').filter({ hasText: wallet.toLowerCase() }).waitFor();
    await page.getByRole('button', { name: 'Claim payout', exact: true }).waitFor();
    const entitlement = await page.locator('.entitlement>strong').innerText();
    if (!entitlement.includes('12.5')) throw new Error('Wrong entitlement ' + entitlement);
    await clickAction('Claim payout');
    expectValue(await client.readContract({ address: manifest.token, abi: erc20Abi, functionName: 'balanceOf', args: [wallet] }), startingBalances.get(wallet) + 2_500_000n, 'beneficiary balance');
  }
  expectValue(await client.readContract({ address: manifest.token, abi: erc20Abi, functionName: 'balanceOf', args: [manifest.core] }), beforePool, 'residual');
  steps.push('Finalize and all four 12.5 claims through UI, chain balances reconciled to zero');
  account = manifest.accounts[4];
  await page.getByRole('button', { name: 'Refresh state', exact: true }).click();
  await page.locator('.personal-address').filter({ hasText: account.toLowerCase() }).waitFor();
  await page.getByText('This wallet did not record a valid check-in and is not eligible for a payout.', { exact: true }).waitFor();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: resolve(output, 'desktop-settled.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 640 });
  await page.getByRole('button', { name: 'VI', exact: true }).click();
  await page.screenshot({ path: resolve(output, 'mobile-settled-vi.png'), fullPage: true });
  if (pageErrors.length) throw new Error(pageErrors.join('; '));
  await writeFile(resolve(output, 'browser-report.json'), JSON.stringify({ status: 'passed', steps, pageErrors, walletRequests: requests, localOnly: true, syntheticWalletProvider: true, actualChainTransactions: true, noProductStateInjection: true, potId, core: manifest.core, token: manifest.token }, null, 2));
  console.log(JSON.stringify({ status: 'passed', steps, output }));
} catch (error) {
  await page.screenshot({ path: resolve(output, 'failure.png'), fullPage: true }).catch(() => {});
  await writeFile(resolve(output, 'browser-report.json'), JSON.stringify({ status: 'failed', steps, pageErrors, error: String(error), walletRequests: requests }, null, 2));
  throw error;
} finally { await browser.close(); }
function expectValue(actual, expected, name) { if (actual !== expected) throw new Error(`${name}: ${actual} != ${expected}`); }
