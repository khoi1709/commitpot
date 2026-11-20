import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { activityDetails, CheckInQrEntry, focusCheckInQrEntry, hasCriticalReadWarning, mergeCurrentActivity, MobileDeskJump, PersonalEntitlementAction, PublicRefreshWarning, publicReadWarningAfterReceiptRefresh, receiptDetails, ReviewSubmitButton } from '../../src/presentation/CommitPotApp';
import { messages } from '../../src/i18n/messages';
import { ACTIVITY_LIMIT, type ConfirmedActivity } from '../../src/application/activity';
import type { PublicPotSnapshot } from '../../src/application/usePublicPot';
import type { ChainContext, TransactionReceipt } from '../../src/domain';

const context: Pick<ChainContext, 'chainId' | 'coreAddress'> = { chainId: 43113, coreAddress: '0x1111111111111111111111111111111111111111' };
const account = '0x2222222222222222222222222222222222222222' as `0x${string}`;
const receipt: TransactionReceipt = { hash: `0x${'a'.repeat(64)}` as `0x${string}`, status: 'success', blockNumber: 7n, chainId: 43113, coreAddress: context.coreAddress, from: account, to: context.coreAddress, operation: 'claim', potId: 3n, beneficiary: account, amount: 10_000_000n };
const activity: ConfirmedActivity = { version: 2, operationId: 'done1', kind: 'claim', hash: receipt.hash, time: 1, chainId: 43113, coreAddress: context.coreAddress, from: receipt.from!, to: receipt.to!, potId: '3', beneficiary: receipt.beneficiary, amount: '10000000', blockNumber: '7' };
const snapshot = (overrides: Partial<PublicPotSnapshot> = {}): PublicPotSnapshot => ({ selected: 3n, pot: { data: null, status: 'idle', error: null }, time: { data: null, status: 'loading', error: null }, chain: { data: null, status: 'loading', error: null }, list: { data: null, status: 'loading', error: null }, wallet: { data: null, status: 'idle', error: null }, participant: { data: null, status: 'idle', error: null }, refreshing: true, publicVerified: false, writesEnabled: false, ...overrides });

describe('current CommitPot App integration', () => {
  it('formats receipt and activity details with actual LF separators', () => {
    const receiptText = receiptDetails({ kind: 'claim', account, chainId: 43113, core: context.coreAddress, token: context.coreAddress, potId: '3', beneficiary: account, amount: '10000000' }, receipt, 'en');
    const activityText = activityDetails(activity, 'en');
    expect(receiptText).toContain('\n');
    expect(activityText).toContain('\n');
    expect(receiptText).not.toContain('\\n');
    expect(activityText).not.toContain('\\n');
    expect(receiptText).toContain(receipt.hash);
    expect(receiptText).toContain('43113');
    expect(receiptText).toContain('7');
    const recoveredText = receiptDetails(null, receipt, 'en');
    expect(recoveredText).toContain(receipt.hash);
    expect(recoveredText).toContain(account);
    expect(recoveredText).not.toContain('undefined');
  });

  it('merges completed in-session history with current stored context, preserving dedupe and exclusions', () => {
    const duplicate = { ...activity, operationId: 'old', time: 2 };
    const foreign = { ...activity, hash: `0x${'b'.repeat(64)}` as `0x${string}`, chainId: 1 };
    const legacy: ConfirmedActivity = { kind: 'claim', hash: `0x${'c'.repeat(64)}` as `0x${string}`, time: 3 };
    const merged = mergeCurrentActivity([duplicate, foreign, legacy], [activity], context);
    expect(merged.map(item => item.hash)).toEqual([activity.hash.toLowerCase(), legacy.hash]);
  });

  it('retains new activity within the 50-row limit and excludes foreign contexts', () => {
    const stored = Array.from({ length: ACTIVITY_LIMIT }, (_, index) => ({
      ...activity, operationId: `stored${index}`, hash: `0x${(index + 1).toString(16).padStart(64, '0')}` as `0x${string}`,
    }));
    const foreign = { ...activity, hash: `0x${'f'.repeat(64)}` as `0x${string}`, coreAddress: '0x3333333333333333333333333333333333333333' as `0x${string}` };
    const merged = mergeCurrentActivity([...stored, foreign], [activity], context);
    expect(merged).toHaveLength(ACTIVITY_LIMIT);
    expect(merged[0].hash).toBe(activity.hash.toLowerCase());
    expect(merged.some(item => item.hash === foreign.hash)).toBe(false);
    expect(merged.some(item => item.hash === stored[ACTIVITY_LIMIT - 2].hash)).toBe(true);
    expect(merged.some(item => item.hash === stored[ACTIVITY_LIMIT - 1].hash)).toBe(false);
  });

  it('shows critical read failure during optional refresh without hiding it for initial load or healthy data', () => {
    expect(hasCriticalReadWarning(snapshot())).toBe(false);
    expect(hasCriticalReadWarning(snapshot({ refreshing: true, chain: { data: null, status: 'error', error: new Error('no chain') } }))).toBe(true);
    expect(hasCriticalReadWarning(snapshot({ refreshing: false, publicVerified: true, chain: { data: null, status: 'ready', error: null }, time: { data: 1, status: 'ready', error: null }, pot: { data: null, status: 'ready', error: null } }))).toBe(false);
    expect(hasCriticalReadWarning(snapshot({ refreshing: false, chain: { data: null, status: 'error', error: new Error('no chain') } }))).toBe(true);
  });

  it('presents post-confirm refresh notice as a read warning with retry, not a failed payment', async () => {
    const html = renderToStaticMarkup(createElement(PublicRefreshWarning, { locale: 'en', onRefresh: vi.fn() }));
    expect(html).toContain('role="status"');
    expect(html).not.toContain('role="alert"');
    expect(html).toContain(messages.en.publicDataWarningHelp);
    expect(html).toContain(messages.en.refresh);
    const failure = new Error('still unavailable');
    const unverified = snapshot({ refreshing: true, chain: { data: null, status: 'error', error: failure }, time: { data: 1, status: 'ready', error: null }, pot: { data: null, status: 'error', error: failure } });
    expect(publicReadWarningAfterReceiptRefresh(unverified, false)).toBeNull();
    expect(publicReadWarningAfterReceiptRefresh(unverified, true)?.warning).toBe(failure);
    const verified = snapshot({ refreshing: true, publicVerified: true, chain: { data: null, status: 'ready', error: null }, time: { data: 1, status: 'ready', error: null }, pot: { data: null, status: 'ready', error: null } });
    expect(publicReadWarningAfterReceiptRefresh(verified, true)?.warning).toBeNull();
    expect(publicReadWarningAfterReceiptRefresh(snapshot(), true)).toBeNull();
  });

  it('renders only one personal entitlement action and uses the zero-attendance refund copy', () => {
    const html = renderToStaticMarkup(createElement(PersonalEntitlementAction, { amount: '10.00', noAttendance: true, disabled: false, locale: 'en', onClaim: vi.fn() }));
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html).toContain(messages.en.refund);
    expect(html).toContain('10.00');
  });

  it('keeps review submission on one native form-submit path', () => {
    const html = renderToStaticMarkup(createElement(ReviewSubmitButton, { disabled: false, label: messages.en.review }));
    expect(html).toContain('type="submit"');
    expect(html).toContain(messages.en.review);
    expect(html).not.toContain('onClick');
  });

  it('renders an accessible mobile desk jump and a directly targetable QR entry', () => {
    const jump = renderToStaticMarkup(createElement(MobileDeskJump, { label: messages.en.jumpToQr, onActivate: vi.fn() }));
    const entry = renderToStaticMarkup(createElement(CheckInQrEntry, { label: messages.en.qrInput, safetyCopy: messages.en.qrNoPresence, value: '', onInput: vi.fn() }));
    expect(jump).toContain('type="button"');
    expect(jump).toContain('aria-controls="checkin-qr-entry"');
    expect(jump).toContain(messages.en.jumpToQr);
    expect(entry).toContain('id="checkin-qr-entry"');
    expect(entry).toContain('aria-label="Participant QR contents"');
    expect(entry).toContain('placeholder=');
  });

  it('focuses and scrolls the QR entry while honoring reduced-motion preferences', () => {
    const target = { focus: vi.fn(), scrollIntoView: vi.fn() };
    focusCheckInQrEntry(target, false);
    expect(target.focus).toHaveBeenCalledOnce();
    expect(target.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
    focusCheckInQrEntry(target, true);
    expect(target.scrollIntoView).toHaveBeenLastCalledWith({ behavior: 'auto', block: 'center' });
  });

  it('provides the wallet-free proof link copy in both locales without claiming live proof', () => {
    expect(messages.en.walletFreeProof).toContain('not live proof');
    expect(messages.vi.walletFreeProof).toContain('không phải bằng chứng trực tiếp');
  });
});
