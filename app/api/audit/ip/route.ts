import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  // Try to read the IP address from headers
  const ipAddress = request.headers.get('x-forwarded-for') || '127.0.0.1';
  return NextResponse.json({ ip: ipAddress });
}
