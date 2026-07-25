import assert from 'node:assert/strict';
import test from 'node:test';
import { MemoryEventStore, verifyEventChain } from '../src/infrastructure/event-store.mjs';

test('event store emits a verifiable append-only hash chain', async () => {
  const store = new MemoryEventStore({ clock: () => new Date('2026-07-25T12:00:00Z') });
  await store.appendBatch([
    { aggregate_type: 'test', aggregate_id: 'a', aggregate_version: 1, event_type: 'test.one', actor_type: 'test', actor_id: 'tester', payload: { value: 1 } },
    { aggregate_type: 'test', aggregate_id: 'a', aggregate_version: 2, event_type: 'test.two', actor_type: 'test', actor_id: 'tester', payload: { value: 2 } }
  ]);
  const events = await store.readAll();
  assert.doesNotThrow(() => verifyEventChain(events));
  events[1].payload.value = 3;
  assert.throws(() => verifyEventChain(events), (error) => error.code === 'EVENT_HASH_INVALID');
});
