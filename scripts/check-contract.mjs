import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
const url = 'https://public-api.usersearch.ai/docs/openapi.yaml';
const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(30000) });
if (!response.ok) throw new Error(`Specification fetch failed: ${response.status}`);
const canonical = (await response.text()).replaceAll('\r\n', '\n').replaceAll('https://public-api.usersearch.ai', '__API_ORIGIN__');
const actual = createHash('sha256').update(canonical).digest('hex');
const expected = JSON.parse(await readFile(new URL('../contract-baseline.json', import.meta.url), 'utf8'));
if (actual !== expected.sha256) {
  console.error(`API specification changed. Review the contract before updating the baseline.\nExpected: ${expected.sha256}\nActual:   ${actual}`);
  process.exitCode = 1;
} else console.log('API specification matches the reviewed baseline.');
