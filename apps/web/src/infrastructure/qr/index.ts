export interface ParticipantQr { v: 1; potId: string; participant: `0x${string}` }

export class QrError extends Error {
  readonly code = 'INVALID_QR';
  constructor(message: string) { super(message); this.name = 'QrError'; }
}

function validate(value: unknown, expectedPotId?: string): ParticipantQr {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new QrError('Invalid QR data');
  const item = value as Record<string, unknown>;
  if (Object.keys(item).sort().join(',') !== 'participant,potId,v' || item.v !== 1) throw new QrError('Unsupported QR format');
  if (typeof item.potId !== 'string' || !/^[1-9]\d{0,77}$/.test(item.potId) || BigInt(item.potId) >= 1n << 256n) throw new QrError('Invalid pot ID');
  if (typeof item.participant !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(item.participant) || /^0x0{40}$/i.test(item.participant)) throw new QrError('Invalid participant address');
  if (expectedPotId !== undefined && item.potId !== expectedPotId) throw new QrError('QR belongs to a different pot');
  return { v: 1, potId: item.potId, participant: item.participant.toLowerCase() as `0x${string}` };
}

export function encodeParticipantQr(input: Omit<ParticipantQr, 'v'>): string {
  return JSON.stringify(validate({ v: 1, ...input }));
}

export function decodeParticipantQr(payload: string, options: { expectedPotId?: string } = {}): ParticipantQr {
  if (typeof payload !== 'string' || payload.length > 1024) throw new QrError('QR is too large');
  let value: unknown;
  try { value = JSON.parse(payload); } catch { throw new QrError('QR must contain participant JSON'); }
  return validate(value, options.expectedPotId);
}
