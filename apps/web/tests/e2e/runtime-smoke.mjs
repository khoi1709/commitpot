import assert from 'node:assert/strict';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const scratchRoot = resolve(repoRoot, 'scratch/2026-11/week-47/2026-11-21_smoke_current');
const args = parseArgs(process.argv.slice(2));
const baseUrl = requireLocalUrl(args.url ?? 'http://localhost:3100');
const outputDir = requireSafeOutput(args.output ?? resolve(scratchRoot, 'run/browser-output'));
const pageErrors = [];
const consoleErrors = [];
const httpErrors = [];
const blockedRequests = [];
const failedRequests = [];
const steps = [];
let browser;
let context;
let outputOwned = false;

try {
  await mkdir(outputDir, { recursive: true });
  if ((await readdir(outputDir)).length !== 0) throw new Error(`Refusing to overwrite non-empty output directory: ${relative(repoRoot, outputDir)}`);
  outputOwned = true;

  // Edge gets a new in-memory context: no signed-in profile, extension, or prior local storage.
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'en-GB' });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: baseUrl.origin });
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== baseUrl.origin) {
      blockedRequests.push(`${request.method()} ${request.url()}`);
      await route.abort('blockedbyclient');
    } else if (request.method() === 'GET' && url.pathname === '/favicon.ico') {
      await route.fulfill({ status: 204, contentType: 'image/x-icon', body: '' });
    } else {
      await route.continue();
    }
  });

  const page = await context.newPage();
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(`${message.text()} (${message.location().url})`); });
  page.on('requestfailed', request => failedRequests.push(`${request.method()} ${request.url()} (${request.failure()?.errorText ?? 'unknown failure'})`));
  page.on('response', response => {
    if (response.status() >= 400) {
      const url = new URL(response.url());
      if (response.status() === 404 && url.origin === baseUrl.origin && url.pathname === '/favicon.ico' && response.request().method() === 'GET') return;
      httpErrors.push(`${response.status()} ${response.url()}`);
    }
  });

  await page.goto(baseUrl.href, { waitUntil: 'networkidle', timeout: 120_000 });
  await page.getByText('Local demonstration', { exact: true }).waitFor({ state: 'visible' });
  await waitForNeutralAppState(page);
  assert.equal(await page.evaluate(() => Boolean(window.ethereum)), false, 'synthetic mock UI must not need an injected wallet');
  steps.push('Fresh wallet-free Edge context loads the visible Local demonstration app');

  const demoTools = page.locator('details.demo-tools');
  await setDetailsOpen(demoTools, true);
  await demoTools.getByRole('button', { name: 'Load a five-person example', exact: true }).click();
  await page.getByRole('heading', { name: 'Campus workshop attendance demo', exact: true }).waitFor();
  await waitUntilIdle(page);
  const potId = await selectedPotId(page);
  assert.match(potId ?? '', /^[1-9][0-9]*$/, 'normal example UI must select a positive pot ID');
  await page.locator('.event-title').filter({ hasText: `Pot #${potId}` }).waitFor();
  await page.locator('.phase-label').filter({ hasText: 'Registration open' }).waitFor();

  const walletSelect = page.locator('.personal-panel select');
  await walletSelect.waitFor({ state: 'visible' });
  const options = await walletSelect.locator('option').evaluateAll(items => items.map(option => ({ value: option.value, label: option.textContent?.trim() ?? '' })));
  const participants = options.filter(option => /^Participant \d+\s*·/.test(option.label) && /^0x[0-9a-fA-F]{40}$/.test(option.value));
  const verifier = options.find(option => /^Verifier\s*·/.test(option.label) && /^0x[0-9a-fA-F]{40}$/.test(option.value));
  assert.equal(participants.length, 5, `Expected five visible synthetic participant accounts; found ${participants.length}`);
  assert.ok(verifier, 'expected the initialized synthetic verifier option');
  steps.push(`Loaded the localized legacy example through UI as pot #${potId} with five synthetic participants and its visible verifier`);

  await page.getByRole('button', { name: 'VI', exact: true }).click();
  await page.getByRole('heading', { name: 'Minh họa điểm danh buổi học trong trường', exact: true }).waitFor();
  assert.equal(await page.locator('html').getAttribute('lang'), 'vi', 'Vietnamese language metadata must follow the visible translated event');
  assert.equal(await selectedPotId(page), potId, 'switching language must keep the same event selected');
  await page.setViewportSize({ width: 390, height: 844 });
  await assertNoHorizontalOverflow(page, 'localized example mobile VI');
  await page.screenshot({ path: resolve(outputDir, 'mobile-example-vi.png'), fullPage: true });
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await page.getByRole('heading', { name: 'Campus workshop attendance demo', exact: true }).waitFor();
  assert.equal(await page.locator('html').getAttribute('lang'), 'en', 'English language metadata must be restored');
  assert.equal(await selectedPotId(page), potId, 'returning to English must keep the same event selected');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: resolve(outputDir, 'desktop-example-en.png'), fullPage: true });
  steps.push('English ⇄ Vietnamese event title continuity keeps the same real demo pot ID; 390px Vietnamese layout has no horizontal overflow');

  const qrPayloads = [];
  for (const participant of participants.slice(0, 4)) {
    steps.push(`Selecting synthetic QR owner ${participant.label}`);
    await selectAccountAndRefresh(page, walletSelect, participant.value);
    await waitForSelectedAccount(page, walletSelect, participant.value, '90', 'Deposit received');
    const qrDetails = page.locator('.personal-panel details.qr-panel');
    await setDetailsOpen(qrDetails, true);
    await qrDetails.getByRole('button', { name: 'Copy QR contents', exact: true }).click();
    const payload = await page.evaluate(() => navigator.clipboard.readText());
    assert.ok(payload, `visible participant QR control must supply account ${participant.label}`);
    const parsed = JSON.parse(payload);
    assert.equal(parsed.v, 1, 'visible participant QR must use the supported schema');
    assert.equal(parsed.potId, potId, 'visible participant QR must identify the preserved selected pot');
    assert.equal(parsed.participant.toLowerCase(), participant.value.toLowerCase(), 'visible participant QR must identify the selected synthetic account');
    qrPayloads.push(payload);
  }
  await selectAccountAndRefresh(page, walletSelect, verifier.value, 'Not yet joined', '100', false);
  assert.equal(await walletSelect.inputValue(), verifier.value, 'visible verifier account must remain selected after refresh');
  await advanceMockPhase(page, 'Check-in open');
  await selectEventTab(page, 1);
  await page.locator('.candidate').waitFor({ state: 'detached' });
  await page.setViewportSize({ width: 390, height: 844 });
  await assertNoHorizontalOverflow(page, 'mobile verifier EN');
  await page.screenshot({ path: resolve(outputDir, 'mobile-verifier-checkin.png'), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });

  const qrInput = page.getByLabel('Participant QR contents', { exact: true });
  const presence = page.getByRole('checkbox', { name: 'I confirm this person is physically present', exact: true });
  const sign = page.getByRole('button', { name: 'Sign and record attendance', exact: true });
  for (const [index, participant] of participants.slice(0, 4).entries()) {
    const payload = JSON.parse(qrPayloads[index]);
    assert.equal(payload.participant.toLowerCase(), participant.value.toLowerCase());
    assert.equal(payload.potId, potId);
    await qrInput.fill(qrPayloads[index]);
    await page.getByRole('button', { name: 'Check participant', exact: true }).click();
    const candidate = page.locator('.candidate');
    await candidate.waitFor({ state: 'visible' });
    assert.equal((await candidate.locator('code').innerText()).toLowerCase(), participant.value.toLowerCase(), 'visible QR inspection must select the expected real attendee');
    assert.equal(await presence.isChecked(), false, 'each attendee requires an explicit manual presence confirmation');
    await presence.check();
    await perform(page, 'Sign and record attendance');
    await candidate.waitFor({ state: 'detached' });
    const count = page.locator('.deposit-line .count-pair span').nth(1).locator('strong');
    await page.waitForFunction(expected => document.querySelector('.deposit-line .count-pair span:nth-child(2) strong')?.textContent?.trim() === expected, String(index + 1));
    assert.equal((await count.innerText()).trim(), String(index + 1), `exact visible attendance count after synthetic participant ${index + 1}`);
  }
  steps.push('Four distinct synthetic participant QR check-ins used normal verifier UI and separate explicit presence confirmations; no product state was injected');

  await advanceMockPhase(page, 'Ready to finalize');
  await selectEventTab(page, 0);
  await perform(page, 'Finalize results');
  await page.locator('.phase-label').filter({ hasText: 'Results finalized' }).waitFor();
  steps.push('Demo phase control and visible finalization action reach Results finalized');

  await selectEventTab(page, 0);
  await selectAccountAndRefresh(page, walletSelect, participants[0].value, 'Attendance confirmed');
  const claim = page.getByRole('button', { name: 'Claim payout', exact: true });
  await claim.waitFor({ state: 'visible' });
  const entitlement = page.locator('.entitlement>strong');
  assert.equal((await entitlement.innerText()).replace(/\s+/g, ' ').trim(), '12.5 Test USDC', 'first eligible synthetic attendee must see the exact 12.5 Test USDC payout');
  await perform(page, 'Claim payout');
  await page.locator('.personal-state').getByText('Payout claimed', { exact: true }).waitFor();
  const claimEntry = page.locator('.activity li').filter({ hasText: 'Claim payout' }).first();
  await claimEntry.waitFor({ state: 'visible' });
  steps.push('Eligible synthetic participant claims the exact simulated 12.5 Test USDC through UI');

  await page.reload({ waitUntil: 'networkidle', timeout: 120_000 });
  await page.getByText('Local demonstration', { exact: true }).waitFor();
  await waitForHealthyPublicState(page);
  await page.waitForFunction(expected => new URL(location.href).searchParams.get('pot') === expected, potId);
  await page.locator('.event-title').filter({ hasText: `Pot #${potId}` }).waitFor();
  await page.locator('.phase-label').filter({ hasText: 'Results finalized' }).waitFor();
  const reloadedWallet = page.locator('.personal-panel select');
  await reloadedWallet.waitFor({ state: 'visible' });
  await page.locator('.personal-state').getByText('Payout claimed', { exact: true }).waitFor();
  await selectAccountAndRefresh(page, reloadedWallet, participants[0].value, 'Payout claimed', '102.5', false);
  const receipts = page.locator('.activity li').filter({ hasText: 'Claim payout' });
  assert.equal(await receipts.count(), 1, 'reload must retain exactly one actual confirmed payout receipt for this synthetic account');
  const receiptDetails = receipts.first().locator('details.activity-details');
  await receiptDetails.waitFor();
  await setDetailsOpen(receiptDetails, true);
  const receipt = await receiptDetails.locator('pre').textContent();
  assert.ok(receipt, 'reloaded UI must expose the actual confirmed claim receipt details');
  assert.match(receipt, /^Operation: claim$/m, 'receipt must show the confirmed claim operation');
  assert.match(receipt, new RegExp(`^Pot ID: ${potId}$`, 'm'), 'receipt must show the same selected pot ID');
  assert.match(receipt, new RegExp(`^Beneficiary: ${participants[0].value}$`, 'm'), 'receipt must show the actual selected beneficiary');
  assert.match(receipt, /^Deposit per person: 12500000$/m, 'receipt must record the exact 12.5 Test USDC base-unit payout');
  assert.match(receipt, /^Copy full transaction hash: 0x[0-9a-fA-F]{64}$/m, 'receipt must show its actual full transaction hash');
  assert.match(receipt, /^Block: [1-9][0-9]*$/m, 'receipt must include an actual confirmed block number');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: resolve(outputDir, 'desktop-reloaded-settled.png'), fullPage: true });
  steps.push('Reload restores selected synthetic account, finalized pot, claimed status and actual persisted receipt with beneficiary, amount, pot, block and full transaction hash');

  if (blockedRequests.length) throw new Error(`Unexpected off-origin requests were blocked: ${blockedRequests.join('; ')}`);
  if (pageErrors.length) throw new Error(`Browser page errors: ${pageErrors.join('; ')}`);
  if (consoleErrors.length) throw new Error(`Browser console errors: ${consoleErrors.join('; ')}`);
  if (httpErrors.length) throw new Error(`Browser HTTP errors: ${httpErrors.join('; ')}`);
  if (failedRequests.length) throw new Error(`Browser request failures: ${failedRequests.join('; ')}`);
  await writeReport('passed', { steps, pageErrors, consoleErrors, httpErrors, blockedRequests, failedRequests, nativeBrowser: 'Microsoft Edge', isolatedFreshContext: true, loopbackOnly: true, mockOnly: true, injectedWallet: false, productStateInjection: false, potId, selectedBeneficiary: participants[0].value, payoutTestUsdc: '12.5', actualReceiptChecked: true });
  console.log(JSON.stringify({ status: 'passed', steps, output: relative(repoRoot, outputDir) }));
} catch (cause) {
  const error = cause instanceof Error ? cause : new Error(String(cause));
  if (pageErrors.length) error.message += `\nBrowser page errors: ${pageErrors.join('; ')}`;
  if (consoleErrors.length) error.message += `\nBrowser console errors: ${consoleErrors.join('; ')}`;
  if (httpErrors.length) error.message += `\nBrowser HTTP errors: ${httpErrors.join('; ')}`;
  if (blockedRequests.length) error.message += `\nBlocked off-origin requests: ${blockedRequests.join('; ')}`;
  if (failedRequests.length) error.message += `\nBrowser request failures: ${failedRequests.join('; ')}`;
  if (context && outputOwned && context.pages()[0]) await context.pages()[0].screenshot({ path: resolve(outputDir, 'failure.png'), fullPage: true }).catch(() => {});
  if (outputOwned) await writeReport('failed', { steps, pageErrors, consoleErrors, httpErrors, blockedRequests, failedRequests, error: String(error), loopbackOnly: true, isolatedFreshContext: true, mockOnly: true, productStateInjection: false }).catch(() => {});
  else console.error(JSON.stringify({ status: 'failed', error: String(error), report: 'not written because output directory was not safely acquired' }));
  throw error;
} finally {
  await browser?.close();
}

async function waitForNeutralAppState(page) {
  await page.waitForFunction(() => !document.querySelector('[role="status"].read-status')
    && !!document.querySelector('.wallet-button')
    && !document.querySelector('.wallet-button')?.disabled
    && !document.querySelector('.notice.error[role="alert"]'), null, { timeout: 30_000 });
}

async function waitForHealthyPublicState(page) {
  await page.waitForFunction(() => {
    const status = document.querySelector('[role="status"].read-status');
    const wallet = document.querySelector('.wallet-button');
    const selectedPot = new URL(location.href).searchParams.has('pot');
    const phase = document.querySelector('.phase-label');
    const stalePublicRead = document.querySelector('.notice.error[role="alert"]');
    return !status && wallet && !wallet.disabled && !stalePublicRead
      && (!selectedPot || phase && !!phase.textContent?.trim() && !/^Checking/.test(phase.textContent));
  }, null, { timeout: 30_000 });
}

async function waitForSelectedAccount(page, select, account, balance, statusText, claimable = statusText === 'Attendance confirmed') {
  await page.waitForFunction(expected => {
    const selected = document.querySelector('.personal-panel select');
    const currentBalance = document.querySelector('.wallet-summary dd')?.textContent ?? '';
    const state = document.querySelector('.personal-state')?.textContent ?? '';
    const status = document.querySelector('[role="status"].read-status');
    const pending = document.querySelector('.notice.pending');
    const walletBusy = document.querySelector('.wallet-button')?.disabled;
    const error = document.querySelector('.notice.error[role="alert"]');
    const claim = document.querySelector('.personal-panel .entitlement button');
    const claimable = expected.claimable ? !!claim && !claim.disabled : !claim;
    return selected?.value === expected.account && currentBalance.trim() === `${expected.balance} Test USDC`
      && state.includes(expected.status) && claimable && !status && !pending && !walletBusy && !error;
  }, { account, balance, status: statusText, claimable }, { timeout: 30_000 });
  assert.equal(await select.inputValue(), account, 'expected synthetic account must remain selected');
}

async function waitUntilIdle(page) {
  await page.waitForFunction(() => !document.querySelector('.notice.pending')
    && Array.from(document.querySelectorAll('.wallet-button')).every(button => !button.disabled), null, { timeout: 30_000 });
  await waitForHealthyPublicState(page);
  const alert = page.locator('.notice.error[role="alert"]');
  if (await alert.count()) throw new Error(`Mock UI action failed: ${await alert.innerText()}`);
}

async function perform(page, label) {
  const button = page.getByRole('button', { name: label, exact: true });
  await button.waitFor({ state: 'visible' });
  await button.click();
  await waitUntilIdle(page);
}

async function selectAccountAndRefresh(page, walletSelect, account, expectedStatus = 'Deposit received', expectedBalance = '90', claimable = expectedStatus === 'Attendance confirmed') {
  await walletSelect.selectOption(account);
  await page.getByRole('button', { name: 'Refresh state', exact: true }).click();
  await waitUntilIdle(page);
  await waitForSelectedAccount(page, walletSelect, account, expectedBalance, expectedStatus, claimable);
}

async function advanceMockPhase(page, expected) {
  const tools = page.locator('details.demo-tools');
  await setDetailsOpen(tools, true);
  const advance = tools.getByRole('button', { name: 'Move to next phase', exact: true });
  await advance.waitFor({ state: 'visible' });
  await advance.click();
  await page.locator('.phase-label').filter({ hasText: expected }).waitFor({ timeout: 15_000 });
  await waitUntilIdle(page);
}

async function setDetailsOpen(details, open) {
  await details.waitFor({ state: 'visible' });
  if (await details.evaluate(element => element.open) !== open) await details.locator('summary').click();
  assert.equal(await details.evaluate(element => element.open), open, `details state must be ${open ? 'open' : 'closed'}`);
}

async function selectEventTab(page, index) {
  const tab = page.getByRole('button', { name: index === 0 ? 'Commitment' : 'Check-in desk', exact: true });
  if (await tab.getAttribute('aria-current') !== 'page') await tab.click();
  await tab.waitFor({ state: 'visible' });
}

async function selectedPotId(page) {
  return page.evaluate(() => new URL(location.href).searchParams.get('pot'));
}

async function assertNoHorizontalOverflow(page, label) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 1, `${label} must not horizontally overflow (overflow ${overflow}px)`);
}

function parseArgs(values) {
  const parsed = {};
  for (let i = 0; i < values.length; i++) {
    const flag = values[i];
    if (!['--url', '--output'].includes(flag) || !values[i + 1] || values[i + 1].startsWith('--')) throw new Error('Usage: node apps/web/tests/e2e/runtime-smoke.mjs [--url <loopback-url>] [--output <empty-directory-under-owned-scratch>]');
    const key = flag === '--url' ? 'url' : 'output';
    if (parsed[key]) throw new Error(`Duplicate argument ${flag}`);
    parsed[key] = values[++i];
  }
  return parsed;
}

function requireLocalUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Only an explicit loopback HTTP origin (or the historical no-argument localhost:3100 default) is permitted.');
  }
  return url;
}

function requireSafeOutput(value) {
  const output = resolve(repoRoot, value);
  const rel = relative(scratchRoot, output);
  if (rel === '..' || rel.startsWith(`..${sep}`) || rel.startsWith(sep)) throw new Error('Output must stay inside scratch/2026-11/week-47/2026-11-21_smoke_current.');
  return output;
}

async function writeReport(status, report) {
  if (!outputOwned) return;
  await writeFile(resolve(outputDir, 'report.json'), JSON.stringify({ status, ...report }, null, 2));
}
