export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
export async function GET() {
  return NextResponse.json({ 
    message: "CRM requires database backend (Supabase). Use local SQLite for dev.", 
    accounts: [] 
  });
}
