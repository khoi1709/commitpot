# TECHNICAL SPECIFICATION — CommitPot (MVP v1.0)

Tài liệu này là **Single Source of Truth** cho toàn bộ đội ngũ phát triển (Smart Contract & Frontend). Mọi thay đổi về cấu trúc dữ liệu, hàm contract hoặc luật chia quỹ phải được cập nhật tại đây trước khi sửa code.

---

## 1. Vòng đời Pot & 3 Mốc thời gian bắt buộc

Để chặn hành vi quan sát người bỏ cuộc rồi mới nạp cọc vào phút chót, vòng đời một Pot bắt buộc tách làm 3 mốc thời gian (`uint64` Unix timestamp):

```text
[Khởi tạo] ---> registrationClose ---> checkInOpen ---> checkInClose ---> [Finalize] ---> [Claim]
     |                  |                   |                |                |             |
  joinPot()       Đóng đăng ký         Mở checkIn()     Đóng checkIn()   finalize()      claim()
```

### Ràng buộc thời gian (Invariants khi gọi `createPot`)
- `block.timestamp < registrationClose`
- `registrationClose <= checkInOpen`
- `checkInOpen < checkInClose`
- `stakeAmount > 0`
- `token != address(0)` và `verifier != address(0)`

---

## 2. Đặc tả Smart Contract (Solidity `^0.8.24`)

### 2.1. Phân tách trách nhiệm theo SOLID
1. **`PotTypes.sol`**: Khai báo toàn bộ `struct`, `enum`, và `custom error`. Không chứa logic.
2. **`IAttendanceVerifier.sol` & `EIP712AttendanceVerifier.sol`**: Chỉ chịu trách nhiệm xác thực chữ ký EIP-712. Không lưu state của Pot.
3. **`IPayoutStrategy.sol` & `EqualSplitStrategy.sol`**: Pure functions tính toán mức chia và phần dư. Không gọi external contract.
4. **`CommitPot.sol`**: Giữ state, nhận/trả ERC-20 (`SafeERC20`), bảo vệ tái nhập (`ReentrancyGuard`), gọi qua `immutable` interface tới Verifier và Strategy.

### 2.2. Cấu trúc dữ liệu cốt lõi (`PotTypes.sol`)

```solidity
enum PotStatus {
    Open,
    Finalized
}

struct PotConfig {
    address token;             // ERC-20 token (Test USDC trên Fuji)
    address verifier;          // Địa chỉ ví được ủy quyền ký xác nhận hiện diện
    uint256 stakeAmount;       // Mức cọc cố định (s)
    uint64 registrationClose;  // Hạn cuối joinPot
    uint64 checkInOpen;        // Thời điểm bắt đầu checkIn
    uint64 checkInClose;       // Hạn cuối checkIn & thời điểm mở finalize
}

struct PotState {
    PotConfig config;
    PotStatus status;
    uint256 participantCount;  // N: Tổng số suất đã nạp cọc
    uint256 checkedInCount;    // K: Tổng số suất đã điểm danh hợp lệ
    uint256 payoutPerWinner;   // Chốt khi finalize()
    uint256 dustAmount;        // Phần dư (N * s) % K, chốt khi finalize()
}

struct CheckInProof {
    uint256 potId;
    address participant;
    uint256 nonce;             // Chống replay attack
    uint64 deadline;           // Thời hạn hiệu lực của chữ ký
    bytes signature;           // Chữ ký EIP-712 của Verifier
}
```

### 2.3. Mapping lưu trữ trong `CommitPot.sol`
- `mapping(uint256 => PotState) public pots;`
- `mapping(uint256 => mapping(address => bool)) public hasJoined;`
- `mapping(uint256 => mapping(address => bool)) public hasCheckedIn;`
- `mapping(uint256 => mapping(address => uint256)) public checkInOrder;` *(Lưu thứ tự điểm danh `1..K` để chia phần dư xác định)*
- `mapping(uint256 => mapping(address => bool)) public hasClaimed;`
- `mapping(uint256 => mapping(uint256 => bool)) public usedNonces;` *(Theo `potId => nonce => bool`)*

### 2.4. Đặc tả 5 hàm cốt lõi

| Hàm | Điều kiện thực thi (Checks) | Thay đổi trạng thái (Effects) & Tương tác (Interactions) |
| :--- | :--- | :--- |
| `createPot(PotConfig config)` | Kiểm tra các ràng buộc thời gian và địa chỉ khác `0x0`. | Tăng `nextPotId`, lưu `PotState` với `status = Open`. Emit `PotCreated`. |
| `joinPot(uint256 potId)` | `status == Open`, `block.timestamp < registrationClose`, `!hasJoined[potId][msg.sender]`. | Set `hasJoined = true`, `participantCount++`. Gọi `safeTransferFrom(msg.sender, address(this), stakeAmount)`. Emit `PotJoined`. |
| `checkIn(CheckInProof proof)` | `status == Open`, `checkInOpen <= block.timestamp <= checkInClose`, `hasJoined[potId][participant]`, `!hasCheckedIn[potId][participant]`, `!usedNonces[potId][nonce]`, `block.timestamp <= proof.deadline`, `attendanceVerifier.verify(pot.config.verifier, proof) == true`. | Set `usedNonces = true`, `hasCheckedIn = true`, `checkedInCount++`, `checkInOrder[potId][participant] = checkedInCount`. Emit `CheckedIn`. |
| `finalize(uint256 potId)` | `status == Open`, `block.timestamp > checkInClose`. *(Bất kỳ ai cũng gọi được)*. | Set `status = Finalized`. Gọi `payoutStrategy.calculatePayout(N, K, s)` để lưu `payoutPerWinner` và `dustAmount`. Emit `PotFinalized`. |
| `claim(uint256 potId, address beneficiary)` | `status == Finalized`, `!hasClaimed[potId][beneficiary]`, đủ điều kiện nhận tiền (xem Mục 3). *(Cho phép gọi hộ nhưng tiền luôn gửi về `beneficiary`)*. | Set `hasClaimed = true`. Tính `amount` (cộng `1` wei nếu nằm trong nhóm nhận dust). Gọi `safeTransfer(beneficiary, amount)`. Emit `PayoutClaimed`. |

### 2.5. Events bắt buộc (Để Frontend index & đối chiếu Explorer)
- `event PotCreated(uint256 indexed potId, address indexed creator, address indexed verifier, address token, uint256 stakeAmount);`
- `event PotJoined(uint256 indexed potId, address indexed participant);`
- `event CheckedIn(uint256 indexed potId, address indexed participant, uint256 order);`
- `event PotFinalized(uint256 indexed potId, uint256 participantCount, uint256 checkedInCount, uint256 payoutPerWinner, uint256 dustAmount);`
- `event PayoutClaimed(uint256 indexed potId, address indexed beneficiary, uint256 amount);`

---

## 3. Công thức quyết toán & Xử lý trường hợp biên (`EqualSplitStrategy`)

Gọi $N$ là `participantCount`, $K$ là `checkedInCount`, $s$ là `stakeAmount` (tính theo đơn vị nhỏ nhất của token, VD: 6 decimals với USDC).

| Trường hợp | Điều kiện | Công thức `payoutPerWinner` | Phần dư (`dust`) | Quyền `claim` |
| :--- | :--- | :--- | :--- | :--- |
| **Bình thường** | $N > 0$ và $K > 0$ | $\lfloor \frac{N \times s}{K} \rfloor$ | $(N \times s) \bmod K$ | Chỉ ví có `hasCheckedIn == true` |
| **Tất cả có mặt** | $N > 0$ và $K = N$ | $s$ | $0$ | Tất cả ví đã tham gia |
| **Không ai điểm danh** | $N > 0$ và $K = 0$ | $s$ *(Chính sách hoàn cọc)* | $0$ | Tất cả ví có `hasJoined == true` |
| **Không ai tham gia** | $N = 0$ | $0$ | $0$ | Không có khoản phải trả |

### Quy tắc chia phần dư xác định (Deterministic Dust Rule)
Khi `dustAmount > 0` (luôn nhỏ hơn $K$):
- Những người có `checkInOrder[potId][beneficiary] <= dustAmount` sẽ được cộng thêm đúng `1` đơn vị nhỏ nhất của token khi gọi `claim`.
- **Kết quả:** Tổng số tiền rút ra bằng chính xác $N \times s$. Không có token bị kẹt vĩnh viễn trong contract và không cần admin quyết định.

---

## 4. Giao thức xác thực EIP-712 & Định dạng QR

### Tại sao dùng EIP-712 thay vì chỉ kiểm tra `msg.sender == verifier`?
Tách biệt **quyền ký xác nhận** (Verifier) khỏi **người gửi giao dịch lên chuỗi** (Verifier, Người tham gia, hoặc Relayer). Chữ ký được khóa cứng với `chainId`, địa chỉ contract, `potId`, `participant`, `nonce` và `deadline` nên không thể tái sử dụng cho ví khác, Pot khác hoặc mạng khác.

### EIP-712 Domain & Typed Data
```json
{
  "domain": {
    "name": "CommitPot",
    "version": "1",
    "chainId": 43113,
    "verifyingContract": "0x<EIP712AttendanceVerifier_Address>"
  },
  "types": {
    "CheckIn": [
      { "name": "potId", "type": "uint256" },
      { "name": "participant", "type": "address" },
      { "name": "nonce", "type": "uint256" },
      { "name": "deadline", "type": "uint64" }
    ]
  }
}
```

### Luồng dữ liệu QR (Frontend -> Verifier -> Chain)
1. **QR trên máy Người tham gia** chỉ chứa JSON tối giản:
   ```json
   { "v": 1, "potId": "1", "participant": "0xAbC...123" }
   ```
2. **Máy Verifier** quét QR, kiểm tra định dạng bằng `Zod` (`JsonQrCodec.ts`).
3. Máy Verifier tự sinh `nonce` (random `uint256` hoặc timestamp + counter) và `deadline` (`now + 300s`), gọi ví Verifier ký EIP-712 `signTypedData`.
4. Máy Verifier gửi giao dịch `checkIn(proof)` lên Fuji Testnet (trong bản MVP, Verifier tự trả phí gas Fuji AVAX để tối ưu trải nghiệm 1-chạm tại cửa).

---

## 5. Đặc tả Frontend & Hợp đồng Dependency Inversion

Frontend sử dụng **Next.js App Router + TypeScript + Tailwind CSS + wagmi/viem**.

### Interface cốt lõi (`apps/web/src/domain/ports/IPotRepository.ts`)
```typescript
export interface PotSummary {
  id: string;
  token: `0x${string}`;
  verifier: `0x${string}`; stakeAmount: bigint; registrationClose: number; checkInOpen: number; checkInClose: number; status: 'OPEN' \vert{} 'FINALIZED'; participantCount: number; checkedInCount: number; payoutPerWinner: bigint; }  export interface IPotRepository { getPot(potId: string): Promise<PotSummary>; getParticipantStatus(potId: string, address: `0x${string}`): Promise<{
    hasJoined: boolean;
    hasCheckedIn: boolean;
    hasClaimed: boolean;
    checkInOrder: number;
  }>;
  createPot(config: CreatePotInput): Promise<`0x${string}`>; joinPot(potId: string): Promise<`0x${string}`>;
  submitCheckIn(proof: CheckInProof): Promise<`0x${string}`>; finalizePot(potId: string): Promise<`0x${string}`>;
  claimPayout(potId: string, beneficiary: `0x${string}`): Promise<`0x${string}`>;
}
```

### Chiến lược hoán đổi Mock / On-chain (`apps/web/src/app/providers.tsx`)
- `NEXT_PUBLIC_USE_MOCK=true` -> Inject `MockPotRepository` (lưu state trong `localStorage`, giả lập độ trễ 400ms để test UI/UX).
- `NEXT_PUBLIC_USE_MOCK=false` -> Inject `AvalanchePotRepository` (đọc/ghi trực tiếp qua `viem` trên Avalanche Fuji Testnet, Chain ID `43113`).

---

## 6. Bảo mật, Giới hạn & Checklist Kiểm thử (Foundry)

### Bộ test case bắt buộc cho Dev 1 (`packages/contracts/test/`)
- [ ] Happy path: 5 người nạp 10 USDC, 4 người check-in, finalize, 4 người claim đúng 12.5 USDC, người vắng claim bị revert.
- [ ] Time bounds: Revert khi `joinPot` sau `registrationClose`, `checkIn` ngoài cửa sổ `[checkInOpen, checkInClose]`, `finalize` trước `checkInClose`.
- [ ] Security & Replay: Revert khi dùng chữ ký của ví khác, dùng lại `nonce`, chữ ký hết hạn `deadline`, chữ ký không phải từ `pot.verifier`.
- [ ] Edge cases: `K = 0` (hoàn cọc cho tất cả `N` người), `N = 0`, chia không hết (VD: 3 người nạp 10 USDC, 2 người hoặc 3 người chia lẻ đơn vị nhỏ nhất -> kiểm tra số dư contract sau khi tất cả claim phải bằng `0`).
- [ ] Double action: Revert khi `joinPot` 2 lần, `checkIn` 2 lần, `claim` 2 lần.

### Lưu ý quy chế Hackathon
- **Yêu cầu Multisig của BTC:** Dù `CommitPot.sol` là contract phi lưu ký (không có hàm `withdraw` cho owner), cần xác nhận với BTC Team1VN xem có yêu cầu đặt ví `deployer` hoặc `verifier` bằng **Safe Wallet (Multisig)** trên Fuji hay không để tránh bị trừ điểm tuân thủ.