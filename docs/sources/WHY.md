# CommitPot — Ý tưởng, Lý do lựa chọn & Điểm tối ưu kỹ thuật

> **Định vị sản phẩm:** Quỹ cam kết hiện diện với luật tài chính bất biến trên chuỗi, xác nhận hiện diện có trách nhiệm, và quyết toán kiểm chứng được.  
> **Bối cảnh:** Avalanche Team1 Vietnam UniHack 2026 (Triển khai trên Avalanche Fuji Testnet).

---

## 1. Tổng quan ý tưởng: CommitPot

### Bài toán thực tế
Các buổi học nhóm, workshop kỹ thuật hoặc meetup cộng đồng builder thường xuyên gặp tình trạng đăng ký ảo (no-show). Khi thu tiền cọc theo cách thủ công (Google Form + chuyển khoản cá nhân), các thành viên buộc phải tin tuyệt đối vào người giữ quỹ và dễ phát sinh tranh cãi khi hoàn trả hoặc phân chia lại tiền cọc.

### Giải pháp định nghĩa hẹp (MVP Scope)
**CommitPot** loại bỏ phần phức tạp nhất của các hệ thống bounty (nghiệm thu chất lượng công việc chủ quan, cần trọng tài phân xử) để tập trung vào một bài toán định lượng được: **cam kết có mặt tại một phiên check-in offline**.

*   Một nhóm chốt trước mức cọc ($s$), loại token (Test USDC), ví người trực điểm danh (`verifier`) và 3 mốc thời gian trước khi mở đăng ký.
*   Người tham gia nạp đúng mức cọc vào Smart Contract.
*   Tại địa điểm sự kiện, người trực điểm danh quét QR cá nhân của người tham gia và ký chứng nhận **EIP-712** riêng cho từng ví.
*   Hết cửa sổ điểm danh, bất kỳ ai cũng có thể kích hoạt chốt kết quả (`finalize`). Người có mặt tự rút lại tiền cọc kèm phần phân bổ từ cọc của người vắng mặt (`claim`):

$$\text{Payout} = s + \frac{(N - K)s}{K} = \frac{Ns}{K}$$

*(Trong đó $N$ là số suất đã nạp cọc, $K$ là số suất điểm danh hợp lệ với $K > 0$).*

### Mô hình tin cậy trung thực (Trust Model)
CommitPot **không** tuyên bố "hoàn toàn không cần tin ai" hay "chống Sybil tuyệt đối". Hệ thống tách bạch rạch ròi hai quyền lực:
*   **Quyền kiểm soát tiền:** Thuộc về Smart Contract bất biến (không có quyền admin rút quỹ hay đổi luật sau khi mở).
*   **Quyền xác nhận hiện diện:** Thuộc về `Verifier` cụ thể tại sự kiện, mọi lần ký đều để lại dấu vết truy trách nhiệm trên chuỗi.

---

## 2. Vì sao chọn CommitPot cho team 3 người trong 9 ngày?

1.  **Tỷ lệ hoàn thiện 100% sản phẩm chạy thật (Zero Vaporware):**
    Với quỹ thời gian 9 ngày nước rút, các ý tưởng quá rộng (DeFi phức tạp, Marketplace, AI + Blockchain) rất dễ rơi vào cảnh "slide đẹp nhưng demo lỗi". CommitPot có phạm vi hẹp, 5 hàm cốt lõi rõ ràng, đủ thời gian để team viết đầy đủ Unit/Fuzz Test trên Foundry và chạy ổn định trên Avalanche Fuji Testnet.
2.  **Hiệu ứng Demo sân khấu trực quan, hiểu ngay trong 10 giây:**
    Giám khảo không cần đọc whitepaper phức tạp để nắm giá trị. Trong kịch bản 3 phút, mở quỹ $5 \times 10$ test USDC, quét QR điểm danh 4 người ngay trên sân khấu, thấy khoản nhận dự kiến nhảy lên $12.5$ test USDC và đối chiếu trực tiếp trên Snowtrace Explorer — sản phẩm tự chứng minh được tính khả thi.
3.  **Tận dụng đúng lợi thế hạ tầng của Avalanche:**
    Điểm danh vật lý tại cửa sự kiện là bài toán thực tế mà **thời gian chốt giao dịch dưới 1 giây (sub-second finality)** của Avalanche tạo ra khác biệt rõ rệt về trải nghiệm người dùng: quét xong giao dịch xác nhận tức thì, không gây ùn tắc dòng người đứng chờ như trên các chuỗi có độ trễ 15–30 giây.
4.  **Vững vàng trước các câu hỏi phản biện sâu của giám khảo:**
    Những góc khuất kỹ thuật mà giám khảo thường xoáy vào (*chia dư token, kẹt gas khi trả thưởng, replay attack, gian lận điểm danh, hay so sánh với chuyển khoản thường*) đều đã được thiết kế xử lý định lượng ngay từ đầu.

---

## 3. CommitPot tối ưu hơn các repo GitHub "tương tự" ở đâu?

Mô hình *Commitment Stake* không phải ý tưởng mới và nằm ngay trong danh sách gợi ý của BTC. Lợi thế cạnh tranh của CommitPot đến từ **chất lượng triển khai kỹ thuật**, giải quyết triệt để những lỗ hổng mà các repo mẫu/hackathon cũ thường bỏ qua:

| Khía cạnh | Các repo "tương tự" thường làm | CommitPot tối ưu hơn |
| :--- | :--- | :--- |
| **Cơ chế điểm danh** | Dùng mã bí mật dùng chung (`secretHash`) hoặc QR tĩnh. Người đầu tiên gọi giao dịch sẽ làm lộ mã trên mempool; người ở sự kiện có thể chụp QR gửi cho người ở nhà. | Dùng **chữ ký EIP-712 riêng cho từng ví**, ràng buộc chặt `potId`, `participant`, `nonce`, `deadline`, `chainId` và `verifyingContract`. Sao chép chứng nhận không thể dùng cho ví khác hay gửi lại lần hai. |
| **Luồng trả thưởng** | Dùng vòng lặp `for` trong hàm `distribute()` để đẩy tiền (Push model) — dễ gặp lỗi Out-of-Gas khi nhóm lớn hoặc một ví lỗi làm kẹt cả đợt rút. | Tách rạch ròi **`finalize()`** (chốt quyền nhận, ai cũng gọi được) và **`claim()`** (mô hình Pull-over-Push). Hỗ trợ gọi nhận hộ nhưng tiền luôn chuyển về đúng ví thụ hưởng. |
| **Chống trục lợi phút chót** | Chỉ thiết kế một `deadline` chung. Người tham gia có thể đợi sát cuối, quan sát ai bỏ cuộc rồi mới nạp cọc để hưởng phần chia. | Tách cứng **3 mốc thời gian**: `registrationClose <= checkInOpen < checkInClose`. Đóng sổ đăng ký trước khi mở cửa sổ điểm danh. |
| **Xử lý số dư lẻ (Dust) & Biên ($K = 0$)** | Bỏ qua phần dư phép chia nguyên (làm kẹt tiền vĩnh viễn trong contract) hoặc thêm hàm `adminWithdraw()` (tạo cửa hậu lạm quyền). | **Quy tắc chia dư xác định** (`checkInOrder <= dustAmount` nhận thêm `1` đơn vị nhỏ nhất) và chính sách rõ ràng khi $K = 0$ (hoàn cọc). Số dư contract sau khi tất cả claim luôn về đúng `0`, không cần quyền admin. |
| **Kiến trúc mã nguồn** | Viết dồn toàn bộ vào một file Solidity nguyên khối; Frontend gọi thẳng RPC khiến team không thể code song song. | Chuẩn **SOLID**: tách `IAttendanceVerifier` và `IPayoutStrategy` qua Dependency Injection (dễ nâng cấp lên ZK-Proof hoặc luật chia mới mà không sửa lõi `CommitPot.sol`). Frontend dùng `IPotRepository` để phát triển song song với `MockPotRepository`. |
| **Định vị & Truyền thông** | Quảng cáo quá đà là "100% trustless / chống Sybil hoàn chỉnh", dễ bị giám khảo bác bỏ ở khâu kiểm tra ngoài đời thực. | **Minh bạch về giới hạn**: thừa nhận rõ vai trò của người trực điểm danh, tập trung bảo chứng phần luật tài chính bất biến và lịch sử kiểm chứng được. |

---

## 4. Gợi ý trả lời Q&A: "Đã có repo tương tự rồi, các bạn làm lại để làm gì?"

> *"Đúng là mô hình Commitment Stake không mới và nằm ngay trong nhóm đề bài gợi ý. Tuy nhiên, phần lớn bản triển khai cũ hoặc dùng mã chung dễ gian lận từ xa, hoặc dùng vòng lặp đẩy tiền dễ kẹt gas, hoặc vẫn để lại quyền admin can thiệp vào quỹ. CommitPot được đội em xây lại từ đầu theo kiến trúc SOLID để xử lý triệt để chính những lỗ hổng triển khai đó: chứng nhận EIP-712 riêng từng ví, 3 mốc thời gian chống trục lợi, chia dư xác định về 0 không cần admin, và tối ưu luồng điểm danh theo tốc độ finality của Avalanche."*