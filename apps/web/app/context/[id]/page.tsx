import { atlasContextRefSchema } from '@starlight-agent-canvas/core/atlas-context';
import { notFound } from 'next/navigation';
import AtlasContextView from '@/components/AtlasContextView';
export default async function AtlasContextFocus({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!atlasContextRefSchema.safeParse(id).success) notFound();
  return <AtlasContextView key={id} contextRef={id} />;
}
