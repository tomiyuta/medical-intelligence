export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { getNdbCheckupRiskRates } from '../../../../lib/data.js';
export async function GET() { return NextResponse.json(getNdbCheckupRiskRates()); }
