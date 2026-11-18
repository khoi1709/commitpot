import { PHASE_DEVELOPMENT_SERVER } from 'next/constants';
export default function config(phase: string) {
  return { distDir: phase === PHASE_DEVELOPMENT_SERVER ? (process.env.COMMITPOT_DEV_DIST ?? '.next-dev') : '.next', devIndicators: false };
}
