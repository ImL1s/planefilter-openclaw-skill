/**
 * api_client.js — Zero-dependency HTTPS client for PlaneFilter skill.
 * Uses only Node.js built-in modules (https, http).
 *
 * @security { env: [], endpoints: [], files: { read: [], write: [] } }
 */
'use strict';

const http = require('http');
const https = require('https');

/**
 * Make an HTTP(S) GET request, return parsed JSON.
 * @param {string} url
 * @param {Record<string, string>} [headers]
 * @returns {Promise<any>}
 */
function get(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const mod = parsed.protocol === 'https:' ? https : http;

    const req = mod.request(parsed, { method: 'GET', headers }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode >= 400) {
          return reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
        }
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(data);
        }
      });
    });

    req.on('error', (e) => reject(e));
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Request timeout')); });
    req.end();
  });
}

module.exports = { get };

