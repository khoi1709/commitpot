# Event metadata API — assignment 006

## Boundary

Optional event context is **curated fictional copy**, not chain state, a real pilot, an organizer endorsement, ownership evidence or attendance proof. The shipped example contains no person or private-venue data. Validation checks structure and text safety, **not whether arbitrary prose contains PII or is true**; editorial review is required. Do not feed uploads, wallet profiles or remote/private metadata into this API.

The fixture is keyed only to chain `31337`, core `0x0000000000000000000000000000000000002000`, pot `"1"`, matching the existing mock identity. Matching that tuple does not prove a pot exists. First obtain a pot from the repository, then bind context. Never rewrite the fixture's key to fit a different pot, deployment or network.

## Imports and exact API

Import directly; the shared domain barrel is intentionally unchanged:

```ts
import {
  eventMetadataSchema,
  loadEventMetadata,
  bindEventMetadata,
  type EventMetadata,
  type EventMetadataContext,
  type EventMetadataLocale,
} from '@/domain/eventMetadata';
import { EventBrief, type EventBriefProps } from '@/presentation/EventBrief';
```

```ts
type EventMetadataLocale = 'en' | 'vi';
type EventMetadataContext = Pick<ChainContext, 'chainId' | 'coreAddress'>;

interface EventMetadataText {
  readonly title: string;
  readonly description: string;
}
interface EventMetadata {
  readonly version: 1;
  readonly kind: 'fictional-demo';
  readonly chainId: number;
  readonly coreAddress: Address;
  readonly potId: string;
  readonly locales: Readonly<Record<EventMetadataLocale, EventMetadataText>>;
}

loadEventMetadata(source: unknown): EventMetadata | null;
bindEventMetadata(
  source: unknown,
  context: EventMetadataContext | null,
  potId: bigint | string,
): EventMetadata | null;

interface EventBriefProps {
  metadata?: unknown;
  context: EventMetadataContext | null;
  potId: bigint | string;
  locale?: EventMetadataLocale; // default 'en'
  headingLevel?: 2 | 3;        // default 2; fit the page's native outline
}
```

- `loadEventMetadata` synchronously accepts a parsed JSON object or JSON text. Missing, malformed or invalid input returns `null`; no fetch, storage, wallet, clock or filesystem access. Returned copy is detached and frozen.
- `bindEventMetadata` validates again and returns metadata only for an exact chain/core/pot match. Addresses compare normalized lowercase bytes; pot strings must already be canonical. Missing/invalid context or any mismatch returns `null`. Never treat a matching return as authenticated metadata.
- `EventBrief` binds on every render, including after network/pot changes. Invalid, missing or mismatched metadata renders only a plain `Pot #<id>` / `Quỹ #<id>` heading. An invalid target pot ID renders `Pot` / `Quỹ`, not input text. Valid context renders the title, plain description, pot ID and fixed EN/VI fictional/non-authority notices. No financial or timing props exist.

## Local integration for 004 / 005

Use a **static import**, not a request to a metadata service. From a module in `apps/web/src/presentation`:

```tsx
import demoEvent from '../../public/demo-event.json';
import { EventBrief } from './EventBrief';

// context is repository.getChainContext(); pot is repository.getPot(id).
// Limit this particular curated fixture to the mock demonstration.
<EventBrief
  metadata={context.mode === 'mock' ? demoEvent : undefined}
  context={context}
  potId={pot.id}
  locale={locale}
  headingLevel={2}
/>
```

Use it in place of the plain pot heading, or set `headingLevel={3}` beneath an existing event heading. Do not duplicate headings. The component inherits the existing Be Vietnam Pro font and `--ink`, `--muted`, `--line` palette tokens through its CSS module. It has no controls, links, assets, effect or live region. Its own `lang` matches the selected EN/VI copy.

Amounts, token identity, registration/check-in times, verifier address, balances, phase and entitlements **must continue to come exclusively from repository/chain data** (or explicitly labelled mock state). Never spread metadata into `PotSummary`, `PotConfig`, `TokenInfo`, a transaction intent or a chain context. The binder reads but never mutates the supplied chain context.

## Schema and rejection policy

`eventMetadataSchema` is an exported JSON Schema (draft 2020-12). Its closed objects admit exactly the fields above, both `en` and `vi`, and no other language. The runtime loader enforces this concrete schema plus the uint256 upper bound for a decimal-string pot ID using the existing domain parser.

| Input | Accepted rule |
| --- | --- |
| Version / kind | Exactly `1` / `fictional-demo` |
| Chain ID | Positive safe integer (`1` to `9007199254740991`) |
| Core address | Nonzero `0x` plus exactly 40 hexadecimal digits |
| Pot ID | Canonical positive decimal string, 1–78 digits, no leading zero, at most uint256 |
| Title / description | 1–80 / 1–360 Unicode code points, no surrounding whitespace |
| Narrative characters | Letters, combining marks, numbers, spaces and limited ordinary punctuation only |
| Languages | Exactly `en` and `vi`, both required |
| JSON text | At most 8192 UTF-16 code units before parsing |

Unknown fields at every level are rejected, including otherwise well-formed URL, venue, contact, organizer, token, amount or deadline fields. Narrative fields cannot contain markup, slashes, colons, backslashes, `@`, control characters or URL schemes; `www.` host prefixes are rejected too. Text is rendered through React text nodes, never HTML, Markdown or autolinks. This deliberately small plain-text format is not a general URL sanitizer or an automatic PII classifier.

## Verification and integration limits

Owned tests and their local-only config live under `apps/web/tests/metadata`. The baseline root Vitest include does not include that directory; manifest/config owner 007 should include these tests when integrating. No shared files, App wiring, chain adapters, global CSS, i18n registry, dependencies or backends are changed by 006. Local test results and remaining integration/visual checks are recorded in the assignment report.
