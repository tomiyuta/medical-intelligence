export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { getNdbCheckupRiskRatesStandardized } from '../../../../lib/data.js';
export async function GET() { return NextResponse.json(getNdbCheckupRiskRatesStandardized()); }
