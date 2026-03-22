#!/usr/bin/env node
/**
 * watch_flight.js — Monitor a flight for equipment changes.
 * Designed for OpenClaw cron jobs. Outputs a notification-ready message.
 *
 * Usage:
 *   node watch_flight.js --flight=CI101 [--date=2026-03-22]
 *
 * Output:
 *   - Flight status with notification-ready formatting (exit 0)
 *   - On error: JSON error (exit 1)
 *
 * @security { env: ["RAPIDAPI_KEY"], endpoints: ["aerodatabox.p.rapidapi.com"], files: { read: [], write: [] } }
 */
'use strict';
const { get } = require('./api_client');
const { normalizeAircraftType, getAircraftSize } = require('./aircraft_data');

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

const flightNumber = args.flight.toUpperCase();
const date = args.date || new Date().toISOString().slice(0, 10);

async function main() {
  const host = 'aerodatabox.p.rapidapi.com';
  const url = `https://${host}/flights/number/${encodeURIComponent(flightNumber)}/${date}`;
  let data;
  try {
    data = await get(url, {
      'X-RapidAPI-Key': RAPIDAPI_KEY,
      'X-RapidAPI-Host': host,
    });
  } catch (err) {
    console.log(JSON.stringify({ error: true, message: err.message }));
    process.exit(1);
  }

  if (!Array.isArray(data) || data.length === 0) {
    console.log(`✈️ ${flightNumber} (${date}): No data available yet, check later.`);
    return;
  }

  const f = data[0];
  const aircraftType = normalizeAircraftType(f.aircraft?.model) || null;
  const airline = f.airline?.name || flightNumber.slice(0, 2);
  const origin = f.departure?.airport?.iata || '?';
  const destination = f.arrival?.airport?.iata || '?';
  const registration = f.aircraft?.reg || null;

  if (!aircraftType) {
    console.log(`✈️ ${flightNumber} (${date}): Route data found (${origin}→${destination}) but no aircraft type yet.`);
    return;
  }

  console.log(`✈️ **${flightNumber}** ${airline} ${origin}→${destination}`);
  console.log(`📅 ${date}`);
  console.log(`🛩️ Aircraft: **${aircraftType}**${registration ? ` (${registration})` : ''}`);

  const size = getAircraftSize(aircraftType);
  if (size !== 'unknown') {
    const sizeLabels = { wideBody: 'Wide-body', narrowBody: 'Narrow-body', regional: 'Regional' };
    console.log(`📏 ${sizeLabels[size]}`);
  }

  console.log('');
  console.log('ℹ️ Single source (AeroDataBox) — use search_flight.js for multi-source equipment change detection.');
}

main().catch((err) => {
  console.log(JSON.stringify({ error: true, message: err.message }));
  process.exit(1);
});
