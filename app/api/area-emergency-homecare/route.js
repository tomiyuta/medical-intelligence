export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { getAreaEmergencyHomecare, getMedicalAreas } from '../../../lib/data.js';

// area_emergency_homecare.json(339行 × {pref, area, hospitals, emerg,
// emerg_claims, homecare, homecare_patients, acute_support})を返す。
// ?pref= で県内圏に絞る。二次医療圏マスタ medical_areas(330圏)との
// 件数差はメタで開示(圏定義差)。統合フェーズは pref+area 名で join する。

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const pref = searchParams.get('pref');

  const all = getAreaEmergencyHomecare() || [];
  const data = pref ? all.filter((r) => r.pref === pref) : all;
  const prefectures = [...new Set(all.map((r) => r.pref))].sort();

  let medicalAreaCount = null;
  try {
    const ma = getMedicalAreas();
    medicalAreaCount = Array.isArray(ma) ? ma.length : null;
  } catch {
    medicalAreaCount = null;
  }

  const fields = ['hospitals', 'emerg', 'emerg_claims', 'homecare', 'homecare_patients', 'acute_support'];

  return NextResponse.json({
    source: '医療需給総覧: 救急告示施設・在宅療養支援診療所/病院 圏別集計',
    fieldLabels: {
      hospitals: '病院数',
      emerg: '救急告示施設数',
      emerg_claims: '救急受入(件)',
      homecare: '在宅療養支援診療所/病院数',
      homecare_patients: '在宅患者数',
      acute_support: '急性期支援',
    },
    fields,
    pref: pref || null,
    resolved: pref ? data.length > 0 : null,
    total: data.length,
    rowCount: all.length,
    medicalAreaCount,
    countMismatchNote:
      medicalAreaCount != null
        ? `本データは${all.length}行、二次医療圏マスタ(medical_areas)は${medicalAreaCount}圏。圏定義差により件数不一致。統合時は pref+area 名で join し、不一致圏は「—」表示すること。`
        : `本データは${all.length}行。二次医療圏マスタとの圏定義差(件数不一致)に留意。pref+area 名で join すること。`,
    prefectures,
    data,
  });
}
