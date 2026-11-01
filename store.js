import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';
import { mkdir, open, readFile, rename, unlink, rmdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';

/** Encrypted local result store. Supply a separate 32-byte key from your secret manager. */
export class EncryptedFileStore {
  #directory; #key;
  constructor({ directory, encryptionKey }) {
    if (!directory || !(encryptionKey instanceof Uint8Array) || encryptionKey.length !== 32)
      throw new TypeError('directory and a 32-byte encryptionKey are required');
    this.#directory = resolve(directory); this.#key = Buffer.from(encryptionKey);
  }
  #path(id) { return join(this.#directory, createHash('sha256').update(id).digest('hex')); }
  async withLock(id, operation) {
    await mkdir(this.#directory, { recursive: true, mode: 0o700 });
    const lock = this.#path(id) + '.lock';
    try { await mkdir(lock, { mode: 0o700 }); }
    catch (cause) {
      if (cause.code !== 'EEXIST') throw cause;
      throw Object.assign(new Error('Another collector holds this result lock. Retry after it finishes; inspect stale locks after a process crash.'), { code: 'COLLECTION_BUSY' });
    }
    try { return await operation(); } finally { await rmdir(lock); }
  }
  async load(id) {
    let bytes;
    try { bytes = await readFile(this.#path(id) + '.enc'); }
    catch (error) { if (error.code === 'ENOENT') return undefined; throw error; }
    if (bytes.length < 29 || bytes[0] !== 1) throw new Error('Invalid encrypted result format');
    const decipher = createDecipheriv('aes-256-gcm', this.#key, bytes.subarray(1, 13));
    decipher.setAAD(Buffer.from(id)); decipher.setAuthTag(bytes.subarray(13, 29));
    return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(29)), decipher.final()]).toString('utf8'));
  }
  async save(id, response) {
    await mkdir(this.#directory, { recursive: true, mode: 0o700 });
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', this.#key, iv);
    cipher.setAAD(Buffer.from(id));
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(response), 'utf8'), cipher.final()]);
    const bytes = Buffer.concat([Buffer.from([1]), iv, cipher.getAuthTag(), encrypted]);
    const target = this.#path(id) + '.enc', temporary = target + '.' + randomBytes(12).toString('hex') + '.tmp';
    let file;
    try {
      file = await open(temporary, 'wx', 0o600);
      await file.writeFile(bytes); await file.sync(); await file.close(); file = undefined;
      await rename(temporary, target);
    } finally {
      await file?.close();
      await unlink(temporary).catch(e => { if (e.code !== 'ENOENT') throw e; });
    }
  }
}
