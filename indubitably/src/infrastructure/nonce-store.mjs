import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { invariant } from '../domain/errors.mjs';

export class MemoryNonceStore {
  #nonces = new Map();
  #clock;

  constructor({ clock = () => new Date() } = {}) {
    this.#clock = clock;
  }

  async consume(agentId, nonce, expiresAtMs) {
    this.#prune(this.#clock().getTime());
    const key = `${agentId}:${nonce}`;
    invariant(!this.#nonces.has(key), 'NONCE_REUSED', 'Request nonce has already been used.', 401);
    this.#nonces.set(key, expiresAtMs);
  }

  #prune(nowMs) {
    for (const [key, expiry] of this.#nonces) {
      if (expiry <= nowMs) this.#nonces.delete(key);
    }
  }
}

export class FileNonceStore {
  #path;
  #queue = Promise.resolve();
  #nonces = new Map();
  #ready;
  #clock;

  constructor(path, { clock = () => new Date() } = {}) {
    this.#path = path;
    this.#clock = clock;
    this.#ready = this.#load();
  }

  async #load() {
    await mkdir(dirname(this.#path), { recursive: true });
    try {
      const object = JSON.parse(await readFile(this.#path, 'utf8'));
      this.#nonces = new Map(Object.entries(object));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await this.#persist();
    }
  }

  async consume(agentId, nonce, expiresAtMs) {
    await this.#ready;
    const operation = this.#queue.then(async () => {
      this.#prune(this.#clock().getTime());
      const key = `${agentId}:${nonce}`;
      invariant(!this.#nonces.has(key), 'NONCE_REUSED', 'Request nonce has already been used.', 401);
      this.#nonces.set(key, expiresAtMs);
      await this.#persist();
    });
    this.#queue = operation.catch(() => undefined);
    return operation;
  }

  #prune(nowMs) {
    for (const [key, expiry] of this.#nonces) {
      if (Number(expiry) <= nowMs) this.#nonces.delete(key);
    }
  }

  async #persist() {
    const temporaryPath = `${this.#path}.tmp`;
    await writeFile(temporaryPath, JSON.stringify(Object.fromEntries(this.#nonces), null, 2), 'utf8');
    await rename(temporaryPath, this.#path);
  }
}
