import { formatTokenAmount } from '../domain/amounts';
import { historicalAnvil } from '../infrastructure/evidence/historical';
import type { ProofSnapshot } from '../infrastructure/evidence/reader';
import styles from './VerificationView.module.css';

export type VerificationLocale = 'en' | 'vi';

interface VerificationViewProps {
  locale?: VerificationLocale;
  potId?: string | null;
  invalidPot?: boolean;
  snapshot?: ProofSnapshot;
}

const copy = {
  en: {
    brand: 'CommitPot',
    language: 'Language',
    english: 'English',
    vietnamese: 'Tiếng Việt',
    title: 'Verify a public pot',
    intro: 'Review public evidence without connecting a wallet. This page never asks for an account, signature or transaction.',
    liveHeading: 'Live verification is not configured',
    liveBody: 'No public release manifest is supplied to this page. It cannot confirm a current deployment, pot state or transaction.',
    historicalTeaser: 'Historical Anvil summary for pot #3: 5 deposits of 10 Test USDC, 4 check-ins and 4 claims of 12.5. This is not live proof.',
    inputLabel: 'Pot ID',
    inputHelp: 'Enter a positive decimal pot ID. The ID is a lookup value, not proof of attendance or ownership.',
    inputPlaceholder: 'For example, 3',
    submit: 'Open verification',
    historicalLink: 'View the historical Anvil summary for pot #3',
    historicalTitle: 'Historical local-chain summary',
    historicalLabel: `Anvil · FEA386 · source ${historicalAnvil.sourceCommit}`,
    historicalIntro: 'A saved report describes one local test lifecycle. It used a synthetic wallet provider and recorded actual local-chain transactions.',
    deposits: 'Recorded deposits',
    attendance: 'Recorded check-ins',
    claims: 'Recorded claims',
    residual: 'Reported residual',
    historicalLimits: 'This is a historical summary, not live proof or a certified result. The saved report contains no full transaction hashes or block identities, so individual receipts cannot be checked from it.',
    invalidTitle: 'Invalid pot reference',
    invalidBody: 'Pot IDs must be positive decimal numbers. The supplied value was not echoed or used.',
    unknownTitle: (id: string) => `Pot #${id} evidence`,
    unknownBody: 'Live evidence is unavailable because this page has no configured release manifest. No pot or transaction has been verified.',
    notHistorical: 'The historical Anvil report covers pot #3 only.',
    return: 'Back to verification',
    readOnly: 'Read-only · no wallet or transaction access',
    liveStatus: 'Live manifest comparison',
    statusUnconfigured: 'Not configured',
    statusInvalidManifest: 'Invalid manifest',
    statusInvalidPot: 'Invalid pot ID',
    statusUnavailable: 'Evidence unavailable',
    statusMismatch: 'Evidence mismatch',
    statusMatched: 'Matches configured manifest',
    statusReason: (reason: string) => `Reason: ${({ 'missing-manifest': 'release manifest missing', 'invalid-manifest': 'release manifest invalid', 'invalid-pot': 'pot ID invalid', 'reader-unavailable': 'public RPC unavailable', 'identity-mismatch': 'deployment or manifest identity mismatch', 'pot-unavailable': 'pot read unavailable', 'receipt-incomplete': 'one or more configured receipts are incomplete', matched: 'matched' } as Record<string, string>)[reason] ?? 'unavailable'}`,
    checkedAt: (block: string) => `Observed chain block ${block}`,
    matchedLimits: "This compares on-chain runtime code, immutable getters and ABI identity with the supplied manifest. The selected pot is read separately at the repository's latest state, not pinned to the identity block; these reads are not an atomic snapshot. Declared source, artifact and compiler data are not independently rebuilt or certified here. Receipt status is shown separately; a configured manifest alone does not prove individual attendance.",
    noReceipts: 'No transaction receipts were configured for this pot.',
    receiptLabel: (hash: string) => `Transaction ${hash}`,
    receiptMatched: 'Receipt matches its configured intent and block.',
    receiptMismatch: 'Receipt does not match its configured intent or block.',
    receiptUnavailable: 'Receipt could not be confirmed from the current public RPC.',
    beneficiary: 'Beneficiary',
    amount: 'Amount',
    network: 'Configured network',
    core: 'Configured core',
    token: 'Configured token',
    deployment: 'Declared deployment block',
    sourceCommit: 'Declared source commit',
    abi: 'Declared ABI hash',
    runtimeHashes: 'Configured full runtime hashes',
    transaction: 'Transaction',
    sender: 'Sender',
    pot: 'Pot',
    block: 'Block',
    blockHash: 'Block hash',
    openExplorer: 'Open Fuji explorer',
    simulation: 'Current claim simulation (separate from the historical receipt)',
    simulationLabels: { 'would-succeed': 'Would succeed at the observed block', AlreadyClaimed: 'Already claimed at the observed block', NotEligible: 'Not eligible at the observed block', NotJoined: 'Not joined at the observed block', PotNotFinalized: 'Pot not finalized at the observed block', unavailable: 'Simulation unavailable', 'other-revert': 'Another contract revert at the observed block' },
    runtimeLabel: (role: string) => `${role} full runtime hash`,
    receiptLimits: 'The displayed receipt is checked against this configured intent. A check-in confirms the on-chain record only; it does not establish physical presence.'
  },
  vi: {
    brand: 'CommitPot',
    language: 'Ngôn ngữ',
    english: 'English',
    vietnamese: 'Tiếng Việt',
    title: 'Kiểm tra quỹ công khai',
    intro: 'Xem bằng chứng công khai mà không kết nối ví. Trang này không yêu cầu tài khoản, chữ ký hay giao dịch.',
    liveHeading: 'Chưa cấu hình xác minh trực tiếp',
    liveBody: 'Trang này chưa có bản kê khai phát hành công khai. Trang không thể xác nhận triển khai, trạng thái quỹ hoặc giao dịch hiện tại.',
    historicalTeaser: 'Tóm tắt Anvil lịch sử của quỹ #3: 5 lượt nạp 10 Test USDC, 4 lượt điểm danh và 4 lượt nhận 12.5. Đây không phải bằng chứng trực tiếp.',
    inputLabel: 'Mã quỹ',
    inputHelp: 'Nhập mã quỹ thập phân dương. Mã chỉ dùng để tra cứu, không chứng minh điểm danh hay quyền sở hữu.',
    inputPlaceholder: 'Ví dụ: 3',
    submit: 'Mở trang xác minh',
    historicalLink: 'Xem tóm tắt Anvil lịch sử của quỹ #3',
    historicalTitle: 'Tóm tắt chuỗi cục bộ lịch sử',
    historicalLabel: `Anvil · FEA386 · mã nguồn ${historicalAnvil.sourceCommit}`,
    historicalIntro: 'Báo cáo đã lưu mô tả một vòng đời thử nghiệm cục bộ. Báo cáo dùng nhà cung cấp ví tổng hợp và ghi nhận giao dịch chuỗi cục bộ thực tế.',
    deposits: 'Lượt nạp được ghi nhận',
    attendance: 'Lượt điểm danh được ghi nhận',
    claims: 'Lượt nhận được ghi nhận',
    residual: 'Số dư còn lại được báo cáo',
    historicalLimits: 'Đây là tóm tắt lịch sử, không phải bằng chứng trực tiếp hay kết quả được chứng nhận. Báo cáo đã lưu không có mã giao dịch đầy đủ hoặc định danh khối nên không thể kiểm tra từng biên nhận.',
    invalidTitle: 'Mã quỹ không hợp lệ',
    invalidBody: 'Mã quỹ phải là số thập phân dương. Giá trị đầu vào không được hiển thị hoặc sử dụng.',
    unknownTitle: (id: string) => `Bằng chứng quỹ #${id}`,
    unknownBody: 'Không có bằng chứng trực tiếp vì trang chưa cấu hình bản kê khai phát hành. Chưa có quỹ hay giao dịch nào được xác minh.',
    notHistorical: 'Báo cáo Anvil lịch sử chỉ có dữ liệu cho quỹ #3.',
    return: 'Quay lại trang xác minh',
    readOnly: 'Chỉ đọc · không truy cập ví hay giao dịch',
    noReceipts: 'Không có biên nhận giao dịch nào được cấu hình cho quỹ này.',
    beneficiary: 'Người thụ hưởng',
    amount: 'Số tiền',
    receiptMatched: 'Biên nhận khớp với ý định và khối đã cấu hình.',
    receiptMismatch: 'Biên nhận không khớp với ý định hoặc khối đã cấu hình.',
    receiptUnavailable: 'Không thể xác nhận biên nhận từ RPC công khai hiện tại.',
    liveStatus: 'So sánh bản kê khai trực tiếp',
    statusUnconfigured: 'Chưa cấu hình',
    statusInvalidManifest: 'Bản kê khai không hợp lệ',
    statusInvalidPot: 'Mã quỹ không hợp lệ',
    statusUnavailable: 'Không thể lấy bằng chứng',
    statusMismatch: 'Bằng chứng không khớp',
    statusMatched: 'Khớp với bản kê khai đã cấu hình',
    statusReason: (reason: string) => `Lý do: ${({ 'missing-manifest': 'thiếu bản kê khai phát hành', 'invalid-manifest': 'bản kê khai phát hành không hợp lệ', 'invalid-pot': 'mã quỹ không hợp lệ', 'reader-unavailable': 'RPC công khai không khả dụng', 'identity-mismatch': 'danh tính triển khai hoặc bản kê khai không khớp', 'pot-unavailable': 'không thể đọc dữ liệu quỹ', 'receipt-incomplete': 'một hoặc nhiều biên nhận chưa đầy đủ', matched: 'khớp' } as Record<string, string>)[reason] ?? 'không khả dụng'}`,
    checkedAt: (block: string) => `Khối chuỗi được quan sát ${block}`,
    matchedLimits: 'Đối chiếu mã thực thi trên chuỗi, getter bất biến và định danh ABI với bản kê khai đã cung cấp. Quỹ được đọc riêng theo trạng thái mới nhất của repository, không cố định tại khối xác minh danh tính; các lần đọc này không phải ảnh chụp nguyên tử. Dữ liệu nguồn, artifact và trình biên dịch được khai báo nhưng không được biên dịch lại hay chứng nhận độc lập tại đây. Trạng thái biên nhận được hiển thị riêng; chỉ có bản kê khai không chứng minh điểm danh của cá nhân.'
  },
} as const;

function historicalAmount(amount: string) {
  return `${amount} Test USDC`;
}

function liveAmount(amount: string) {
  try { return `${formatTokenAmount(BigInt(amount), 6)} Test USDC`; }
  catch { return '—'; }
}

function operationLabel(snapshot: ProofSnapshot, language: VerificationLocale) {
  if (snapshot.status !== 'matched' || !snapshot.manifest) return null;
  return language === 'en'
    ? { create: 'Pot created', approve: 'Token approval', join: 'Joined', checkIn: 'Check-in', finalize: 'Finalized', claim: 'Claim' }
    : { create: 'Đã tạo quỹ', approve: 'Phê duyệt token', join: 'Đã tham gia', checkIn: 'Điểm danh', finalize: 'Đã chốt', claim: 'Nhận tiền' };
}

function receiptStatus(receipt: ProofSnapshot['receipts'][number] | undefined, snapshot: ProofSnapshot, locale: VerificationLocale) {
  if (receipt) {
    if (locale === 'en') return receipt.status === 'matched' ? 'Receipt matches its configured intent and block.' : receipt.status === 'mismatch' ? 'Receipt does not match its configured intent or block.' : 'Receipt could not be confirmed from the current public RPC.';
    return receipt.status === 'matched' ? 'Biên nhận khớp với ý định và khối đã cấu hình.' : receipt.status === 'mismatch' ? 'Biên nhận không khớp với ý định hoặc khối đã cấu hình.' : 'Không thể xác nhận biên nhận từ RPC công khai hiện tại.';
  }
  if (locale === 'en') return snapshot.status === 'mismatch' ? 'Configured reference — not checked because deployment identity mismatched.' : snapshot.status === 'unavailable' ? 'Configured reference — not checked because public evidence is unavailable.' : 'Configured reference — not checked against the chain.';
  return snapshot.status === 'mismatch' ? 'Tham chiếu đã cấu hình — chưa kiểm tra vì danh tính triển khai không khớp.' : snapshot.status === 'unavailable' ? 'Tham chiếu đã cấu hình — chưa kiểm tra vì bằng chứng công khai không khả dụng.' : 'Tham chiếu đã cấu hình — chưa đối chiếu với chuỗi.';
}

function simulationLabel(simulation: NonNullable<ProofSnapshot['receipts'][number]['simulation']>, locale: VerificationLocale) {
  const messages = {
    en: { 'would-succeed': 'Would succeed at the observed block', AlreadyClaimed: 'Already claimed at the observed block', NotEligible: 'Not eligible at the observed block', NotJoined: 'Not joined at the observed block', PotNotFinalized: 'Pot not finalized at the observed block', unavailable: 'Simulation unavailable', 'other-revert': 'Another contract revert at the observed block' },
    vi: { 'would-succeed': 'Có thể thành công tại khối được quan sát', AlreadyClaimed: 'Đã nhận tại khối được quan sát', NotEligible: 'Không đủ điều kiện tại khối được quan sát', NotJoined: 'Chưa tham gia tại khối được quan sát', PotNotFinalized: 'Quỹ chưa chốt tại khối được quan sát', unavailable: 'Không thể mô phỏng', 'other-revert': 'Hợp đồng trả về lỗi khác tại khối được quan sát' },
  } as const;
  return messages[locale][simulation];
}

export function VerificationView({ locale = 'en', potId = null, invalidPot = false, snapshot }: VerificationViewProps) {
  const t = copy[locale];
  const isHistorical = potId === historicalAnvil.potId && !invalidPot && !snapshot;
  const statusLabel = snapshot ? ({
    unconfigured: t.statusUnconfigured,
    'invalid-manifest': t.statusInvalidManifest,
    'invalid-pot': t.statusInvalidPot,
    unavailable: t.statusUnavailable,
    mismatch: t.statusMismatch,
    matched: t.statusMatched,
  } as const)[snapshot.status] : null;
  const operations = snapshot ? operationLabel(snapshot, locale) : null;

  return <div className={styles.page} lang={locale}>
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <a className={styles.brand} href="/verify">{t.brand}</a>
        <nav className={styles.languages} aria-label={t.language}>
          <a href={potId ? `/verify/${potId}?lang=en` : '/verify?lang=en'} aria-current={locale === 'en' ? 'page' : undefined}>{t.english}</a>
          <a href={potId ? `/verify/${potId}?lang=vi` : '/verify?lang=vi'} aria-current={locale === 'vi' ? 'page' : undefined}>{t.vietnamese}</a>
        </nav>
      </div>
    </header>
    <main className={styles.main}>
      {invalidPot ? <section className={styles.surface} aria-labelledby="verify-title">
        <h1 id="verify-title">{t.invalidTitle}</h1>
        <p>{t.invalidBody}</p>
        <a className={styles.textLink} href={`/verify?lang=${locale}`}>{t.return}</a>
      </section> : potId === null ? <>
        <section className={styles.intro} aria-labelledby="verify-title">
          <h1 id="verify-title">{t.title}</h1>
          <p>{t.intro}</p>
        </section>
        <div className={styles.columns}>
          <section className={styles.surface} aria-labelledby="lookup-title">
            <h2 id="lookup-title">{t.inputLabel}</h2>
            <form className={styles.lookup} action="/verify" method="get">
              <input type="hidden" name="lang" value={locale} />
              <label htmlFor="pot-id">{t.inputLabel}</label>
              <input id="pot-id" name="potId" inputMode="numeric" autoComplete="off" maxLength={78} placeholder={t.inputPlaceholder} required aria-describedby="pot-help" />
              <p id="pot-help" className={styles.help}>{t.inputHelp}</p>
              <button type="submit">{t.submit}</button>
            </form>
            <p className={styles.historyShortcut}><a href={`/verify/${historicalAnvil.potId}?lang=${locale}`}>{t.historicalLink}</a></p>
          </section>
          <aside className={styles.liveNotice} aria-labelledby="live-heading">
            <h2 id="live-heading">{t.liveHeading}</h2>
            <p>{t.liveBody}</p>
            <p className={styles.historyTeaser}>{t.historicalTeaser}</p>
            <a className={styles.historyTeaserLink} href={`/verify/${historicalAnvil.potId}?lang=${locale}`}>{t.historicalLink}</a>
          </aside>
        </div>
      </> : <>
        <section className={styles.intro} aria-labelledby="verify-title">
          <h1 id="verify-title">{isHistorical ? t.historicalTitle : t.unknownTitle(potId)}</h1>
          {isHistorical && <p className={styles.historyLabel}>{t.historicalLabel}</p>}
        </section>
        {isHistorical ? <>
          <p className={styles.summaryIntro}>{t.historicalIntro}</p>
          <section className={styles.surface} aria-label={t.historicalTitle}>
            <dl className={styles.summary}>
              <div><dt>{t.deposits}</dt><dd>{historicalAnvil.depositCount} × {historicalAmount(historicalAnvil.deposit)}</dd></div>
              <div><dt>{t.attendance}</dt><dd>{historicalAnvil.attendanceCount}</dd></div>
              <div><dt>{t.claims}</dt><dd>{historicalAnvil.payoutCount} × {historicalAmount(historicalAnvil.payout)}</dd></div>
              <div><dt>{t.residual}</dt><dd>{historicalAmount(historicalAnvil.residual)}</dd></div>
            </dl>
            <p className={styles.limits}>{t.historicalLimits}</p>
          </section>
          <p className={styles.historyNote}>{t.notHistorical}</p>
        </> : snapshot ? <section className={snapshot.status === 'matched' ? styles.manifestNotice : styles.liveNotice} aria-labelledby="live-heading">
          <div className={styles.statusHeading}>
            <h2 id="live-heading">{t.liveStatus}</h2>
            <span className={snapshot.status === 'matched' ? styles.statusMatched : styles.statusNotMatched}>{statusLabel}</span>
          </div>
          {snapshot.reason !== 'matched' && <p>{t.statusReason(snapshot.reason)}</p>}
          {snapshot.manifest && <dl className={styles.identities}>
            <div><dt>{locale === 'en' ? 'Network and chain ID' : 'Mạng và mã chuỗi'}</dt><dd>{snapshot.manifest.network} · {snapshot.manifest.chainId}</dd></div>
            <div><dt>{locale === 'en' ? 'Core address' : 'Địa chỉ core'}</dt><dd><code>{snapshot.manifest.contracts.core.address}</code></dd></div>
            <div><dt>{locale === 'en' ? 'Token address' : 'Địa chỉ token'}</dt><dd><code>{snapshot.manifest.contracts.token.address}</code></dd></div>
            <div><dt>{locale === 'en' ? 'Deployment block' : 'Khối triển khai'}</dt><dd><code>{snapshot.manifest.deployment.blockNumber}</code> · <code>{snapshot.manifest.deployment.blockHash}</code></dd></div>
            <div><dt>{locale === 'en' ? 'Declared source commit' : 'Commit mã nguồn đã khai báo'}</dt><dd><code>{snapshot.manifest.sourceCommit}</code></dd></div>
            <div><dt>{locale === 'en' ? 'Declared compiler settings' : 'Cấu hình trình biên dịch đã khai báo'}</dt><dd>{snapshot.manifest.compiler.version} · optimizer {snapshot.manifest.compiler.optimizer.enabled ? 'on' : 'off'} ({snapshot.manifest.compiler.optimizer.runs}) · {snapshot.manifest.compiler.evmVersion}</dd></div>
            <div><dt>{locale === 'en' ? 'Declared ABI hash' : 'Hash ABI đã khai báo'}</dt><dd><code>{snapshot.manifest.abiHash}</code></dd></div>
            {Object.entries(snapshot.manifest.contracts).map(([role, identity]) => <div key={role}><dt>{locale === 'en' ? `${role} deployed runtime hash` : `Hash runtime ${role} đã triển khai`}</dt><dd><code>{identity.deployedRuntimeHash}</code></dd></div>)}
          </dl>}
          {snapshot.status !== 'matched' && snapshot.manifest && <section className={styles.receipts} aria-labelledby="declared-receipts-heading">
            <h3 id="declared-receipts-heading">{locale === 'en' ? 'Declared transaction references · not verified' : 'Tham chiếu giao dịch đã khai báo · chưa xác minh'}</h3>
            {!snapshot.manifest.receipts.some(reference => reference.potId === snapshot.requestedPotId) ? <p>{locale === 'en' ? 'No transaction references are configured for this pot.' : 'Không có tham chiếu giao dịch nào được cấu hình cho quỹ này.'}</p> : <ol>{snapshot.manifest.receipts.filter(reference => reference.potId === snapshot.requestedPotId).map(reference => <li key={reference.hash}>
              <strong>{reference.intent.kind}</strong>
              <span className={styles.receiptOther}>{receiptStatus(undefined, snapshot, locale)}</span>
              <span>{locale === 'en' ? 'Configured transaction hash' : 'Hash giao dịch đã cấu hình'}: <code>{reference.hash}</code></span>
              <span>{locale === 'en' ? 'Configured block and hash' : 'Khối và hash đã cấu hình'}: <code>{reference.blockNumber}</code> · <code>{reference.blockHash}</code></span>
              <span>{locale === 'en' ? 'Configured sender' : 'Người gửi đã cấu hình'}: <code>{reference.intent.account}</code></span>
              <span>{locale === 'en' ? 'Configured pot' : 'Quỹ đã cấu hình'}: <code>{reference.potId}</code></span>
              {snapshot.manifest?.network === 'fuji' && <a href={`https://testnet.snowtrace.io/tx/${reference.hash}`} target="_blank" rel="noreferrer">{locale === 'en' ? 'Open declared transaction on Fuji explorer' : 'Mở giao dịch đã khai báo trên trình khám phá Fuji'}</a>}
            </li>)}</ol>}
          </section>}
          {snapshot.status === 'matched' && snapshot.pot && <>
            <p className={styles.observed}>{t.checkedAt(snapshot.observedBlock ?? '—')} · {snapshot.observedBlockHash}</p>
            <dl className={styles.summary}>
              <div><dt>{locale === 'en' ? 'Pot status' : 'Trạng thái quỹ'}</dt><dd>{snapshot.pot.status}</dd></div>
            <div><dt>{locale === 'en' ? 'Token address' : 'Địa chỉ token'}</dt><dd><code>{snapshot.pot.token}</code></dd></div>
            <div><dt>{locale === 'en' ? 'Verifier address' : 'Địa chỉ người xác minh'}</dt><dd><code>{snapshot.pot.verifier}</code></dd></div>
            <div><dt>{locale === 'en' ? 'Registration closes' : 'Đóng đăng ký'}</dt><dd>{new Date(snapshot.pot.registrationClose * 1000).toISOString()}</dd></div>
            <div><dt>{locale === 'en' ? 'Check-in opens' : 'Mở điểm danh'}</dt><dd>{new Date(snapshot.pot.checkInOpen * 1000).toISOString()}</dd></div>
            <div><dt>{locale === 'en' ? 'Check-in closes' : 'Đóng điểm danh'}</dt><dd>{new Date(snapshot.pot.checkInClose * 1000).toISOString()}</dd></div>
              <div><dt>{locale === 'en' ? 'Deposit per participant' : 'Tiền nạp mỗi người'}</dt><dd>{liveAmount(snapshot.pot.stakeAmount)}</dd></div>
              <div><dt>{locale === 'en' ? 'Participants' : 'Người tham gia'}</dt><dd>{snapshot.pot.participantCount}</dd></div>
              <div><dt>{locale === 'en' ? 'Check-ins' : 'Lượt điểm danh'}</dt><dd>{snapshot.pot.checkedInCount}</dd></div>
              {snapshot.pot.status === 'FINALIZED' && <>
                <div><dt>{locale === 'en' ? 'Payout per winner' : 'Mức nhận mỗi người'}</dt><dd>{liveAmount(snapshot.pot.payoutPerWinner)}</dd></div>
                <div><dt>{locale === 'en' ? 'Remainder' : 'Phần dư'}</dt><dd>{liveAmount(snapshot.pot.dustAmount)}</dd></div>
              </>}
            </dl>
            <p className={styles.limits}>{t.matchedLimits}</p>
            <p className={styles.receiptLimit}>{locale === 'en' ? 'Configured receipt references are shown with an individual match, mismatch, unavailable, or not-checked status. A successful check-in transaction does not establish that a participant was physically present.' : 'Tham chiếu biên nhận được hiển thị với trạng thái khớp, không khớp, không khả dụng hoặc chưa kiểm tra riêng từng mục. Giao dịch điểm danh thành công không chứng minh người tham gia đã có mặt.'}</p>
            {snapshot.manifest && <section className={styles.receipts} aria-labelledby="receipt-heading">
              <h3 id="receipt-heading">{locale === 'en' ? 'Configured transactions' : 'Giao dịch đã cấu hình'}</h3>
              {!snapshot.manifest.receipts.some(reference => reference.potId === snapshot.requestedPotId) ? <p>{t.noReceipts}</p> : <ol>{snapshot.manifest.receipts.filter(reference => reference.potId === snapshot.requestedPotId).map(reference => {
                const receipt = snapshot.receipts.find(item => item.reference.hash === reference.hash);
                const label = operations?.[reference.intent.kind] ?? reference.intent.kind;
                return <li key={reference.hash}>
                  <strong>{label}</strong>
                  <span className={receipt?.status === 'matched' ? styles.receiptMatched : styles.receiptOther}>{receiptStatus(receipt, snapshot, locale)}</span>
                  <span>{locale === 'en' ? 'Full transaction hash' : 'Hash giao dịch đầy đủ'}: <code>{reference.hash}</code></span>
                  <span>{locale === 'en' ? 'Reference block' : 'Khối tham chiếu'}: <code>{reference.blockNumber}</code></span>
                  <span>{locale === 'en' ? 'Reference block hash' : 'Hash khối tham chiếu'}: <code>{reference.blockHash}</code></span>
                  <span>{locale === 'en' ? 'Configured sender' : 'Người gửi đã cấu hình'}: <code>{reference.intent.account}</code></span>
                  <span>{locale === 'en' ? 'Configured pot' : 'Quỹ đã cấu hình'}: <code>{reference.potId}</code></span>
                  {receipt?.observed && <>
                    <span>{locale === 'en' ? 'Observed sender' : 'Người gửi được quan sát'}: <code>{receipt.observed.sender}</code></span>
                    <span>{locale === 'en' ? 'Observed destination' : 'Đích được quan sát'}: <code>{receipt.observed.destination}</code></span>
                    <span>{locale === 'en' ? 'Observed core' : 'Core được quan sát'}: <code>{receipt.observed.core}</code></span>
                    <span>{locale === 'en' ? 'Observed operation' : 'Thao tác được quan sát'}: {receipt.observed.operation}</span>
                    <span>{locale === 'en' ? 'Observed block' : 'Khối được quan sát'}: <code>{receipt.observed.blockNumber}</code> · <code>{receipt.observed.blockHash}</code></span>
                    {receipt.observed.potId && <span>{locale === 'en' ? 'Observed pot' : 'Quỹ được quan sát'}: <code>{receipt.observed.potId}</code></span>}
                    {receipt.observed.blockTimestamp && <span>{locale === 'en' ? 'Block time (UTC)' : 'Thời gian khối (UTC)'}: {new Date(receipt.observed.blockTimestamp * 1000).toISOString()}</span>}
                  </>}
                  {receipt?.beneficiary && <span>{t.beneficiary}: <code>{receipt.beneficiary}</code></span>}
                  {receipt?.amount && <span>{t.amount}: {liveAmount(receipt.amount)}</span>}
                  {receipt?.simulation && <span className={styles.simulation}>{locale === 'en' ? 'Current claim simulation, separate from receipt' : 'Mô phỏng nhận tiền hiện tại, tách biệt biên nhận'}: {simulationLabel(receipt.simulation, locale)}</span>}
                  {snapshot.manifest?.network === 'fuji' && <a href={`https://testnet.snowtrace.io/tx/${reference.hash}`} target="_blank" rel="noreferrer">{locale === 'en' ? 'Open Fuji explorer' : 'Mở trình khám phá Fuji'}</a>}
                </li>;
              })}</ol>}
            </section>}
          </>}
        </section> : <section className={styles.liveNotice} aria-labelledby="live-heading">
          <h2 id="live-heading">{t.liveHeading}</h2>
          <p>{t.unknownBody}</p>
        </section>}
        <a className={styles.textLink} href={`/verify?lang=${locale}`}>{t.return}</a>
      </>}
      <p className={styles.readOnly}>{t.readOnly}</p>
    </main>
  </div>;
}
