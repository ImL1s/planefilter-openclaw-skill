#!/usr/bin/env node
/**
 * ai_briefing.js — Search flight + generate AI analysis via Gemini REST API.
 *
 * Usage: node ai_briefing.js --flight=CI101 [--date=2026-03-22]
 * Env:   RAPIDAPI_KEY (required), GEMINI_API_KEY (required), AIRLABS_KEY (optional)
 *
 * @security { env: ["RAPIDAPI_KEY", "AIRLABS_KEY", "GEMINI_API_KEY"], endpoints: ["opensky-network.org", "aerodatabox.p.rapidapi.com", "airlabs.co", "generativelanguage.googleapis.com"], files: { read: [], write: [] } }
 */
'use strict';

const { post } = require('./api_client');
const { execFileSync } = require('child_process');
const path = require('path');

// ── CLI Args ────────────────────────────────────────────────────────────────
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v || true];
  })
);

if (!args.flight) {
  console.error('Usage: node ai_briefing.js --flight=CI101 [--date=2026-03-22]');
  process.exit(1);
}

const FLIGHT = String(args.flight).toUpperCase();
const DATE = args.date || new Date().toISOString().split('T')[0];
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

if (!GEMINI_API_KEY) {
  console.error(JSON.stringify({ error: true, message: 'GEMINI_API_KEY not set. Get one at https://aistudio.google.com/apikey' }));
  process.exit(1);
}

const SYSTEM_INSTRUCTION = `You are an aviation data analyst for a consumer flight-lookup app.
Summarize flight data into 2-3 concise sentences. Cross-reference safety events and equipment changes.
Use the user's language (detect from input). Never invent data. Keep under 120 words.`;

async function main() {
  // Step 1: Run search_flight.js to get flight data
  const searchScript = path.join(__dirname, 'search_flight.js');
  let flightData;
  try {
    const dateArg = args.date ? `--date=${DATE}` : '';
    const result = execFileSync('node', [searchScript, `--flight=${FLIGHT}`, dateArg].filter(Boolean), {
      encoding: 'utf-8',
      env: process.env,
      timeout: 30000,
    });
    flightData = JSON.parse(result);
    if (flightData.error) {
      console.log(JSON.stringify({ error: true, message: 'Flight search failed', detail: flightData.message }));
      process.exit(1);
    }
  } catch (err) {
    console.error(JSON.stringify({ error: true, message: `Flight search failed: ${err.message}` }));
    process.exit(1);
  }

  // Step 2: Build prompt
  const lines = [
    `Flight: ${flightData.flightNumber} (${flightData.airline || ''})`,
    `Route: ${flightData.origin || '?'} → ${flightData.destination || '?'}`,
    `Aircraft: ${flightData.aircraftType || 'unknown'}`,
    `Confidence: ${Math.round((flightData.confidence || 0) * 100)}%`,
  ];

  if (flightData.equipmentChange?.hasChanged) {
    lines.push(`⚠ Equipment change: ${flightData.equipmentChange.from} → ${flightData.equipmentChange.to} (${flightData.equipmentChange.changeType})`);
  }

  if (flightData.typeDistribution && Object.keys(flightData.typeDistribution).length > 0) {
    const dist = Object.entries(flightData.typeDistribution)
      .map(([type, share]) => `${type}=${Math.round(Number(share) * 100)}%`)
      .join(', ');
    lines.push(`Type distribution: ${dist}`);
  }

  lines.push(`Sources: ${(flightData.sources || []).join(', ')}`);

  // Step 3: Call Gemini REST API (zero SDK, zero deps)
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`;
  const payload = {
    system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
    contents: [{ parts: [{ text: lines.join('\n') }] }],
    generationConfig: { maxOutputTokens: 300, temperature: 0.3 },
  };

  try {
    const response = await post(geminiUrl, payload);
    const text = response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    console.log(JSON.stringify({
      flightNumber: flightData.flightNumber,
      briefing: text.trim(),
      flightData,
    }, null, 2));
  } catch (err) {
    console.error(JSON.stringify({ error: true, message: `Gemini API failed: ${err.message}` }));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(JSON.stringify({ error: true, message: err.message }));
  process.exit(1);
});
