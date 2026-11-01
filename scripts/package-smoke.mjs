import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
const directory = await mkdtemp(join(tmpdir(), 'usersearch-install-'));
if (!process.env.npm_execpath) throw new Error('Run with npm run test:package');
function run(args, cwd) { return execFileSync(process.execPath, [process.env.npm_execpath, ...args], { cwd, encoding: 'utf8' }); }
const [{ filename }] = JSON.parse(run(['pack', '--json', '--pack-destination', directory], process.cwd()));
await writeFile(join(directory, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
run(['install', '--ignore-scripts', '--no-audit', '--no-fund', join(directory, filename)], directory);
const smoke = "import {UserSearch, EncryptedFileStore} from 'usersearch-sdk'; const c = new UserSearch({apiKey:'test',fetch:async()=>new Response(JSON.stringify({balance:123}))}); if ((await c.balance()).data.balance!==123 || typeof EncryptedFileStore!=='function') throw new Error('Package smoke failed'); console.log('Installed-package imports and mocked request passed');";
await writeFile(join(directory, 'smoke.mjs'), smoke);
console.log(execFileSync(process.execPath, ['smoke.mjs'], { cwd: directory, encoding: 'utf8' }));
await writeFile(join(directory, 'smoke.cjs'), "const {UserSearch, VERSION} = require('usersearch-sdk'); const {EncryptedFileStore} = require('usersearch-sdk/storage'); if(typeof UserSearch !== 'function' || typeof EncryptedFileStore !== 'function' || !VERSION) throw new Error('CommonJS imports failed'); console.log('CommonJS and optional storage exports passed');");
console.log(execFileSync(process.execPath, ['smoke.cjs'], { cwd: directory, encoding: 'utf8' }));
console.log(`Isolated test package: ${directory}`);
