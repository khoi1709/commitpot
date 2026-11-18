# English / Vietnamese content contract

Direct human requirement: both language options, not two separate apps. A language change must preserve the selected pot, wallet, pending transaction, scanned identifier and current form. No i18n library is required for this small interface. A single typed dictionary and locale-aware date display are sufficient; contract values remain unchanged.

## Financial wording

| English | Vietnamese | Meaning to preserve |
|---|---|---|
| Commitment deposit | Tiền cọc cam kết | Attendance commitment, not an investment or yield product. |
| Create a pot | Tạo quỹ cam kết | Fix immutable rules before participants join. |
| Join and deposit | Tham gia và nạp cọc | Transfers the exact supported token amount after allowance. |
| Approve token spending | Cho phép sử dụng token | Separate token allowance transaction, not the deposit itself. |
| Registration closes | Hạn đăng ký | Join rejected at this exact timestamp. |
| Check-in opens / closes | Mở / đóng điểm danh | Both check-in endpoints inclusive on chain. |
| Attendance verifier | Người xác nhận hiện diện | A trusted human attests attendance; not a trustless location sensor. |
| Confirm this person is present | Xác nhận người này có mặt | Explicit verifier action, not merely scanning an address. |
| Finalize results | Chốt kết quả | Records entitlement; does not automatically pay every wallet. |
| Claim payout | Nhận phần được hưởng | Pull payment goes only to the named beneficiary. |
| Claim deposit refund | Nhận lại tiền cọc | K=0 returns each joined wallet's original deposit. |
| Did not check in | Chưa điểm danh hợp lệ | Avoid claiming a wallet is physically absent from chain data alone. |
| If attendance closed now | Nếu chốt điểm danh lúc này | A provisional base allocation, never a guaranteed reward. |
| Confirmed on chain | Đã xác nhận trên chuỗi | Successful receipt and refreshed state, not a submitted hash. |
| Awaiting wallet approval | Đang chờ xác nhận trong ví | User may reject; no state fabricated as success. |
| Outcome not yet known | Chưa xác định kết quả giao dịch | Preserve reference and reconcile, do not invite blind resend. |
| Mock demonstration | Mô phỏng cục bộ | Explicit synthetic local state, no live-chain proof. |
| Test tokens only — no real monetary value | Chỉ dùng token thử nghiệm — không có giá trị tiền thật | Fuji/local demo, no real-money product. |

## Required truthful disclosure

English: Financial rules are enforced by the contract. Attendance is confirmed by the named verifier. A personal QR identifies a wallet and pot; it is not proof of physical presence or wallet ownership.

Vietnamese: Hợp đồng thực thi các quy tắc tài chính. Người xác nhận được chỉ định chịu trách nhiệm điểm danh. Mã QR cá nhân chỉ xác định ví và quỹ; mã này không tự chứng minh sự hiện diện ngoài đời hoặc quyền sở hữu ví.

English: If nobody checks in, all joined participants can reclaim their deposits. If at least one participant checks in, the pot is shared among valid attendees; final token rounding follows check-in order.

Vietnamese: Nếu không có lượt điểm danh hợp lệ, mọi người đã tham gia có thể nhận lại tiền cọc. Nếu có ít nhất một người điểm danh hợp lệ, quỹ được chia cho những người đã điểm danh; phần lẻ theo đơn vị nhỏ nhất của token được phân bổ theo thứ tự điểm danh.

## Formatting and state

- Keep Test USDC/AVAX, addresses, transaction hashes, network identifiers and exact amounts byte-correct; don't translate token tickers or use floating-point token arithmetic.
- Use locale-aware date strings with an explicit timezone. Review the same Unix times before submitting in either language. A translated countdown cannot override chain eligibility.
- Localize all primary actions, tooltips, field errors, receipt failures, camera states and empty states—not just the header. Machine error codes are mapped to meaningful messages without leaking arbitrary RPC HTML.
- Non-color status and visible text distinguish submitted/confirmed/reverted/unknown outcomes. Generic success banners must not hide a failed receipt.
- Set document language, retain readable Unicode fonts and full Vietnamese diacritics, prevent long hashes/addresses overflowing mobile layouts. Language preference is public local UI data, not a wallet permission.
