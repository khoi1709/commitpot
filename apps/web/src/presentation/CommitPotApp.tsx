'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import demoEvent from '../../public/demo-event.json';
import { EventBrief } from './EventBrief';
import { useAttendanceCandidate, type AttendanceContext, type AttendanceReview } from '../application/useAttendanceCandidate';
import { usePublicPot, type PublicPotSnapshot } from '../application/usePublicPot';
import { createDemoRuntime, type AppRuntime } from '../application/runtime';
import { createRecoveryController, getBrowserStorage, readPreference, writePreference, withRecoveryLease, RecoveryError, type RecoveryController, type RecoverySnapshot } from '../application/recovery';
import { ACTIVITY_LIMIT, isLegacyActivity, loadConfirmedActivity, type ConfirmedActivity } from '../application/activity';
import type { OperationKind } from '../application/pending';
import { calculatePayout, DomainError, formatTokenAmount, getPotTimeState, isCheckInAllowed, isFinalizeAllowed, isJoinAllowed, normalizeAddress, parsePotId, parseTokenAmount, validatePotConfig, validateTimestamp, type Address, type ChainContext, type OperationContext, type OperationIntent, type OperationStage, type ParticipantStatus, type PotConfig, type PotSummary, type TransactionReceipt, type WalletConnection } from '../domain';
import { encodeParticipantQr } from '../infrastructure/qr';
import { messages, localizeError, type Locale, type MessageKey } from '../i18n/messages';

type PendingOperation = ReturnType<RecoveryController['begin']>;
export function hasCriticalReadWarning(snapshot: PublicPotSnapshot) {
  const reads = snapshot.selected === null ? [snapshot.chain, snapshot.time] : [snapshot.chain, snapshot.time, snapshot.pot];
  return !snapshot.publicVerified && reads.some(read => read.status === 'error' || read.status === 'stale');
}
export function mergeCurrentActivity(stored: ConfirmedActivity[], completed: ConfirmedActivity[], context: Pick<ChainContext, 'chainId' | 'coreAddress'>) {
  const matchesContext = (item: ConfirmedActivity) => !isLegacyActivity(item)
    && item.chainId === context.chainId && item.coreAddress.toLowerCase() === context.coreAddress.toLowerCase();
  const rows = [...completed.filter(matchesContext), ...stored.filter(item => isLegacyActivity(item) || matchesContext(item))];
  const unique = new Map<string, ConfirmedActivity>();
  for (const item of rows) {
    const key = item.hash.toLowerCase();
    const existing = unique.get(key);
    if (!existing || isLegacyActivity(existing) && !isLegacyActivity(item)) unique.set(key, item);
  }
  return [...unique.values()].slice(0, ACTIVITY_LIMIT);
}
export function PersonalEntitlementAction({ amount, noAttendance, disabled, locale, onClaim }: { amount: string; noAttendance: boolean; disabled: boolean; locale: Locale; onClaim: () => void }) {
  return <div className="entitlement"><span>{messages[locale].claimable}</span><strong>{amount} <small>Test USDC</small></strong><button className="primary full" disabled={disabled} onClick={onClaim}>{messages[locale][noAttendance ? 'refund' : 'claim']}<Icon name="arrow" /></button></div>;
}
export function ReviewSubmitButton({ disabled, label }: { disabled: boolean; label: string }) {
  return <button className="primary" type="submit" disabled={disabled}>{label}<Icon name="arrow" /></button>;
}
export function publicReadWarningAfterReceiptRefresh(snapshot: Pick<PublicPotSnapshot, 'selected' | 'chain' | 'time' | 'pot' | 'publicVerified'>, pending: boolean) {
  if (!pending) return null;
  const criticalReads = snapshot.selected === null ? [snapshot.chain, snapshot.time] : [snapshot.chain, snapshot.time, snapshot.pot];
  if (criticalReads.some(read => read.status === 'loading' || read.status === 'idle')) return null;
  return { warning: snapshot.publicVerified ? null : snapshot.chain.error ?? snapshot.time.error ?? snapshot.pot.error ?? new DomainError('RPC_UNAVAILABLE') };
}
export function PublicRefreshWarning({ locale, onRefresh }: { locale: Locale; onRefresh: () => void }) {
  return <div className="notice pending" role="status"><strong>{messages[locale].publicDataWarning}</strong><p>{messages[locale].publicDataWarningHelp}</p><button onClick={onRefresh}>{messages[locale].refresh}</button></div>;
}
const stageMessageKeys: Record<OperationStage, MessageKey> = { preparing: 'stagePreparing', signing: 'stageSigning', preflight: 'stagePreflight', submitting: 'stageSubmitting', confirming: 'stageConfirming' };
const operationMessages: Record<OperationKind, MessageKey> = { create: 'create', approve: 'approve', join: 'join', checkIn: 'sign', finalize: 'finalize', claim: 'claim' };
const PENDING_KEY = 'commitpot-pending-v1';
const CHECKIN_QR_ENTRY_ID = 'checkin-qr-entry';
type CheckInQrTarget = { focus: () => void; scrollIntoView: (options?: ScrollIntoViewOptions) => void };
export function MobileDeskJump({ label, onActivate }: { label: string; onActivate: () => void }) {
  return <button type="button" className="mobile-desk-jump" aria-controls={CHECKIN_QR_ENTRY_ID} onClick={onActivate}>{label}<Icon name="arrow" /></button>;
}
export function CheckInQrEntry({ label, safetyCopy, value, onInput }: { label: string; safetyCopy: string; value: string; onInput: (value: string) => void }) {
  return <><label htmlFor={CHECKIN_QR_ENTRY_ID}>{label}<textarea id={CHECKIN_QR_ENTRY_ID} aria-label={label} value={value} onChange={event => onInput(event.target.value)} placeholder='{"v":1,"potId":"1","participant":"0x…"}' rows={3} /></label><p className="qr-limit">{safetyCopy}</p></>;
}
export function focusCheckInQrEntry(target: CheckInQrTarget, reducedMotion: boolean) {
  target.focus();
  target.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
}
const blankConnection: WalletConnection = { connected: false, address: null, chainId: null, mode: 'mock' };
const blankStatus: ParticipantStatus = { joined: false, checkedIn: false, claimed: false, order: 0n, claimable: 0n };
const short = (value: string) => `${value.slice(0, 6)}…${value.slice(-4)}`;
const sameAddress = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
function localInput(time: number) { const date = new Date(time * 1000); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
function Icon({ name }: { name: 'mark' | 'arrow' | 'check' | 'copy' | 'wallet' }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{name === 'mark' ? <><path d="M5 6h14v9a5 5 0 0 1-5 5h-4a5 5 0 0 1-5-5V6Z"/><path d="M8 3h8M9 12l2 2 4-4"/></> : name === 'arrow' ? <><path d="M5 12h14M13 6l6 6-6 6"/></> : name === 'check' ? <path d="m5 12 4 4L19 6"/> : name === 'copy' ? <><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/></> : <><rect x="3" y="6" width="18" height="14" rx="3"/><path d="M3 8V4h14M16 13h5"/></>}</svg>;
}

type FreshState = { context: ChainContext; connection: WalletConnection; time: number; pot: PotSummary | null; participant: ParticipantStatus | null };
type Mutation = { kind: Exclude<OperationKind, 'checkIn'>; potId?: bigint; config?: PotConfig };
export function receiptDetails(intent: OperationIntent | null | undefined, receipt: TransactionReceipt, locale: Locale) {
  const unknown = messages[locale].unknown;
  const storedPotId = intent && 'potId' in intent ? intent.potId : undefined;
  const storedBeneficiary = intent?.kind === 'claim' ? intent.beneficiary : intent?.kind === 'checkIn' ? intent.proof.participant : undefined;
  const storedAmount = intent && 'amount' in intent ? intent.amount : intent?.kind === 'create' ? intent.config.stakeAmount : undefined;
  const lines = [
    `${messages[locale].operation}: ${intent?.kind ?? receipt.operation ?? unknown}`,
    `${messages[locale].copyHash}: ${receipt.hash}`,
    `${messages[locale].chain}: ${receipt.chainId ?? intent?.chainId ?? unknown}`,
    `${messages[locale].core}: ${receipt.coreAddress ?? intent?.core ?? unknown}`,
    `${messages[locale].from}: ${receipt.from ?? intent?.account ?? unknown}`,
    `${messages[locale].destination}: ${receipt.to ?? unknown}`,
    `${messages[locale].potId}: ${receipt.potId ?? receipt.createdPotId ?? storedPotId ?? unknown}`,
    `${messages[locale].beneficiary}: ${receipt.beneficiary ?? storedBeneficiary ?? unknown}`,
    `${messages[locale].amount}: ${receipt.amount ?? storedAmount ?? unknown}`,
    `${messages[locale].block}: ${receipt.blockNumber ?? unknown}`,
  ];
  return lines.join('\n');
}
export function activityDetails(item: ConfirmedActivity, locale: Locale) {
  if (isLegacyActivity(item)) return `${messages[locale].legacyLabel}: ${item.kind} · ${item.hash}`;
  return [
    `${messages[locale].operation}: ${item.kind}`, `${messages[locale].copyHash}: ${item.hash}`,
    `${messages[locale].chain}: ${item.chainId}`, `${messages[locale].core}: ${item.coreAddress}`,
    `${messages[locale].from}: ${item.from}`, `${messages[locale].destination}: ${item.to}`,
    ...(item.potId ? [`${messages[locale].potId}: ${item.potId}`] : []),
    ...(item.beneficiary ? [`${messages[locale].beneficiary}: ${item.beneficiary}`] : []),
    ...(item.amount ? [`${messages[locale].amount}: ${item.amount}`] : []),
    `${messages[locale].block}: ${item.blockNumber}`,
  ].join('\n');
}

export default function CommitPotApp() {
  const [locale, setLocale] = useState<Locale>('en');
  const [runtime, setRuntime] = useState<AppRuntime | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [nativeBalance, setNativeBalance] = useState<bigint | null | undefined>(undefined);
  const [selected, setSelected] = useState<bigint | null>(null);
  const [view, setView] = useState<'event' | 'create' | 'desk'>('event');
  const [error, setError] = useState<unknown>(null);
  const [publicRefreshWarning, setPublicRefreshWarning] = useState<unknown>(null);
  const [receiptRefreshPending, setReceiptRefreshPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copyState, setCopyState] = useState(false);
  const [camera, setCamera] = useState(false);
  const [cameraMessage, setCameraMessage] = useState('');
  const [qrImage, setQrImage] = useState('');
  const [lookup, setLookup] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [form, setForm] = useState({ amount: '10', verifier: '', registration: '', open: '', close: '' });
  const [recovery, setRecovery] = useState<RecoveryController | null>(null);
  const [recoverySnapshot, setRecoverySnapshot] = useState<RecoverySnapshot | null>(null);
  const [storedActivity, setStoredActivity] = useState<ConfirmedActivity[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const recoveryLock = useRef(false);
  const initialSelection = useRef(false);
  const attendanceRef = useRef<ReturnType<typeof useAttendanceCandidate> | null>(null);
  const t = (key: MessageKey) => messages[locale][key];
  const money = (value: bigint) => formatTokenAmount(value, 6);
  const date = (time: number) => new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(time * 1000);

  useEffect(() => {
    let active = true;
    const storage = getBrowserStorage();
    const savedLocale = readPreference(storage, 'commitpot-language');
    if (savedLocale === 'en' || savedLocale === 'vi') setLocale(savedLocale);
    try {
      const mode = process.env.NEXT_PUBLIC_USE_MOCK;
      if (mode !== 'true' && mode !== 'false') throw new DomainError('INVALID_CONFIG');
      const start = async () => {
        const next = mode === 'false' ? await (await import('../infrastructure/avalanche/browser')).createBrowserRuntime() : createDemoRuntime();
        if (!active) return;
        setRuntime(next);
        const queryId = new URL(location.href).searchParams.get('pot');
        if (queryId) { try { setSelected(parsePotId(queryId)); } catch (cause) { setError(cause); } }
        const controller = createRecoveryController(storage);
        setRecovery(controller);
        setRecoverySnapshot(controller.load());
        const unsubscribe = controller.subscribe(setRecoverySnapshot);
        setInitializing(false);
        return () => unsubscribe();
      };
      let unsubscribe: (() => void) | undefined;
      void start().then(cleanup => { unsubscribe = cleanup; }).catch(cause => { if (active) { setError(cause); setInitializing(false); } });
      return () => { active = false; unsubscribe?.(); };
    } catch (cause) { setError(cause); setInitializing(false); }
  }, []);
  useEffect(() => { document.documentElement.lang = locale; writePreference(getBrowserStorage(), 'commitpot-language', locale); }, [locale]);

  const publicPot = usePublicPot(runtime?.repository ?? null, runtime?.wallet ?? null, selected, 5000);
  const snapshot = publicPot;
  const chainState = snapshot.chain;
  useEffect(() => {
    const outcome = publicReadWarningAfterReceiptRefresh(snapshot, receiptRefreshPending);
    if (!outcome) return;
    setReceiptRefreshPending(false);
    setPublicRefreshWarning(outcome.warning);
  }, [receiptRefreshPending, snapshot]);
  useEffect(() => { if (snapshot.publicVerified && publicRefreshWarning) setPublicRefreshWarning(null); }, [snapshot.publicVerified, publicRefreshWarning]);
  const chainContext = chainState.data;
  const currentPot = snapshot.pot.data?.id === selected ? snapshot.pot.data : null;
  const connection = snapshot.wallet.data ?? blankConnection;
  const now = snapshot.time.data ?? 0;
  const status = snapshot.participant.data?.status ?? blankStatus;
  const balance = snapshot.participant.data?.balance ?? null;
  const allowance = snapshot.participant.data?.allowance ?? null;
  const selectedPhase = currentPot && snapshot.time.status === 'ready' && snapshot.pot.status === 'ready' ? getPotTimeState(currentPot, now) : null;
  const phaseKey: Record<string, MessageKey> = { REGISTRATION: 'registrationPhase', WAITING: 'waitingPhase', CHECK_IN: 'checkInPhase', AWAITING_FINALIZATION: 'awaitingPhase', FINALIZED: 'finalizedPhase' };
  const pending = recoverySnapshot?.pending ?? null;
  const quarantined = !!recoverySnapshot?.blocked && (!!recoverySnapshot?.raw || !!recoverySnapshot?.legacy || !!recoverySnapshot?.quarantine);
  const writeBlocked = !recovery || !recoverySnapshot || recoverySnapshot.blocked || !!pending || !!recoverySnapshot.legacy || !!recoverySnapshot.raw;
  const publicWriteReady = snapshot.writesEnabled && chainState.status === 'ready' && snapshot.time.status === 'ready';
  const disabled = busy || writeBlocked;
  const attendanceContext: AttendanceContext | null = currentPot && chainContext ? {
    chainId: chainContext.chainId, coreAddress: chainContext.coreAddress, potId: currentPot.id,
    verifier: currentPot.config.verifier, account: connection.connected ? connection.address : null,
  } : null;
  const attendance = useAttendanceCandidate(runtime?.repository ?? null, attendanceContext);
  attendanceRef.current = attendance;
  const candidate = attendance.candidate;

  useEffect(() => {
    const storage = getBrowserStorage();
    if (!storage || !chainContext) { setStoredActivity([]); return; }
    setStoredActivity(loadConfirmedActivity(storage, chainContext));
  }, [chainContext?.chainId, chainContext?.coreAddress, recoverySnapshot?.activity]);
  useEffect(() => {
    if (selected !== null) { const url = new URL(location.href); url.searchParams.set('pot', String(selected)); history.replaceState(null, '', url); }
  }, [selected]);
  useEffect(() => {
    if (initialSelection.current || selected !== null || snapshot.list.status !== 'ready' || !snapshot.list.data?.length) return;
    initialSelection.current = true;
    setSelected(snapshot.list.data[0].id);
  }, [selected, snapshot.list.status, snapshot.list.data]);
  useEffect(() => {
    let active = true;
    if (!runtime || !connection.address || chainContext?.mode === 'mock') { setNativeBalance(undefined); return; }
    setNativeBalance(undefined);
    void runtime.wallet.getNativeBalance(connection.address).then(value => { if (active) setNativeBalance(value); }).catch(() => { if (active) setNativeBalance(null); });
    return () => { active = false; };
  }, [runtime, connection.address, connection.chainId, chainContext?.mode]);
  useEffect(() => {
    if (!runtime || !snapshot.time.data) return;
    const timestamp = snapshot.time.data;
    setForm(current => ({ ...current, verifier: current.verifier || runtime.mock?.verifier || '', ...(current.registration ? {} : { registration: localInput(timestamp + 3600), open: localInput(timestamp + 3600), close: localInput(timestamp + 7200) }) }));
  }, [runtime, snapshot.time.data]);
  useEffect(() => {
    if (!pending?.hash || !runtime) return;
    if (pending.intent.kind === 'create') return;
    // Normal and recovered completion refreshes through the same public reader.
  }, [pending?.hash, runtime]);
  useEffect(() => {
    const provider = (window as unknown as { ethereum?: { on?: (name: string, listener: (...args: unknown[]) => void) => void; removeListener?: (name: string, listener: (...args: unknown[]) => void) => void } }).ethereum;
    if (!provider?.on) return;
    const invalidateWalletContext = () => {
      attendanceRef.current?.cancel();
      setCamera(false);
      void publicPot.refresh().catch(setError);
    };
    provider.on('accountsChanged', invalidateWalletContext);
    provider.on('chainChanged', invalidateWalletContext);
    return () => {
      provider.removeListener?.('accountsChanged', invalidateWalletContext);
      provider.removeListener?.('chainChanged', invalidateWalletContext);
    };
  }, [publicPot.refresh]);
  useEffect(() => {
    if (!recovery) return;
    const refreshRecovery = (event: StorageEvent) => { if (event.key === PENDING_KEY || event.key === null) recovery.load(); };
    window.addEventListener('storage', refreshRecovery);
    return () => window.removeEventListener('storage', refreshRecovery);
  }, [recovery]);
  useEffect(() => {
    setQrImage('');
    if (!currentPot || !connection.address || !status.joined) return;
    const payload = encodeParticipantQr({ potId: String(currentPot.id), participant: connection.address });
    let active = true;
    void QRCode.toDataURL(payload, { width: 248, margin: 2, color: { dark: '#211842', light: '#ffffff' } }).then(image => { if (active) setQrImage(image); }).catch(setError);
    return () => { active = false; };
  }, [currentPot?.id, connection.address, status.joined]);
  useEffect(() => {
    if (!camera || !videoRef.current) return;
    let disposed = false;
    let stream: MediaStream | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stopTracks = () => { stream?.getTracks().forEach(track => track.stop()); stream = undefined; };
    const start = async () => {
      type Detector = { detect(video: HTMLVideoElement): Promise<{ rawValue: string }[]> };
      const DetectorClass = (window as unknown as { BarcodeDetector?: new (options: { formats: string[] }) => Detector }).BarcodeDetector;
      if (!DetectorClass || !navigator.mediaDevices?.getUserMedia) {
        if (!disposed) { setCameraMessage(t('cameraUnavailable')); setCamera(false); }
        return;
      }
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      if (disposed) { stopTracks(); return; }
      const video = videoRef.current;
      if (!video) { stopTracks(); return; }
      video.srcObject = stream;
      await video.play();
      if (disposed) { stopTracks(); return; }
      const detector = new DetectorClass({ formats: ['qr_code'] });
      const scan = async () => {
        if (disposed) return;
        try {
          const codes = await detector.detect(video);
          if (disposed) return;
          if (codes[0]) { attendanceRef.current?.setInput(codes[0].rawValue); setCamera(false); return; }
        } catch {
          if (disposed) return;
        }
        if (!disposed) timer = setTimeout(() => { void scan(); }, 300);
      };
      void scan();
    };
    void start().catch(() => { if (!disposed) { setCameraMessage(t('noCameraPermission')); setCamera(false); } });
    return () => { disposed = true; if (timer) clearTimeout(timer); stopTracks(); if (videoRef.current) videoRef.current.srcObject = null; };
  }, [camera, locale]);
  useEffect(() => { setCamera(false); }, [view]);
  const refreshPublic = useCallback(async (id?: bigint | null) => {
    if (id !== undefined && id !== selected) { setSelected(id); await Promise.resolve(); }
    await publicPot.refresh();
  }, [publicPot.refresh, selected]);

  function formConfig(context: ChainContext, time: number): PotConfig {
    const config = {
      token: context.token, verifier: normalizeAddress(form.verifier), stakeAmount: parseTokenAmount(form.amount, 6),
      registrationClose: Math.floor(new Date(form.registration).getTime() / 1000),
      checkInOpen: Math.floor(new Date(form.open).getTime() / 1000), checkInClose: Math.floor(new Date(form.close).getTime() / 1000),
    };
    validatePotConfig(config, time, context.token);
    return config;
  }

  async function readFresh(potId: bigint | null, review?: AttendanceReview, checkMember?: Address): Promise<FreshState> {
    if (!runtime) throw new DomainError('WALLET_UNAVAILABLE');
    const assertReview = () => { if (review) attendanceRef.current?.assertCurrent(review); };
    const context = await runtime.repository.getChainContext(); assertReview();
    const time = await runtime.repository.getChainTimestamp(); assertReview(); validateTimestamp(time);
    const currentConnection = await runtime.wallet.getConnection(); assertReview();
    if (!currentConnection.connected || !currentConnection.address) throw new DomainError('ACCOUNT_NOT_CONNECTED');
    if (currentConnection.chainId !== context.chainId || currentConnection.mode !== context.mode) throw new DomainError('WRONG_CHAIN');
    if (review && (!sameAddress(currentConnection.address, review.context.account) || currentConnection.chainId !== review.context.chainId || !sameAddress(context.coreAddress, review.context.coreAddress))) throw new DomainError('ACCOUNT_CHANGED');
    const pot = potId === null ? null : await runtime.repository.getPot(potId); assertReview();
    const participant = pot ? await runtime.repository.getParticipantStatus(pot.id, checkMember ?? currentConnection.address) : null; assertReview();
    return { context, connection: currentConnection, time, pot, participant };
  }

  async function checkGas(context: ChainContext, account: Address) {
    if (context.mode === 'mock') return;
    const native = await runtime!.wallet.getNativeBalance(account);
    if (native === 0n) throw new DomainError('INSUFFICIENT_GAS');
    if (native === null) throw new DomainError('RPC_UNAVAILABLE', 'Native AVAX balance is unavailable.');
  }

  function makeIntent(kind: OperationKind, fresh: FreshState, config?: PotConfig, amount?: bigint, beneficiary?: Address, proof?: { participant: Address; nonce: string; deadline: number }): OperationIntent {
    const base = { account: fresh.connection.address!, chainId: fresh.context.chainId, core: fresh.context.coreAddress, token: fresh.context.token };
    if (kind === 'create' && config) return { ...base, kind, config: { ...config, stakeAmount: config.stakeAmount.toString() }, amount: config.stakeAmount.toString() };
    if (kind === 'approve' && amount !== undefined) return { ...base, kind, amount: amount.toString() };
    if (kind === 'join' && fresh.pot) return { ...base, kind, potId: fresh.pot.id.toString(), amount: fresh.pot.config.stakeAmount.toString() };
    if (kind === 'finalize' && fresh.pot) return { ...base, kind, potId: fresh.pot.id.toString() };
    if (kind === 'claim' && fresh.pot && beneficiary) return { ...base, kind, potId: fresh.pot.id.toString(), beneficiary, amount: fresh.participant?.claimable.toString() };
    if (kind === 'checkIn' && fresh.pot && proof) return { ...base, kind, potId: fresh.pot.id.toString(), beneficiary: proof.participant, proof };
    throw new DomainError('INVALID_ARGUMENT');
  }

  async function finishReceipt(controller: RecoveryController, operation: PendingOperation, receipt: TransactionReceipt) {
    const result = controller.complete(operation.id, receipt);
    setRecoverySnapshot(result);
    if (receipt.status === 'failure') { setError(receipt.error ?? new DomainError('TRANSACTION_REVERTED')); return false; }
    const createdPotId = receipt.createdPotId;
    if (createdPotId !== undefined) { setSelected(createdPotId); setView('event'); setReviewing(false); }
    try {
      const refresh = refreshPublic(createdPotId);
      setReceiptRefreshPending(true);
      await refresh;
    } catch (cause) { setReceiptRefreshPending(false); setPublicRefreshWarning(cause); }
    return true;
  }

  async function performMutation(mutation: Mutation): Promise<boolean> {
    if (!runtime || !recovery || recoveryLock.current || busy) return false;
    if (writeBlocked) { setError(new RecoveryError('STORAGE_UNAVAILABLE')); return false; }
    recoveryLock.current = true; setBusy(true); setError(null);
    try {
      return await withRecoveryLease(async () => {
        let operation: PendingOperation | null = null;
        try {
          const fresh = await readFresh(mutation.potId ?? null);
          const { context, connection, time, pot, participant } = fresh;
          if (mutation.kind === 'create') {
            const config = mutation.config ?? formConfig(context, time);
            validatePotConfig(config, time, context.token);
            const native = context.mode === 'mock' ? null : await runtime.wallet.getNativeBalance(connection.address!);
            if (native === 0n) throw new DomainError('INSUFFICIENT_GAS');
            if (native === null && context.mode !== 'mock') throw new DomainError('RPC_UNAVAILABLE');
            const intent = makeIntent('create', fresh, config);
            operation = recovery.begin(intent); setRecoverySnapshot(recovery.load());
            const opContext: OperationContext = { account: connection.address!, chainId: context.chainId, onStage: stage => setRecoverySnapshot(recovery.setStage(operation!.id, stage)) };
            const hash = await runtime.repository.createPot(config, opContext);
            const afterHash = recovery.setHash(operation.id, hash); setRecoverySnapshot(afterHash);
            const receipt = await runtime.repository.waitForTransaction(hash, operation.intent);
            return await finishReceipt(recovery, operation, receipt);
          }
          if (!pot || pot.id !== mutation.potId || !participant) throw new DomainError('POT_NOT_FOUND');
          if (mutation.kind === 'approve') {
            if (await runtime.wallet.getTokenAllowance(connection.address!, context.coreAddress) >= pot.config.stakeAmount) throw new DomainError('INVALID_ARGUMENT', 'The deposit allowance is already sufficient.');
            const native = context.mode === 'mock' ? null : await runtime.wallet.getNativeBalance(connection.address!);
            if (native === 0n) throw new DomainError('INSUFFICIENT_GAS');
            if (native === null && context.mode !== 'mock') throw new DomainError('RPC_UNAVAILABLE');
            const intent = makeIntent('approve', fresh, undefined, pot.config.stakeAmount);
            operation = recovery.begin(intent); setRecoverySnapshot(recovery.load());
            const opContext: OperationContext = { account: connection.address!, chainId: context.chainId, onStage: stage => setRecoverySnapshot(recovery.setStage(operation!.id, stage)) };
            const hash = await runtime.wallet.approveToken(pot.config.stakeAmount, opContext);
            const afterHash = recovery.setHash(operation.id, hash); setRecoverySnapshot(afterHash);
            const receipt = await runtime.repository.waitForTransaction(hash, operation.intent);
            return await finishReceipt(recovery, operation, receipt);
          }
          if (mutation.kind === 'join') {
            if (!isJoinAllowed(pot, time)) throw new DomainError('REGISTRATION_CLOSED');
            if (participant.joined) throw new DomainError('ALREADY_JOINED');
            const [funds, approved] = await Promise.all([runtime.wallet.getTokenBalance(connection.address!), runtime.wallet.getTokenAllowance(connection.address!, context.coreAddress)]);
            if (funds < pot.config.stakeAmount) throw new DomainError('INSUFFICIENT_BALANCE');
            if (approved < pot.config.stakeAmount) throw new DomainError('INSUFFICIENT_ALLOWANCE');
            await checkGas(context, connection.address!);
            const intent = makeIntent('join', fresh);
            operation = recovery.begin(intent); setRecoverySnapshot(recovery.load());
            const opContext: OperationContext = { account: connection.address!, chainId: context.chainId, onStage: stage => setRecoverySnapshot(recovery.setStage(operation!.id, stage)) };
            const hash = await runtime.repository.joinPot(pot.id, opContext);
            const afterHash = recovery.setHash(operation.id, hash); setRecoverySnapshot(afterHash);
            const receipt = await runtime.repository.waitForTransaction(hash, operation.intent);
            return await finishReceipt(recovery, operation, receipt);
          }
          if (mutation.kind === 'finalize') {
            if (pot.status === 'FINALIZED') throw new DomainError('POT_ALREADY_FINALIZED');
            if (!isFinalizeAllowed(pot, time)) throw new DomainError('FINALIZE_TOO_EARLY');
            await checkGas(context, connection.address!);
            const intent = makeIntent('finalize', fresh);
            operation = recovery.begin(intent); setRecoverySnapshot(recovery.load());
            const opContext: OperationContext = { account: connection.address!, chainId: context.chainId, onStage: stage => setRecoverySnapshot(recovery.setStage(operation!.id, stage)) };
            const hash = await runtime.repository.finalizePot(pot.id, opContext);
            const afterHash = recovery.setHash(operation.id, hash); setRecoverySnapshot(afterHash);
            const receipt = await runtime.repository.waitForTransaction(hash, operation.intent);
            return await finishReceipt(recovery, operation, receipt);
          }
          if (mutation.kind === 'claim') {
            if (pot.status !== 'FINALIZED') throw new DomainError('NOT_FINALIZED');
            if (!participant.claimable) throw new DomainError('NOT_ELIGIBLE');
            await checkGas(context, connection.address!);
            const intent = makeIntent('claim', fresh, undefined, undefined, connection.address!);
            operation = recovery.begin(intent); setRecoverySnapshot(recovery.load());
            const opContext: OperationContext = { account: connection.address!, chainId: context.chainId, onStage: stage => setRecoverySnapshot(recovery.setStage(operation!.id, stage)) };
            const hash = await runtime.repository.claimPayout(pot.id, connection.address!, opContext);
            const afterHash = recovery.setHash(operation.id, hash); setRecoverySnapshot(afterHash);
            const receipt = await runtime.repository.waitForTransaction(hash, operation.intent);
            return await finishReceipt(recovery, operation, receipt);
          }
          return false;
        } catch (cause) {
          if (operation) {
            const state = recovery.load(); setRecoverySnapshot(state);
            const stageAware = cause as { submitted?: boolean; stage?: OperationStage };
            const definitelyNotSubmitted = stageAware.submitted === false;
            if (state.pending?.id === operation.id && state.pending && !state.pending.hash && definitelyNotSubmitted) {
              try { setRecoverySnapshot(recovery.discard(operation.id)); } catch (discardError) { setError(discardError); }
            }
          }
          throw cause;
        }
      }, PENDING_KEY);
    } catch (cause) { setError(cause); return false; }
    finally { recoveryLock.current = false; setBusy(false); }
  }

  async function recordAttendance() {
    if (!currentPot || !runtime || !recovery || !candidate || !attendance.present || !publicWriteReady || disabled) return;
    let review: AttendanceReview;
    try { review = attendance.getReview(); attendance.assertCurrent(review); }
    catch (cause) { setError(cause); return; }
    setBusy(true); recoveryLock.current = true; setError(null);
    try {
      const success = await withRecoveryLease(async () => {
        let operation: PendingOperation | null = null;
        let submissionAttempted = false;
        try {
          const fresh = await readFresh(review.context.potId, review, review.candidate.address);
          if (!fresh.pot || !fresh.participant || !sameAddress(fresh.pot.config.verifier, review.context.verifier)) throw new DomainError('WRONG_VERIFIER');
          if (!isCheckInAllowed(fresh.pot, fresh.time)) throw new DomainError('CHECK_IN_NOT_OPEN');
          if (!fresh.participant.joined) throw new DomainError('NOT_JOINED');
          if (fresh.participant.checkedIn) throw new DomainError('ALREADY_CHECKED_IN');
          const bytes = crypto.getRandomValues(new Uint8Array(32));
          const nonce = BigInt(`0x${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')}`);
          const deadline = Math.min(fresh.time + 300, fresh.pot.config.checkInClose);
          const proofIntent = { participant: review.candidate.address, nonce: nonce.toString(), deadline };
          const intent = makeIntent('checkIn', fresh, undefined, undefined, undefined, proofIntent);
          const native = fresh.context.mode === 'mock' ? null : await runtime.wallet.getNativeBalance(fresh.connection.address!);
          if (native === 0n) throw new DomainError('INSUFFICIENT_GAS');
          if (native === null && fresh.context.mode !== 'mock') throw new DomainError('RPC_UNAVAILABLE');
          attendance.assertCurrent(review);
          operation = recovery.begin(intent); setRecoverySnapshot(recovery.load());
          const opContext: OperationContext = { account: fresh.connection.address!, chainId: fresh.context.chainId, onStage: stage => setRecoverySnapshot(recovery.setStage(operation!.id, stage)) };
          const proof = await runtime.wallet.signCheckIn({ potId: review.context.potId, participant: review.candidate.address, nonce, deadline }, opContext);
          attendance.assertCurrent(review);
          // Wallets may be open while the human reads the prompt. Re-read all authorization facts before broadcast.
          const latest = await runtime.repository.getChainContext(); attendance.assertCurrent(review);
          if (latest.chainId !== intent.chainId || !sameAddress(latest.coreAddress, intent.core)) throw new DomainError('WRONG_CHAIN');
          const latestTime = await runtime.repository.getChainTimestamp(); attendance.assertCurrent(review); validateTimestamp(latestTime);
          const latestConnection = await runtime.wallet.getConnection(); attendance.assertCurrent(review);
          if (!latestConnection.connected || !sameAddress(latestConnection.address, intent.account) || latestConnection.chainId !== intent.chainId) throw new DomainError('ACCOUNT_CHANGED');
          const latestPot = await runtime.repository.getPot(review.context.potId); attendance.assertCurrent(review);
          if (latestPot.id !== review.context.potId || !sameAddress(latestPot.config.verifier, review.context.verifier) || !isCheckInAllowed(latestPot, latestTime)) throw new DomainError('CHECK_IN_NOT_OPEN');
          const latestMember = await runtime.repository.getParticipantStatus(review.context.potId, review.candidate.address); attendance.assertCurrent(review);
          if (!latestMember.joined) throw new DomainError('NOT_JOINED');
          if (latestMember.checkedIn) throw new DomainError('ALREADY_CHECKED_IN');
          if (latestTime > deadline) throw new DomainError('PROOF_EXPIRED');
          await checkGas(latest, intent.account as Address); attendance.assertCurrent(review);
          submissionAttempted = true;
          const hash = await runtime.repository.submitCheckIn(proof, opContext);
          const afterHash = recovery.setHash(operation.id, hash); setRecoverySnapshot(afterHash);
          const receipt = await runtime.repository.waitForTransaction(hash, operation.intent);
          return await finishReceipt(recovery, operation, receipt);
        } catch (cause) {
          if (operation) {
            const state = recovery.load(); setRecoverySnapshot(state);
            const stageAware = cause && typeof cause === 'object' ? cause as { submitted?: boolean; stage?: OperationStage } : undefined;
            const definitelyNotSubmitted = !submissionAttempted || stageAware?.submitted === false;
            if (state.pending?.id === operation.id && state.pending && !state.pending.hash && definitelyNotSubmitted) {
              try { setRecoverySnapshot(recovery.discard(operation.id)); } catch (discardError) { setError(discardError); }
            }
          }
          throw cause;
        }
      }, PENDING_KEY);
      if (success) attendance.clear(); else attendance.setInput(attendance.getSnapshot().input);
    } catch (cause) { attendance.setInput(attendance.getSnapshot().input); setError(cause); }
    finally { recoveryLock.current = false; setBusy(false); }
  }

  async function reconcile() {
    if (!runtime || !recovery || !pending?.hash || recoveryLock.current || busy) return;
    setBusy(true); recoveryLock.current = true; setError(null);
    try {
      await withRecoveryLease(async () => {
        const current = recovery.load(); setRecoverySnapshot(current);
        const item = current.pending;
        if (!item?.hash || item.id !== pending.id) throw new DomainError('SUBMISSION_UNKNOWN');
        const context = await runtime.repository.getChainContext();
        if (context.chainId !== item.intent.chainId || !sameAddress(context.coreAddress, item.intent.core)) throw new DomainError('WRONG_CHAIN');
        const receipt = await runtime.repository.waitForTransaction(item.hash, item.intent);
        await finishReceipt(recovery, item, receipt);
      }, PENDING_KEY);
    } catch (cause) { setError(cause); }
    finally { recoveryLock.current = false; setBusy(false); }
  }

  async function discardPending() {
    if (!recovery || !pending || busy || !confirm(t('clearUnknownConfirm'))) return;
    setBusy(true); recoveryLock.current = true;
    try { await withRecoveryLease(async () => setRecoverySnapshot(recovery.discard(pending.id)), PENDING_KEY); }
    catch (cause) { setError(cause); }
    finally { recoveryLock.current = false; setBusy(false); }
  }

  async function discardQuarantined() {
    const raw = recoverySnapshot?.raw;
    if (!recovery || !raw || busy) return;
    setBusy(true); recoveryLock.current = true;
    try { await withRecoveryLease(async () => setRecoverySnapshot(recovery.discardQuarantine(raw)), PENDING_KEY); }
    catch (cause) { setError(cause); }
    finally { recoveryLock.current = false; setBusy(false); }
  }

  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); setCopyState(true); setTimeout(() => setCopyState(false), 1600); }
    catch (cause) { setError(cause); }
  }
  async function createPot() {
    try {
      if (!chainContext || snapshot.time.status !== 'ready') throw new DomainError('RPC_UNAVAILABLE');
      const config = formConfig(chainContext, now);
      setReviewing(true);
    } catch (cause) { setError(cause); }
  }
  async function loadExample() {
    if (!runtime?.mock || disabled || busy || !runtime) return;
    setBusy(true); setError(null);
    try {
      const timestamp = runtime.mock.clock.now();
      runtime.mock.setAccount(runtime.mock.accounts[0]);
      const config = { token: (await runtime.repository.getTokenInfo()).address, verifier: runtime.mock.verifier, stakeAmount: 10_000_000n, registrationClose: timestamp + 60, checkInOpen: timestamp + 90, checkInClose: timestamp + 390 };
      const hash = await runtime.repository.createPot(config);
      const id = (await runtime.repository.waitForTransaction(hash)).createdPotId;
      if (!id) throw new DomainError('RECEIPT_MISMATCH');
      for (const account of runtime.mock.accounts) {
        runtime.mock.setAccount(account);
        await runtime.wallet.approveToken(config.stakeAmount);
        await runtime.repository.joinPot(id);
      }
      runtime.mock.setAccount(runtime.mock.accounts[0]); setSelected(id); setView('event'); await refreshPublic(id);
    } catch (cause) { setError(cause); }
    finally { setBusy(false); }
  }
  function advanceMock() {
    if (!runtime?.mock || !currentPot) return;
    const current = runtime.mock.clock.now();
    const jump = current < currentPot.config.checkInOpen ? currentPot.config.checkInOpen - current : current <= currentPot.config.checkInClose ? currentPot.config.checkInClose - current + 1 : 1;
    runtime.mock.clock.advance(Math.max(1, jump));
    void publicPot.refresh();
  }
  async function selectMockAccount(value: string) {
    if (!runtime?.mock) return;
    attendanceRef.current?.cancel(); setCamera(false);
    runtime.mock.setAccount(value ? normalizeAddress(value) : null);
    await publicPot.refresh();
  }
  async function runSelectedMutation(kind: Mutation['kind']) {
    if (!currentPot || !publicWriteReady || disabled) return;
    await performMutation({ kind, potId: currentPot.id });
  }

  const activity = chainContext ? mergeCurrentActivity(storedActivity, recoverySnapshot?.activity ?? [], chainContext) : [];
  const networkName = chainContext?.mode === 'mock' ? t('mock') : chainContext?.mode === 'local' ? `${t('localChain')} · ${chainContext.chainId}` : chainContext?.mode === 'fuji' ? `${t('fujiConfigured')} · ${chainContext.chainId}` : '';
  const authorized = !!currentPot && sameAddress(connection.address, currentPot.config.verifier);
  const canWrite = publicWriteReady && !disabled && !!connection.address;
  const selectedReadWarning = snapshot.pot.status === 'error' || snapshot.pot.status === 'stale' ? snapshot.pot.error : null;
  const eventListWarning = snapshot.list.status === 'error' || snapshot.list.status === 'stale' ? snapshot.list.error : null;
  const criticalReadWarning = hasCriticalReadWarning(snapshot);
  const activePotBrief = currentPot ? <EventBrief metadata={chainContext?.mode === 'mock' ? demoEvent : undefined} context={chainContext} potId={currentPot.id} locale={locale} headingLevel={2} /> : null;

  return <div className="app-shell">
    <aside className="brand-rail"><a className="brand" href="/" aria-label="CommitPot"><span className="brand-symbol"><Icon name="mark" /></span><span>CommitPot</span></a><p>{t('tagline')}</p><div className="rail-bottom"><span className="network-dot" />{networkName}<small>{t('testOnly')}</small></div></aside>
    <div className="workspace">
      <header className="topbar"><span className="mobile-brand">CommitPot</span><span className="topbar-caption">{t('event')}</span><div className="topbar-actions"><div className="language-control" aria-label="Language"><button aria-pressed={locale === 'en'} onClick={() => setLocale('en')}>EN</button><button aria-pressed={locale === 'vi'} onClick={() => setLocale('vi')}>VI</button></div><button className="wallet-button" onClick={() => { if (!runtime) return; void (connection.connected ? runtime.disconnect() : runtime.connect()).then(() => publicPot.refresh()).catch(setError); }} disabled={!runtime || busy}><Icon name="wallet" />{connection.address ? short(connection.address) : t('connect')}</button></div></header>
      {chainContext?.mode === 'mock' && <div className="demo-banner"><strong>{t('mock')}</strong><span>{t('mockHelp')}</span></div>}
      <main>
        <div className="page-heading"><div><h1>{view === 'create' ? t('createTitle') : t('pots')}</h1><p>{view === 'create' ? t('createIntro') : t('tagline')}</p></div><button className="primary" onClick={() => { setView(view === 'create' ? 'event' : 'create'); setReviewing(false); setError(null); }}><span>{view === 'create' ? t('back') : t('create')}</span><Icon name="arrow" /></button></div>
        
         
         
         
         {view === 'desk' && currentPot && <MobileDeskJump label={t('jumpToQr')} onActivate={() => { const target = document.getElementById(CHECKIN_QR_ENTRY_ID); if (target instanceof HTMLTextAreaElement) focusCheckInQrEntry(target, window.matchMedia('(prefers-reduced-motion: reduce)').matches); }} />}
         {(initializing || snapshot.refreshing) && <p className="read-status" role="status">{t('checking')}</p>}
        {criticalReadWarning && <div className="notice error" role="alert"><strong>{t('lookup')}</strong><p>{!!(snapshot.chain.error ?? snapshot.time.error ?? snapshot.pot.error) ? localizeError(snapshot.chain.error ?? snapshot.time.error ?? snapshot.pot.error, locale) : t('publicReadUnverified')}</p><button onClick={() => void publicPot.refresh()}>{t('refresh')}</button></div>}
        {!!publicRefreshWarning && <PublicRefreshWarning locale={locale} onRefresh={() => { setReceiptRefreshPending(true); void publicPot.refresh().catch(cause => { setReceiptRefreshPending(false); setPublicRefreshWarning(cause); }); }} />}
        {!!error && <div className="notice error" role="alert"><strong>{t('errors')}</strong><p>{localizeError(error, locale)}</p><button onClick={() => setError(null)}>{t('cancel')}</button></div>}
        {recoverySnapshot?.warning && <div className="notice pending" role="status"><strong>{t('pending')}</strong><p>{recoverySnapshot.warning}</p></div>}
        {recoverySnapshot?.confirmed && <div className="notice confirmed" role="status"><strong>{recoverySnapshot.confirmed.status === 'success' ? t('confirmed') : t('failed')}</strong><details><summary>{t('details')}</summary><pre className="receipt-context">{receiptDetails(recoverySnapshot.pending?.intent, recoverySnapshot.confirmed, locale)}</pre></details><button onClick={() => void copy(receiptDetails(recoverySnapshot.pending?.intent, recoverySnapshot.confirmed!, locale))}>{copyState ? t('copied') : t('copyReceipt')}</button></div>}
        {quarantined && <section className="notice pending quarantine"><strong>{t('quarantined')}</strong><p>{t('quarantineHelp')}</p>{recoverySnapshot?.legacy && <p>{t('legacyLabel')}: {recoverySnapshot.legacy.kind} · {recoverySnapshot.legacy.hash ?? t('unknown')} · {recoverySnapshot.legacy.chainId} · {recoverySnapshot.legacy.core}</p>}{recoverySnapshot?.raw && <details><summary>{t('inspectBytes')}</summary><pre>{recoverySnapshot.raw}</pre><button onClick={() => void copy(recoverySnapshot.raw!)}>{copyState ? t('copied') : t('copyBytes')}</button></details>}{recoverySnapshot?.raw && recovery?.discardQuarantine && <button disabled={busy} onClick={() => { if (confirm(t('clearQuarantineConfirm'))) void discardQuarantined(); }}>{t('clearQuarantined')}</button>}</section>}
        {pending && <section className="notice pending pending-summary" role="status"><strong>{busy ? t('pending') : t('unknown')}</strong><p>{t('operation')}: {t(operationMessages[pending.intent.kind])} · {t('stage')}: {t(stageMessageKeys[pending.stage])}</p><dl>{pending.intent.potId && <div><dt>{t('potId')}</dt><dd>#{pending.intent.potId}</dd></div>}<div><dt>{t('from')}</dt><dd className="address">{pending.intent.account}</dd></div><div><dt>{t('chain')}</dt><dd>{pending.intent.chainId}</dd></div><div><dt>{t('core')}</dt><dd className="address">{pending.intent.core}</dd></div>{pending.intent.kind === 'claim' && <div><dt>{t('beneficiary')}</dt><dd className="address">{pending.intent.beneficiary}</dd></div>}{pending.intent.kind === 'checkIn' && <div><dt>{t('beneficiary')}</dt><dd className="address">{pending.intent.proof.participant}</dd></div>}{pending.intent.kind === 'create' && <div><dt>{t('amount')}</dt><dd>{money(BigInt(pending.intent.config.stakeAmount))} Test USDC</dd></div>}</dl>{pending.hash && <><code className="full-hash">{pending.hash}</code><div className="button-row"><button onClick={() => void copy(pending.hash!)}>{copyState ? t('copied') : t('copyHash')}</button>{chainContext?.mode === 'fuji' && chainContext.chainId === 43113 && <a className="button-link" href={`https://testnet.snowtrace.io/tx/${pending.hash}`} target="_blank" rel="noreferrer">{t('openExplorer')}</a>}</div></>}<div className="button-row">{pending.hash && <button onClick={() => void reconcile()} disabled={busy}>{t('reconcile')}</button>}<button onClick={() => void discardPending()} disabled={busy}>{t('clearUnknown')}</button></div></section>}

        {view === 'create' ? <section className="create-surface">
          <form onSubmit={event => { event.preventDefault(); void createPot(); }}>
            <div className="form-grid"><label>{t('amount')}<div className="amount-input"><input required aria-label={t('amount')} inputMode="decimal" value={form.amount} onChange={event => { setReviewing(false); setForm({ ...form, amount: event.target.value }); }} /><span>Test USDC</span></div></label><label>{t('verifierAddress')}<input required value={form.verifier} placeholder="0x…" onChange={event => { setReviewing(false); setForm({ ...form, verifier: event.target.value }); }} /></label>{(['registration', 'open', 'close'] as const).map((field, index) => <label key={field}>{t((['registration', 'checkInOpen', 'checkInClose'] as const)[index])}<input required type="datetime-local" value={form[field]} onChange={event => { setReviewing(false); setForm({ ...form, [field]: event.target.value }); }} /></label>)}</div>
            <p className="secondary-text">{t('timezone')} · {Intl.DateTimeFormat().resolvedOptions().timeZone}</p><p className="trust-note">{t('preDeposit')}</p><p className="trust-note">{t('feeHelp')}</p>
            {reviewing && <div className="review-block"><h2>{t('rules')}</h2><p>{t('immutable')}</p><dl><div><dt>{t('deposit')}</dt><dd>{form.amount} Test USDC</dd></div>{(['registration', 'open', 'close'] as const).map((field, index) => <div key={field}><dt>{t((['registration', 'checkInOpen', 'checkInClose'] as const)[index])}</dt><dd>{new Date(form[field]).toLocaleString(locale === 'en' ? 'en-GB' : 'vi-VN')}</dd></div>)}<div><dt>{t('verifier')}</dt><dd className="address">{form.verifier}</dd></div></dl><button type="button" className="primary" disabled={!canWrite} onClick={() => { if (!chainContext) return; try { const config = formConfig(chainContext, now); void performMutation({ kind: 'create', config }); } catch (cause) { setError(cause); } }}>{t('confirmCreate')}</button></div>}
            {!reviewing && <ReviewSubmitButton disabled={snapshot.time.status !== 'ready' || !chainContext || writeBlocked} label={t('review')} />}
          </form>
        </section> : <div className="event-layout">
          <section className="event-picker" aria-label={t('pots')}><form className="lookup" onSubmit={event => { event.preventDefault(); try { const id = parsePotId(lookup); setSelected(id); setView('event'); setError(null); void publicPot.refresh(); } catch (cause) { setError(cause); } }}><label htmlFor="pot-id">{t('potId')}</label><div><input id="pot-id" inputMode="numeric" value={lookup} onChange={event => setLookup(event.target.value)} placeholder="1" /><button aria-label={t('open')}><Icon name="arrow" /></button></div></form><div className="event-list">{snapshot.list.data?.map(item => <button className={`event-item ${selected === item.id ? 'selected' : ''}`} key={String(item.id)} onClick={() => { setSelected(item.id); setView('event'); setError(null); }}><span className="event-number">#{String(item.id).padStart(2, '0')}</span><strong>{t('event')} {String(item.id)}</strong><span>{money(item.config.stakeAmount)} Test USDC</span><span className="item-phase">{snapshot.time.data !== null ? t(phaseKey[getPotTimeState(item, snapshot.time.data)]) : t('checking')}</span></button>)}</div>{!!eventListWarning && <p className="read-warning">{localizeError(eventListWarning, locale)}</p>}{chainContext?.mode === 'mock' && <details className="demo-tools"><summary>{t('mockTools')}</summary><p>{t('mockHelp')}</p><button disabled={disabled} onClick={() => void loadExample()}>{t('example')}</button>{currentPot && <button disabled={disabled} onClick={advanceMock}>{t('advance')}</button>}<button disabled={disabled} onClick={() => { if (confirm(t('resetConfirm'))) { runtime?.mock?.reset(); history.replaceState(null, '', '/'); setSelected(null); setView('event'); void publicPot.refresh(); } }}>{t('reset')}</button></details>}</section>
          <section className="event-workspace">{!currentPot ? <div className="empty-state"><span className="empty-mark"><Icon name="mark" /></span><h2>{selected ? t('lookup') : t('noEvents')}</h2><p>{selectedReadWarning ? localizeError(selectedReadWarning, locale) : selected ? t('lookupHelp') : t('empty')}</p>{selected && <button onClick={() => void publicPot.refresh()}>{t('refresh')}</button>}<button className="primary" onClick={() => setView('create')}>{t('create')}<Icon name="arrow" /></button>{chainContext?.mode === 'mock' && <button className="text-button" disabled={disabled} onClick={() => void loadExample()}>{t('example')}</button>}</div> : <>
            <div className="event-title"><div>{activePotBrief}<p className={`phase-label ${selectedPhase === 'FINALIZED' ? 'settled' : ''}`}><span />{selectedPhase ? t(phaseKey[selectedPhase]) : t('checking')}</p></div><button className="icon-button" aria-label={t('share')} onClick={() => void copy(location.href)}><Icon name="copy" />{copyState ? t('copied') : t('share')}</button></div>
            <nav className="event-tabs"><button aria-current={view === 'event' ? 'page' : undefined} onClick={() => setView('event')}>{t('overview')}</button><button aria-current={view === 'desk' ? 'page' : undefined} onClick={() => setView('desk')}>{t('verifierTab')}</button></nav>
            <div className="event-body"><div className="event-main">
              <div className="deposit-line"><div><span>{t('deposit')}</span><strong>{money(currentPot.config.stakeAmount)} <small>Test USDC</small></strong></div><div className="count-pair"><span><strong>{String(currentPot.participantCount)}</strong>{t('joined')}</span><span><strong>{String(currentPot.checkedInCount)}</strong>{t('attended')}</span></div></div>
              {!!selectedReadWarning && <div className="notice error" role="alert">{localizeError(selectedReadWarning, locale)} <button onClick={() => void publicPot.refresh()}>{t('refresh')}</button></div>}
              {view === 'desk' ? <>
                <section className="checkin-desk"><h3>{t('deskTitle')}</h3><p>{t('deskIntro')}</p><p className="verifier-identity"><span>{t('phase')}</span> {selectedPhase ? t(phaseKey[selectedPhase]) : t('checking')} · <span>{t('verifier')}</span> <code>{short(currentPot.config.verifier)}</code></p>{!authorized && <p className="notice">{t('unauthorized')}</p>}
                  <CheckInQrEntry label={t('qrInput')} safetyCopy={t('qrNoPresence')} value={attendance.input} onInput={attendance.setInput} />
                  <div className="button-row"><button disabled={disabled || !attendance.input || !currentPot} onClick={() => { setError(null); void attendance.inspect(); }}>{attendance.inspecting ? t('checking') : t('inspect')}</button><button disabled={!authorized || disabled} onClick={() => { setCameraMessage(''); setCamera(value => !value); }}>{camera ? t('stopCamera') : t('scan')}</button></div>
                  {camera && <video ref={videoRef} playsInline muted className="scanner" />}{cameraMessage && <p role="status">{cameraMessage}</p>}{!!attendance.error && <p className="read-warning" role="alert">{localizeError(attendance.error, locale)}</p>}
                  {candidate && <div className="candidate"><span>{t('candidate')}</span><code>{candidate.address}</code><p className="qr-limit">{t('qrNoPresence')}</p>{candidate.status.checkedIn ? <p>{t('alreadyAttended')}</p> : <><label className="checkbox"><input type="checkbox" checked={attendance.present} onChange={event => attendance.setPresent(event.target.checked)} />{t('present')}</label><button className="primary" disabled={!canWrite || !attendance.present || !authorized || selectedPhase !== 'CHECK_IN'} onClick={() => void recordAttendance()}>{t('sign')}<Icon name="check" /></button></>}</div>}
                </section>
                <details className="phase-chronology"><summary>{t('chronology')}</summary><ol className="phase-rail">{(['registration', 'checkInOpen', 'checkInClose'] as const).map((key, index) => { const stamp = [currentPot.config.registrationClose, currentPot.config.checkInOpen, currentPot.config.checkInClose][index]; return <li className={snapshot.time.data !== null && snapshot.time.data >= stamp ? 'reached' : ''} key={key}><span className="phase-node">{snapshot.time.data !== null && snapshot.time.data >= stamp ? <Icon name="check" /> : index + 1}</span><div><strong>{t(key)}</strong><time>{date(stamp)}</time></div></li>; })}</ol></details>
              </> : <>
                <ol className="phase-rail">{(['registration', 'checkInOpen', 'checkInClose'] as const).map((key, index) => { const stamp = [currentPot.config.registrationClose, currentPot.config.checkInOpen, currentPot.config.checkInClose][index]; return <li className={snapshot.time.data !== null && snapshot.time.data >= stamp ? 'reached' : ''} key={key}><span className="phase-node">{snapshot.time.data !== null && snapshot.time.data >= stamp ? <Icon name="check" /> : index + 1}</span><div><strong>{t(key)}</strong><time>{date(stamp)}</time></div></li>; })}</ol>
                <div className="allocation"><div><h3>{t('pool')}</h3><strong>{money(currentPot.participantCount * currentPot.config.stakeAmount)} <span>Test USDC</span></strong></div><p>{currentPot.status === 'FINALIZED' && currentPot.checkedInCount === 0n ? t('noAttendance') : t('trust')}</p></div>
                {currentPot.status !== 'FINALIZED' && currentPot.checkedInCount > 0n && <div className="estimate"><h3>{t('estimate')}</h3><strong>{money(calculatePayout(currentPot.participantCount, currentPot.checkedInCount, currentPot.config.stakeAmount).base)} Test USDC</strong><p>{t('estimateHelp')}</p></div>}
                {selectedPhase === 'AWAITING_FINALIZATION' && <div className="settlement-action"><p>{t('finalizeHelp')}</p><button className="primary" disabled={!canWrite} onClick={() => void runSelectedMutation('finalize')}>{t('finalize')}<Icon name="arrow" /></button></div>}

                <details className="fixed-rules"><summary>{t('rules')}</summary><dl><div><dt>{t('verifier')}</dt><dd className="address">{currentPot.config.verifier}</dd></div><div><dt>{t('token')}</dt><dd className="address">{currentPot.config.token}</dd></div></dl><p>{t('immutable')}</p><p>{t('trust')}</p></details>
              </>}
            </div>{view !== 'desk' && <aside className="personal-panel"><h3>{t('yourStatus')}</h3>{chainContext?.mode === 'mock' && runtime?.mock && <label>{t('selectAccount')}<select value={connection.address ?? ''} disabled={busy} onChange={event => void selectMockAccount(event.target.value)}><option value="">{t('disconnected')}</option>{runtime.mock.accounts.map((address, index) => <option value={address} key={address}>{t('participant')} {index + 1} · {short(address)}</option>)}<option value={runtime.mock.verifier}>{t('demoVerifier')} · {short(runtime.mock.verifier)}</option></select></label>}{connection.address ? <><p className="address personal-address">{connection.address}</p><dl className="wallet-summary"><div><dt>{t('balance')}</dt><dd>{balance === null ? t('checking') : `${money(balance)} Test USDC`}</dd></div><div><dt>{t('allowance')}</dt><dd>{allowance === null ? t('checking') : `${money(allowance)} Test USDC`}</dd></div>{chainContext?.mode !== 'mock' && <div><dt>{t('nativeBalance')}</dt><dd>{nativeBalance === undefined ? t('checking') : nativeBalance === null ? t('nativeUnavailable') : nativeBalance === 0n ? t('noGas') : `${formatTokenAmount(nativeBalance, 18)} AVAX`}</dd></div>}</dl><p className="personal-state"><Icon name={status.checkedIn || status.joined ? 'check' : 'wallet'} />{status.claimed ? t('claimed') : status.checkedIn ? t('stateAttended') : status.joined ? t('stateJoined') : t('stateUnjoined')}</p>{!status.joined && selectedPhase === 'REGISTRATION' && <><button className="primary full" disabled={!canWrite || balance === null || allowance === null} onClick={() => void runSelectedMutation(allowance !== null && allowance < currentPot.config.stakeAmount ? 'approve' : 'join')}>{allowance !== null && allowance < currentPot.config.stakeAmount ? t('approve') : t('join')}<Icon name="arrow" /></button><p className="hint">{t('approveHelp')}</p></>}{!status.joined && selectedPhase !== 'REGISTRATION' && <p>{t('closedJoin')}</p>}{status.joined && currentPot.status !== 'FINALIZED' && <details className="qr-panel" open={selectedPhase === 'CHECK_IN'}><summary>{t('qr')}</summary>{qrImage && <img src={qrImage} width={220} height={220} alt={t('qr')} />}<p>{t('qrHelp')}</p><button onClick={() => void copy(encodeParticipantQr({ potId: String(currentPot.id), participant: connection.address! }))}>{t('payload')}</button></details>}{currentPot.status === 'FINALIZED' && status.joined && <>{status.claimable > 0n ? <PersonalEntitlementAction amount={money(status.claimable)} noAttendance={currentPot.checkedInCount === 0n} disabled={!canWrite} locale={locale} onClaim={() => void runSelectedMutation('claim')} /> : <p>{status.claimed ? t('claimed') : t('noShow')}</p>}</>}</> : <p>{t('notJoined')}</p>}</aside>}
            </div>
            {view !== 'desk' && <section className="activity"><h3>{t('receipts')}</h3>{!activity.length ? <p>{t('noReceipts')}</p> : <ul>{activity.slice(0, 6).map((item, index) => <li key={`${item.hash}-${index}`}><Icon name="check"/><span>{t(operationMessages[item.kind])}<small>{isLegacyActivity(item) ? t('legacyLabel') : `${t('confirmed')} · ${item.chainId} · ${t('block')} ${item.blockNumber}`} · ${new Date(item.time).toLocaleTimeString(locale)}</small></span><details className="activity-details"><summary>{t('details')}</summary><pre>{activityDetails(item, locale)}</pre><button onClick={() => void copy(activityDetails(item, locale))}>{t('copyReceipt')}</button></details><button className="copy-hash" aria-label={t('copyHash')} onClick={() => void copy(item.hash)}><Icon name="copy"/></button></li>)}</ul>}</section>}
          </>}</section>
        </div>}
      </main><footer><span>CommitPot</span><p>{t('testOnly')}</p><a href="/verify">{t('walletFreeProof')}</a><button onClick={() => { setError(null); void publicPot.refresh(); }}>{t('refresh')}</button></footer>
    </div>
  </div>;
}

