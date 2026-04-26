export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';

let cache = null;
function load() {
  if (!cache) cache = JSON.parse(readFileSync(join(process.cwd(), 'data', 'static', 'vital_stats_pref.json'), 'utf-8'));
  return cache;
}

export async function GET() {
  return NextResponse.json(load());
}
