# CommitPot — 2:45 narrated-demo script / Kịch bản demo 2:45

**Deliverable: narration and capture plan, not a recorded video.** Choose EN **or** VI for one take; do not read both within the same 2–3 minutes. The timeboxes total 165 seconds; rehearse against a timer before recording. No transaction, server, public-network call, recording, upload or recruitment was performed for this document.

## Evidence and preparation

Use the [evidence ledger](<README.md>) and [historical browser-to-Anvil report](<../../output/verification/local-browser/browser-report.json>). The saved run is **Anvil 31337, pot 3, synthetic fixture wallets, real local transactions**, associated with the previously verified source boundary—not a new improvement-candidate run. The report is a lifecycle summary, not a complete receipt-hash ledger. Never invent a hash, block, timestamp, Fuji address, pilot or latency number.

Two honest presentation modes:

- **Available now, offline:** show the [English deck](<../../output/pitch/commitpot-en.html>) or [Vietnamese deck](<../../output/pitch/commitpot-vi.html>), the saved report and the [historical settled capture](<../../output/verification/local-browser/desktop-settled.png>). Narrate them as historical evidence, not a live click-through. Display the integration assertions as source, not fresh execution.
- **Prepared recording, after the permitted local verification owner has produced it:** use one fresh isolated local pot and a source-bound receipt ledger. Preserve all receipts outside the edit even if repetitions are cut. Do not start that environment or execute transactions as part of this documentation assignment. Public Fuji footage requires separate release permission and evidence.

Before a future capture, record exact source commit plus dirty-state/artifact identity, chain ID, core/token identity and decimals, pot ID, deadlines, fixture aliases and all transaction hashes with receipt status, block/time, sender, beneficiary, amount and before/after balances. No secrets or fixture private keys in slides, captions or recordings. A fresh pot ID is not automatically `3`; never mix a fresh run's receipt with historical pot 3.

**On-screen labels throughout:** `HISTORICAL LOCAL ANVIL · 31337 · synthetic wallets · test tokens` or `PREPARED LOCAL RUN · 31337 · [actual source/pot identity]`. Add `READ-ONLY SIMULATION — NOT A MINED TRANSACTION` on simulated failures. A failed RPC request is unavailable evidence, not a valid denial.

**Disclose cuts visibly and in speech:** `Five approvals/deposits prepared; repeated prompts cut. Local test clock advanced to check-in/open and close+1. Not wall-clock latency; not Fuji.` Mock phase buttons are not chain-time evidence. Local timestamp controls are fixture setup only; no clock fast-forward is possible on Fuji. Prefer a cursor pause over animation; caption all narration and retain evidence labels when cropping.

## Timed narration — use one language track

| Time / picture | English narration | Lời thuyết minh tiếng Việt |
|---|---|---|
| **0:00–0:20** · Title + mode label | CommitPot is a voluntary attendance agreement for a staffed workshop. This is historical local Anvil evidence, not Fuji. All tokens and wallets are test fixtures; five wallets do not mean five users. Public testnet release is pending. | CommitPot là cam kết tham dự tự nguyện cho workshop có người điểm danh. Đây là bằng chứng Anvil cục bộ đã lưu, không phải Fuji. Token và ví chỉ dùng thử nghiệm; năm ví không phải năm người dùng. Bản testnet công khai đang chờ. |
| **0:20–0:42** · Rules + register/approve/deposit sequence | Before joining, everyone sees the fixed stake, verifier and deadlines. Approval and deposit are separate actions; gas is separate too. If someone attends, only verified attendees share the deposits. If nobody checks in, each joined wallet can reclaim its stake. | Trước khi tham gia, mọi người xem mức gửi, người xác minh và thời hạn cố định. Cấp quyền và gửi token là hai bước; gas tính riêng. Có người điểm danh thì chỉ ví hợp lệ chia tổng khoản gửi. Không ai điểm danh thì mỗi ví được nhận lại gốc. |
| **0:42–1:02** · Prepared-run disclosure + five-deposit total | The saved browser run prepared five ten-token deposits. Repeated wallet prompts are omitted here. Its local test clock advanced across the check-in windows; this is not a speed measurement. The recorded pool is fifty test tokens. | Lần chạy trình duyệt đã chuẩn bị năm khoản gửi, mỗi khoản mười token. Phần trình bày bỏ các thao tác ví lặp lại. Đồng hồ kiểm thử cục bộ đã chuyển qua các mốc điểm danh; đây không phải phép đo tốc độ. Tổng ghi nhận là năm mươi token. |
| **1:02–1:25** · QR inspection → attestation → signature → receipt | At the desk, a QR identifies a wallet and pot. It proves neither ownership nor presence. The named verifier must check the person, explicitly attest, then sign and submit. Four check-ins were confirmed. A signature or transaction hash alone is not a confirmed result. | Tại bàn điểm danh, QR chỉ định danh ví và quỹ, không chứng minh sở hữu ví hay có mặt. Người xác minh phải kiểm tra người tham gia, xác nhận rõ, rồi ký và gửi giao dịch. Bốn lượt đã được ghi nhận. Chữ ký hoặc mã giao dịch riêng lẻ chưa là kết quả xác nhận. |
| **1:25–1:50** · Settlement table + positive evidence | After closing, anyone can finalize. Five times ten becomes four payouts of twelve point five. The saved run completed all four claims and reconciled the isolated core balance to zero. The extra two point five comes from the no-show deposit, not yield. Another caller cannot redirect the beneficiary's payment. | Sau hạn đóng, ai cũng có thể chốt. Năm khoản mười token thành bốn khoản nhận mười hai phẩy năm. Bản ghi đã hoàn tất bốn khoản và đối soát số dư hợp đồng biệt lập về không. Phần tăng thêm từ khoản mất của ví vắng mặt, không phải lãi. Người gọi khác không thể chuyển hướng tiền của ví thụ hưởng. |
| **1:50–2:17** · Positive / negative / positive control panel | Compare an eligible payout with the fifth wallet's denial. The saved integration assertion expects NOT_ELIGIBLE; it is not a public reverted receipt. A new read-only control must check the exact error and unchanged balance and claim flag. Already-paid wallets should return AlreadyClaimed; use their historical receipts as positive evidence, not another payment attempt. | So sánh khoản nhận hợp lệ với việc từ chối ví thứ năm. Kiểm thử tích hợp đã lưu yêu cầu NOT_ELIGIBLE, không phải biên nhận lỗi trên mạng công khai. Đối chứng chỉ đọc mới phải kiểm tra đúng lỗi, số dư và cờ đã nhận không đổi. Ví đã nhận phải báo AlreadyClaimed; dùng biên nhận cũ làm bằng chứng dương, không gửi lại. |
| **2:17–2:45** · Trust boundary + next gate | There is no admin withdrawal, but the human verifier is trusted. No cancellation, verifier replacement or disputes exist; partial check-in failures can be unfair. Our source is public. Fuji identity, public hosting and a consented usability exercise remain separate gates. This prototype does not prove fewer no-shows. Inspect the evidence before approving a release. | Không có quyền rút cho admin, nhưng vẫn tin cậy người xác minh. Chưa có hủy, thay người xác minh hay khiếu nại; lỗi sau điểm danh một phần có thể bất công. Mã nguồn đã công khai. Fuji, hosting và thử nghiệm có đồng thuận là các bước riêng. Nguyên mẫu chưa chứng minh giảm vắng mặt. Hãy kiểm tra bằng chứng trước khi cho phép phát hành. |

## Positive / negative / positive capture specification

The current [adapter integration source](<../../apps/web/tests/integration/local-chain.test.ts#L75-L85>) pairs successful payouts, mapped `NOT_ELIGIBLE` rejection and `ALREADY_CLAIMED` rejection. The [browser source](<../../apps/web/tests/e2e/local-chain-browser.mjs#L94-L110>) reconciles successful claims and displays the no-show message; it does not record a mined no-show revert. The [unit no-show case](<../../packages/contracts/test/unit/CommitPotLifecycle.t.sol#L49-L74>) uses generic `expectRevert`. **Do not upgrade these into exact-selector/balance/flag control coverage.** No fresh control was executed here.

For a future same-run capture, the verification owner should:

1. **Positive A:** after finalization, show an eligible, unclaimed attendee; confirm a claim receipt and `PayoutClaimed(potId,beneficiary,12_500_000)`, exact token balance increase and `hasClaimed=true`. If already paid, use that actual historical receipt instead of retrying.
2. **Negative E:** simulate `claim(potId,E)` against the same chain/core/pot. Require decoded `NotEligible(potId,E)`, not a generic revert or transport failure. Show `claimable=0`, token balance unchanged and `hasClaimed=false` before/after. Label this **simulation, no transaction broadcast**. There is no need to spend gas manufacturing a mined revert.
3. **Positive B:** confirm a different eligible unclaimed wallet can still claim; show its own receipt and balance delta. If all four claims are already complete, show B's historical receipt, explicitly historical. Never relabel `AlreadyClaimed` as a failed positive route.
4. **Reconcile:** retain all five deposits, four check-ins and four payouts in the evidence ledger, even when the video shows only representative operations. Show dust `0`, pot obligation `0`, and the actual core before/after balance rather than assuming every core always has zero balance.

A correct-denial clip is ready only when its expected inputs, error and state checks are captured. Until then, the offline narration must stay with the accurately labelled existing assertion/source evidence. Never replay an uncertain send to make the video smoother.

## Recording and publication checklist / Kiểm tra trước khi xuất bản

- [ ] Exact run identity shown; historical/current/mock/simulation labels never conflated.
- [ ] Five wallet fixtures are not described as users; no measurements or pilot outcomes invented.
- [ ] Prepared transactions, repeated-prompt cuts and time advances disclosed in captions and voice.
- [ ] Positive control and correctly labelled negative control visible; unavailable data is not green success.
- [ ] One language track fits 2–3 minutes; readable captions and amount/receipt close-ups included.
- [ ] No private account, seed phrase, private key, personal logistics or attendee identity exposed.
- [ ] Video file, required accessible slide format, fresh-judge link access and any publication authorized separately.

**VI:** Các ô trên là điều kiện chuẩn bị, chưa phải kết quả đã đạt. Không quay, tải lên, tuyển người hoặc gửi giao dịch trong nhiệm vụ tài liệu này.
