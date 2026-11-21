import assert from 'node:assert/strict';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
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
const nonCriticalHttpErrors = [];
const transportErrors = [];
const externalRequests = [];
const steps = [];
const results = [];
let browser;
let context;
let outputOwned = false;

try {
  await mkdir(outputDir, { recursive: true });
  if ((await readdir(outputDir)).length !== 0) throw new Error(`Refusing to overwrite non-empty output directory: ${relative(repoRoot, outputDir)}`);
  outputOwned = true;

  browser = await chromium.launch({ channel: 'msedge', headless: true });
  context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'en-GB', reducedMotion: 'reduce' });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: baseUrl.origin });
  await context.route('**/*', async route => {
    if (new URL(route.request().url()).origin !== baseUrl.origin) {
      externalRequests.push(`${route.request().method()} ${route.request().url()}`);
      return route.abort('blockedbyclient');
    }
    await route.fallback();
  });
  await context.route('**/favicon.ico', async route => {
    const url = new URL(route.request().url());
    if (route.request().method() !== 'GET' || url.origin !== baseUrl.origin || url.pathname !== '/favicon.ico') return route.fallback();
    nonCriticalHttpErrors.push(`GET ${url.href} fulfilled with 204 by the test harness only; no favicon asset is shipped`);
    await route.fulfill({ status: 204, body: '' });
  });
  const page = await context.newPage();
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('requestfailed', request => transportErrors.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText ?? 'request failed'}`));
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('response', response => { if (response.status() >= 400) (response.status() === 404 && new URL(response.url()).pathname === '/favicon.ico' ? nonCriticalHttpErrors : httpErrors).push(`${response.status()} ${response.url()}`); });

  await page.goto(baseUrl.href, { waitUntil: 'networkidle', timeout: 120_000 });
  await page.getByText('Local demonstration', { exact: true }).waitFor({ state: 'visible' });
  steps.push('Production loopback preflight: hydrated Local demonstration banner is visible before test actions');

  for (const [name, run] of [
    ['proof-routes', () => proofControls(page, baseUrl)],
    ['mobile-desk-jump', () => mobileDeskControls(page, baseUrl, outputDir)],
    ['recovery-quarantine', () => recoveryQuarantineControls(page, baseUrl)],
    ['zero-attendance-refund', () => refundControls(page, baseUrl, outputDir)],
    ['receipt-newlines', () => receiptNewlineControl(page, baseUrl)],
  ]) {
    try { await run(); results.push({ name, status: 'passed' }); }
    catch (error) { results.push({ name, status: 'failed', error: String(error) }); throw error; }
  }

  if (pageErrors.length) throw new Error(`Browser page errors: ${pageErrors.join('; ')}`);
  if (consoleErrors.length) throw new Error(`Browser console errors: ${consoleErrors.join('; ')}`);
  if (httpErrors.length) throw new Error(`Browser HTTP errors: ${httpErrors.join('; ')}`);
  if (transportErrors.length) throw new Error(`Browser request failures: ${transportErrors.join('; ')}`);
  const report = { status: 'passed', steps, results, pageErrors, consoleErrors, httpErrors, nonCriticalHttpErrors, transportErrors, localOnly: true, isolatedMicrosoftEdgeContext: true, walletFree: true, mockFinancialStateInjection: false };
  await writeReport(report);
  console.log(JSON.stringify({ status: 'passed', steps, nonCriticalHttpErrors, output: relative(repoRoot, outputDir) }));
} catch (cause) {
  const error = cause instanceof Error ? cause : new Error(String(cause));
  if (pageErrors.length) error.message += `\nBrowser page errors: ${pageErrors.join('; ')}`;
  if (consoleErrors.length) error.message += `\nBrowser console errors: ${consoleErrors.join('; ')}`;
  if (httpErrors.length) error.message += `\nBrowser HTTP errors: ${httpErrors.join('; ')}`;
  if (transportErrors.length) error.message += `\nBrowser request failures: ${transportErrors.join('; ')}`;
  if (context && outputOwned) {
    const pages = context.pages();
    if (pages[0]) await pages[0].screenshot({ path: resolve(outputDir, 'failure.png'), fullPage: true }).catch(() => {});
  }
  if (outputOwned) await writeReport({ status: 'failed', steps, results, pageErrors, consoleErrors, httpErrors, nonCriticalHttpErrors, transportErrors, error: String(error), localOnly: true, isolatedMicrosoftEdgeContext: true }).catch(() => {});
  else console.error(JSON.stringify({ status: 'failed', error: String(error), report: 'not written because output directory was not safely acquired' }));
  throw error;
} finally {
  await browser?.close();
}

async function proofControls(page, base) {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const lang of ['en', 'vi']) {
    await page.goto(new URL(`/verify?lang=${lang}`, base).href, { waitUntil: 'networkidle', timeout: 120_000 });
    await page.getByRole('heading', { name: lang === 'en' ? 'Verify a public pot' : 'Kiểm tra quỹ công khai', exact: true }).waitFor();
    await page.getByRole('heading', { name: lang === 'en' ? 'Live verification is not configured' : 'Chưa cấu hình xác minh trực tiếp', exact: true }).waitFor();
    await page.getByText(lang === 'en' ? 'No public release manifest is supplied to this page. It cannot confirm a current deployment, pot state or transaction.' : 'Trang này chưa có bản kê khai phát hành công khai. Trang không thể xác nhận triển khai, trạng thái quỹ hoặc giao dịch hiện tại.', { exact: true }).waitFor();
    await assertNoHorizontalOverflow(page, `proof ${lang}`);
    await page.getByRole('textbox', { name: lang === 'en' ? 'Pot ID' : 'Mã quỹ', exact: true }).waitFor();
    await page.getByRole('link', { name: lang === 'en' ? 'View the historical Anvil summary for pot #3' : 'Xem tóm tắt Anvil lịch sử của quỹ #3', exact: true }).first().waitFor();
    await page.screenshot({ path: resolve(outputDir, `proof-${lang}-390.png`), fullPage: true });
    await page.goto(new URL(`/verify/not-a-pot?lang=${lang}`, base).href, { waitUntil: 'networkidle', timeout: 120_000 });
    await page.getByRole('heading', { name: lang === 'en' ? 'Invalid pot reference' : 'Mã quỹ không hợp lệ', exact: true }).waitFor();
    await page.getByText(lang === 'en' ? 'Pot IDs must be positive decimal numbers. The supplied value was not echoed or used.' : 'Mã quỹ phải là số thập phân dương. Giá trị đầu vào không được hiển thị hoặc sử dụng.', { exact: true }).waitFor();
    await assertNoHorizontalOverflow(page, `invalid proof ${lang}`);
    await page.screenshot({ path: resolve(outputDir, `proof-invalid-${lang}-390.png`), fullPage: true });
  }
  steps.push('Wallet-free proof routes EN/VI: exact headings, unconfigured status, public history link, invalid pot and 390px overflow');
}

async function recoveryQuarantineControls(page, base) {
  const key = 'commitpot-pending-v1';
  const poison = { corrupt: 'preserve-this-exact-text-λ', future: JSON.stringify({ version: 999, started: 1, sentinel: 'preserve-future-bytes-λ' }) };
  for (const [kind, raw] of Object.entries(poison)) {
    await page.evaluate(() => localStorage.clear());
    await page.goto(base.href, { waitUntil: 'networkidle', timeout: 120_000 });
    await page.getByText('Local demonstration', { exact: true }).waitFor();
    const tools = page.locator('details.demo-tools');
    await setDetailsOpen(tools, true);
    await tools.getByRole('button', { name: 'Load a five-person example', exact: true }).click();
    await page.getByRole('heading', { name: 'Campus workshop attendance demo', exact: true }).waitFor();
    await waitUntilIdle(page);
    const originalPotId = await selectedPotId(page);
    await page.locator('.event-title').filter({ hasText: `Pot #${originalPotId}` }).waitFor();
    await page.locator('.phase-label').filter({ hasText: 'Registration open' }).waitFor();
    const originalAccountSelect = page.locator('.personal-panel select');
    await page.waitForFunction(() => !!document.querySelector('.personal-panel select')?.value);
    const initialAccount = await originalAccountSelect.inputValue();
    await waitForSelectedAccount(page, originalAccountSelect, initialAccount, '90', 'Deposit received');
    await setDetailsOpen(tools, false);
    await page.evaluate(({ storageKey, bytes }) => localStorage.setItem(storageKey, bytes), { storageKey: key, bytes: raw });
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByText('Local demonstration', { exact: true }).waitFor();
    const warning = page.getByText('Saved operation data needs review', { exact: true });
    await warning.waitFor();
    await page.getByText('Writes are blocked.', { exact: false }).waitFor();
    await page.locator('.quarantine').getByText('Writes are blocked.', { exact: false }).waitFor();
    await page.locator('.event-title').filter({ hasText: `Pot #${originalPotId}` }).waitFor();
    await page.locator('.phase-label').filter({ hasText: 'Registration open' }).waitFor();
    await page.locator('.personal-panel select').waitFor();
    await waitForQuarantinedReadReady(page, page.locator('.personal-panel select'), initialAccount, '90', 'Deposit received');
    const inspectedBytes = page.locator('.quarantine pre');
    await page.locator('.quarantine details summary').click();
    assert.equal(await inspectedBytes.textContent(), raw, `${kind} inspector shows the exact saved raw bytes`);
    assert.equal(await page.evaluate(storageKey => localStorage.getItem(storageKey), key), raw, `${kind} raw bytes must remain exact after load`);
    assert.equal(await page.evaluate(({ storageKey, bytes }) => localStorage.getItem(storageKey) === bytes, { storageKey: key, bytes: raw }), true, `${kind} blocked write preserves the exact quarantined bytes`);
    const create = page.getByRole('button', { name: 'Create a pot', exact: true }).first();
    assert.equal(await create.isEnabled(), true, 'navigation stays usable while recovery writes are blocked');
    await setDetailsOpen(tools, true);
    assert.equal(await tools.getByRole('button', { name: 'Load a five-person example', exact: true }).isEnabled(), false, 'mock write action is blocked by quarantined recovery bytes');
    await setDetailsOpen(tools, false);
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByText('Local demonstration', { exact: true }).waitFor();
    await page.getByText('Saved operation data needs review', { exact: true }).waitFor();
    await page.locator('.event-title').filter({ hasText: `Pot #${originalPotId}` }).waitFor();
    await page.locator('.phase-label').filter({ hasText: /Registration open|Waiting for check-in|Check-in open|Ready to finalize|Results finalized/ }).waitFor();
    await page.locator('.personal-panel select').waitFor();
    const preservedAccount = page.locator('.personal-panel select');
    assert.equal(await preservedAccount.inputValue(), initialAccount, `${kind} quarantine retains the selected pot participant`);
    await waitForQuarantinedReadReady(page, preservedAccount, initialAccount, '90', 'Deposit received');
    assert.equal(await page.evaluate(storageKey => localStorage.getItem(storageKey), key), raw, `${kind} bytes must remain exact across a second reload`);
    page.once('dialog', dialog => { assert.match(dialog.message(), /original|preserved|giao dịch/i); void dialog.dismiss(); });
    await page.getByRole('button', { name: 'Clear reviewed quarantined bytes', exact: true }).click();
    await page.getByText('Saved operation data needs review', { exact: true }).waitFor();
    assert.equal(await page.evaluate(storageKey => localStorage.getItem(storageKey), key), raw, `${kind} cancel must preserve exact bytes`);
    await page.screenshot({ path: resolve(outputDir, `quarantine-${kind}-cancel-en-390.png`), fullPage: true });
    page.once('dialog', dialog => { assert.match(dialog.message(), /original|preserved|giao dịch/i); void dialog.accept(); });
    await page.getByRole('button', { name: 'Clear reviewed quarantined bytes', exact: true }).click();
    await page.getByText('Saved operation data needs review', { exact: true }).waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(storageKey => localStorage.getItem(storageKey), key), null, `${kind} clear must remove only exact quarantined record`);
    await setDetailsOpen(tools, true);
    const example = tools.getByRole('button', { name: 'Load a five-person example', exact: true });
    assert.equal(await example.isEnabled(), true, 'write gate releases only after exact quarantined bytes are removed');
    await example.click();
    await waitUntilIdle(page);
    await page.waitForFunction(previous => new URL(location.href).searchParams.get('pot') !== previous, originalPotId);
    const newPotId = await selectedPotId(page);
    assert.match(newPotId, /^[1-9][0-9]*$/);
    assert.notEqual(newPotId, originalPotId, 'post-review example creates and selects a new pot ID');
    await page.locator('.event-title').filter({ hasText: `Pot #${newPotId}` }).waitFor();
    await page.locator('.phase-label').filter({ hasText: 'Registration open' }).waitFor();
    const exampleAccount = page.locator('.personal-panel select');
    await page.waitForFunction(() => !!document.querySelector('.personal-panel select')?.value);
    const newAccount = await exampleAccount.inputValue();
    assert.match(newAccount, /^0x[0-9a-fA-F]{40}$/, 'normal allowed demo operation selects a real synthetic participant');
    await waitForSelectedAccount(page, exampleAccount, newAccount, '80', 'Deposit received');
    assert.equal((await page.locator('.deposit-line .count-pair span').first().locator('strong').innerText()).trim(), '5', 'post-review example has the confirmed five joined participants');
    assert.equal(await page.evaluate(storageKey => localStorage.getItem(storageKey), key), null, 'normal UI can create a new example after reviewed quarantine removal');
    await page.screenshot({ path: resolve(outputDir, `quarantine-${kind}-cleared-en-390.png`), fullPage: true });
    await page.evaluate(() => localStorage.clear());
  }
  steps.push('Corrupt and future non-financial recovery records are quarantined with exact bytes preserved across reload; cancel preserves them; accepted clear releases only the verified normal UI write action under reduced-motion emulation');
}

async function mobileDeskControls(page, base, outputDir) {
  await page.evaluate(() => localStorage.clear());
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(base.href, { waitUntil: 'networkidle', timeout: 120_000 });
  await page.getByText('Local demonstration', { exact: true }).waitFor();
  const tools = page.locator('.demo-tools');
  if (!(await tools.evaluate(element => element.open))) await tools.locator('summary').click();
  await page.getByRole('button', { name: 'Load a five-person example', exact: true }).first().click();
  await page.getByRole('heading', { name: 'Campus workshop attendance demo', exact: true }).waitFor();
  await page.locator('.event-title').getByText('Pot #1', { exact: true }).waitFor();
  const accountSelect = page.locator('.personal-panel select');
  const verifier = await accountSelect.locator('option').evaluateAll(options => options.find(option => /^Verifier\s*·/.test(option.textContent?.trim() ?? ''))?.value ?? '');
  assert.match(verifier, /^0x[0-9a-fA-F]{40}$/, 'initialized verifier option is available before entering desk');
  await accountSelect.selectOption(verifier);
  await waitUntilIdle(page);
  const exampleTools = page.locator('details.demo-tools');
  await setDetailsOpen(exampleTools, true);
  const phaseAdvance = exampleTools.getByRole('button', { name: 'Move to next phase', exact: true });
  await phaseAdvance.click();
  await page.locator('.phase-label').filter({ hasText: 'Check-in open' }).waitFor();
  await setDetailsOpen(exampleTools, false);
  await page.getByRole('button', { name: 'Check-in desk', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Go to participant QR entry', exact: true }).waitFor();
  const verifierShortAddress = `${verifier.slice(0, 6)}…${verifier.slice(-4)}`;
  const verifierContext = page.locator('.verifier-identity');
  await page.waitForFunction(({ phase, name, address }) => {
    const text = document.querySelector('.verifier-identity')?.innerText ?? '';
    return text.includes(phase) && text.includes(name) && text.includes(address);
  }, { phase: 'Check-in open', name: 'Attendance verifier', address: verifierShortAddress });
  await page.getByText('This QR identifies a wallet and pot. It does not prove person presence or wallet ownership.', { exact: true }).waitFor();
  const jump = page.getByRole('button', { name: 'Go to participant QR entry', exact: true });
  const mobileJump = page.locator('.mobile-desk-jump');
  assert.equal(await mobileJump.isVisible(), true, 'mobile jump is visibly present at phone width');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForFunction(() => window.scrollY === 0);
  await assertNoHorizontalOverflow(page, 'mobile desk jump EN');
  const rect = async locator => locator.evaluate(element => { const r = element.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, visible: r.width > 0 && r.height > 0 }; });
  const jumpBefore = await rect(jump);
  const startPosition = await page.evaluate(() => ({ scrollY: window.scrollY, height: window.innerHeight }));
  assert.ok(startPosition.scrollY === 0 && jumpBefore.visible && jumpBefore.top >= 0 && jumpBefore.bottom <= startPosition.height, `mobile desk entry action must appear in the initial phone viewport at scroll top: ${JSON.stringify({ startPosition, jumpBefore })}`);
  await page.screenshot({ path: resolve(outputDir, 'mobile-desk-pre-jump-en-390.png'), fullPage: true });
  await jump.click();
  const qr = page.locator('#checkin-qr-entry');
  await assertAccessibleQrEntry(page, qr, 'en');
  const initialTop = await rect(qr);
  await page.waitForFunction(() => document.activeElement?.id === 'checkin-qr-entry');
  await page.waitForFunction(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => { const element = document.getElementById('checkin-qr-entry'); if (!element) return resolve(false); const rect = element.getBoundingClientRect(); resolve(rect.top >= 0 && rect.bottom <= window.innerHeight && scrollY > 0); }))));
  const afterJump = await rect(qr);
  assert.ok(afterJump.visible && afterJump.top >= 0 && afterJump.bottom <= 844, `focused textarea must fit viewport after smooth scroll settles: ${JSON.stringify(afterJump)}`);
  assert.ok(initialTop.top >= 0 && initialTop.top <= 844 || afterJump.top >= 0, 'QR input has an actionable mobile position');
  const nearby = page.locator('.qr-limit');
  const disclosure = await rect(nearby);
  assert.ok(disclosure.visible && disclosure.top < 844, 'QR-not-presence safety disclosure remains near the target in the phone viewport');
  assert.match(await verifierContext.innerText(), new RegExp(`Check-in open.*Attendance verifier.*${escapeRegExp(verifierShortAddress)}`), 'selected pot phase and designated verifier short address remain visible at the desk target');
  await page.screenshot({ path: resolve(outputDir, 'mobile-desk-post-jump-en-390.png'), fullPage: true });
  await page.getByRole('button', { name: 'VI', exact: true }).click();
  const vietnameseJump = page.getByRole('button', { name: 'Đến ô nhập mã QR người tham gia', exact: true });
  await vietnameseJump.waitFor();
  assert.equal(await mobileJump.isVisible(), true, 'Vietnamese mobile jump is visibly present at phone width');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForFunction(() => window.scrollY === 0);
  const jumpBoundsVi = await rect(vietnameseJump);
  const viewportVi = await page.evaluate(() => ({ scrollY: window.scrollY, height: window.innerHeight }));
  assert.ok(viewportVi.scrollY === 0 && jumpBoundsVi.visible && jumpBoundsVi.top >= 0 && jumpBoundsVi.bottom <= viewportVi.height, `Vietnamese mobile desk entry action must appear in initial viewport: ${JSON.stringify({ viewportVi, jumpBoundsVi })}`);
  await assertNoHorizontalOverflow(page, 'mobile desk jump VI');
  await page.screenshot({ path: resolve(outputDir, 'mobile-desk-pre-jump-vi-390.png'), fullPage: true });
  await vietnameseJump.click();
  await assertAccessibleQrEntry(page, qr, 'vi');
  await page.waitForFunction(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => { const element = document.getElementById('checkin-qr-entry'); if (!element || document.activeElement !== element) return resolve(false); const rect = element.getBoundingClientRect(); resolve(rect.top >= 0 && rect.bottom <= window.innerHeight && scrollY > 0); }))));
  await assertVisibleInPhone(page, qr, 'Vietnamese QR field after smooth scroll settles');
  const safetyCopyVi = page.locator('.qr-limit').first();
  await safetyCopyVi.getByText('QR này xác định ví và quỹ. QR không chứng minh người đó có mặt hoặc sở hữu ví.', { exact: true }).waitFor();
  const verifierContextVi = page.locator('.verifier-identity');
  await page.waitForFunction(({ phase, name, address }) => {
    const text = document.querySelector('.verifier-identity')?.innerText ?? '';
    return text.includes(phase) && text.includes(name) && text.includes(address);
  }, { phase: 'Đang mở điểm danh', name: 'Người xác nhận hiện diện', address: verifierShortAddress });
  await page.screenshot({ path: resolve(outputDir, 'mobile-desk-post-jump-vi-390.png'), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  assert.equal(await page.locator('.mobile-desk-jump').isVisible(), false, 'mobile-only jump is hidden at desktop width regardless of active locale');
  assert.equal(await qr.isVisible(), true, 'QR entry remains present on desktop');
  await assertAccessibleQrEntry(page, qr, 'vi');
  await page.screenshot({ path: resolve(outputDir, 'desktop-desk-controls-en-1440.png'), fullPage: true });
  steps.push('Five-person UI example; verifier selection and Check-in desk. 390×844 EN/VI jump is visible, focuses/scrolls QR entry into viewport, keeps pot phase/verifier/safety copy, and is hidden at 1440px desktop');
}

async function refundControls(page, base, outputDir) {
  await page.evaluate(() => localStorage.clear());
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(base.href, { waitUntil: 'networkidle', timeout: 120_000 });
  await page.getByRole('button', { name: 'Create a pot', exact: true }).first().click();
  await page.getByLabel('Deposit per person', { exact: true }).fill('10');
  const verifierField = page.getByLabel('Verifier address', { exact: true });
  await verifierField.waitFor();
  const initializedVerifier = await verifierField.inputValue();
  assert.match(initializedVerifier, /^0x[0-9a-fA-F]{40}$/, 'form uses the initialized synthetic verifier');
  const start = new Date(Date.now() + 2 * 60_000); start.setSeconds(0, 0);
  const future = minutes => { const value = new Date(start.getTime() + minutes * 60_000); const adjusted = new Date(value.getTime() - value.getTimezoneOffset() * 60_000); return adjusted.toISOString().slice(0, 16); };
  await page.getByLabel('Registration closes', { exact: true }).fill(future(0));
  await page.getByLabel('Check-in opens', { exact: true }).fill(future(1));
  await page.getByLabel('Check-in closes', { exact: true }).fill(future(2));
  await page.getByRole('button', { name: 'Review commitment', exact: true }).click();
  await page.getByRole('heading', { name: 'Fixed rules', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Confirm and create', exact: true }).click();
  await page.waitForFunction(() => new URL(location.href).searchParams.has('pot'));
  const potId = await page.evaluate(() => new URL(location.href).searchParams.get('pot'));
  assert.match(potId, /^[1-9][0-9]*$/, 'new custom pot route contains an explicit positive ID');
  const accountSelect = page.locator('.personal-panel select');
  const walletOptions = await accountSelect.locator('option').evaluateAll(options => options.map(option => ({ value: option.value, label: option.textContent?.trim() ?? '' })));
  const participant = walletOptions.find(option => /^Participant 1\s*·/.test(option.label));
  const secondParticipant = walletOptions.find(option => /^Participant 2\s*·/.test(option.label));
  const verifier = walletOptions.find(option => /^Verifier\s*·/.test(option.label));
  assert.ok(participant && secondParticipant && participant.value !== secondParticipant.value && verifier, 'normal mock UI exposes two distinct participant wallets and a verifier after create');
  await page.locator('.event-title').filter({ hasText: `Pot #${potId}` }).waitFor();
  for (const [name, option] of [['participant one', participant], ['participant two', secondParticipant]]) {
    await accountSelect.selectOption(option.value);
    await waitForSelectedAccount(page, accountSelect, option.value, '100', 'Not yet joined');
    assert.match(await page.locator('.wallet-summary dd').first().innerText(), /100\s*Test USDC/, `${name} starts at 100 Test USDC`);
    await page.getByRole('button', { name: 'Approve token spending', exact: true }).click(); await waitUntilIdle(page);
    await page.getByRole('button', { name: 'Join and deposit', exact: true }).click(); await waitUntilIdle(page);
    await waitForSelectedAccount(page, accountSelect, option.value, '90', 'Deposit received');
    assert.match(await page.locator('.wallet-summary dd').first().innerText(), /90\s*Test USDC/, `${name} deposit deducts exactly 10 Test USDC`);
  }
  await page.locator('.event-title').filter({ hasText: `Pot #${potId}` }).waitFor();
  assert.equal((await page.locator('.deposit-line .count-pair span').first().locator('strong').innerText()).trim(), '2', 'selected custom pot shows exactly two joined participants before finalization');
  assert.equal((await page.locator('.deposit-line .count-pair span').nth(1).locator('strong').innerText()).trim(), '0', 'selected custom pot has zero check-ins');
  const demoTools = page.locator('details.demo-tools');
  await setDetailsOpen(demoTools, true);
  const advance = demoTools.getByRole('button', { name: 'Move to next phase', exact: true });
  await advance.click();
  await page.locator('.phase-label').filter({ hasText: 'Check-in open' }).waitFor();
  await advance.click();
  await page.locator('.phase-label').filter({ hasText: 'Ready to finalize' }).waitFor();
  await setDetailsOpen(demoTools, false);
  await page.getByRole('button', { name: 'Finalize results', exact: true }).click(); await waitUntilIdle(page);
  await waitForSelectedAccount(page, accountSelect, secondParticipant.value, '90', 'Deposit received');
  const entitlement = page.locator('.entitlement>strong');
  await entitlement.waitFor();
  assert.equal((await entitlement.innerText()).replace(/\s+/g, ' ').trim(), '10 Test USDC', 'participant two has an exact 10 Test USDC refund entitlement');
  await page.getByRole('button', { name: 'Claim deposit refund', exact: true }).waitFor();
  await accountSelect.selectOption(participant.value);
  await waitForSelectedAccount(page, accountSelect, participant.value, '90', 'Deposit received');
  await entitlement.waitFor();
  assert.equal((await entitlement.innerText()).replace(/\s+/g, ' ').trim(), '10 Test USDC', 'participant one has an exact 10 Test USDC refund entitlement');
  await page.setViewportSize({ width: 390, height: 844 });
  await assertNoHorizontalOverflow(page, 'zero-attendance refund EN');
  await page.screenshot({ path: resolve(outputDir, 'refund-before-en-390.png'), fullPage: true });
  await page.getByRole('button', { name: 'VI', exact: true }).click();
  await assertNoHorizontalOverflow(page, 'zero-attendance refund VI');
  const vietnameseRefundCta = page.getByRole('button', { name: 'Nhận lại tiền cọc', exact: true });
  await vietnameseRefundCta.waitFor();
  await accountSelect.selectOption(participant.value);
  await waitForSelectedAccount(page, accountSelect, participant.value, '90', 'Đã nhận tiền cọc');
  await page.screenshot({ path: resolve(outputDir, 'refund-before-vi-390.png'), fullPage: true });
  await vietnameseRefundCta.click();
  await page.locator('.personal-state').getByText('Đã nhận tiền', { exact: true }).waitFor();
  await waitForSelectedAccount(page, accountSelect, participant.value, '100', 'Đã nhận tiền');
  assert.match(await page.locator('.wallet-summary dd').first().innerText(), /100\s*Test USDC/, 'first zero-attendance refund must restore exact original 10 balance');
  await page.screenshot({ path: resolve(outputDir, 'refund-after-vi-390.png'), fullPage: true });
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await page.locator('.personal-state').getByText('Payout claimed', { exact: true }).waitFor();
  await accountSelect.selectOption(secondParticipant.value);
  await waitForSelectedAccount(page, accountSelect, secondParticipant.value, '90', 'Deposit received');
  assert.match(await page.locator('.wallet-summary dd').first().innerText(), /90\s*Test USDC/, 'second joined participant has 90 before refund');
  await entitlement.waitFor();
  assert.equal((await entitlement.innerText()).replace(/\s+/g, ' ').trim(), '10 Test USDC', 'participant two has an exact 10 Test USDC refund entitlement');
  const secondRefundCta = page.getByRole('button', { name: 'Claim deposit refund', exact: true });
  await secondRefundCta.waitFor();
  await secondRefundCta.click();
  await page.locator('.personal-state').getByText('Payout claimed', { exact: true }).waitFor();
  await waitForSelectedAccount(page, accountSelect, secondParticipant.value, '100', 'Payout claimed');
  assert.match(await page.locator('.wallet-summary dd').first().innerText(), /100\s*Test USDC/, 'second zero-attendance refund restores exactly 10');
  await page.getByRole('button', { name: 'VI', exact: true }).click();
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByText('Mô phỏng cục bộ', { exact: true }).waitFor();
  const reloadedAccount = page.locator('.personal-panel select');
  await reloadedAccount.waitFor();
  await reloadedAccount.selectOption(participant.value);
  await waitForSelectedAccount(page, reloadedAccount, participant.value, '100', 'Đã nhận tiền');
  const receipts = page.locator('.activity li').filter({ hasText: 'Nhận phần được hưởng' });
  await page.waitForFunction(expected => document.querySelectorAll('.activity li').length >= expected, 2);
  assert.equal(await receipts.count(), 2, 'reload retains exactly two confirmed zero-attendance refund receipts');
  const receiptHashes = [];
  for (const option of [participant, secondParticipant]) {
    const entry = receipts.filter({ hasText: 'Người nhận' }).filter({ hasText: option.value });
    await entry.waitFor();
    await entry.locator('details.activity-details summary').click();
    const receipt = await entry.locator('pre').textContent();
    assert.notEqual(receipt, null, 'confirmed refund history receipt text exists');
    assert.ok(receipt.includes(`Người nhận: ${option.value}`), 'confirmed refund history identifies the actual participant beneficiary');
    assert.match(receipt, /Mức cọc mỗi người: 10000000/, 'confirmed refund history records exact 10-token base-unit amount under the receipt locale label');
    assert.ok(receipt.includes('\n') && !receipt.includes('\\n'), 'refund receipt stores real LF line breaks');
    const receiptHash = (receipt.match(/^Sao chép mã giao dịch đầy đủ: (0x[0-9a-fA-F]{64})$/m) ?? [])[1];
    assert.match(receiptHash ?? '', /^0x[0-9a-fA-F]{64}$/, 'confirmed refund history includes the exact full transaction hash');
    receiptHashes.push(receiptHash);
  }
  assert.ok(receiptHashes[0] && receiptHashes[1] && receiptHashes[0] !== receiptHashes[1], 'two distinct confirmed refund receipts survive reload');
  assert.equal(await reloadedAccount.inputValue(), participant.value, 'reload selection explicitly remains on participant one');
  await waitForSelectedAccount(page, reloadedAccount, participant.value, '100', 'Đã nhận tiền');
  await assertNoHorizontalOverflow(page, 'zero-attendance refund VI reload');
  await page.screenshot({ path: resolve(outputDir, 'refund-after-vi-390.png'), fullPage: true });
  steps.push('Separate normal UI-created K=0 pot: two distinct participants each approve and deposit 10 (100→90), both are refunded after UI phase controls/finalization (90→100); VI reload retains claim state/history with beneficiary and amount in 390px EN/VI captures');
}

async function receiptNewlineControl(page, base) {
  await page.goto(base.href, { waitUntil: 'networkidle', timeout: 120_000 });
  await page.getByText('Mô phỏng cục bộ', { exact: true }).waitFor();
  const line = page.locator('.activity li').filter({ hasText: 'Nhận phần được hưởng' }).first();
  await line.waitFor();
  const details = line.locator('details.activity-details');
  await details.locator('summary').click();
  const text = await details.locator('pre').textContent();
  assert.notEqual(text, null, 'copyable activity receipt text exists');
  const beneficiary = (text.match(/Người nhận: (0x[0-9a-fA-F]{40})/) ?? [])[1];
  const receiptHash = (text.match(/^Sao chép mã giao dịch đầy đủ: (0x[0-9a-fA-F]{64})$/m) ?? [])[1];
  assert.ok(beneficiary, 'copyable activity receipt identifies the actual beneficiary');
  assert.ok(receiptHash, 'copyable receipt identifies its actual full transaction hash');
  assert.match(text, /Mức cọc mỗi người: 10000000/, 'copyable activity receipt gives exact confirmed refund amount under receipt amount translation');
  assert.ok(text.includes('\n'), 'rendered receipt must contain real line breaks');
  assert.ok(!text.includes('\\n'), 'rendered receipt must not contain literal backslash-n sequences');
  assert.ok(text.includes(`Người nhận: ${beneficiary}`), 'receipt names exact beneficiary');
  assert.ok(text.includes(`Sao chép mã giao dịch đầy đủ: ${receiptHash}`), 'receipt includes the full transaction hash');
  await details.getByRole('button', { name: 'Sao chép chi tiết biên nhận', exact: true }).click();
  await page.waitForFunction(async expected => (await navigator.clipboard.readText()).replace(/\r\n/g, '\n') === expected, text);
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  assert.equal(copied.replace(/\r\n/g, '\n'), text, 'clipboard receipt must preserve real newline characters');
  const copyHash = line.locator('.copy-hash');
  await copyHash.click();
  await page.waitForFunction(async expected => await navigator.clipboard.readText() === expected, receiptHash);
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), receiptHash, 'separate full-hash copy control copies this exact receipt hash');
  steps.push('Clipboard preserves receipt lines (platform LF/CRLF) and exact separate hash; rendered receipt uses real LF, never literal backslash-n');
}

async function waitUntilIdle(page) {
  await page.waitForFunction(() => !document.querySelector('.notice.pending') && Array.from(document.querySelectorAll('.wallet-button')).every(button => !button.disabled), null, { timeout: 30_000 });
  const alert = page.locator('.notice.error[role="alert"]');
  if (await alert.count()) throw new Error(`Mock UI action failed: ${await alert.innerText()}`);
}
async function waitForQuarantinedReadReady(page, select, account, balance, statusText) {
  await page.waitForFunction(expected => {
    const select = document.querySelector('.personal-panel select');
    const currentBalance = document.querySelector('.wallet-summary dd')?.textContent ?? '';
    const state = document.querySelector('.personal-state')?.textContent ?? '';
    return select?.value === expected.account
      && currentBalance.trim() === `${expected.balance} Test USDC`
      && state.includes(expected.status)
      && !document.querySelector('.read-status');
  }, { account, balance, status: statusText }, { timeout: 30_000 });
  assert.equal(await select.inputValue(), account, 'expected mock account remains selected during quarantine read');
}
async function waitForSelectedAccount(page, select, account, balance, statusText) {
  await page.waitForFunction(expected => {
    const select = document.querySelector('.personal-panel select');
    const currentBalance = document.querySelector('.wallet-summary dd')?.textContent ?? '';
    const state = document.querySelector('.personal-state')?.textContent ?? '';
    const receiptStatus = document.querySelector('.notice.confirmed[role="status"] strong')?.textContent ?? '';
    return select?.value === expected.account
      && currentBalance.trim() === `${expected.balance} Test USDC`
      && (state.includes(expected.status) || receiptStatus === expected.status)
      && !document.querySelector('.notice.pending')
      && !document.querySelector('.wallet-button')?.disabled;
  }, { account, balance, status: statusText }, { timeout: 30_000 });
  assert.equal(await select.inputValue(), account, 'expected mock account is selected');
  await waitUntilIdle(page);
}
async function setDetailsOpen(details, open) {
  await details.waitFor();
  if (await details.evaluate(element => element.open) !== open) await details.locator('summary').click();
  assert.equal(await details.evaluate(element => element.open), open, `details state is ${open ? 'open' : 'closed'}`);
}
async function selectedPotId(page) {
  return await page.evaluate(() => new URL(location.href).searchParams.get('pot'));
}
async function assertAccessibleQrEntry(page, locator, locale) {
  const name = locale === 'en' ? 'Participant QR contents' : 'Nội dung QR của người tham gia';
  assert.equal(await locator.getAttribute('aria-label'), name, `${locale} QR input has its localized accessible label`);
  assert.equal(await page.getByRole('textbox', { name, exact: true }).count(), 1, `${locale} QR input is exposed under its localized accessible name`);
}
async function assertNoHorizontalOverflow(page, label) { const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); assert.ok(overflow <= 1, `${label} horizontal overflow ${overflow}px`); }
function escapeRegExp(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
async function assertVisibleInPhone(page, locator, label) { const rect = await locator.evaluate(element => { const r = element.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, width: r.width, height: r.height }; }); assert.ok(rect.top >= 0 && rect.bottom <= 844 && rect.width > 0 && rect.height > 0, `${label} outside 390x844 viewport: ${JSON.stringify(rect)}`); }
function parseArgs(values) {
  const result = {};
  for (let i = 0; i < values.length; i++) {
    const flag = values[i];
    if (!['--url', '--output'].includes(flag) || !values[i + 1]) throw new Error('Usage: node apps/web/tests/e2e/improvements-controls.mjs --url <loopback-url> --output <empty-allowed-output-directory>');
    const key = flag === '--url' ? 'url' : 'output';
    if (result[key]) throw new Error(`Duplicate argument ${flag}`);
    result[key] = values[++i];
  }
  if (!result.url || !result.output) throw new Error('Both --url and --output are required; no default server or output is assumed.');
  return result;
}
function requireLocalUrl(value) { const url = new URL(value); if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw new Error('Only an explicitly provided loopback HTTP URL is permitted.'); return url; }
function requireSafeOutput(value) {
  const output = resolve(repoRoot, value); const rel = relative(repoRoot, output);
  if (rel.startsWith(`..${sep}`) || rel === '..' || rel.startsWith(sep)) throw new Error('Output must stay inside the repository.');
  const scratchRelative = relative(resolve(repoRoot, 'scratch'), output).split(sep).join('/');
  if (/^\d{4}-\d{2}\/week-\d{2}\/\d{4}-\d{2}-\d{2}_[^/]+(?:\/.*)?$/.test(scratchRelative)) return output;
  throw new Error('Output must stay under a dated scratch/YYYY-MM/week-WW/YYYY-MM-DD_task directory.');
}
async function writeReport(report) { if (!outputOwned) return; await writeFile(resolve(outputDir, 'controls-report.json'), JSON.stringify(report, null, 2)); }
