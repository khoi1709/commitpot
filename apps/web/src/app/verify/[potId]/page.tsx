import { parsePotId } from '../../../domain/amounts';
import { loadServerProof } from '../../../infrastructure/evidence/server';
import { VerificationView, type VerificationLocale } from '../../../presentation/VerificationView';

type Params = Promise<{ potId: string }>;
type Search = Promise<{ lang?: string | string[] }>;

function locale(value: string | string[] | undefined): VerificationLocale {
  return value === 'vi' ? 'vi' : 'en';
}

export default async function VerifyPotPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const [{ potId: rawId }, query] = await Promise.all([params, searchParams]);
  const language = locale(query.lang);
  try {
    const potId = parsePotId(rawId).toString();
    if (potId !== rawId) return <VerificationView locale={language} invalidPot />;
    if (potId === '3' && !process.env.COMMITPOT_PROOF_MANIFEST_JSON) return <VerificationView locale={language} potId={potId} />;
    const snapshot = await loadServerProof(process.env.COMMITPOT_PROOF_MANIFEST_JSON, potId);
    return <VerificationView locale={language} potId={potId} snapshot={snapshot} />;
  } catch {
    return <VerificationView locale={language} invalidPot />;
  }
}
