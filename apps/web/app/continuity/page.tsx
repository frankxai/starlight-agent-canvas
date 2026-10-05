import type { Metadata } from 'next';
import { ContinuityClient } from '../../components/ContinuityClient';

export const metadata: Metadata = {
  title: 'Session continuity · Starlight Agent Canvas',
  description: 'Recovered work from SIS: captured intent, owner, checkout, admission and delivery proof.',
};

export default function ContinuityPage() {
  return <ContinuityClient />;
}
