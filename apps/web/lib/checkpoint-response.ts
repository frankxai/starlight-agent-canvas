import { NextResponse } from 'next/server';

export function checkpointErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  if (message.startsWith('Timed out waiting for canvas lock') || message.startsWith('Canvas lock ownership changed')) {
    return NextResponse.json({ error: 'Canvas is locked by another writer or needs owner reconciliation. Keep your edits, wait for that writer, then refresh history.' }, { status: 503 });
  }
  if (code === 'ENOENT' || message === 'Checkpoint was not found.') {
    return NextResponse.json({ error: 'Canvas or checkpoint was not found. Refresh history and choose an available checkpoint.' }, { status: 404 });
  }
  if (message.startsWith('Checkpoint could not')) {
    return NextResponse.json({ error: 'Checkpoint could not be verified. The current canvas is unchanged; choose another checkpoint.' }, { status: 409 });
  }
  if (code === 'EACCES' || code === 'EPERM' || code === 'ENOSPC') {
    return NextResponse.json({ error: 'Local history storage is unavailable. Check disk space and access to the Canvas home before retrying.' }, { status: 503 });
  }
  return NextResponse.json({ error: 'History request could not be completed. Check the canvas, checkpoint and checkpoint name, then refresh history.' }, { status: 400 });
}
