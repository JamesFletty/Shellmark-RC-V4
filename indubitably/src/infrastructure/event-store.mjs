import { createHash } from 'node:crypto';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { canonicalJson } from '../domain/canonical-json.mjs';
import { DomainError } from '../domain/errors.mjs';
import { newId } from '../domain/ids.mjs';

const GENESIS_HASH = '0'.repeat(64);

function hashEvent(unsignedEvent) {
  return createHash('sha256').update(canonicalJson(unsignedEvent)).digest('hex');
}

function finalizeEvent(input, previousHash, clock) {
  const unsigned = {
    event_id: input.event_id ?? newId('evt'),
    aggregate_type: input.aggregate_type,
    aggregate_id: input.aggregate_id,
    aggregate_version: input.aggregate_version,
    event_type: input.event_type,
    actor_type: input.actor_type,
    actor_id: input.actor_id,
    payload: input.payload ?? {},
    occurred_at: input.occurred_at ?? clock().toISOString(),
    previous_event_hash: previousHash
  };
  return { ...unsigned, event_hash: hashEvent(unsigned) };
}

export function verifyEventChain(events) {
  let previousHash = GENESIS_HASH;
  for (const event of events) {
    if (event.previous_event_hash !== previousHash) {
      throw new DomainError('EVENT_CHAIN_BROKEN', `Event ${event.event_id} has an invalid previous hash.`, 500);
    }
    const { event_hash: suppliedHash, ...unsigned } = event;
    const expectedHash = hashEvent(unsigned);
    if (suppliedHash !== expectedHash) {
      throw new DomainError('EVENT_HASH_INVALID', `Event ${event.event_id} failed integrity verification.`, 500);
    }
    previousHash = event.event_hash;
  }
  return previousHash;
}

export class MemoryEventStore {
  #events = [];
  #clock;

  constructor({ clock = () => new Date() } = {}) {
    this.#clock = clock;
  }

  async readAll() {
    return structuredClone(this.#events);
  }

  async appendBatch(inputs) {
    const events = [];
    let previousHash = this.#events.at(-1)?.event_hash ?? GENESIS_HASH;
    for (const input of inputs) {
      const event = finalizeEvent(input, previousHash, this.#clock);
      events.push(event);
      previousHash = event.event_hash;
    }
    this.#events.push(...events);
    return structuredClone(events);
  }
}

export class FileEventStore {
  #path;
  #clock;
  #queue = Promise.resolve();
  #events = [];
  #ready;

  constructor(path, { clock = () => new Date() } = {}) {
    this.#path = path;
    this.#clock = clock;
    this.#ready = this.#initialize();
  }

  async #initialize() {
    await mkdir(dirname(this.#path), { recursive: true });
    try {
      const raw = await readFile(this.#path, 'utf8');
      this.#events = raw
        .split('\n')
        .filter(Boolean)
        .map((line, index) => {
          try {
            return JSON.parse(line);
          } catch (error) {
            throw new DomainError('EVENT_LOG_INVALID', `Invalid JSON on event-log line ${index + 1}: ${error.message}`, 500);
          }
        });
      verifyEventChain(this.#events);
    } catch (error) {
      if (error.code === 'ENOENT') {
        await appendFile(this.#path, '', 'utf8');
        this.#events = [];
        return;
      }
      throw error;
    }
  }

  async readAll() {
    await this.#ready;
    return structuredClone(this.#events);
  }

  async appendBatch(inputs) {
    await this.#ready;
    const operation = this.#queue.then(async () => {
      const events = [];
      let previousHash = this.#events.at(-1)?.event_hash ?? GENESIS_HASH;
      for (const input of inputs) {
        const event = finalizeEvent(input, previousHash, this.#clock);
        events.push(event);
        previousHash = event.event_hash;
      }
      const serialized = `${events.map((event) => JSON.stringify(event)).join('\n')}\n`;
      await appendFile(this.#path, serialized, 'utf8');
      this.#events.push(...events);
      return structuredClone(events);
    });
    this.#queue = operation.catch(() => undefined);
    return operation;
  }
}
