'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { calculatePayout, formatTokenAmount, getPotTimeState, isJoinAllowed, isCheckInAllowed, isFinalizeAllowed, normalizeAddress, parsePotId, parseTokenAmount, validatePotConfig, type Address, type ParticipantStatus, type PotConfig, type PotSummary, type TxHash, type WalletConnection } from '../domain';
import { decodeParticipantQr, encodeParticipantQr } from '../infrastructure/qr';
import { createDemoRuntime, type AppRuntime } from '../application/runtime';
import { parsePendingOperation, matchesPendingContext, type PendingOperation, type OperationKind } from '../application/pending';
import { activityStorageKey, parseActivity, type ConfirmedActivity } from '../application/activity';
import { messages, localizeError, type Locale, type MessageKey } from '../i18n/messages';

const operationMessages: Record<OperationKind, MessageKey> = { create: 'create', approve: 'approve', join: 'join', checkIn: 'sign', finalize: 'finalize', claim: 'claim' };
const PENDING_KEY = 'commitpot-pending-v1';
const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;
function Icon({ name }: { name: 'mark' | 'arrow' | 'check' | 'copy' | 'wallet' }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{name === 'mark' ? <><path d="M5 6h14v9a5 5 0 0 1-5 5h-4a5 5 0 0 1-5-5V6Z"/><path d="M8 3h8M9 12l2 2 4-4"/></> : name === 'arrow' ? <><path d="M5 12h14M13 6l6 6-6 6"/></> : name === 'check' ? <path d="m5 12 4 4L19 6"/> : name === 'copy' ? <><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/></> : <><rect x="3" y="6" width="18" height="14" rx="3"/><path d="M3 8V4h14M16 13h5"/></>}</svg>;
}
const blankStatus: ParticipantStatus = { joined: false, checkedIn: false, claimed: false, order: 0n, claimable: 0n };
function localInput(time: number) { const date = new Date(time * 1000); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }

export default function CommitPotApp() {
  const [locale, setLocale] = useState<Locale>('en');
  const [runtime, setRuntime] = useState<AppRuntime | null>(null);
  const [networkName, setNetworkName] = useState('');
  const [pots, setPots] = useState<PotSummary[]>([]);
  const [selected, setSelected] = useState<bigint | null>(null);
  const [pot, setPot] = useState<PotSummary | null>(null);
  const [connection, setConnection] = useState<WalletConnection>({ connected: false, address: null, chainId: null, mode: 'mock' });
  const [status, setStatus] = useState(blankStatus);
  const [balance, setBalance] = useState(0n);
  const [allowance, setAllowance] = useState(0n);
  const [now, setNow] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState<PendingOperation | null>(null);
  const [activity, setActivity] = useState<ConfirmedActivity[]>([]);
  const [view, setView] = useState<'event' | 'create' | 'desk'>('event');
  const [lookup, setLookup] = useState('');
  const [qrImage, setQrImage] = useState('');
  const [qrInput, setQrInput] = useState('');
  const [candidate, setCandidate] = useState<{ address: Address; status: ParticipantStatus } | null>(null);
  const [present, setPresent] = useState(false);
  const [camera, setCamera] = useState(false);
  const [cameraMessage, setCameraMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [form, setForm] = useState({ amount: '10', verifier: '', registration: '', open: '', close: '' });
  const videoRef = useRef<HTMLVideoElement>(null);
  const refreshId = useRef(0);
  const operationLock = useRef(false);
  const activityKey = useRef('');
  const t = (key: MessageKey) => messages[locale][key];
  const money = (value: bigint) => formatTokenAmount(value, 6);
  const date = (time: number) => new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(time * 1000);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('commitpot-language');
      if (saved === 'en' || saved === 'vi') setLocale(saved);
      const init = async () => {
        const mode = process.env.NEXT_PUBLIC_USE_MOCK;
        if (mode !== 'true' && mode !== 'false') throw { code: 'INVALID_CONFIG' };
        const next = mode === 'false' ? await (await import('../infrastructure/avalanche/browser')).createBrowserRuntime() : createDemoRuntime();
        setRuntime(next);
        const context = await next.repository.getChainContext();
        activityKey.current = activityStorageKey(context);
        setActivity(parseActivity(localStorage.getItem(activityKey.current)));
        setNetworkName(context.mode === 'local' ? 'Local chain · 31337' : context.mode === 'fuji' ? 'Avalanche Fuji · 43113' : '');
        const id = new URL(location.href).searchParams.get('pot');
        if (id) { try { setSelected(parsePotId(id)); } catch { setError(new Error('Invalid pot')); } }
        const raw = localStorage.getItem(PENDING_KEY);
        if (raw) setPending(parsePendingOperation(raw));
      };
      void init().catch(setError);
    } catch (cause) { setError(cause); }
  }, []);
  useEffect(() => { document.documentElement.lang = locale; try { localStorage.setItem('commitpot-language', locale); } catch { /* UI language remains usable without persistence. */ } }, [locale]);

  const refresh = useCallback(async (id = selected) => {
    if (!runtime) return;
    const request = ++refreshId.current;
    try {
      const [events, wallet, timestamp] = await Promise.all([runtime.repository.listPots(), runtime.wallet.getConnection(), runtime.repository.getChainTimestamp()]);
      const activeId = id ?? events[0]?.id ?? null;
      const active = activeId ? await runtime.repository.getPot(activeId) : null;
      const [participant, funds, approved] = wallet.address && active ? await Promise.all([runtime.repository.getParticipantStatus(active.id, wallet.address), runtime.wallet.getTokenBalance(wallet.address), runtime.wallet.getTokenAllowance(wallet.address)]) : [blankStatus, 0n, 0n];
      if (request !== refreshId.current) return;
      setPots(events); setConnection(wallet); setNow(timestamp); setPot(active); setStatus(participant); setBalance(funds); setAllowance(approved);
      if (activeId !== selected) setSelected(activeId);
    } catch (cause) { if (request === refreshId.current) { setPot(null); setError(cause); } }
  }, [runtime, selected]);
  useEffect(() => { void refresh(); const timer = setInterval(() => void refresh(), 5000); return () => clearInterval(timer); }, [refresh]);
  useEffect(() => { if (selected) { const url = new URL(location.href); url.searchParams.set('pot', String(selected)); history.replaceState(null, '', url); } setCandidate(null); setPresent(false); }, [selected]);
  useEffect(() => {
    const time = now || Math.floor(Date.now() / 1000);
    setForm(current => ({ ...current, verifier: current.verifier || runtime?.mock?.verifier || '', ...(current.registration ? {} : { registration: localInput(time + 3600), open: localInput(time + 3600), close: localInput(time + 7200) }) }));
  }, [now, runtime]);

  const personalPayload = pot && connection.address && status.joined ? encodeParticipantQr({ potId: String(pot.id), participant: connection.address }) : '';
  useEffect(() => { setQrImage(''); if (personalPayload) void QRCode.toDataURL(personalPayload, { width: 248, margin: 2, color: { dark: '#211842', light: '#ffffff' } }).then(setQrImage).catch(setError); }, [personalPayload]);
  const stopCamera = () => setCamera(false);
  useEffect(() => {
    if (!camera || !videoRef.current) return;
    let disposed = false; let stream: MediaStream | undefined; let timer: ReturnType<typeof setTimeout> | undefined;
    const start = async () => {
      type Detector = { detect(video: HTMLVideoElement): Promise<{ rawValue: string }[]> };
      const DetectorClass = (window as unknown as { BarcodeDetector?: new (options: { formats: string[] }) => Detector }).BarcodeDetector;
      if (!DetectorClass || !navigator.mediaDevices?.getUserMedia) { setCameraMessage(messages[locale].cameraUnavailable); setCamera(false); return; }
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      if (disposed) { stream.getTracks().forEach(track => track.stop()); return; }
      const video = videoRef.current!; video.srcObject = stream; await video.play(); const detector = new DetectorClass({ formats: ['qr_code'] });
      const scan = async () => { if (disposed) return; try { const codes = await detector.detect(video); if (codes[0]) { setQrInput(codes[0].rawValue); setCamera(false); return; } } catch { /* A partial video frame may not yet be decodable. */ } timer = setTimeout(scan, 300); };
      void scan();
    };
    void start().catch(() => { setCameraMessage(messages[locale].noCameraPermission); setCamera(false); });
    return () => { disposed = true; if (timer) clearTimeout(timer); stream?.getTracks().forEach(track => track.stop()); };
  }, [camera, locale]);
  useEffect(() => { setCamera(false); }, [view]);

  async function transact(kind: OperationKind, action: () => Promise<TxHash>): Promise<boolean> {
    if (!runtime || busy || pending || operationLock.current) return false;
    operationLock.current = true;
    setBusy(true); setError(null);
    let submitted = false;
    let knownReceipt = false;
    try {
      const context = await runtime.repository.getChainContext();
      const current = await runtime.wallet.getConnection();
      if (!current.address || current.address.toLowerCase() !== connection.address?.toLowerCase() || current.chainId !== context.chainId) throw { code: 'WRONG_CHAIN' };
      const intent: PendingOperation = { kind, potId: kind === 'create' ? undefined : pot ? String(pot.id) : undefined, account: current.address, chainId: context.chainId, core: context.coreAddress, started: Date.now() };
      localStorage.setItem(PENDING_KEY, JSON.stringify(intent)); setPending(intent);
      const hash = await action(); submitted = true;
      const item = { ...intent, hash }; setPending(item); localStorage.setItem(PENDING_KEY, JSON.stringify(item));
      const receipt = await runtime.repository.waitForTransaction(hash);
      knownReceipt = true;
      localStorage.removeItem(PENDING_KEY); setPending(null);
      if (receipt.status !== 'success') throw receipt.error ?? new Error('Reverted transaction');
      setActivity(previous => {
        const next = [{ kind, hash: receipt.hash, time: Date.now() }, ...previous.filter(item => item.hash !== receipt.hash)].slice(0, 6);
        try { localStorage.setItem(activityKey.current, JSON.stringify(next)); } catch { /* Confirmed payments remain confirmed if optional activity history cannot persist. */ }
        return next;
      });
      if (receipt.createdPotId) { setSelected(receipt.createdPotId); setView('event'); setReviewing(false); await refresh(receipt.createdPotId); }
      else await refresh();
      return true;
    } catch (cause) {
      const code = cause && typeof cause === 'object' && 'code' in cause ? String(cause.code) : '';
      const deterministic = cause && typeof cause === 'object' && 'name' in cause && cause.name === 'DomainError';
      if (knownReceipt || (!submitted && (runtime.mock || deterministic || ['4001', 'ACTION_REJECTED'].includes(code)))) { localStorage.removeItem(PENDING_KEY); setPending(null); }
      setError(cause); return false;
    } finally { operationLock.current = false; setBusy(false); }
  }
  async function reconcile() {
    if (!runtime || !pending?.hash) return;
    setBusy(true);
    try {
      const context = await runtime.repository.getChainContext();
      if (!matchesPendingContext(pending, context)) throw { code: 'WRONG_CHAIN' };
      const current = await runtime.wallet.getConnection();
      if (!current.address || !pending.account || current.address.toLowerCase() !== pending.account.toLowerCase()) throw { code: 'ACCOUNT_NOT_CONNECTED' };
      const receipt = await runtime.repository.waitForTransaction(pending.hash);
      localStorage.removeItem(PENDING_KEY); setPending(null);
      if (receipt.status !== 'success') throw receipt.error;
      if (receipt.createdPotId) { setSelected(receipt.createdPotId); setView('event'); }
      await refresh(receipt.createdPotId ?? selected);
    } catch (cause) { setError(cause); } finally { setBusy(false); }
  }
  async function copy(value: string) { try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch (cause) { setError(cause); } }
  function configFromForm(): PotConfig {
    if (!runtime) throw new Error('Runtime unavailable');
    const config = { token: runtime.mock ? '0x0000000000000000000000000000000000001000' as Address : pot?.config.token ?? process.env.NEXT_PUBLIC_USDC_ADDRESS as Address, verifier: normalizeAddress(form.verifier), stakeAmount: parseTokenAmount(form.amount, 6), registrationClose: Math.floor(new Date(form.registration).getTime() / 1000), checkInOpen: Math.floor(new Date(form.open).getTime() / 1000), checkInClose: Math.floor(new Date(form.close).getTime() / 1000) };
    validatePotConfig(config, now); return config;
  }
  async function inspectQr() {
    if (!runtime || !pot) return;
    setError(null); setPresent(false);
    try { const result = decodeParticipantQr(qrInput, { expectedPotId: String(pot.id) }); const member = await runtime.repository.getParticipantStatus(pot.id, result.participant); if (!member.joined) throw { code: 'NOT_JOINED' }; setCandidate({ address: result.participant, status: member }); }
    catch (cause) { setCandidate(null); setError(cause); }
  }
  async function recordAttendance() {
    if (!runtime || !pot || !candidate || !present) return;
    const bytes = crypto.getRandomValues(new Uint8Array(32)); const nonce = BigInt(`0x${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')}`);
    const success = await transact('checkIn', async () => {
      const timestamp = await runtime.repository.getChainTimestamp();
      const proof = await runtime.wallet.signCheckIn({ potId: pot.id, participant: candidate.address, nonce, deadline: Math.min(timestamp + 300, pot.config.checkInClose) });
      return runtime.repository.submitCheckIn(proof);
    });
    if (success) { setCandidate(null); setPresent(false); setQrInput(''); }
  }
  async function loadExample() {
    if (!runtime?.mock || busy || pending) return;
    setBusy(true); setError(null);
    try {
      const timestamp = runtime.mock.clock.now(); runtime.mock.setAccount(runtime.mock.accounts[0]);
      const hash = await runtime.repository.createPot({ token: (await runtime.repository.getTokenInfo()).address, verifier: runtime.mock.verifier, stakeAmount: 10_000_000n, registrationClose: timestamp + 60, checkInOpen: timestamp + 90, checkInClose: timestamp + 390 });
      const id = (await runtime.repository.waitForTransaction(hash)).createdPotId!;
      for (const account of runtime.mock.accounts) { runtime.mock.setAccount(account); await runtime.wallet.approveToken(10_000_000n); await runtime.repository.joinPot(id); }
      runtime.mock.setAccount(runtime.mock.accounts[0]); setSelected(id); setView('event'); await refresh(id);
    } catch (cause) { setError(cause); } finally { setBusy(false); }
  }
  const phase = pot ? getPotTimeState(pot, now) : null;
  const phaseKey: Record<string, MessageKey> = { REGISTRATION: 'registrationPhase', WAITING: 'waitingPhase', CHECK_IN: 'checkInPhase', AWAITING_FINALIZATION: 'awaitingPhase', FINALIZED: 'finalizedPhase' };
  const disabled = busy || !!pending;
  const authorized = !!pot && connection.address?.toLowerCase() === pot.config.verifier.toLowerCase();

  return <div className="app-shell">
    <aside className="brand-rail"><a className="brand" href="/" aria-label="CommitPot"><span className="brand-symbol"><Icon name="mark" /></span><span>CommitPot</span></a><p>{t('tagline')}</p><div className="rail-bottom"><span className="network-dot" />{runtime?.mock ? t('mock') : networkName}<small>{t('testOnly')}</small></div></aside>
    <div className="workspace">
      <header className="topbar"><span className="mobile-brand">CommitPot</span><span className="topbar-caption">{t('event')}</span><div className="topbar-actions"><div className="language-control" aria-label="Language"><button aria-pressed={locale === 'en'} onClick={() => setLocale('en')}>EN</button><button aria-pressed={locale === 'vi'} onClick={() => setLocale('vi')}>VI</button></div><button className="wallet-button" onClick={() => { if (!runtime) return; void (connection.connected ? runtime.disconnect() : runtime.connect()).then(() => refresh()).catch(setError); }} disabled={!runtime || busy}><Icon name="wallet" />{connection.address ? short(connection.address) : t('connect')}</button></div></header>
      {runtime?.mock && <div className="demo-banner"><strong>{t('mock')}</strong><span>{t('mockHelp')}</span></div>}
      <main>
        <div className="page-heading"><div><h1>{view === 'create' ? t('createTitle') : t('pots')}</h1><p>{view === 'create' ? t('createIntro') : t('tagline')}</p></div><button className="primary" onClick={() => { setView(view === 'create' ? 'event' : 'create'); setReviewing(false); setError(null); }}><span>{view === 'create' ? t('back') : t('create')}</span><Icon name="arrow" /></button></div>
        {!!error && <div className="notice error" role="alert"><strong>{t('errors')}</strong><p>{localizeError(error, locale)}</p><button onClick={() => setError(null)}>{t('cancel')}</button>{!runtime && <button onClick={() => { if (confirm(t('resetConfirm'))) { localStorage.removeItem('commitpot-demo-v1'); location.reload(); } }}>{t('reset')}</button>}</div>}
        {pending && <div className="notice pending" role="status"><strong>{busy ? t('pending') : t('unknown')}</strong>{pending.hash && <code>{pending.hash}</code>}<div className="button-row">{pending.hash && <button onClick={() => void reconcile()} disabled={busy}>{t('reconcile')}</button>}{!busy && <button onClick={() => { if (confirm(t('clearUnknownConfirm'))) { localStorage.removeItem(PENDING_KEY); setPending(null); } }}>{t('clearUnknown')}</button>}</div></div>}
        {view === 'create' ? <section className="create-surface">
          <form onSubmit={event => { event.preventDefault(); try { configFromForm(); setReviewing(true); } catch (cause) { setError(cause); } }}>
            <div className="form-grid"><label>{t('amount')}<div className="amount-input"><input required aria-label={t('amount')} inputMode="decimal" value={form.amount} onChange={e => { setReviewing(false); setForm({ ...form, amount: e.target.value }); }} /><span>Test USDC</span></div></label><label>{t('verifierAddress')}<input required value={form.verifier} placeholder="0x…" onChange={e => { setReviewing(false); setForm({ ...form, verifier: e.target.value }); }} /></label>{(['registration', 'open', 'close'] as const).map((field, index) => <label key={field}>{t((['registration', 'checkInOpen', 'checkInClose'] as const)[index])}<input required type="datetime-local" value={form[field]} onChange={e => { setReviewing(false); setForm({ ...form, [field]: e.target.value }); }} /></label>)}</div>
            <p className="secondary-text">{t('timezone')} · {Intl.DateTimeFormat().resolvedOptions().timeZone}</p><p className="trust-note">{t('trust')}</p>
            {reviewing ? <div className="review-block"><h2>{t('rules')}</h2><p>{t('immutable')}</p><dl><div><dt>{t('deposit')}</dt><dd>{form.amount} Test USDC</dd></div>{(['registration', 'open', 'close'] as const).map((field, i) => <div key={field}><dt>{t((['registration', 'checkInOpen', 'checkInClose'] as const)[i])}</dt><dd>{new Date(form[field]).toLocaleString(locale === 'en' ? 'en-GB' : 'vi-VN')}</dd></div>)}<div><dt>{t('verifier')}</dt><dd className="address">{form.verifier}</dd></div></dl><button type="button" className="primary" disabled={disabled || !connection.connected} onClick={() => void transact('create', () => runtime!.repository.createPot(configFromForm()))}>{t('confirmCreate')}</button></div> : <button className="primary" disabled={!runtime || busy}>{t('review')}<Icon name="arrow" /></button>}
          </form>
        </section> : <div className="event-layout">
          <section className="event-picker" aria-label={t('pots')}><form className="lookup" onSubmit={event => { event.preventDefault(); try { setSelected(parsePotId(lookup)); void refresh(parsePotId(lookup)); } catch (cause) { setError(cause); } }}><label htmlFor="pot-id">{t('potId')}</label><div><input id="pot-id" inputMode="numeric" value={lookup} onChange={event => setLookup(event.target.value)} placeholder="1" /><button aria-label={t('open')}><Icon name="arrow" /></button></div></form><div className="event-list">{pots.map(item => <button className={`event-item ${selected === item.id ? 'selected' : ''}`} key={String(item.id)} onClick={() => { setSelected(item.id); setView('event'); setError(null); }}><span className="event-number">#{String(item.id).padStart(2, '0')}</span><strong>{t('event')} {String(item.id)}</strong><span>{money(item.config.stakeAmount)} Test USDC</span><span className="item-phase">{t(phaseKey[getPotTimeState(item, now)])}</span></button>)}</div>{runtime?.mock && <details className="demo-tools"><summary>{t('mockTools')}</summary><p>{t('mockHelp')}</p><button disabled={disabled} onClick={() => void loadExample()}>{t('example')}</button><button disabled={disabled} onClick={() => { if (confirm(t('resetConfirm'))) { runtime.mock!.reset(); localStorage.removeItem(activityKey.current); setActivity([]); history.replaceState(null, '', '/'); setSelected(null); setPot(null); void refresh(null); } }}>{t('reset')}</button></details>}</section>
          <section className="event-workspace">{!pot ? <div className="empty-state"><span className="empty-mark"><Icon name="mark" /></span><h2>{t('noEvents')}</h2><p>{t('empty')}</p><button className="primary" onClick={() => setView('create')}>{t('create')}<Icon name="arrow" /></button>{runtime?.mock && <button className="text-button" disabled={disabled} onClick={() => void loadExample()}>{t('example')}</button>}</div> : <>
            <div className="event-title"><div><h2>{t('event')} <span>#{String(pot.id)}</span></h2><p className={`phase-label ${phase === 'FINALIZED' ? 'settled' : ''}`}><span />{t(phaseKey[phase!])}</p></div><button className="icon-button" aria-label={t('share')} onClick={() => void copy(location.href)}><Icon name="copy" />{copied ? t('copied') : t('share')}</button></div>
            <nav className="event-tabs"><button aria-current={view === 'event' ? 'page' : undefined} onClick={() => setView('event')}>{t('overview')}</button><button aria-current={view === 'desk' ? 'page' : undefined} onClick={() => setView('desk')}>{t('verifierTab')}</button></nav>
            <div className="event-body"><div className="event-main">
              <div className="deposit-line"><div><span>{t('deposit')}</span><strong>{money(pot.config.stakeAmount)} <small>Test USDC</small></strong></div><div className="count-pair"><span><strong>{String(pot.participantCount)}</strong>{t('joined')}</span><span><strong>{String(pot.checkedInCount)}</strong>{t('attended')}</span></div></div>
              <ol className="phase-rail">{(['registration', 'checkInOpen', 'checkInClose'] as const).map((key, i) => { const stamp = [pot.config.registrationClose, pot.config.checkInOpen, pot.config.checkInClose][i]; return <li className={now >= stamp ? 'reached' : ''} key={key}><span className="phase-node">{now >= stamp ? <Icon name="check" /> : i + 1}</span><div><strong>{t(key)}</strong><time>{date(stamp)}</time></div></li>; })}</ol>
              {view === 'desk' ? <section className="checkin-desk"><h3>{t('deskTitle')}</h3><p>{t('deskIntro')}</p>{!authorized && <p className="notice">{t('unauthorized')}</p>}<label>{t('qrInput')}<textarea aria-label={t('qrInput')} value={qrInput} onChange={event => { setQrInput(event.target.value); setCandidate(null); setPresent(false); }} placeholder='{"v":1,"potId":"1","participant":"0x…"}' rows={3} /></label><div className="button-row"><button disabled={disabled || !qrInput} onClick={() => void inspectQr()}>{t('inspect')}</button><button disabled={!authorized} onClick={() => { setCameraMessage(''); setCamera(value => !value); }}>{camera ? t('stopCamera') : t('scan')}</button></div>{camera && <video ref={videoRef} playsInline muted className="scanner" />}{cameraMessage && <p role="status">{cameraMessage}</p>}{candidate && <div className="candidate"><span>{t('candidate')}</span><code>{candidate.address}</code>{candidate.status.checkedIn ? <p>{t('alreadyAttended')}</p> : <><label className="checkbox"><input type="checkbox" checked={present} onChange={event => setPresent(event.target.checked)} />{t('present')}</label><button className="primary" disabled={disabled || !present || !authorized || !isCheckInAllowed(pot, now)} onClick={() => void recordAttendance()}>{t('sign')}<Icon name="check" /></button></>}</div>}</section> : <>
                <div className="allocation"><div><h3>{t('pool')}</h3><strong>{money(pot.participantCount * pot.config.stakeAmount)} <span>Test USDC</span></strong></div><p>{pot.status === 'FINALIZED' && pot.checkedInCount === 0n ? t('noAttendance') : t('trust')}</p></div>
                {pot.status !== 'FINALIZED' && pot.checkedInCount > 0n && <div className="estimate"><h3>{t('estimate')}</h3><strong>{money(calculatePayout(pot.participantCount, pot.checkedInCount, pot.config.stakeAmount).base)} Test USDC</strong><p>{t('estimateHelp')}</p></div>}
                {isFinalizeAllowed(pot, now) && <div className="settlement-action"><p>{t('finalizeHelp')}</p><button className="primary" disabled={disabled || !connection.connected} onClick={() => void transact('finalize', () => runtime!.repository.finalizePot(pot.id))}>{t('finalize')}<Icon name="arrow" /></button></div>}
                <details className="fixed-rules"><summary>{t('rules')}</summary><dl><div><dt>{t('verifier')}</dt><dd className="address">{pot.config.verifier}</dd></div><div><dt>{t('token')}</dt><dd className="address">{pot.config.token}</dd></div></dl><p>{t('immutable')}</p><p>{t('trust')}</p></details>
              </>}
            </div><aside className="personal-panel"><h3>{t('yourStatus')}</h3>{runtime?.mock && <label>{t('selectAccount')}<select value={connection.address ?? ''} disabled={busy} onChange={event => { runtime.mock!.setAccount(event.target.value ? event.target.value as Address : null); setCandidate(null); void refresh(); }}><option value="">{t('disconnected')}</option>{runtime.mock.accounts.map((address, i) => <option value={address} key={address}>{t('participant')} {i + 1} · {short(address)}</option>)}<option value={runtime.mock.verifier}>{t('demoVerifier')} · {short(runtime.mock.verifier)}</option></select></label>}{connection.address ? <><p className="address personal-address">{connection.address}</p><dl className="wallet-summary"><div><dt>{t('balance')}</dt><dd>{money(balance)} Test USDC</dd></div></dl><p className="personal-state"><Icon name={status.checkedIn || status.joined ? 'check' : 'wallet'} />{status.claimed ? t('claimed') : status.checkedIn ? t('stateAttended') : status.joined ? t('stateJoined') : t('stateUnjoined')}</p>{!status.joined && isJoinAllowed(pot, now) && <><button className="primary full" disabled={disabled} onClick={() => void transact(allowance < pot.config.stakeAmount ? 'approve' : 'join', () => allowance < pot.config.stakeAmount ? runtime!.wallet.approveToken(pot.config.stakeAmount) : runtime!.repository.joinPot(pot.id))}>{allowance < pot.config.stakeAmount ? t('approve') : t('join')}<Icon name="arrow" /></button><p className="hint">{t('approveHelp')}</p></>}{!status.joined && !isJoinAllowed(pot, now) && <p>{t('closedJoin')}</p>}{status.joined && pot.status !== 'FINALIZED' && <details className="qr-panel" open={phase === 'CHECK_IN'}><summary>{t('qr')}</summary>{qrImage && <img src={qrImage} width={220} height={220} alt={t('qr')} />}<p>{t('qrHelp')}</p><button onClick={() => void copy(personalPayload)}>{t('payload')}</button></details>}{pot.status === 'FINALIZED' && status.joined && <>{status.claimable > 0n ? <div className="entitlement"><span>{t('claimable')}</span><strong>{money(status.claimable)} <small>Test USDC</small></strong><p>{t('destination')}: {short(connection.address)}</p><button className="primary full" disabled={disabled} onClick={() => void transact('claim', () => runtime!.repository.claimPayout(pot.id, connection.address!))}>{pot.checkedInCount === 0n ? t('refund') : t('claim')}<Icon name="arrow" /></button></div> : !status.claimed && <p>{t('noShow')}</p>}</>}</> : <button className="primary full" onClick={() => void runtime?.connect().then(() => refresh()).catch(setError)}>{t('connect')}</button>}{runtime?.mock && phase !== 'FINALIZED' && <button className="advance-button" disabled={disabled} onClick={() => { const next = now < pot.config.checkInOpen ? pot.config.checkInOpen : pot.config.checkInClose + 1; runtime.mock!.clock.set(next); stopCamera(); void refresh(); }}>{t('advance')}</button>}<p className="hint">{t('receiptHelp')}</p></aside></div>
            <section className="activity"><h3>{t('receipts')}</h3>{!activity.length ? <p>{t('noReceipts')}</p> : <ul>{activity.map(item => <li key={item.hash}><Icon name="check" /><span>{t(operationMessages[item.kind])}<small>{t('confirmed')} · {new Date(item.time).toLocaleTimeString(locale)}</small></span><code>{short(item.hash)}</code></li>)}</ul>}</section>
          </>}</section>
        </div>}
      </main><footer><span>CommitPot</span><p>{t('testOnly')}</p><button onClick={() => { setError(null); void refresh(); }}>{t('refresh')}</button></footer>
    </div>
  </div>;
}
