import { NextResponse } from 'next/server';

/** Healthcheck do container web (compose / proxy). */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'web',
    timestamp: new Date().toISOString(),
  });
}
