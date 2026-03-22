#!/usr/bin/env node
/**
 * search_flight.js — Multi-source flight aircraft lookup with confidence scoring.
 *
 * Usage: node search_flight.js --flight=CI101 [--date=2026-03-22]
 * Env:   RAPIDAPI_KEY (required), AIRLABS_KEY (optional)
 *
 * @security { env: ["RAPIDAPI_KEY", "AIRLABS_KEY"], endpoints: ["opensky-network.org", "aerodatabox.p.rapidapi.com", "airlabs.co"], files: { read: [], write: [] } }
 */
'use strict';

const { get } = require('./api_client');

// ── CLI Args ────────────────────────────────────────────────────────────────
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v || true];
  })
);

if (!args.flight) {
  console.error('Usage: node search_flight.js --flight=CI101 [--date=2026-03-22]');
  process.exit(1);
}

const FLIGHT = String(args.flight).toUpperCase();
const DATE = args.date || new Date().toISOString().split('T')[0];
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '';
const AIRLABS_KEY = process.env.AIRLABS_KEY || '';

if (!RAPIDAPI_KEY) {
  console.error(JSON.stringify({ error: true, message: 'RAPIDAPI_KEY not set. Subscribe at https://rapidapi.com/aedbx-aedbx/api/aerodatabox' }));
  process.exit(1);
}

// ── API Clients ──────────────────────────────────────────────────────────────

/** OpenSky: callsign → ICAO24 → aircraft metadata (FREE, no key) */
async function queryOpenSky(flightNumber) {
  try {
    const statesUrl = `https://opensky-network.org/api/states/all?callsign=${encodeURIComponent(flightNumber)}`;
    const statesJson = await get(statesUrl);
    const states = statesJson.states;
    if (!Array.isArray(states) || states.length === 0) return null;

    const icao24 = String(states[0][0] || '');
    if (!icao24) return null;

    const acUrl = `https://opensky-network.org/api/metadata/aircraft/icao/${icao24}`;
    const ac = await get(acUrl);
    return {
      aircraftType: ac.typecode || undefined,
      registration: ac.registration || undefined,
      airline: states[0][2] || undefined, // originCountry
    };
  } catch {
    return null;
  }
}

/** AeroDataBox via RapidAPI */
async function queryAeroDataBox(apiKey, flightNumber, date) {
  if (!apiKey) return null;
  try {
    const host = 'aerodatabox.p.rapidapi.com';
    const url = `https://${host}/flights/number/${encodeURIComponent(flightNumber)}/${date}`;
    const json = await get(url, {
      'X-RapidAPI-Key': apiKey,
      'X-RapidAPI-Host': host,
    });
    if (!Array.isArray(json) || json.length === 0) return null;

    const f = json[0];
    const aircraft = f.aircraft || {};
    const dep = f.departure || {};
    const arr = f.arrival || {};
    const al = f.airline || {};

    return {
      aircraftType: aircraft.model || undefined,
      registration: aircraft.reg || undefined,
      airline: al.name || undefined,
      origin: (dep.airport || {}).iata || undefined,
      destination: (arr.airport || {}).iata || undefined,
    };
  } catch {
    return null;
  }
}

/** AirLabs */
async function queryAirLabs(apiKey, flightIata) {
  if (!apiKey) return null;
  try {
    const url = `https://airlabs.co/api/v9/flights?api_key=${encodeURIComponent(apiKey)}&flight_iata=${encodeURIComponent(flightIata)}`;
    const json = await get(url);
    const resp = json.response;
    if (!Array.isArray(resp) || resp.length === 0) return null;

    const r = resp[0];
    return {
      aircraftType: r.aircraft_icao || undefined,
      registration: r.reg_number || undefined,
      airline: r.airline_iata || undefined,
      origin: r.dep_iata || undefined,
      destination: r.arr_iata || undefined,
    };
  } catch {
    return null;
  }
}

// ── Confidence Calculator ────────────────────────────────────────────────────

const SOURCE_WEIGHTS = { aerodatabox: 0.9, opensky: 0.7, airlabs: 0.6 };
const FUTURE_BONUS = { aerodatabox: 0.15 };

function calculateConfidence(sources, flightDate) {
  if (sources.length === 0) return { confidence: 0, distribution: {} };

  const isFuture = flightDate ? new Date(flightDate).getTime() > Date.now() : false;
  const votes = {};
  let totalWeight = 0;

  for (const src of sources) {
    let weight = SOURCE_WEIGHTS[src.source] || 0.5;
    if (isFuture) weight += (FUTURE_BONUS[src.source] || 0);
    votes[src.aircraftType] = (votes[src.aircraftType] || 0) + weight;
    totalWeight += weight;
  }

  if (totalWeight === 0) return { confidence: 0, distribution: {} };

  const distribution = {};
  for (const [type, weight] of Object.entries(votes)) {
    distribution[type] = +(weight / totalWeight).toFixed(3);
  }

  const sorted = Object.entries(votes).sort(([, a], [, b]) => b - a);
  const bestGuess = sorted[0][0];
  const bestShare = sorted[0][1] / totalWeight;

  let confidence;
  if (bestShare === 1.0 && sources.length > 1) {
    confidence = 1.0;
  } else if (sources.length === 1) {
    confidence = bestShare * 0.6;
  } else {
    const countBonus = Math.min(sources.length / 5, 1.0) * 0.2;
    confidence = Math.min(bestShare * 0.8 + countBonus, 1.0);
  }

  return { confidence: +confidence.toFixed(3), bestGuess, distribution };
}

// ── Equipment Change Detector ────────────────────────────────────────────────

const WIDE_BODY = new Set([
  'A332', 'A333', 'A338', 'A339', 'A342', 'A343', 'A345', 'A346',
  'A359', 'A35K', 'B762', 'B763', 'B764', 'B772', 'B773', 'B77L',
  'B77W', 'B788', 'B789', 'B78X',
]);
const NARROW_BODY = new Set([
  'A318', 'A319', 'A320', 'A321', 'A19N', 'A20N', 'A21N',
  'B731', 'B732', 'B733', 'B734', 'B735', 'B736', 'B737', 'B738', 'B739',
  'B38M', 'B39M', 'B3XM', 'B752', 'B753',
]);
const REGIONAL = new Set([
  'E170', 'E175', 'E190', 'E195', 'E290', 'E295',
  'AT43', 'AT45', 'AT72', 'AT76', 'CRJ1', 'CRJ2', 'CRJ7', 'CRJ9', 'CRJX',
  'DH8A', 'DH8B', 'DH8C', 'DH8D',
]);
const SIZE_RANK = { regional: 1, narrowBody: 2, wideBody: 3, unknown: 0 };

function getAircraftSize(icaoType) {
  if (!icaoType) return 'unknown';
  if (WIDE_BODY.has(icaoType)) return 'wideBody';
  if (NARROW_BODY.has(icaoType)) return 'narrowBody';
  if (REGIONAL.has(icaoType)) return 'regional';
  return 'unknown';
}

function detectEquipmentChange(scheduledType, actualType) {
  if (!scheduledType || !actualType || scheduledType === actualType) {
    return null;
  }
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

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Query all sources in parallel
  const [openSkyResult, aeroResult, airLabsResult] = await Promise.all([
    queryOpenSky(FLIGHT),
    queryAeroDataBox(RAPIDAPI_KEY, FLIGHT, DATE),
    AIRLABS_KEY ? queryAirLabs(AIRLABS_KEY, FLIGHT) : Promise.resolve(null),
  ]);

  // Collect source results
  const sources = [];
  if (openSkyResult?.aircraftType) {
    sources.push({ source: 'opensky', aircraftType: openSkyResult.aircraftType });
  }
  if (aeroResult?.aircraftType) {
    sources.push({ source: 'aerodatabox', aircraftType: aeroResult.aircraftType });
  }
  if (airLabsResult?.aircraftType) {
    sources.push({ source: 'airlabs', aircraftType: airLabsResult.aircraftType });
  }

  if (sources.length === 0 && !openSkyResult && !aeroResult && !airLabsResult) {
    console.log(JSON.stringify({ error: true, message: 'No flight data found' }, null, 2));
    process.exit(1);
  }

  // Calculate confidence
  const confidence = calculateConfidence(sources, DATE);

  // Merge best data
  const bestAirline = aeroResult?.airline || openSkyResult?.airline || '';
  const bestOrigin = aeroResult?.origin || airLabsResult?.origin || '';
  const bestDest = aeroResult?.destination || airLabsResult?.destination || '';
  const bestReg = aeroResult?.registration || openSkyResult?.registration;

  // Equipment change detection
  let equipmentChange = null;
  if (aeroResult?.aircraftType && openSkyResult?.aircraftType) {
    equipmentChange = detectEquipmentChange(aeroResult.aircraftType, openSkyResult.aircraftType);
  }

  const result = {
    flightNumber: FLIGHT,
    date: DATE,
    airline: bestAirline,
    origin: bestOrigin,
    destination: bestDest,
    aircraftType: confidence.bestGuess || sources[0]?.aircraftType || 'unknown',
    registration: bestReg || null,
    confidence: confidence.confidence,
    equipmentChange,
    typeDistribution: confidence.distribution,
    sources: sources.map((s) => s.source),
  };

  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(JSON.stringify({ error: true, message: err.message }));
  process.exit(1);
});
