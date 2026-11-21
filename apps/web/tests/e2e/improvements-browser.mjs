import assert from 'node:assert/strict';
import { readdir, mkdir, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const args = parseArgs(process.argv.slice(2));
const baseUrl = requireLocalUrl(args.url);
const outputDir = requireSafeOutput(args.output);
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

  // Launch a new isolated Microsoft Edge context. No persistent profile, user account, or extension is loaded.
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'en-GB' });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: baseUrl.origin });
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== baseUrl.origin) {
      blockedRequests.push(request.url());
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
  page.on('requestfailed', request => failedRequests.push(`${request.url()} (${request.failure()?.errorText ?? 'unknown failure'})`));
  page.on('response', response => {
    if (response.status() >= 400) {
      const url = new URL(response.url());
      if (response.status() === 404 && url.origin === baseUrl.origin && url.pathname === '/favicon.ico' && response.request().method() === 'GET') return;
      httpErrors.push(`${response.status()} ${response.url()}`);
    }
  });

  await verifyNeutralReadOnlyRoutes(page, baseUrl);
  await page.goto(baseUrl.href, { waitUntil: 'networkidle', timeout: 120_000 });
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await page.getByText('Local demonstration', { exact: true }).waitFor();
  await waitForNeutralAppState(page);
  assert.equal(await page.evaluate(() => Boolean(window.ethereum)), false, 'mock lifecycle must not need an injected wallet');
  steps.push('Fresh, wallet-free Edge context opens the explicitly labelled mock app');

  await page.getByRole('button', { name: 'Create a pot', exact: true }).first().click();
  await page.getByLabel('Deposit per person', { exact: true }).fill('10');
  const verifierField = page.getByLabel('Verifier address', { exact: true });
  await verifierField.waitFor();
  const verifierAddress = await verifierField.inputValue();
  assert.match(verifierAddress, /^0x[0-9a-fA-F]{40}$/, 'mock verifier must be initialized as a valid synthetic address');
  const schedule = makeSchedule();
  await page.getByLabel('Registration closes', { exact: true }).fill(schedule.registration);
  await page.getByLabel('Check-in opens', { exact: true }).fill(schedule.open);
  await page.getByLabel('Check-in closes', { exact: true }).fill(schedule.close);
  await page.getByRole('button', { name: 'Review commitment', exact: true }).click();
  await page.getByRole('heading', { name: 'Fixed rules', exact: true }).waitFor();
  await perform(page, 'Confirm and create');
  await page.waitForFunction(() => new URL(location.href).searchParams.has('pot'));
  const potId = await page.evaluate(() => new URL(location.href).searchParams.get('pot'));
  assert.match(potId, /^[1-9][0-9]*$/, 'the selected pot ID must be a valid user-visible route value');

  // Discover the real synthetic accounts and labels from the post-create UI; never use undefined constants.
  const walletSelect = page.locator('.personal-panel select');
  await walletSelect.waitFor({ state: 'visible' });
  const walletOptions = await walletSelect.locator('option').evaluateAll(options => options.map(option => ({ value: option.value, label: option.textContent?.trim() ?? '' })));
  const participants = walletOptions.filter(option => /^Participant \d+\s*·/.test(option.label) && /^0x[0-9a-fA-F]{40}$/.test(option.value));
  const verifierOption = walletOptions.find(option => /^Verifier\s*·/.test(option.label) && /^0x[0-9a-fA-F]{40}$/.test(option.value));
  assert.equal(participants.length, 5, `Expected five visible synthetic participant wallets; found ${participants.length}`);
  assert.ok(verifierOption, 'Expected the visible synthetic verifier wallet option');
  assert.equal(verifierOption.value.toLowerCase(), verifierAddress.toLowerCase(), 'visible verifier wallet must match the creation form');
  steps.push(`Pot #${potId} created through the normal review and confirmation controls`);

  for (const [index, participant] of participants.entries()) {
    await selectAccountAndRefresh(page, walletSelect, participant.value);
    await page.getByRole('button', { name: 'Approve token spending', exact: true }).waitFor();
    await perform(page, 'Approve token spending');
    await page.getByRole('button', { name: 'Join and deposit', exact: true }).waitFor();
    await perform(page, 'Join and deposit');
    await page.getByText('Deposit received', { exact: true }).waitFor();
    if (index === 4) steps.push('Five distinct demo wallets separately approve and deposit 10 Test USDC');
  }

  const qrPayloads = [];
  for (const participant of participants.slice(0, 4)) qrPayloads.push(await copyParticipantQr(page, walletSelect, participant.value));
  await walletSelect.selectOption(verifierOption.value);
  await refresh(page);

  // The phase-advance control is a visible mock-demo action, not injected application state or a clock rewrite.
  await advanceMockPhase(page, 'Check-in open');
  await selectEventTab(page, 1);
  const qrInput = page.getByLabel('Participant QR contents', { exact: true });
  const candidate = page.locator('.candidate');
  const presence = page.getByRole('checkbox', { name: 'I confirm this person is physically present', exact: true });
  const sign = page.getByRole('button', { name: 'Sign and record attendance', exact: true });

  for (const [index, participant] of participants.slice(0, 4).entries()) {
    const payload = qrPayloads[index];
    const parsed = JSON.parse(payload);
    assert.equal(parsed.potId, potId);
    assert.equal(parsed.participant.toLowerCase(), participant.value.toLowerCase());

    await qrInput.fill(payload);
    await page.getByRole('button', { name: 'Check participant', exact: true }).click();
    await candidate.waitFor();
    assert.equal(await presence.isChecked(), false);

    if (index === 3) {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.screenshot({ path: resolve(outputDir, 'desk-pre-last-checkin-desktop-en.png'), fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      await assertNoHorizontalOverflow(page, 'pre-last-checkin mobile EN');
      await page.screenshot({ path: resolve(outputDir, 'desk-pre-last-checkin-mobile-en-390.png'), fullPage: true });
      await page.getByRole('button', { name: 'VI', exact: true }).click();
      await page.screenshot({ path: resolve(outputDir, 'desk-pre-last-checkin-mobile-vi-390.png'), fullPage: true });
      await page.getByRole('button', { name: 'EN', exact: true }).click();
      await page.setViewportSize({ width: 1440, height: 1000 });
    }

    if (index === 0) {
      await presence.check();
      await page.waitForTimeout(5_500);
      await waitForHealthyPublicState(page);
      await candidate.waitFor({ state: 'visible' });
      assert.equal(await presence.isChecked(), true, 'a healthy public poll must preserve the reviewed candidate and presence attestation');
      assert.equal(await sign.isEnabled(), true, 'healthy polling must preserve the eligible signing control');
      steps.push('Healthy public poll preserves candidate review and human-presence attestation');
      await qrInput.fill('not a valid participant QR');
      await candidate.waitFor({ state: 'detached' });
      assert.equal(await presence.count(), 0, 'changing QR input must clear presence confirmation with the candidate');
      assert.equal(await sign.count(), 0, 'changing QR input must remove the attendance action');

      // An account change must also invalidate the previously reviewed participant.
      await qrInput.fill(payload);
      await page.getByRole('button', { name: 'Check participant', exact: true }).click();
      await candidate.waitFor();
      await presence.check();
      await selectEventTab(page, 0);
      await walletSelect.waitFor({ state: 'visible' });
      await walletSelect.selectOption(participant.value);
      await refresh(page);
      await selectEventTab(page, 1);
      await candidate.waitFor({ state: 'detached' });
      assert.equal(await presence.count(), 0, 'switching the selected wallet must clear candidate and presence state');
      assert.equal(await sign.count(), 0, 'stale candidate must not retain an attendance action');
      await selectEventTab(page, 0);
      await walletSelect.selectOption(verifierOption.value);
      await refresh(page);
      await selectEventTab(page, 1);
      await qrInput.fill(payload);
      await page.getByRole('button', { name: 'Check participant', exact: true }).click();
      await candidate.waitFor();
    }

    await presence.check();
    await perform(page, 'Sign and record attendance');
    await candidate.waitFor({ state: 'detached' });
  }
  steps.push('Four normal check-ins; edited QR and selected-wallet changes invalidate prior presence/candidate state');

  await advanceMockPhase(page, 'Ready to finalize');
  // Finalize appears on the Commitment tab, not the Check-in desk.
  await page.getByRole('button', { name: 'Commitment', exact: true }).click();
  await page.getByRole('button', { name: 'Finalize results', exact: true }).waitFor();
  await perform(page, 'Finalize results');
  await page.locator('.phase-label').filter({ hasText: 'Results finalized' }).waitFor();
  steps.push('Finalize through the normal action control');

  for (const participant of participants.slice(0, 4)) {
    await selectAccountAndRefresh(page, walletSelect, participant.value);
    const claim = page.getByRole('button', { name: 'Claim payout', exact: true });
    try {
      await claim.waitFor({ timeout: 10_000 });
    } catch {
      throw new Error(`Claim UI dependency missing for eligible checked-in wallet ${participant.label}`);
    }
    const entitlement = page.locator('.entitlement>strong');
    assert.equal((await entitlement.innerText()).replace(/\s+/g, ' ').trim(), '12.5 Test USDC', 'each eligible checked-in participant must see the exact 12.5 Test USDC entitlement');
    const entry = page.locator('.activity li').filter({ hasText: 'Claim payout' }).first();
    await perform(page, 'Claim payout');
    await claim.waitFor({ state: 'detached' });
    await page.locator('.personal-state').getByText('Payout claimed', { exact: true }).waitFor();
    await entry.waitFor();
  }
  await selectAccountAndRefresh(page, walletSelect, participants[4].value);
  assert.match(await page.locator('.personal-panel').innerText(), /This wallet did not record a valid check-in and is not eligible for a payout\./, 'no-show must be explicitly ineligible after settlement');
  assert.equal(await page.getByRole('button', { name: 'Claim payout', exact: true }).count(), 0, 'no-show must not receive a claim button');
  await page.getByRole('button', { name: 'VI', exact: true }).click();
  assert.match(await page.locator('.personal-panel').innerText(), /Ví này chưa có điểm danh hợp lệ và không đủ điều kiện nhận tiền\./, 'Vietnamese no-show copy must remain truthful');
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  steps.push('Four eligible participants claim exactly 12.5 each; fifth joined no-show is visibly ineligible');

  await page.reload({ waitUntil: 'networkidle' });
  await page.getByText('Local demonstration', { exact: true }).waitFor();
  await waitForHealthyPublicState(page);
  await walletSelect.waitFor({ state: 'visible' });
  await selectAccountAndRefresh(page, walletSelect, participants[0].value);
  await page.getByText(`Pot #${potId}`, { exact: true }).waitFor();
  await page.locator('.phase-label').filter({ hasText: 'Results finalized' }).waitFor();
  assert.match(await page.locator('.deposit-line').innerText(), /10\s*Test USDC/, 'reload must retain the visible Test USDC commitment');
  const counts = page.locator('.deposit-line .count-pair');
  assert.equal((await counts.locator('span').nth(0).locator('strong').innerText()).trim(), '5', 'visible participant count must survive reload');
  assert.equal((await counts.locator('span').nth(1).locator('strong').innerText()).trim(), '4', 'visible check-in count must survive reload');
  const claimedActivity = page.locator('.activity li').filter({ hasText: 'Claim payout' });
  assert.equal(await claimedActivity.count(), 4, 'reload must retain four confirmed payout receipts');
  for (const participant of participants.slice(0, 4)) {
    await selectAccountAndRefresh(page, walletSelect, participant.value);
    const claimedStatus = page.locator('.personal-state').filter({ hasText: 'Payout claimed' });
    await claimedStatus.waitFor();
  }
  steps.push('Reload retains pot identity, finalized financial phase, 5 deposits, 4 check-ins, four claim receipts and each claimed participant status');

  // Verify the selected event remains readable after disconnecting the demo wallet.
  await walletSelect.selectOption('');
  await refresh(page);
  await page.getByText(`Pot #${potId}`, { exact: true }).waitFor();
  await page.locator('.phase-label').filter({ hasText: 'Results finalized' }).waitFor();
  await page.locator('.event-workspace').waitFor({ state: 'visible' });
  await waitForHealthyPublicState(page);
  steps.push('Selected pot remains visible after wallet disconnect');

  const settledUrl = page.url();
  await page.setViewportSize({ width: 390, height: 844 });
  await assertNoHorizontalOverflow(page, 'settled mobile EN');
  await page.screenshot({ path: resolve(outputDir, 'settled-mobile-en-390.png'), fullPage: true });
  await page.getByRole('button', { name: 'VI', exact: true }).click();
  await assertNoHorizontalOverflow(page, 'settled mobile VI');
  await page.screenshot({ path: resolve(outputDir, 'settled-mobile-vi-390.png'), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await page.screenshot({ path: resolve(outputDir, 'settled-desktop-en-1440.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(new URL('/verify?lang=en', baseUrl).href, { waitUntil: 'networkidle', timeout: 120_000 });
  await page.getByRole('heading', { name: 'Verify a public pot', exact: true }).waitFor();
  await assertNoHorizontalOverflow(page, 'wallet-free proof mobile EN');
  await page.screenshot({ path: resolve(outputDir, 'proof-mobile-en-390.png'), fullPage: true });
  await page.goto(new URL('/verify?lang=vi', baseUrl).href, { waitUntil: 'networkidle', timeout: 120_000 });
  await page.getByRole('heading', { name: 'Kiểm tra quỹ công khai', exact: true }).waitFor();
  await assertNoHorizontalOverflow(page, 'wallet-free proof mobile VI');
  await page.screenshot({ path: resolve(outputDir, 'proof-mobile-vi-390.png'), fullPage: true });
  await page.goto(settledUrl, { waitUntil: 'networkidle', timeout: 120_000 });
  await page.locator('.phase-label').filter({ hasText: 'Results finalized' }).waitFor();
  await waitForHealthyPublicState(page);
  steps.push('390px settled EN/VI, 1440px settled EN, and wallet-free proof mobile EN/VI captures checked for overflow');

  if (blockedRequests.length) throw new Error(`Blocked non-same-origin browser requests: ${blockedRequests.join('; ')}`);
  if (pageErrors.length) throw new Error(`Browser page errors: ${pageErrors.join('; ')}`);
  if (consoleErrors.length) throw new Error(`Browser console errors: ${consoleErrors.join('; ')}`);
  if (httpErrors.length) throw new Error(`Browser HTTP errors: ${httpErrors.join('; ')}`);
  await writeReport('passed', { steps, pageErrors, consoleErrors, httpErrors, blockedRequests, failedRequests, localOnly: true, isolatedMicrosoftEdgeContext: true, injectedWallet: false, productStateInjection: false, potId, financialFlow: { participants: 5, approvals: 5, deposits: 5, checkins: 4, claims: 4, exactEntitlementTestUsdc: '12.5', noShowIneligible: true, reloadClaims: 4, checkinInputs: 4 }, scenarios: ['wallet-free-verify-neutral', 'mock-create-approve-deposit-checkin-finalize-claim-reload', 'qr-edit-invalidates-presence', 'mock-wallet-switch-invalidates-candidate', 'healthy-poll-preserves-attestation', 'selected-pot-survives-wallet-disconnect', 'en-vi-390px-overflow-proof-captures'] });
  console.log(JSON.stringify({ status: 'passed', steps, output: relative(repoRoot, outputDir) }));
} catch (cause) {
  const error = cause instanceof Error ? cause : new Error(String(cause));
  if (pageErrors.length) error.message += `\nBrowser page errors: ${pageErrors.join('; ')}`;
  if (consoleErrors.length) error.message += `\nBrowser console errors: ${consoleErrors.join('; ')}`;
  if (httpErrors.length) error.message += `\nBrowser HTTP errors: ${httpErrors.join('; ')}`;
  if (blockedRequests.length) error.message += `\nBlocked non-same-origin browser requests: ${blockedRequests.join('; ')}`;
  if (failedRequests.length) error.message += `\nBrowser request failures: ${failedRequests.join('; ')}`;
  if (context && outputOwned) {
    const pages = context.pages();
    if (pages[0]) await pages[0].screenshot({ path: resolve(outputDir, 'failure.png'), fullPage: true }).catch(() => {});
  }
  if (outputOwned) await writeReport('failed', { steps, pageErrors, consoleErrors, httpErrors, blockedRequests, failedRequests, error: String(error), localOnly: true, isolatedMicrosoftEdgeContext: true }).catch(() => {});
  else console.error(JSON.stringify({ status: 'failed', error: String(error), report: 'not written because output directory was not safely acquired' }));
  throw error;
} finally {
  await browser?.close();
}

async function verifyNeutralReadOnlyRoutes(page, base) {
  await page.goto(new URL('/verify?lang=en', base).href, { waitUntil: 'networkidle', timeout: 120_000 });
  await page.getByRole('heading', { name: 'Verify a public pot', exact: true }).waitFor();
  await page.getByRole('heading', { name: 'Live verification is not configured', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => Boolean(window.ethereum)), false, 'wallet-free verification must not depend on an extension');
  await page.goto(new URL('/verify/3?lang=en', base).href, { waitUntil: 'networkidle', timeout: 120_000 });
  await page.getByRole('heading', { name: 'Historical local-chain summary', exact: true }).waitFor();
  await page.getByText(/not live proof or a certified result/i).waitFor();
  assert.equal(await page.evaluate(() => Boolean(window.ethereum)), false, 'historical route must remain wallet-free');
  steps.push('Wallet-free verify page remains unconfigured and historical pot remains neutral');
}

async function copyParticipantQr(page, walletSelect, account) {
  await walletSelect.selectOption(account);
  await refresh(page);
  const details = page.locator('details.qr-panel');
  if (!(await details.evaluate(element => element.open))) await details.locator('summary').click();
  await details.getByRole('button', { name: 'Copy QR contents', exact: true }).click();
  const payload = await page.evaluate(() => navigator.clipboard.readText());
  assert.ok(payload, 'the visible personal QR copy action must produce contents');
  return payload;
}

async function refresh(page) {
  await page.getByRole('button', { name: 'Refresh state', exact: true }).click();
  await waitForHealthyPublicState(page);
  await waitForSelectedAccountState(page);
}

async function selectAccountAndRefresh(page, walletSelect, account) {
  await walletSelect.selectOption(account);
  await refresh(page);
  assert.equal(await walletSelect.inputValue(), account, 'the requested demo wallet must remain selected after refresh');
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

async function waitForSelectedAccountState(page) {
  await page.waitForFunction(() => {
    const selectedAccount = document.querySelector('.personal-panel select')?.value;
    const balance = document.querySelector('.wallet-summary dd');
    return !selectedAccount || !!balance && !/^Checking/.test(balance.textContent ?? '');
  }, null, { timeout: 30_000 });
}

async function assertNoHorizontalOverflow(page, label) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 1, `${label} must not horizontally overflow (overflow ${overflow}px)`);
}

async function selectEventTab(page, index) {
  const tab = page.getByRole('button', { name: index === 0 ? 'Commitment' : 'Check-in desk', exact: true });
  if (await tab.getAttribute('aria-current') !== 'page') await tab.click();
}

async function perform(page, label) {
  const button = page.getByRole('button', { name: label, exact: true });
  await button.waitFor();
  await button.click();
  await page.waitForFunction(() => !document.querySelector('.notice.pending') && Array.from(document.querySelectorAll('.wallet-button')).every(item => !item.disabled), null, { timeout: 30_000 });
  const alert = page.locator('.notice.error[role="alert"]');
  if (await alert.count()) throw new Error(`${label} failed: ${await alert.innerText()}`);
}

async function advanceMockPhase(page, expected) {
  const tools = page.locator('details.demo-tools');
  await tools.waitFor();
  if (!(await tools.evaluate(element => element.open))) await tools.locator('summary').click();
  const advance = page.getByRole('button', { name: 'Move to next phase', exact: true });
  await advance.waitFor({ timeout: 10_000 });
  await advance.click();
  await page.locator('.phase-label').filter({ hasText: expected }).waitFor({ timeout: 10_000 });
}

function makeSchedule() {
  const base = new Date(Date.now() + 10 * 60_000);
  base.setSeconds(0, 0);
  return {
    registration: asLocalInput(base),
    open: asLocalInput(new Date(base.getTime() + 60 * 60_000)),
    close: asLocalInput(new Date(base.getTime() + 2 * 60 * 60_000)),
  };
}

function asLocalInput(date) {
  const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return adjusted.toISOString().slice(0, 16);
}

function parseArgs(values) {
  const parsed = {};
  for (let i = 0; i < values.length; i++) {
    const flag = values[i];
    if (!['--url', '--output'].includes(flag) || !values[i + 1]) throw new Error('Usage: node apps/web/tests/e2e/improvements-browser.mjs --url <loopback-url> --output <empty-allowed-output-directory>');
    const key = flag === '--url' ? 'url' : 'output';
    if (parsed[key]) throw new Error(`Duplicate argument ${flag}`);
    parsed[key] = values[++i];
  }
  if (!parsed.url || !parsed.output) throw new Error('Both --url and --output are required; no default server or output is assumed.');
  return parsed;
}

function requireLocalUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw new Error('Only an explicitly provided loopback HTTP URL is permitted.');
  return url;
}

function requireSafeOutput(value) {
  const output = resolve(repoRoot, value);
  const rel = relative(repoRoot, output);
  if (rel.startsWith(`..${sep}`) || rel === '..' || rel.startsWith(sep)) throw new Error('Output must stay inside the repository.');
  const verification = resolve(repoRoot, 'output', 'verification', 'improvements');
  if (output === verification || output.startsWith(verification + sep)) return output;
  const scratch = resolve(repoRoot, 'scratch');
  const scratchRelative = relative(scratch, output).split(sep).join('/');
  if (/^\d{4}-\d{2}\/week-\d{2}\/\d{4}-\d{2}-\d{2}_[^/]+(?:\/.*)?$/.test(scratchRelative)) return output;
  throw new Error('Output must be under output/verification/improvements or a dated scratch/YYYY-MM/week-WW/YYYY-MM-DD_task directory.');
}

async function writeReport(status, report) {
  if (!outputOwned) return;
  await mkdir(outputDir, { recursive: true });
  await writeFile(resolve(outputDir, 'browser-report.json'), JSON.stringify({ status, ...report }, null, 2));
}
