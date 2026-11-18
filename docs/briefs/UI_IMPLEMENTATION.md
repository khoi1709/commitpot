# Bilingual application implementation — pending source assignment

Human requested **both English and Vietnamese** language options and delegated visual choice/build. Source ownership will be assigned to one worker after actual domain API and UX preparation are available; this file does not duplicate an active maker assignment.

## Outcome

One coherent working app: entry/create/share, participant approve/deposit and personal QR, verifier scan/paste/attest/sign/submit, finalization and beneficiary claim with exact confirmed receipt evidence. Use actual domain+mock ports, later switch configured adapter, never fake successful on-chain actions. No marketing detour or analytics.

## Scope and consumption

Assigned worker will own apps/web/src/{app,application,presentation,i18n}/ and tests/ui only. No domain/mock/avalanche/QR codec/schema/generated ABI/manifest edits. Read docs/DOMAIN_API.md and its actual exports before writing imports. Dedicated QR worker publishes codec API, not UI duplicate validators. Bootstrap handles Next config/deps. Read docs/UX_DIRECTION.md when ready, follow source-grounded framework versions.

## Bilingual boundary

A small typed English/Vietnamese message dictionary is sufficient, no i18n framework install. One language control visible on desktop/phone; persist only preference, set document lang, localize all visible task labels, status/error messages, confirmation summaries, token/refund/trust disclosures, date/time formatting. Preserve addresses, hashes, token symbols and exact numbers. Critical financial translations must have the same meaning. Do not duplicate business state/rules per language. Test switching without losing wallet/pot state or pending transaction context.

## Concrete acceptance

- Read pot without wallet; nonexistent pot clear not blank. Create form validates ordered explicit-zone timestamps/positive exact stake/verifier and reviews immutable rules.
- Join requires allowance/approve then confirmed join, prevents double-click, correct funds/gas/error states. No funds or wallet required in labelled mock mode; synthetic accounts clearly distinct and displayable.
- Participant QR uses published codec; displays copyable identifier payload and explains not proof of attendance or ownership.
- Verifier confirms active wallet matches pot verifier, scan/manual parse scope, explicit physical attestation, actual signature and receipt; repeat/wrongpot/expired/userrejected cases and camera cleanup. BarcodeDetector optional not sole support; manual input always works.
- Chain timestamps determine phases, UI clock informative. Zero attendance refund, no-show ineligibility, true dust and remaining claims visible. Finalize not auto payout. A claim forwarded for another wallet always shows destination beneficiary.
- Money uses shared bigint parse/format, exact six decimals when dust requires it. Payout estimate label if attendance closed now; no guaranteed yield or misleading always-rising estimate.
- Persist/reconcile pending operation intent/hash through shared hook, outcomeunknown if nohash, no blind resend or real-to-mock fallback.
- Real loading/error/empty states, keyboard focus/labels/reducedmotion/noncolor statuses, 44px targets, 390px/lowheight and desktop layouts.
- No literal translations silently dropped, no debug controls in real mode, no custom private-key imports, no invented token/explorer data.

## Done report

Exact source files, actual test/build commands/results, rendered evidence if assigned, outstanding dependencies and explicit scope closure. No completion from prose or compilation alone. Worker must load Impeccable/craftfloor before UI edits, use the new project's context, and preserve delegated visual contract. Final independent finish review uses actual screenshots and source identity.
