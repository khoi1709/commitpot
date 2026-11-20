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

On the provisioned Windows runner, use the checked-in CI commands (PowerShell 5.1 plus Node.js 22, pnpm 11.25.0, and the pinned offline Foundry toolchain):

```powershell
pnpm.cmd test:contracts
pnpm.cmd test:integration
```

`test:contracts` force-builds offline, compares the freshly generated ABI, and runs the discovered unit, failure, and invariant suites. `test:integration` first refuses an existing listener on 127.0.0.1:18545, then owns and cleans its Anvil/Vitest processes and restores `COMMITPOT_LOCAL_RPC`. These commands need the preprovisioned dependencies, Foundry and fixture sources; they do not download or install tools. Current-candidate results must be recorded by the run that produced them; historical reports below are not current acceptance. The manual hosted workflow intentionally stops at its isolated-runner provisioning gate before checkout; hosted checks are not green. These reproducible local scripts are the available development gate, not hosted CI certification.

## Current verification

The latest source-gate results and unfinished browser acceptance are summarized in [current publication and verification status](<docs/PUBLICATION_STATUS.md>). A GitHub source publication is not a deployment, hosted-CI pass, security audit, or complete product acceptance.

Other useful local commands, when the matching toolchain is available:

```powershell
pnpm.cmd test
pnpm.cmd typecheck
pnpm.cmd build
```

Contract toolchain is pinned to Solidity 0.8.24 / Paris and uses OpenZeppelin 5.0.2 plus forge-std 1.9.7. A verified project-local Foundry 1.9.0 is available on this machine, not committed or globally installed:

```powershell
.\scripts\tooling\setup-contracts.ps1
& .\.tools\foundry\forge.exe test --root packages/contracts -vv
node scripts/abi/export.mjs
```

The ABI export reads the real compiler artifact. It is not a handwritten interface.

## Real local-chain verification

Use only the owned disposable loopback runner, never a public RPC or a real user wallet:

```powershell
pnpm.cmd test:integration
```

The runner refuses to adopt a pre-existing listener and binds only its own Anvil on 127.0.0.1:18545 / chain 31337. It freshly compiles contracts offline, compares the compiler ABI, requires exactly the named integration case, and runs it with a process timeout. Output goes to a uniquely named `scratch/` run directory. It restores `COMMITPOT_LOCAL_RPC` and checks listener cleanup. The test deploys a chain-ID-restricted mock token and contracts, uses synthetic local wallets and real local EIP-712 transactions; no private key enters the public client.

The saved browser-to-Anvil test is a historical fixture whose configuration is pinned to 127.0.0.1:8545; it is not the current 18545 runner or the same Anvil process. Its test-only injected wallet provider and fixture remain confined to test files, never the app. See the verification record and demo evidence ledger for the exact historical scope.

The wallet-free proof page at `/verify` is read-only. An unconfigured deployment is shown as unconfigured; when a manifest is configured, the page compares it with observed deployment identity and displays configured receipt-reference status. A configured manifest comparison is not a rebuild or source/runtime parity certificate. A matching configured deployment is not a formal audit.

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
- [Windows offline CI and exact local runner](<.github/workflows/windows.yml>)
- [Pitch, narration, and proposed consent protocol](<docs/demo/README.md>)
- [Development verification findings](<docs/reviews/EXECUTION_FINDINGS.md>)
- [Preserved original technical specification](<docs/sources/TECHSPEC.md>)

The public source repository already existed at the historical baseline. This source publication does not publish a deployment or hosted service; no Fuji/mainnet operation, hosting, or hackathon submission is authorized or implied. The Ares project and original downloads remain unchanged.
