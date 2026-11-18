# Current mock application integration boundary

Mock implementer607 owns infrastructure/mock and its tests only. Its exact stable UI surface:

- `createMockPotEnvironment(options?)` returns `{repository,wallet:repository,clock,accounts,verifier}`.
- Repository implements IPotRepository and IWalletPort, plus **mock-only** setAccount(address|null).
- clock.now()/set()/advance() are injected controlled local demonstration time, not on-chain time manipulation.
- Token/chain/accounts/verifier constants clearly labelled synthetic; never a Fuji token claim.
- Runtime is created client-side after mount with optional browser storage, no localStorage at import. Corrupt/future storage is surfaced and preserved until explicit reset.
- UI must waitForTransaction for writes, inspect failure/success, extract createdPotId, then refresh reads. Money/counts/potIDs bigint; timestamps integer seconds. Locale switch preserves this runtime.

The UI can first ship a complete explicitly labelled mock lifecycle, but the overall objective still requires real local-chain integration and independent evidence. Do not claim app complete or verified Fuji from a mock screen. No hidden hardcoded success/rewards or pre-filled transaction hashes. Future actual adapter is separate and does not silently fall back to mock.

UI needs disconnected/read-only view, synthetic wallet switch only in mock, create/deposit/QR/check-in/finalize/claim with exacteligibility and transparenttrust. Unknownbroadcast remains unknown; never blindly retry. See BILINGUAL_COPY.md for truthful English/Vietnamese terms.
