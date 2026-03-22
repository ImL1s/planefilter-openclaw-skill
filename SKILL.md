---
name: planefilter
description: >
  Aviation flight lookup — query aircraft type, equipment changes, confidence
  scoring, and AI briefing for any flight number. Use when: looking up flight
  aircraft, checking equipment change, querying flight data, asking what plane
  a flight uses. Triggers on: flight lookup, aircraft type, what plane, 查機型,
  航班查詢, equipment change, plane filter, flight number, CI101, 飛機型號.
metadata:
  openclaw:
    emoji: "✈️"
    primaryEnv: RAPIDAPI_KEY
    requires:
      bins: [node]
      env: [RAPIDAPI_KEY]
---

# PlaneFilter — Flight Aircraft Type Lookup

Look up aircraft type, equipment changes, and confidence scoring for any flight
by querying multiple aviation data sources (OpenSky, AeroDataBox, AirLabs) and
merging results with weighted confidence scoring.

## Prerequisites

### Required
- **Node.js** (v18+)
- **RAPIDAPI_KEY** — Subscribe to [AeroDataBox on RapidAPI](https://rapidapi.com/aedbx-aedbx/api/aerodatabox) (free Basic plan: 150 req/month)

### Optional (more data sources)
- **AIRLABS_KEY** — Get from [AirLabs](https://airlabs.co/signup) (free: 150 req/month)
- **GEMINI_API_KEY** — Get from [Google AI Studio](https://aistudio.google.com/apikey) (for AI briefing feature)

## Commands

### 1. Search Flight (core feature)

```bash
node {baseDir}/scripts/search_flight.js --flight=CI101 [--date=2026-03-22]
```

**Required env:** `RAPIDAPI_KEY`
**Optional env:** `AIRLABS_KEY` (adds another data source)

**Output:** JSON with aircraft type, airline, route, confidence score, equipment change detection.

```json
{
  "flightNumber": "CI101",
  "airline": "China Airlines",
  "origin": "NRT",
  "destination": "TPE",
  "aircraftType": "A333",
  "confidence": 0.85,
  "equipmentChange": null,
  "typeDistribution": { "A333": 0.65, "A330-300": 0.35 },
  "sources": ["opensky", "aerodatabox", "airlabs"]
}
```

### 2. AI Flight Briefing

```bash
node {baseDir}/scripts/ai_briefing.js --flight=CI101 [--date=2026-03-22]
```

**Required env:** `RAPIDAPI_KEY`, `GEMINI_API_KEY`

Searches flight data and generates a natural-language AI analysis using Gemini.

### 3. Health Check

```bash
node {baseDir}/scripts/health_check.js
```

Verifies all API keys are set and reachable. Shows which data sources are available.

## How It Works

1. **Parallel query** — Hits OpenSky (free, no key) + AeroDataBox (RapidAPI) + AirLabs (optional) simultaneously
2. **Confidence scoring** — Weighted votes from each source (AeroDataBox 0.9, OpenSky 0.7, AirLabs 0.6)
3. **Equipment change detection** — If scheduled aircraft ≠ actual aircraft, classifies as Upgrade/Downgrade/Lateral
4. **AI briefing** (optional) — Feeds merged data into Gemini for human-readable analysis

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `RAPIDAPI_KEY not set` | Missing env var | `export RAPIDAPI_KEY=your_key` or set in `~/.openclaw/openclaw.json` |
| `403 from AeroDataBox` | Invalid or expired key | Check your RapidAPI subscription |
| `No flight data found` | Flight not in any database | Try with a different date or a major airline flight |
| `GEMINI_API_KEY not set` | Missing for AI briefing | Only needed for `ai_briefing.js`, not for search |
