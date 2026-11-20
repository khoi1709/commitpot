import { createPublicBrowserReader } from '../avalanche/browser';
import { loadProof, type ProofSnapshot } from './reader';

/** Uses only server-side public configuration and the explicitly read-only repository factory. */
export async function loadServerProof(manifestJson: string | undefined, potId: string): Promise<ProofSnapshot> {
  return loadProof({ manifestJson, potId, createReader: createPublicBrowserReader });
}
