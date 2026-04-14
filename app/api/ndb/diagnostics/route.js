export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { getNdbDiagnostics } from '../../../../lib/data.js';
export async function GET() { return NextResponse.json(getNdbDiagnostics()); }
