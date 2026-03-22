---
name: planefilter
description: >
  Aviation flight lookup — query aircraft type, equipment changes, and
  confidence scoring for any flight number. Use when: looking up flight
  aircraft, checking equipment change, querying flight data, asking what plane
  a flight uses. Triggers on: flight lookup, aircraft type, what plane, 查機型,
  航班查詢, equipment change, plane filter, flight number, CI101, 飛機型號.
homepage: https://github.com/ImL1s/planefilter-openclaw-skill
metadata:
  openclaw:
    emoji: "✈️"
    primaryEnv: RAPIDAPI_KEY
    requires:
      bins: [node]
      env: [RAPIDAPI_KEY]
    install:
      - id: "node-brew"
        kind: "brew"
        formula: "node"
        bins: ["node"]
        label: "Install Node.js (brew)"
---

# PlaneFilter — Flight Aircraft Type Lookup

Look up aircraft type, equipment changes, and confidence scoring for any flight
by querying multiple aviation data sources (OpenSky, AeroDataBox, AirLabs) and
merging results with weighted confidence scoring.

查詢任何航班的機型、換機偵測、信心分數。同時查詢多個航空資料來源（OpenSky、AeroDataBox、AirLabs），加權合併結果。

## Prerequisites / 前置需求

### Required / 必要
- **Node.js** (v18+)
- **RAPIDAPI_KEY** — Subscribe to [AeroDataBox on RapidAPI](https://rapidapi.com/aedbx-aedbx/api/aerodatabox) (free Basic plan: 150 req/month)
  - 至 RapidAPI 訂閱 AeroDataBox（免費方案：每月 150 次）

### Optional / 選用（更多資料來源）
- **AIRLABS_KEY** — Get from [AirLabs](https://airlabs.co/signup) (free: 150 req/month)
  - 至 AirLabs 註冊取得（免費：每月 150 次）

## Commands / 指令

### 1. Search Flight / 搜尋航班

```bash
node {baseDir}/scripts/search_flight.js --flight=CI101 [--date=2026-03-22]
```

**Required env:** `RAPIDAPI_KEY`
**Optional env:** `AIRLABS_KEY` (adds another data source for higher confidence / 增加第三資料源提升信心分數)

### 2. Health Check / 健康檢查

```bash
node {baseDir}/scripts/health_check.js
```

Verifies all API keys are set and reachable. Shows which data sources are available.
驗證所有 API key 是否設定且可連線，顯示可用的資料來源。

### 3. Watch Flight / 監控航班（Cron 排程用）

```bash
node {baseDir}/scripts/watch_flight.js --flight=CI101 [--date=2026-03-22]
```

**Required env:** `RAPIDAPI_KEY`

Outputs notification-ready text (not JSON). Designed for OpenClaw cron jobs with `--announce`.
輸出通知用的純文字格式（非 JSON），專為 OpenClaw 排程搭配 `--announce` 推送設計。

## Output Format / 輸出格式

`search_flight.js` outputs JSON to stdout / 輸出 JSON 至 stdout：

```json
{
  "flightNumber": "CI101",
  "date": "2026-03-22",
  "airline": "China Airlines",
  "origin": "NRT",
  "destination": "TPE",
  "aircraftType": "A333",
  "registration": "B-18311",
  "confidence": 0.6,
  "equipmentChange": null,
  "typeDistribution": { "A333": 1 },
  "sources": ["aerodatabox"]
}
```

## Output Interpretation / 輸出解讀

When presenting results to the user, follow these rules:
向使用者呈現結果時，遵循以下規則：

| Field / 欄位 | How to Interpret / 解讀方式 |
|-------|--------------------|
| `confidence` ≥ 0.8 | 高信心 — 直接呈現機型 |
| `confidence` 0.5–0.8 | 中等 — 加上「可能」或「最可能」 |
| `confidence` < 0.5 | 低信心 — 警告資料不確定，顯示 `typeDistribution` |
| `equipmentChange` not null | ⚠️ **重要** — 實際機型與排班不同！顯示 `from`、`to`、`changeType`（upgrade/downgrade/lateral） |
| `typeDistribution` | 各來源投票分佈。多個項目 = 來源間有分歧 |
| `sources` empty | 無資料 — 建議換個日期再試 |

**Note on aircraft type codes / 關於機型代碼：** The script automatically normalizes model names (e.g. "Airbus A330-300" → "A333") and filters invalid typecodes. In rare cases, an unrecognized model name may pass through as-is.
腳本會自動將全名正規化為 ICAO 代碼，並過濾無效的機型代碼。

## How It Works / 運作原理

1. **Parallel query / 平行查詢** — Hits OpenSky (free, no key) + AeroDataBox (RapidAPI) + AirLabs (optional) simultaneously / 同時查詢三個資料來源
2. **Confidence scoring / 信心評分** — Weighted votes from each source (AeroDataBox 0.9, OpenSky 0.7, AirLabs 0.6) / 各來源加權投票
3. **Equipment change detection / 換機偵測** — If scheduled aircraft ≠ actual aircraft, classifies as Upgrade/Downgrade/Lateral / 排班與實際機型不同時，分類為升等/降等/平移

## Proactive Notifications (Cron) / 主動通知（排程）

Set up a cron job to monitor a flight and push alerts to Telegram/Discord:
設定排程監控航班，自動推送通知到 Telegram/Discord：

```bash
# Check CI101 every 2 hours, push to Telegram if anything changes
# 每 2 小時查一次 CI101，有變化就推送 Telegram
openclaw cron add --name "Watch CI101" \
  --every 2h \
  --session isolated \
  --message "Use the planefilter skill to watch flight CI101 for today. If there's an equipment change, tell me immediately with details." \
  --announce --channel telegram

# One-shot check at specific time / 指定時間一次性檢查
openclaw cron add --name "CI101 departure check" \
  --at "2026-04-01T06:00:00+08:00" \
  --session isolated \
  --message "Use planefilter to check CI101 for today. Report aircraft type and any equipment changes." \
  --announce --channel telegram \
  --delete-after-run
```

The agent reads the cron message, calls `watch_flight.js`, and pushes results to your channel.
Agent 讀取 cron 訊息 → 呼叫 `watch_flight.js` → 將結果推送至您的頻道。

## Troubleshooting / 疑難排解

| Error / 錯誤 | Cause / 原因 | Fix / 解法 |
|-------|-------|------|
| `RAPIDAPI_KEY not set` | 未設定環境變數 | `export RAPIDAPI_KEY=your_key` 或在 `~/.openclaw/openclaw.json` 設定 |
| `403 from AeroDataBox` | API key 無效或過期 | 檢查你的 RapidAPI 訂閱 |
| `No flight data found` | 航班不在任何資料庫中 | 換個日期或試主要航空公司的航班 |
