import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import demo from '../../public/demo-event.json';
import { EventBrief, type EventBriefProps } from '../../src/presentation/EventBrief';

const context = { chainId: 31337, coreAddress: '0x0000000000000000000000000000000000002000' as const };
const render = (props: Partial<EventBriefProps> = {}) => renderToStaticMarkup(createElement(EventBrief, {
  context, potId: 1n, metadata: demo, ...props,
}));

// Server markup assertions only. These do not certify browser layout or accessibility.
describe('EventBrief', () => {
  it('shows native heading, exact ID and fixed non-authoritative disclosure in English', () => {
    const html = render();
    expect(html).toMatch(/^<section[^>]*lang="en">/);
    expect(html).toMatch(/<h2[^>]*>Campus workshop attendance demo<\/h2>/);
    expect(html).toContain('Pot #1');
    expect(html).toContain('Fictional demo, not a real pilot.');
    expect(html).toContain('No real person or private venue is represented.');
    expect(html).toContain('not proof of ownership or attendance');
    expect(html).toContain('Amounts, token and deadlines come from chain state');
    expect(html).not.toMatch(/<(a|button|input|img|script|iframe)\b/);
    expect(html).not.toMatch(/role="(status|alert)"/);
  });

  it('renders Vietnamese text and native h3 when nested under an existing heading', () => {
    const html = render({ locale: 'vi', headingLevel: 3 });
    expect(html).toMatch(/^<section[^>]*lang="vi">/);
    expect(html).toMatch(/<h3[^>]*>Minh họa điểm danh buổi học trong trường<\/h3>/);
    expect(html).toContain('Quỹ #1');
    expect(html).toContain('không phải thí điểm thực tế');
    expect(html).toContain('không chứng minh quyền sở hữu hay sự hiện diện');
    expect(html).not.toContain(demo.locales.en.title);
  });

  it.each([
    { metadata: undefined }, { metadata: null }, { metadata: '{' }, { context: null },
    { context: { ...context, chainId: 43113 } },
    { context: { ...context, coreAddress: '0x0000000000000000000000000000000000002001' as const } },
    { metadata: { ...demo, potId: '2' } }, { metadata: { ...demo, token: 'fake-token' } },
  ])('uses only plain pot identity when context is unavailable, invalid or mismatched (%j)', props => {
    const html = render(props);
    expect(html).toMatch(/^<h2[^>]*lang="en">Pot #1<\/h2>$/);
    expect(html).not.toContain(demo.locales.en.title);
    expect(html).not.toContain('Fictional demo');
  });

  it('rebinds for every target instead of carrying a previous title into the next pot', () => {
    expect(render()).toContain(demo.locales.en.title);
    expect(render({ potId: 2n })).toMatch(/^<h2[^>]*>Pot #2<\/h2>$/);
    expect(render({ context: { ...context, chainId: 43113 } })).not.toContain(demo.locales.en.title);
  });

  it('uses the localized ID fallback, not the rejected metadata title', () => {
    expect(render({ locale: 'vi', metadata: undefined, headingLevel: 3 })).toMatch(/^<h3[^>]*lang="vi">Quỹ #1<\/h3>$/);
  });

  it.each(['01', '1\n', '0', -1n, '<script>alert(1)</script>'])('never echoes an invalid target ID %s', potId => {
    expect(render({ potId })).toMatch(/^<h2[^>]*lang="en">Pot<\/h2>$/);
  });

  it('uses React text nodes and never renders HTML or URL-bearing metadata', () => {
    const data = structuredClone(demo);
    data.locales.en.title = "A fictional 'workshop'";
    expect(render({ metadata: data })).toContain('A fictional &#x27;workshop&#x27;');
    data.locales.en.title = '<img src=x onerror=alert(1)>';
    expect(render({ metadata: data })).toMatch(/^<h2[^>]*>Pot #1<\/h2>$/);
    data.locales.en.title = 'https://example.invalid';
    expect(render({ metadata: data })).toMatch(/^<h2[^>]*>Pot #1<\/h2>$/);
  });
});
