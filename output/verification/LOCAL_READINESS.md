# Local application readiness

## Available now

Open **http://localhost:3100** for the bilingual local demonstration. Use the visible EN/VI control. The app exposes actual organizer, participant and verifier flows; mock mode is explicitly labelled and never presented as Fuji.

Implemented and tested: create/review fixed rules; approve/deposit; personal QR; on-site verifier attestation, signature and check-in; permissionless finalization; beneficiary-safe pull claims; zero-attendance refunds; deterministic rounding; receipts and persisted recovery; normal reload and language switching.

The real chain adapter and contracts were also exercised through the actual browser interface against an isolated Anvil node, not merely mocked RPC responses. Five wallets each deposited10, four attendees signed/checkedin, each received12.5, and the core's token balance returned tozero. Synthetic walletbridge lives only in testharness; no realuserwalletor privatekeyaccess was used.

## Evidence

- [Detailed verification and limitations](<VERIFICATION.md>)
- [Actual browser-to-chain report](<local-browser/browser-report.json>)
- [Mock UI report](<browser/report.json>)
- [Final visual-repair source manifest](<FINAL_SOURCE_MANIFEST.json>) and [closing source/test manifest](<CLOSING_SOURCE_MANIFEST.json>)
- [Additional 390×640 validation recovery flow](<browser/input-boundaries.json>)
- [Independent source recheck](<../../docs/reviews/independent/SOURCE_RECHECK.md>)
- [Independent scoped interface verdict](<../../docs/reviews/independent/FINISH_VERDICT.md>)
- [Independent development command check](<../../docs/reviews/independent/EXECUTION_CHECK.md>) and [manifest/date reconciliation](<../../docs/reviews/independent/EVIDENCE_RECONCILIATION.md>)

## Not claimed

No Fuji/mainnet deployment, public hosting, Git publication, realwalletsigning, organizer submission, formalcontractaudit, physicalphonecamera certification or exhaustivewalletrejection/replacementUX coverage. Testnettokenissuerrestrictionsandmultisigcompliance require separatelyverifiedfacts. Camera/manualfallbackworksbydesign; the hardware pathremainsunverified.

## Local services

The user-facing mock app is intentionally left running at3100. The loopback Anvil8545 and secondconfiguredapp3101 were stopped after final verification and recorded zero residual; their saved evidence remains. This does not affect the persistent mock demo. Browser contexts were closed. BrowserSkilldaemonhadnoextensionconnectionand exitednormallyidle; no existingbrowserprofile orsettingswerechanged.
