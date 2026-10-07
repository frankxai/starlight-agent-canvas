import { canvasIdSchema } from '@starlight-agent-canvas/core';
import { notFound } from 'next/navigation';
import SiteDirectionWorkbench from '@/components/SiteDirectionWorkbench';
export default async function WebsiteDirections({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!canvasIdSchema.safeParse(id).success) notFound();
  return <SiteDirectionWorkbench key={id} canvasId={id} />;
}
