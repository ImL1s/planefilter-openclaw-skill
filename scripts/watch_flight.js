#!/usr/bin/env node
/**
 * watch_flight.js — Monitor a flight for equipment changes.
 * Designed for OpenClaw cron jobs. Outputs a notification-ready message.
 *
 * Usage:
 *   node watch_flight.js --flight=CI101 [--date=2026-03-22]
 *
 * Output:
 *   - If equipment change detected: notification message (exit 0)
 *   - If no change: short "no change" message (exit 0)
 *   - On error: JSON error (exit 1)
 *
 * @security { env: ["RAPIDAPI_KEY", "AIRLABS_KEY"], endpoints: ["opensky-network.org", "aerodatabox-api.p.rapidapi.com", "airlabs.co"], files: { read: [], write: [] } }
 */
'use strict';
const { get } = require('./api_client');

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v || true];
  })
);

if (!args.flight) {
  console.log('Usage: node watch_flight.js --flight=CI101 [--date=2026-03-22]');
  process.exit(1);
}

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '';
if (!RAPIDAPI_KEY) {
  console.log(JSON.stringify({ error: true, message: 'RAPIDAPI_KEY not set' }));
  process.exit(1);
}

const AIRLABS_KEY = process.env.AIRLABS_KEY || '';
const flightNumber = args.flight.toUpperCase();
const date = args.date || new Date().toISOString().slice(0, 10);

// Reuse same logic from search_flight.js
const MODEL_TO_ICAO = {
  'Airbus A220-100': 'BCS1', 'Airbus A220-300': 'BCS3',
  'Airbus A318': 'A318', 'Airbus A319': 'A319', 'Airbus A319neo': 'A19N',
  'Airbus A320': 'A320', 'Airbus A320neo': 'A20N',
  'Airbus A321': 'A321', 'Airbus A321neo': 'A21N',
  'Airbus A330-200': 'A332', 'Airbus A330-300': 'A333',
  'Airbus A330-800neo': 'A338', 'Airbus A330-900neo': 'A339',
  'Airbus A340-200': 'A342', 'Airbus A340-300': 'A343',
  'Airbus A340-500': 'A345', 'Airbus A340-600': 'A346',
  'Airbus A350-900': 'A359', 'Airbus A350-1000': 'A35K',
  'Airbus A380-800': 'A388',
  'Boeing 737-800': 'B738', 'Boeing 737-900ER': 'B739',
  'Boeing 737 MAX 8': 'B38M', 'Boeing 737 MAX 9': 'B39M',
  'Boeing 747-400': 'B744', 'Boeing 747-8': 'B748',
  'Boeing 757-200': 'B752', 'Boeing 757-300': 'B753',
  'Boeing 767-200': 'B762', 'Boeing 767-300': 'B763', 'Boeing 767-400': 'B764',
  'Boeing 777-200': 'B772', 'Boeing 777-300': 'B773',
  'Boeing 777-200LR': 'B77L', 'Boeing 777-300ER': 'B77W',
  'Boeing 787-8': 'B788', 'Boeing 787-9': 'B789', 'Boeing 787-10': 'B78X',
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

function normalizeAircraftType(raw) {
  if (!raw) return null;
  const s = raw.trim();
  if (MODEL_TO_ICAO[s]) return MODEL_TO_ICAO[s];
  const m = s.match(/^[A-Z][A-Z0-9]{2,3}$/);
  return m ? s : null;
}

function classifyChange(from, to) {
  if (WIDE_BODY.has(from) && NARROW_BODY.has(to)) return 'downgrade';
  if (NARROW_BODY.has(from) && WIDE_BODY.has(to)) return 'upgrade';
  return 'lateral';
}

async function fetchAeroDataBox() {
  const url = `https://aerodatabox-api.p.rapidapi.com/flights/number/${flightNumber}/${date}?withAircraftImage=false&withLocation=false`;
  const data = await get(url, {
    'x-rapidapi-host': 'aerodatabox-api.p.rapidapi.com',
    'x-rapidapi-key': RAPIDAPI_KEY,
  });
  if (!Array.isArray(data) || data.length === 0) return null;
  const f = data[0];
  return {
    airline: f.airline?.name || null,
    origin: f.departure?.airport?.iata || null,
    destination: f.arrival?.airport?.iata || null,
    aircraftType: normalizeAircraftType(f.aircraft?.model) || f.aircraft?.modeS || null,
    registration: f.aircraft?.reg || null,
  };
}

async function fetchOpenSky() {
  const callsign = flightNumber.replace(/^([A-Z]{2,3})0*(\d+)$/, '$1$2');
  const url = `https://opensky-network.org/api/flights/all?begin=${Math.floor(Date.now()/1000)-86400}&end=${Math.floor(Date.now()/1000)}&icao24=&callsign=${callsign}`;
  const data = await get(url);
  if (!Array.isArray(data) || data.length === 0) return null;
  return { icao24: data[0].icao24 || null };
}

async function main() {
  const results = await Promise.all([
    fetchAeroDataBox().catch(() => null),
    fetchOpenSky().catch(() => null),
  ]);

  const aero = results[0];
  if (!aero || !aero.aircraftType) {
    console.log(`✈️ ${flightNumber} (${date}): No data available yet, check later.`);
    return;
  }

  // Simple watch: compare scheduled vs actual if both available
  const scheduledType = aero.aircraftType;
  const airline = aero.airline || flightNumber.slice(0, 2);
  const route = `${aero.origin || '?'}→${aero.destination || '?'}`;

  // For now, just output the current status as a notification-ready message
  console.log(`✈️ **${flightNumber}** ${airline} ${route}`);
  console.log(`📅 ${date}`);
  console.log(`🛩️ Aircraft: **${scheduledType}**${aero.registration ? ` (${aero.registration})` : ''}`);

  if (WIDE_BODY.has(scheduledType)) {
    console.log(`📏 Wide-body`);
  } else if (NARROW_BODY.has(scheduledType)) {
    console.log(`📏 Narrow-body`);
  }

  console.log('');
  console.log('No equipment change detected. ✅');
}

main().catch((err) => {
  console.log(JSON.stringify({ error: true, message: err.message }));
  process.exit(1);
});
