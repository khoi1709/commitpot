# CommitPot

An attendance commitment fund: fixed deposits, accountable human check-in, immutable payout rules. Built with Solidity/Foundry and a bilingual English/Vietnamese Next.js interface.

**Test tokens only. No real money.** The contract enforces financial rules; a named verifier remains trusted to confirm attendance. A QR identifies a wallet/pot, not physical presence or ownership. No admin withdrawal, mutable pot settings, yield, proprietary token, or claim of a formal security audit.

## Run the local demonstration

Requirements: Node 22+, pnpm 11.25.0. Install project-local dependencies, then start the app:

```powershell
pnpm install --ignore-scripts
Copy-Item apps/web/.env.example apps/web/.env.local
pnpm dev
```

Open **http://localhost:3100**. The default interface is clearly labelled **Local demonstration** with synthetic accounts and receipts, not a Fuji deployment. Choose EN/VI in the header. Load the five-person example to create five actual mock deposits, or create a custom pot. Demo wallets and phase controls are restricted to mock mode.

For the standard example: move to check-in, select the verifier wallet, open the check-in desk, enter each participant's personal QR contents, attest physical presence, sign/record four participants, move past check-in, finalize, then select each eligible participant and claim 12.5 Test USDC. The fifth wallet is ineligible. If nobody checks in, joined participants reclaim their original deposit.

## Development checks

```powershell
pnpm test
pnpm typecheck
pnpm build
```

Contract toolchain is pinned to Solidity 0.8.24 / Paris and uses OpenZeppelin 5.0.2 plus forge-std 1.9.7. A verified project-local Foundry 1.9.0 is available on this machine, not committed or globally installed:

```powershell
.\scripts\tooling\setup-contracts.ps1
& .\.tools\foundry\forge.exe test --root packages/contracts -vv
node scripts/abi/export.mjs
```

The ABI export reads the real compiler artifact. It is not a handwritten interface.

## Real local-chain verification

Use only a disposable loopback Anvil node, never a public RPC or a real user wallet:

```powershell
& .\.tools\foundry\anvil.exe --host 127.0.0.1 --port 8545 --chain-id 31337 --silent
pnpm --filter @commitpot/web exec vitest run --config vitest.integration.config.ts
```

The local integration deploys a chain-ID-restricted mock token and core/helper/strategy contracts, uses five distinct local wallets, signs actual EIP-712 proofs, records four check-ins and reconciles all four 12.5 payouts and a zero residual. It also compares viem/contract digests and rejects cross-core proof reuse. Test wallets are RPC-provided synthetic accounts; no private key enters the public client.

A separate browser test drives the real UI with a test-only injected wallet provider forwarding to that same loopback node. The fixture/provider is in test files only, never part of the app. See the verification record for the executed scope.

## On-chain configuration

Copy [the example environment](<apps/web/.env.example>) only when you have a real deployment and wallet. Set `NEXT_PUBLIC_USE_MOCK=false`, an explicit `local` or `fuji` mode, the chain ID, public RPC, core and supported token addresses. Configuration is validated against chain/code/token decimals. A failure **never silently falls back to mock**. Fuji broadcasts and public hosting have not been authorized or performed.

- Local test: chain 31337 and loopback RPC only.
- Intended Fuji: chain 43113 with HTTPS RPC and a separately verified Test USDC contract.
- Never put a private key or seed phrase in `NEXT_PUBLIC_*` or client code.
- Camera scanning requires a supported secure context; manual QR contents input is always available. Scanning alone does not attest attendance.
- Wrong-chain/user-rejected/pending/reverted/unknown outcomes are distinct. A returned transaction hash is not a confirmed result. Check the receipt before retrying.

## Rules and limits

Registration closes before check-in begins. Check-in endpoints are inclusive; finalization requires a later timestamp. Only confirmed attendees claim when there is at least one valid check-in. Integer dust goes to earliest check-in orders, one base unit each. All calculations use bigint/base units. Per-pot recorded deposits—not the global token balance—determine entitlements; unsolicited transfers may remain locked.

No cancellation, verifier replacement, disputes, payout expiry, or unclaimed-fund sweep. Lost verifier after partial check-in can disadvantage others. Test USDC remains subject to issuer pause/blacklist behavior. EOA/ERC-1271 validation does not by itself implement a Safe multisig collection interface; organizer multisig requirements remain unconfirmed.

## Documentation

- [Active technical execution contract](<docs/EXECUTION_CONTRACT.md>)
- [Domain interface](<docs/DOMAIN_API.md>)
- [Contract interface](<docs/CONTRACT_API.md>)
- [Current execution state](<docs/STATE.md>)
- [Local readiness and verification evidence](<output/verification/LOCAL_READINESS.md>)
- [Observed interface design system](<apps/web/DESIGN.md>)
- [Development verification findings](<docs/reviews/EXECUTION_FINDINGS.md>)
- [Preserved original technical specification](<docs/sources/TECHSPEC.md>)

The Ares project and original downloads remain unchanged. No Git publication, hosting, mainnet operation or hackathon submission is implied by local completion.
