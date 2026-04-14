import { readFileSync } from 'fs';
import { join } from 'path';
let cache = {};
function load(name) {
  if (!cache[name]) {
    cache[name] = JSON.parse(readFileSync(join(process.cwd(), 'data', 'static', name + '.json'), 'utf-8'));
  }
  return cache[name];
}
export function getTiers() { return load('tiers'); }
export function getPrefectures() { return load('prefectures'); }
export function getTopFacilities() { return load('top_facilities'); }
export function getPrefecturesFull() { return load('prefectures_full'); }
export function getMunicipalities() { return load('municipalities'); }
export function getMedicalAreas() { return load('medical_areas_national'); }
export function getFacilitiesGeo() { return load('facilities_geo'); }
export function getPrefCoords() { return load('pref_coords'); }
export function getJapanMap() { return load('japan_map'); }
export function getAreaDemographics() { return load('area_demographics'); }
export function getNdbDiagnostics() { return load('ndb_diagnostics'); }
export function getNdbPrescriptions() { return load('ndb_prescriptions'); }
export function getNdbHealthCheckup() { return load('ndb_health_checkup'); }
export function getAreaEmergencyHomecare() { return load('area_emergency_homecare'); }
export function getFacilityStandards() { return load('facility_standards'); }
export function getFacilityStandardsSummary() { return load('facility_standards_summary'); }
