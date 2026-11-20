import { describe, expect, it } from 'vitest';
import { localizeError, messages, type Locale, type MessageKey } from '../../src/i18n/messages';

describe('CommitPot EN/VI disclosures and recovery copy', () => {
  it('keeps every application message available in both locales', () => {
    expect(Object.keys(messages.en).sort()).toEqual(Object.keys(messages.vi).sort());
    const key: MessageKey = 'statusUnavailable';
    const localized: Record<Locale, string> = { en: messages.en[key], vi: messages.vi[key] };
    expect(localized.en).toBeTruthy();
    expect(localized.vi).toBeTruthy();
  });

  it('discloses voluntary participation, loss rules, and verifier limits before deposit', () => {
    for (const locale of [messages.en, messages.vi]) {
      expect(locale.preDeposit.length).toBeGreaterThan(80);
      expect(locale.feeHelp).toContain('Test USDC');
      expect(locale.feeHelp).toContain('AVAX');
    }
    expect(messages.en.preDeposit).toContain('Joining is voluntary');
    expect(messages.en.preDeposit).toContain('lose their entire deposit');
    expect(messages.en.preDeposit).toContain('no cancellation');
    expect(messages.vi.preDeposit).toContain('Tham gia là tự nguyện');
    expect(messages.vi.preDeposit).toContain('mất toàn bộ tiền cọc');
  });

  it('distinguishes finalization from payout settlement and QR identity from presence/ownership', () => {
    expect(messages.en.finalizedPhase).toBe('Results finalized');
    expect(messages.en.qrHelp).toContain('not physical presence or wallet ownership');
    expect(messages.vi.qrHelp).toContain('không chứng minh sự hiện diện ngoài đời hoặc quyền sở hữu ví');
  });

  it('localizes wallet, RPC, native-gas and unknown-submission states with safe next steps', () => {
    expect(localizeError({ code: 'WALLET_UNAVAILABLE' }, 'en')).toContain('Continue browsing');
    expect(localizeError({ code: 'RPC_UNAVAILABLE' }, 'vi')).toContain('thử lại');
    expect(localizeError({ code: 'INSUFFICIENT_GAS' }, 'en')).toContain('AVAX');
    expect(localizeError({ code: 'SUBMISSION_UNKNOWN' }, 'en')).toContain('Reconcile before trying again');
    expect(localizeError({ code: 'CONFIRMATION_UNAVAILABLE' }, 'vi')).toContain('trước khi thử lại');
  });
});
