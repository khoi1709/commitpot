# CommitPot — verification evidence summary

This note summarizes the source-only publication candidate. It is not a release receipt and does not assert that this candidate has been published to GitHub or hosted.

## 1. Local source reproduction and verification

The local candidate was reproduced from recorded baseline [`690797e09c093b370bf6198303efc38f065d153b`](https://github.com/khoi1709/commitpot/commit/690797e09c093b370bf6198303efc38f065d153b) plus exactly these two reviewed browser harnesses; application and contract source were not changed for this candidate:

- [`apps/web/tests/e2e/improvements-browser.mjs`](../apps/web/tests/e2e/improvements-browser.mjs) — SHA-256 `9CF579CAE821CF7271A561FAFA3FB522642A7C763F8EF9491AA15AABF8D7CBEC`.
- [`apps/web/tests/e2e/improvements-controls.mjs`](../apps/web/tests/e2e/improvements-controls.mjs) — SHA-256 `ADD4CE2074445F0F664B9786E24633307196260617FB62E39D63950EE1867863`.

In an isolated local snapshot, the fresh verification results were:

- Web tests: 273 passed; Foundry: 53 passed (35 unit, 15 failure, 3 invariant); offline Solidity compilation: 54 files; generated ABI matched the checked-in ABI.
- TypeScript typecheck passed, and a fresh production build completed successfully.
- Anvil integration: 1/1 passed on local chain 31337. Five synthetic wallets deposited 10 Test USDC each; four checked in and claimed 12.5 each; the isolated pot residual was zero.
- Both browser suites passed against that local production build in isolated Microsoft Edge contexts, using the local mock application. Dependencies were reused from the local offline cache; no hosted CI was run.

The 12.5 Test USDC claims above are local Anvil/mock observations only; they are not Fuji transactions. These development checks are not a formal security audit or evidence about real attendees.

## 2. Fuji testnet deployment and one-account lifecycle

The deployed contract sources match the recorded baseline commit above; application and contract source were unchanged for this deployment. The network was Avalanche Fuji C-Chain (chain ID **43113**). The token was [Circle Fuji Test USDC](https://developers.circle.com/stablecoins/usdc-contract-addresses#testnet), six decimals, at [`0x5425890298aed601595a70AB815c96711a31Bc65`](https://testnet.snowtrace.io/address/0x5425890298aed601595a70AB815c96711a31Bc65).

- Core: [`0xea655A1101d40175C4dd509da083F0b8696D9880`](https://testnet.snowtrace.io/address/0xea655A1101d40175C4dd509da083F0b8696D9880); [deployment transaction](https://testnet.snowtrace.io/tx/0x263ba177d09c52ef952d28e76c672ed43d12a8538930ccd616d8eb251fa4f143).
- EIP712AttendanceVerifier: [`0x8B292F49a16b950faFe2469d38A0d980eD79F1f5`](https://testnet.snowtrace.io/address/0x8B292F49a16b950faFe2469d38A0d980eD79F1f5); [deployment transaction](https://testnet.snowtrace.io/tx/0x20f8ef2e2ea5e072397aa3ea802c2599488778e05a4ed198d363bde453818492).
- EqualSplitStrategy: [`0x578b9E77Fe90F07f6b75B6e1daFA17999a2ae45C`](https://testnet.snowtrace.io/address/0x578b9E77Fe90F07f6b75B6e1daFA17999a2ae45C); [deployment transaction](https://testnet.snowtrace.io/tx/0x01c32d1ac403248ab7d76b027b576528377e8636efe653fcbf1e48aae603ea25).

One synthetic test-only account acted as creator, verifier and participant for pot #1: [create](https://testnet.snowtrace.io/tx/0x5ee8e3bec50ef904dd12ab100e15e586a6e0c20f39743d05e1697fc18cf10d32), [approve exactly 1 Test USDC](https://testnet.snowtrace.io/tx/0x95e18a7f4f65d60af512e6320c1eaa791984db893695f630f3339faa872818ce), [deposit 1](https://testnet.snowtrace.io/tx/0xc991633e12cb6ecbceb59329e6fc93cb7d5d0968e5a8ada6160892bc37f8fff2), [synthetic check-in](https://testnet.snowtrace.io/tx/0xd76a70cc5ce54e5132f692d445f9d42a648058fe3692b8877fb22064fc7ab807), [finalize](https://testnet.snowtrace.io/tx/0x305961e1444bc9c624d982df1bc0b58bb004d749b5ab1b94c7d47a8b7bd5fa30), and [claim 1 Test USDC](https://testnet.snowtrace.io/tx/0x9495a9ae61ac4f4d3dc1e4edc781707392f1e2d58842616ff9534c584ce13969).

At the claim block, read-only checks confirmed zero Test USDC remaining in the core, zero allowance, zero claimable amount and zero rounding dust. This single synthetic lifecycle does not establish use by a real or user wallet, real attendance, multiple participants, no-show behavior, or a 12.5 Test USDC Fuji payout. No public source upload was verified. This is not hosted MVP evidence or a formal security audit.
