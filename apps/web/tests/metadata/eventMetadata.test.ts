import { describe, expect, it, vi } from 'vitest';
import demo from '../../public/demo-event.json';
import { MAX_UINT256 } from '../../src/domain/amounts';
import {
  bindEventMetadata,
  eventMetadataSchema,
  loadEventMetadata,
  type EventMetadataContext,
} from '../../src/domain/eventMetadata';

const context: EventMetadataContext = {
  chainId: 31337,
  coreAddress: '0x0000000000000000000000000000000000002000',
};
const fixture = () => structuredClone(demo);

function withText(value: string, field: 'title' | 'description' = 'title') {
  const data = fixture();
  data.locales.en[field] = value;
  return data;
}

describe('local fictional metadata loading', () => {
  it('loads both curated translations and JSON text without mutating its source', () => {
    const source = fixture();
    const before = structuredClone(source);
    const loaded = loadEventMetadata(source);
    expect(loaded).toEqual(before);
    expect(loadEventMetadata(JSON.stringify(source))).toEqual(loaded);
    expect(source).toEqual(before);
    expect(loaded).not.toBe(source);
    expect(Object.isFrozen(loaded)).toBe(true);
    expect(Object.isFrozen(loaded?.locales)).toBe(true);
    expect(Object.isFrozen(loaded?.locales.en)).toBe(true);
    expect(Object.isFrozen(loaded?.locales.vi)).toBe(true);
    source.locales.en.title = 'Changed source';
    expect(loaded?.locales.en.title).toBe('Campus workshop attendance demo');
  });

  it.each([undefined, null, '', '{', 'null', '[]', [], true, 1, ' '.repeat(8193)])(
    'returns null for missing, malformed or oversized data (%j)', source => {
      expect(loadEventMetadata(source)).toBeNull();
    },
  );

  it.each([
    { version: 2 }, { kind: 'pilot' }, { chainId: 0 }, { chainId: -1 }, { chainId: 1.5 },
    { chainId: '31337' }, { chainId: Number.MAX_SAFE_INTEGER + 1 }, { chainId: NaN },
    { chainId: Infinity }, { coreAddress: '0x' }, { coreAddress: '0x' + '0'.repeat(40) },
    { coreAddress: '0x' + 'g'.repeat(40) }, { coreAddress: '0x' + '1'.repeat(39) },
    { coreAddress: '0x' + '1'.repeat(41) }, { coreAddress: ' 0x' + '1'.repeat(40) },
    { coreAddress: context.coreAddress + '\n' },
    { potId: '0' }, { potId: '01' }, { potId: '+1' }, { potId: '1.0' }, { potId: '1e2' },
    { potId: '-1' }, { potId: ' 1' }, { potId: '1 ' }, { potId: '1\n' }, { potId: 1 },
    { potId: '1'.repeat(79) }, { potId: String(MAX_UINT256 + 1n) },
  ])('rejects invalid identity or schema discriminator %j', patch => {
    expect(loadEventMetadata({ ...fixture(), ...patch })).toBeNull();
  });

  it('accepts safe chain and uint256 endpoints', () => {
    expect(loadEventMetadata({ ...fixture(), chainId: 1, potId: '1' })).not.toBeNull();
    expect(loadEventMetadata({ ...fixture(), chainId: Number.MAX_SAFE_INTEGER, potId: String(MAX_UINT256) })).not.toBeNull();
  });

  it('requires exactly the EN and VI languages and exact text fields', () => {
    for (const locales of [
      { en: demo.locales.en }, { vi: demo.locales.vi },
      { ...demo.locales, fr: demo.locales.en }, { ...demo.locales, EN: demo.locales.en },
      { ...demo.locales, en: null }, { ...demo.locales, en: { title: 'Demo' } },
      { ...demo.locales, en: { ...demo.locales.en, url: 'https://example.invalid' } },
    ]) expect(loadEventMetadata({ ...fixture(), locales })).toBeNull();
    expect(loadEventMetadata({ ...fixture(), locales: null })).toBeNull();
  });

  it.each([
    'token', 'stakeAmount', 'registrationClose', 'checkInOpen', 'checkInClose',
    'payoutPerWinner', 'claimable', 'participantCount', 'status', 'verifier', 'owner',
    'organizer', 'person', 'email', 'privateVenue', 'url', 'image',
  ])('rejects unknown field %s rather than accepting financial or private-data channels', key => {
    expect(loadEventMetadata({ ...fixture(), [key]: 'Not part of the format' })).toBeNull();
  });

  it('rejects missing fields, inherited data, accessor properties and unknown symbol fields', () => {
    const missing: Record<string, unknown> = fixture();
    delete missing.potId;
    expect(loadEventMetadata(missing)).toBeNull();
    expect(loadEventMetadata(Object.create(demo))).toBeNull();
    const getter = vi.fn(() => 31337);
    const accessor = Object.defineProperty(fixture(), 'chainId', { get: getter });
    expect(loadEventMetadata(accessor)).toBeNull();
    expect(getter).not.toHaveBeenCalled();
    expect(loadEventMetadata({ ...fixture(), [Symbol('unknown')]: true })).toBeNull();
    expect(loadEventMetadata(JSON.parse(JSON.stringify(demo).replace('"version":1', '"__proto__":{},"version":1')))).toBeNull();
  });

  it('bounds text by Unicode code points and retains Vietnamese diacritics', () => {
    expect(loadEventMetadata(withText('A'.repeat(80)))).not.toBeNull();
    expect(loadEventMetadata(withText('A'.repeat(81)))).toBeNull();
    expect(loadEventMetadata(withText('A'.repeat(360), 'description'))).not.toBeNull();
    expect(loadEventMetadata(withText('A'.repeat(361), 'description'))).toBeNull();
    expect(loadEventMetadata(withText('𝒜'.repeat(80)))).not.toBeNull();
    expect(loadEventMetadata(withText('𝒜'.repeat(81)))).toBeNull();
    expect(loadEventMetadata(demo)?.locales.vi).toEqual(demo.locales.vi);
  });

  it.each([
    '', ' ', ' Demo', 'Demo ', 'Demo\n', '\nDemo', 'A\tB', 'A\0B', 'A\u202eB',
    'A\u200bB', '<script>alert(1)</script>', '<img src=x onerror=alert(1)>',
    'https://example.invalid', '//example.invalid', 'javascript:alert(1)',
    'data:text/html;base64,AAAA', 'www.example.invalid', 'WWW.example.invalid',
    '[link](https://example.invalid)', 'mailto:demo@example.invalid', 'C:\\private',
    '&#60;script&#62;',
  ])('rejects blank, unsafe markup, URL and control syntax (%j)', text => {
    expect(loadEventMetadata(withText(text))).toBeNull();
    expect(loadEventMetadata(withText(text, 'description'))).toBeNull();
  });

  it('publishes closed JSON Schema with the same narrative patterns and limits', () => {
    const schema = eventMetadataSchema;
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(['version', 'kind', 'chainId', 'coreAddress', 'potId', 'locales']);
    expect(schema.properties.chainId).toEqual({ type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER });
    expect(schema.properties.locales.required).toEqual(['en', 'vi']);
    expect(schema.properties.locales.additionalProperties).toBe(false);
    expect(schema.properties.locales.properties.en.additionalProperties).toBe(false);
    expect(schema.properties.locales.properties.en.properties.title.maxLength).toBe(80);
    expect(schema.properties.locales.properties.vi.properties.description.maxLength).toBe(360);
    const textPattern = new RegExp(schema.properties.locales.properties.en.properties.title.pattern, 'u');
    for (const value of ['Title\n', '<b>Title</b>', 'https://example.invalid', 'www.example.invalid']) {
      expect(textPattern.test(value)).toBe(false);
    }
    expect(textPattern.test(demo.locales.vi.title)).toBe(true);
    expect(new RegExp(schema.properties.coreAddress.pattern).test(context.coreAddress)).toBe(true);
    expect(new RegExp(schema.properties.coreAddress.pattern).test('0x' + '0'.repeat(40))).toBe(false);
    expect(new RegExp(schema.properties.coreAddress.pattern).test(context.coreAddress + '\n')).toBe(false);
    expect(new RegExp(schema.properties.potId.pattern).test('01')).toBe(false);
    expect(new RegExp(schema.properties.potId.pattern).test('1\n')).toBe(false);
  });

  it('does not claim automatic PII detection: permitted prose still needs editorial curation', () => {
    // Intentionally fictional prose. Syntax validation cannot know whether a name is a real person.
    expect(loadEventMetadata(withText('A fictional attendee named Example'))).not.toBeNull();
    expect(demo.locales.en.description).toContain('no real pilot, person or private venue');
    expect(demo.locales.vi.description).toContain('cá nhân hay địa điểm riêng tư');
  });

  it('never fetches a URL or any other metadata source', () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    try {
      expect(loadEventMetadata('https://example.invalid/demo.json')).toBeNull();
      expect(loadEventMetadata(demo)).not.toBeNull();
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('chain / core / pot binding', () => {
  it('matches the complete tuple, including bigint target IDs', () => {
    expect(bindEventMetadata(demo, context, 1n)).toEqual(loadEventMetadata(demo));
    expect(bindEventMetadata(demo, context, '1')).toEqual(loadEventMetadata(demo));
    const core = '0xaB00000000000000000000000000000000002000';
    const source = { ...fixture(), coreAddress: core };
    expect(bindEventMetadata(source, { ...context, coreAddress: core.toLowerCase() as `0x${string}` }, 1n)?.coreAddress).toBe(core.toLowerCase());
  });

  it.each([
    [null, '1'], [{ ...context, chainId: 43113 }, '1'],
    [{ ...context, coreAddress: '0x0000000000000000000000000000000000002001' }, '1'],
    [{ ...context, coreAddress: '0x0' }, '1'], [{ ...context, chainId: -1 }, '1'],
    [{ ...context, coreAddress: context.coreAddress + '\n' }, '1'],
    [context, '2'], [context, 2n], [context, '01'], [context, '1\n'], [context, 0n], [context, MAX_UINT256 + 1n],
  ])('rejects absent, invalid or mismatched target context %j / %s', (target, id) => {
    expect(bindEventMetadata(demo, target as EventMetadataContext | null, id as string | bigint)).toBeNull();
  });

  it('never changes chain context or accepts financial authority from metadata', () => {
    const chainState = Object.freeze({ ...context, token: '0x0000000000000000000000000000000000001000', mode: 'mock' });
    const loaded = bindEventMetadata(demo, chainState, '1');
    expect(chainState.token).toBe('0x0000000000000000000000000000000000001000');
    expect(loaded).not.toHaveProperty('token');
    expect(loaded).not.toHaveProperty('stakeAmount');
    expect(loaded).not.toHaveProperty('checkInClose');
    expect(bindEventMetadata({ ...fixture(), stakeAmount: '1' }, chainState, '1')).toBeNull();
    expect(bindEventMetadata(undefined, chainState, '1')).toBeNull();
  });
});
