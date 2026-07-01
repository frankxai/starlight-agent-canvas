import { NextResponse, type NextRequest } from 'next/server';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);

function hostName(hostHeader: string | null): string {
  if (!hostHeader) return '';
  if (hostHeader.startsWith('[')) {
    const closing = hostHeader.indexOf(']');
    return closing > 0 ? hostHeader.slice(1, closing).toLowerCase() : hostHeader.toLowerCase();
  }
  return hostHeader.split(':')[0].toLowerCase();
}

export function proxy(request: NextRequest) {
  if (process.env.AGENT_CANVAS_ALLOW_REMOTE === '1') {
    return NextResponse.next();
  }

  const host = hostName(request.headers.get('host'));
  if (LOCAL_HOSTS.has(host)) {
    return NextResponse.next();
  }

  return NextResponse.json(
    { error: 'Starlight Agent Canvas API is localhost-only unless AGENT_CANVAS_ALLOW_REMOTE=1 is set.' },
    { status: 403 },
  );
}

export const config = {
  matcher: '/api/:path*',
};
