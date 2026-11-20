import { describe, expect, it, vi } from 'vitest';
import { createAttendanceCandidateController, type AttendanceContext } from '../../src/application/useAttendanceCandidate';
import type { Address, ParticipantStatus } from '../../src/domain';

const a: Address = '0x0000000000000000000000000000000000000001';
const b: Address = '0x0000000000000000000000000000000000000002';
const verifier: Address = '0x00000000000000000000000000000000000000aa';
const context: AttendanceContext = {
  chainId: 31337, coreAddress: '0x0000000000000000000000000000000000002000',
  potId: 1n, verifier, account: verifier,
};
const member: ParticipantStatus = { joined: true, checkedIn: false, claimed: false, order: 0n, claimable: 0n };
const qr = (participant: Address, potId = '1') => JSON.stringify({ v: 1, potId, participant });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const setup = () => {
  const repository = { getParticipantStatus: vi.fn(async () => member) };
  return { repository, controller: createAttendanceCandidateController(repository, context) };
};

describe('attendance ingestion and exact final review', () => {
  it('invalidates attested QR A when camera/manual ingestion supplies QR B', async () => {
    const { controller } = setup();
    controller.setInput(qr(a));
    await controller.inspect();
    controller.setPresent(true);
    const reviewA = controller.getReview();
    expect(reviewA.candidate.address).toBe(a);
    controller.assertCurrent(reviewA);

    controller.setInput(qr(b)); // The camera and textarea use this exact method.
    expect(controller.getSnapshot()).toMatchObject({ input: qr(b), candidate: null, present: false });
    expect(() => controller.assertCurrent(reviewA)).toThrow(/again/);
    expect(() => controller.getReview()).toThrow();
    await controller.inspect();
    expect(controller.getSnapshot().candidate?.address).toBe(b);
    expect(controller.getSnapshot().present).toBe(false);
    controller.setPresent(true);
    const reviewB = controller.getReview();
    expect(reviewB.candidate.address).toBe(b);
    expect(reviewB.context.potId).toBe(1n);
    controller.assertCurrent(reviewB);
    expect(() => controller.assertCurrent(reviewA)).toThrow();
    expect(() => controller.assertCurrent({ ...reviewB })).toThrow();
  });

  it('treats repeated input as a new ingestion and requires a new explicit attestation', async () => {
    const { controller } = setup();
    controller.setInput(qr(a)); await controller.inspect(); controller.setPresent(true);
    const old = controller.getReview();
    controller.setInput(qr(a));
    expect(controller.getSnapshot()).toMatchObject({ candidate: null, present: false });
    expect(() => controller.assertCurrent(old)).toThrow();
  });

  it('drops delayed A after B inspection, including delayed errors', async () => {
    for (const rejects of [false, true]) {
      const delayed = deferred<ParticipantStatus>();
      const repository = { getParticipantStatus: vi.fn().mockReturnValueOnce(delayed.promise).mockResolvedValue(member) };
      const controller = createAttendanceCandidateController(repository, context);
      controller.setInput(qr(a));
      const inspectA = controller.inspect();
      controller.setInput(qr(b));
      await controller.inspect(); controller.setPresent(true);
      const reviewB = controller.getReview();
      if (rejects) delayed.reject(new Error('late A RPC failure')); else delayed.resolve(member);
      expect(await inspectA).toBeNull();
      expect(controller.getSnapshot()).toMatchObject({ candidate: { address: b }, present: true, error: null, inspecting: false });
      controller.assertCurrent(reviewB);
    }
  });

  it('only publishes the newest inspection of unchanged input', async () => {
    const delayed = deferred<ParticipantStatus>();
    const repository = { getParticipantStatus: vi.fn().mockReturnValueOnce(delayed.promise).mockResolvedValue(member) };
    const controller = createAttendanceCandidateController(repository, context);
    controller.setInput(qr(a)); const first = controller.inspect();
    await controller.inspect(); controller.setPresent(true); const current = controller.getReview();
    delayed.resolve({ ...member, checkedIn: true }); await first;
    expect(controller.getSnapshot().candidate?.status.checkedIn).toBe(false);
    controller.assertCurrent(current);
  });

  const changes: [string, Partial<AttendanceContext>][] = [
    ['account', { account: b }], ['disconnect', { account: null }], ['pot', { potId: 2n }],
    ['core', { coreAddress: a }], ['chain', { chainId: 43113 }], ['verifier', { verifier: b }],
  ];
  it.each(changes)('invalidates a candidate/review immediately on %s change', async (_name, change) => {
    const { controller } = setup();
    controller.setInput(qr(a)); await controller.inspect(); controller.setPresent(true);
    const old = controller.getReview();
    controller.setContext({ ...context, ...change });
    expect(controller.getSnapshot()).toMatchObject({ input: qr(a), candidate: null, present: false, error: null });
    expect(() => controller.assertCurrent(old)).toThrow();
  });

  it.each(changes)('drops delayed inspection after %s change and change back (ABA)', async (_name, change) => {
    const delayed = deferred<ParticipantStatus>();
    const controller = createAttendanceCandidateController({ getParticipantStatus: () => delayed.promise }, context);
    controller.setInput(qr(a)); const work = controller.inspect();
    controller.setContext({ ...context, ...change }); controller.setContext(context);
    delayed.resolve(member);
    expect(await work).toBeNull();
    expect(controller.getSnapshot()).toMatchObject({ candidate: null, present: false, inspecting: false });
  });

  it('compares addresses case-insensitively and does not invalidate on equivalent context allocation', async () => {
    const { controller } = setup();
    controller.setInput(qr(a)); await controller.inspect(); controller.setPresent(true); const review = controller.getReview();
    controller.setContext({ ...context, verifier: `0x${verifier.slice(2).toUpperCase()}`, account: `0x${verifier.slice(2).toUpperCase()}` });
    controller.assertCurrent(review);
    expect(controller.getReview()).toBe(review);
  });

  it('revoking/rechecking presence cannot restore an earlier final review', async () => {
    const { controller } = setup();
    controller.setInput(qr(a)); await controller.inspect(); controller.setPresent(true); const review = controller.getReview();
    controller.setPresent(false); controller.setPresent(true);
    expect(() => controller.assertCurrent(review)).toThrow();
    controller.assertCurrent(controller.getReview());
  });

  it('reinspection invalidates the attestation even if the same participant succeeds', async () => {
    const { controller } = setup();
    controller.setInput(qr(a)); await controller.inspect(); controller.setPresent(true); const review = controller.getReview();
    await controller.inspect();
    expect(controller.getSnapshot().present).toBe(false);
    expect(() => controller.assertCurrent(review)).toThrow();
  });

  it('rejects a participant address with a terminal newline accepted by the QR parser before membership reads', async () => {
    const { controller, repository } = setup();
    const payload = JSON.stringify({ v: 1, potId: '1', participant: `${a}\n` });
    controller.setInput(payload);
    expect(await controller.inspect()).toBeNull();
    expect(controller.getSnapshot().candidate).toBeNull();
    expect(controller.getSnapshot().error).toMatchObject({ code: 'INVALID_QR' });
    expect(repository.getParticipantStatus).not.toHaveBeenCalled();
  });

  it('uses existing QR validation before reading membership and records actionable errors', async () => {
    const { controller, repository } = setup();
    for (const input of ['garbage', qr(a, '2'), 'x'.repeat(1025)]) {
      controller.setInput(input);
      expect(await controller.inspect()).toBeNull();
      expect(controller.getSnapshot().error).toMatchObject({ code: 'INVALID_QR' });
    }
    expect(repository.getParticipantStatus).not.toHaveBeenCalled();
    controller.setInput(qr(a)); repository.getParticipantStatus.mockResolvedValueOnce({ ...member, joined: false });
    expect(await controller.inspect()).toBeNull();
    expect(controller.getSnapshot().error).toMatchObject({ code: 'NOT_JOINED' });
    expect(controller.getSnapshot().candidate).toBeNull();
  });

  it('does not allow checked-in, uninspected, disconnected or nonverifier final review', async () => {
    const { controller, repository } = setup();
    controller.setPresent(true); expect(controller.getSnapshot().present).toBe(false);
    repository.getParticipantStatus.mockResolvedValueOnce({ ...member, checkedIn: true });
    controller.setInput(qr(a)); await controller.inspect(); controller.setPresent(true);
    expect(controller.getSnapshot().candidate?.status.checkedIn).toBe(true);
    expect(controller.getSnapshot().present).toBe(false);
    expect(() => controller.getReview()).toThrow();
    for (const [account, code] of [[null, 'ACCOUNT_NOT_CONNECTED'], [a, 'WRONG_VERIFIER']] as const) {
      controller.setContext({ ...context, account }); await controller.inspect(); controller.setPresent(true);
      expect(() => controller.getReview()).toThrowError(expect.objectContaining({ code }));
    }
  });

  it('freezes reviewed identity/status and does not share mutable repository objects', async () => {
    const mutableContext = { ...context };
    const mutableStatus = { ...member };
    const controller = createAttendanceCandidateController({ getParticipantStatus: async () => mutableStatus }, mutableContext);
    controller.setInput(qr(a)); await controller.inspect(); controller.setPresent(true); const review = controller.getReview();
    mutableContext.potId = 99n; mutableStatus.joined = false;
    expect(review.context.potId).toBe(1n); expect(review.candidate.status.joined).toBe(true);
    expect(Object.isFrozen(review)).toBe(true); expect(Object.isFrozen(review.candidate.status)).toBe(true);
    controller.assertCurrent(review);
  });

  it('clear/cancel invalidate pending work; cancel preserves input and clear removes it', async () => {
    for (const method of ['clear', 'cancel'] as const) {
      const delayed = deferred<ParticipantStatus>();
      const controller = createAttendanceCandidateController({ getParticipantStatus: () => delayed.promise }, context);
      const listener = vi.fn(); const unsubscribe = controller.subscribe(listener);
      controller.setInput(qr(a)); const work = controller.inspect(); controller[method]();
      delayed.resolve(member); await work;
      expect(controller.getSnapshot()).toMatchObject({ input: method === 'clear' ? '' : qr(a), candidate: null, inspecting: false });
      expect(listener).toHaveBeenCalled(); unsubscribe(); listener.mockClear(); controller.clear();
      expect(listener).not.toHaveBeenCalled();
    }
  });
});
