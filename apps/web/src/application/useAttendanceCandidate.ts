'use client';

import { useEffect, useLayoutEffect, useMemo, useSyncExternalStore } from 'react';
import { DomainError, normalizeAddress, type Address, type IPotRepository, type ParticipantStatus } from '../domain';
import { decodeParticipantQr } from '../infrastructure/qr';

export type AttendanceContext = Readonly<{
  chainId: number;
  coreAddress: Address;
  potId: bigint;
  verifier: Address;
  account: Address | null;
}>;
export type AttendanceCandidate = Readonly<{ address: Address; status: Readonly<ParticipantStatus> }>;
export type AttendanceReview = Readonly<{
  generation: number;
  input: string;
  context: AttendanceContext;
  candidate: AttendanceCandidate;
}>;
export type AttendanceCandidateSnapshot = Readonly<{
  input: string;
  context: AttendanceContext | null;
  generation: number;
  candidate: AttendanceCandidate | null;
  present: boolean;
  inspecting: boolean;
  error: unknown | null;
}>;
export type AttendanceRepository = Pick<IPotRepository, 'getParticipantStatus'>;
export interface AttendanceCandidateController {
  getSnapshot(): AttendanceCandidateSnapshot;
  subscribe(listener: () => void): () => void;
  setContext(context: AttendanceContext | null): void;
  setInput(input: string): void;
  setPresent(present: boolean): void;
  inspect(): Promise<AttendanceCandidate | null>;
  getReview(): AttendanceReview;
  assertCurrent(review: AttendanceReview): void;
  clear(): void;
  cancel(): void;
}

function contextKey(context: AttendanceContext | null): string {
  return context ? [context.chainId, context.coreAddress.toLowerCase(), context.potId,
    context.verifier.toLowerCase(), context.account?.toLowerCase() ?? ''].join(':') : '';
}
const frozenContext = (context: AttendanceContext | null) => context && Object.freeze({ ...context });
const reviewError = () => Object.assign(new Error('Inspect this candidate and confirm presence again.'), { code: 'ATTENDANCE_REVIEW_STALE' });

/** No wallet, camera, storage or browser access; all ingestion shares one generation guard. */
export function createAttendanceCandidateController(
  repository: AttendanceRepository | null,
  context: AttendanceContext | null = null,
): AttendanceCandidateController {
  let state: AttendanceCandidateSnapshot = Object.freeze({
    input: '', context: frozenContext(context), generation: 0, candidate: null,
    present: false, inspecting: false, error: null,
  });
  let review: AttendanceReview | null = null;
  const listeners = new Set<() => void>();
  const publish = (change: Partial<AttendanceCandidateSnapshot>) => {
    state = Object.freeze({ ...state, ...change });
    listeners.forEach(listener => listener());
  };
  const invalidate = (change: Partial<AttendanceCandidateSnapshot> = {}) => {
    review = null;
    publish({ generation: state.generation + 1, candidate: null, present: false, inspecting: false, error: null, ...change });
  };
  return {
    getSnapshot: () => state,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    setContext(next) {
      if (contextKey(next) !== contextKey(state.context)) invalidate({ context: frozenContext(next) });
    },
    // Camera detections MUST use this same setter as manual text edits, including repeated scans.
    setInput(input) { invalidate({ input }); },
    setPresent(present) {
      const next = present && !!state.candidate?.status.joined && !state.candidate.status.checkedIn;
      if (next !== state.present) { review = null; publish({ present: next }); }
    },
    async inspect() {
      invalidate({ inspecting: true });
      const { generation, input, context: captured } = state;
      try {
        if (!repository || !captured) throw new DomainError('INVALID_CONFIG', 'Attendance context is unavailable.');
        const payload = decodeParticipantQr(input, { expectedPotId: String(captured.potId) });
        if (payload.participant.length !== 42) throw new DomainError('INVALID_ADDRESS');
        const participant = normalizeAddress(payload.participant);
        const status = await repository.getParticipantStatus(captured.potId, participant);
        if (generation !== state.generation) return null;
        if (!status.joined) throw new DomainError('NOT_JOINED');
        const candidate = Object.freeze({ address: participant, status: Object.freeze({ ...status }) });
        publish({ candidate, inspecting: false });
        return candidate;
      } catch (error) {
        if (generation === state.generation) publish({ inspecting: false, error });
        return null;
      }
    },
    getReview() {
      if (!state.present || !state.candidate || !state.context || state.inspecting) throw reviewError();
      if (!state.context.account) throw new DomainError('ACCOUNT_NOT_CONNECTED');
      if (state.context.account.toLowerCase() !== state.context.verifier.toLowerCase()) throw new DomainError('WRONG_VERIFIER');
      review ??= Object.freeze({ generation: state.generation, input: state.input, context: state.context, candidate: state.candidate });
      return review;
    },
    assertCurrent(expected) {
      if (expected !== review || !state.present || expected.generation !== state.generation || expected.candidate !== state.candidate) throw reviewError();
    },
    clear() { invalidate({ input: '' }); },
    cancel() { invalidate(); },
  };
}

/** Layout synchronization prevents a changed-context render from exposing an old attestation to a click. */
export function useAttendanceCandidate(repository: AttendanceRepository | null, context: AttendanceContext | null) {
  const controller = useMemo(() => createAttendanceCandidateController(repository), [repository]);
  const key = contextKey(context);
  useLayoutEffect(() => { controller.setContext(context); }, [controller, key]); // Context identity, not object allocation.
  useEffect(() => () => controller.cancel(), [controller]);
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  return { ...snapshot, ...controller };
}
