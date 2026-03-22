/**
 * aircraft_data.js — Shared aircraft type constants and classification.
 * Used by search_flight.js and watch_flight.js.
 *
 * @security { env: [], endpoints: [], files: { read: [], write: [] } }
 */
'use strict';

/** Common full model name → ICAO type code mapping (lowercase keys) */
const MODEL_TO_ICAO = {
  'airbus a220-100': 'BCS1', 'airbus a220-300': 'BCS3',
  'airbus a318': 'A318', 'airbus a319': 'A319', 'airbus a319neo': 'A19N',
  'airbus a320': 'A320', 'airbus a320neo': 'A20N',
  'airbus a321': 'A321', 'airbus a321neo': 'A21N',
  'airbus a330-200': 'A332', 'airbus a330-300': 'A333',
  'airbus a330-800': 'A338', 'airbus a330-900': 'A339',
  'airbus a340-300': 'A343', 'airbus a340-600': 'A346',
  'airbus a350-900': 'A359', 'airbus a350-1000': 'A35K',
  'airbus a380-800': 'A388',
  'boeing 737-800': 'B738', 'boeing 737-900': 'B739',
  'boeing 737 max 8': 'B38M', 'boeing 737 max 9': 'B39M',
  'boeing 747-400': 'B744', 'boeing 747-8': 'B748',
  'boeing 757-200': 'B752', 'boeing 757-300': 'B753',
  'boeing 767-300': 'B763', 'boeing 767-400': 'B764',
  'boeing 777-200': 'B772', 'boeing 777-300': 'B773',
  'boeing 777-300er': 'B77W', 'boeing 777-200lr': 'B77L',
  'boeing 787-8': 'B788', 'boeing 787-9': 'B789', 'boeing 787-10': 'B78X',
  'embraer 170': 'E170', 'embraer 175': 'E175',
  'embraer 190': 'E190', 'embraer 195': 'E195',
};

const WIDE_BODY = new Set([
  'A332', 'A333', 'A338', 'A339', 'A342', 'A343', 'A345', 'A346',
  'A359', 'A35K', 'A388', 'B744', 'B748',
  'B762', 'B763', 'B764', 'B772', 'B773', 'B77L',
  'B77W', 'B788', 'B789', 'B78X',
]);

const NARROW_BODY = new Set([
  'A318', 'A319', 'A320', 'A321', 'A19N', 'A20N', 'A21N',
  'BCS1', 'BCS3',
  'B731', 'B732', 'B733', 'B734', 'B735', 'B736', 'B737', 'B738', 'B739',
  'B38M', 'B39M', 'B3XM', 'B752', 'B753',
]);

const REGIONAL = new Set([
  'E170', 'E175', 'E190', 'E195', 'E290', 'E295',
  'AT43', 'AT45', 'AT72', 'AT76', 'CRJ1', 'CRJ2', 'CRJ7', 'CRJ9', 'CRJX',
  'DH8A', 'DH8B', 'DH8C', 'DH8D',
]);

/** Known ICAO type code prefixes — used to validate typecodes from OpenSky */
const ICAO_PREFIXES = new Set([
  'A3', 'A2', 'A1',  // Airbus
  'B7', 'B3', 'B38', 'B39', 'B78',  // Boeing
  'E1', 'E2',  // Embraer
  'AT', 'CR', 'DH',  // Regional
  'MD', 'DC', 'IL', 'TU', 'AN',  // Others
]);

/** Check if a typecode looks like a valid ICAO code (2-4 uppercase alphanumeric) */
function isValidIcaoType(code) {
  if (!code || code.length < 2 || code.length > 4) return false;
  if (!/^[A-Z0-9]+$/.test(code)) return false;
  return [...ICAO_PREFIXES].some((p) => code.startsWith(p));
}

/** Normalize aircraft type: convert full model names to ICAO codes when possible */
function normalizeAircraftType(raw) {
  if (!raw) return undefined;
  const lower = raw.toLowerCase().trim();
  if (MODEL_TO_ICAO[lower]) return MODEL_TO_ICAO[lower];
  if (/^[A-Z0-9]{2,4}$/.test(raw)) return raw;
  return raw;
}

const SIZE_RANK = { regional: 1, narrowBody: 2, wideBody: 3, unknown: 0 };

function getAircraftSize(icaoType) {
  if (!icaoType) return 'unknown';
  if (WIDE_BODY.has(icaoType)) return 'wideBody';
  if (NARROW_BODY.has(icaoType)) return 'narrowBody';
  if (REGIONAL.has(icaoType)) return 'regional';
  return 'unknown';
}

function detectEquipmentChange(scheduledType, actualType) {
  if (!scheduledType || !actualType || scheduledType === actualType) return null;
  const fromSize = getAircraftSize(scheduledType);
  const toSize = getAircraftSize(actualType);
  const fromRank = SIZE_RANK[fromSize];
  const toRank = SIZE_RANK[toSize];

  let changeType = 'unknown';
  if (fromRank !== 0 && toRank !== 0) {
    if (toRank > fromRank) changeType = 'upgrade';
    else if (toRank < fromRank) changeType = 'downgrade';
    else changeType = 'lateral';
  }

  return { hasChanged: true, from: scheduledType, to: actualType, changeType };
}

module.exports = {
  MODEL_TO_ICAO,
  WIDE_BODY,
  NARROW_BODY,
  REGIONAL,
  ICAO_PREFIXES,
  SIZE_RANK,
  isValidIcaoType,
  normalizeAircraftType,
  getAircraftSize,
  detectEquipmentChange,
};
