import { parsePotId } from '../../domain/amounts';
import { loadServerProof } from '../../infrastructure/evidence/server';
import { VerificationView, type VerificationLocale } from '../../presentation/VerificationView';

type Search = Promise<{ potId?: string | string[]; lang?: string | string[] }>;

function locale(value: string | string[] | undefined): VerificationLocale {
  return value === 'vi' ? 'vi' : 'en';
}

export default async function VerifyPage({ searchParams }: { searchParams: Search }) {
  const query = await searchParams;
  const language = locale(query.lang);
  if (query.potId === undefined) return <VerificationView locale={language} />;
  if (typeof query.potId !== 'string') return <VerificationView locale={language} invalidPot />;

  if (!/^[1-9][0-9]{0,77}$/.test(query.potId)) return <VerificationView locale={language} invalidPot />;
  try {
    const potId = parsePotId(query.potId).toString();
    if (potId !== query.potId) return <VerificationView locale={language} invalidPot />;
    if (potId === '3' && !process.env.COMMITPOT_PROOF_MANIFEST_JSON) return <VerificationView locale={language} potId={potId} />;
    const snapshot = await loadServerProof(process.env.COMMITPOT_PROOF_MANIFEST_JSON, potId);
    return <VerificationView locale={language} potId={potId} snapshot={snapshot} />;
  } catch {
    return <VerificationView locale={language} invalidPot />;
  }
}
