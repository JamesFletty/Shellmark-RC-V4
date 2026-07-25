import { createHash } from 'node:crypto';
import { invariant } from '../domain/errors.mjs';
import { canonicalJson } from '../domain/canonical-json.mjs';

function readPointer(document, pointer) {
  if (pointer === '' || pointer === '/') return document;
  invariant(pointer.startsWith('/'), 'INVALID_VALIDATOR_CONFIG', `JSON pointer must start with /: ${pointer}`);
  return pointer
    .slice(1)
    .split('/')
    .map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'))
    .reduce((value, part) => value?.[part], document);
}

function evaluate(actual, assertion) {
  switch (assertion.operator) {
    case 'exists':
      return actual !== undefined;
    case 'equals':
      return canonicalJson(actual) === canonicalJson(assertion.expected);
    case 'type':
      if (assertion.expected === 'array') return Array.isArray(actual);
      if (assertion.expected === 'null') return actual === null;
      return typeof actual === assertion.expected;
    case 'minimum':
      return typeof actual === 'number' && actual >= assertion.expected;
    case 'maximum':
      return typeof actual === 'number' && actual <= assertion.expected;
    case 'matches':
      return typeof actual === 'string' && new RegExp(assertion.expected).test(actual);
    default:
      throw new Error(`Unsupported assertion operator: ${assertion.operator}`);
  }
}

export class JsonArtifactValidator {
  id = 'json-artifact-v1';
  verificationType = 'deterministic';

  constructor({ artifactStore }) {
    this.artifactStore = artifactStore;
  }

  async run({ artifact, config }) {
    const bytes = await this.artifactStore.read(artifact.sha256);
    let document;
    try {
      document = JSON.parse(bytes.toString('utf8'));
    } catch (error) {
      return this.#report(false, [{ criterion_id: 'valid-json', status: 'failed', message: error.message }], { artifact_sha256: artifact.sha256 });
    }
    const assertions = config?.assertions ?? [];
    invariant(Array.isArray(assertions) && assertions.length > 0, 'INVALID_VALIDATOR_CONFIG', 'JSON validator requires at least one assertion.');
    const results = assertions.map((assertion, index) => {
      const actual = readPointer(document, assertion.pointer);
      const passed = evaluate(actual, assertion);
      return {
        criterion_id: assertion.criterion_id ?? `assertion-${index + 1}`,
        status: passed ? 'passed' : 'failed',
        pointer: assertion.pointer,
        operator: assertion.operator,
        expected: assertion.expected,
        actual
      };
    });
    return this.#report(results.every((result) => result.status === 'passed'), results, {
      artifact_sha256: artifact.sha256,
      assertion_count: assertions.length
    });
  }

  #report(accepted, results, evidence) {
    const evidenceHash = createHash('sha256').update(canonicalJson({ results, evidence })).digest('hex');
    return {
      verification_type: this.verificationType,
      validator_ref: this.id,
      aggregate_result: accepted ? 'accepted' : 'rejected',
      confidence: 1,
      results,
      evidence_hash: evidenceHash,
      evidence
    };
  }
}
