import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { invariant } from '../domain/errors.mjs';

function decodeBase64Strict(value) {
  invariant(typeof value === 'string' && value.length > 0, 'ARTIFACT_CONTENT_REQUIRED', 'Artifact content is required.');
  invariant(value.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(value), 'ARTIFACT_BASE64_INVALID', 'Artifact content is not canonical base64.');
  const bytes = Buffer.from(value, 'base64');
  invariant(bytes.toString('base64') === value, 'ARTIFACT_BASE64_INVALID', 'Artifact content is not canonical base64.');
  return bytes;
}

function validateExpectedHash(expectedSha256) {
  if (expectedSha256 === undefined) return;
  invariant(/^[a-f0-9]{64}$/.test(expectedSha256), 'ARTIFACT_HASH_INVALID', 'Expected artifact hash must be lowercase SHA-256 hex.');
}

export class FileArtifactStore {
  #root;
  #maximumBytes;

  constructor(root, { maximumBytes = 10 * 1024 * 1024 } = {}) {
    this.#root = root;
    this.#maximumBytes = maximumBytes;
  }

  async putBase64({ contentBase64, expectedSha256, mediaType }) {
    validateExpectedHash(expectedSha256);
    const bytes = decodeBase64Strict(contentBase64);
    invariant(bytes.length > 0, 'ARTIFACT_EMPTY', 'Artifact content decoded to zero bytes.');
    invariant(bytes.length <= this.#maximumBytes, 'ARTIFACT_TOO_LARGE', `Artifact exceeds ${this.#maximumBytes} bytes.`, 413);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    if (expectedSha256 !== undefined) {
      invariant(expectedSha256 === sha256, 'ARTIFACT_HASH_MISMATCH', 'Artifact hash does not match the supplied digest.', 422, {
        expected: expectedSha256,
        actual: sha256
      });
    }
    const directory = join(this.#root, sha256.slice(0, 2));
    const path = join(directory, sha256);
    await mkdir(directory, { recursive: true });
    await writeFile(path, bytes, { flag: 'wx' }).catch((error) => {
      if (error.code !== 'EEXIST') throw error;
    });
    return {
      sha256,
      size_bytes: bytes.length,
      media_type: mediaType ?? 'application/octet-stream',
      storage_path: path
    };
  }

  async read(sha256) {
    return readFile(join(this.#root, sha256.slice(0, 2), sha256));
  }
}

export class MemoryArtifactStore {
  #objects = new Map();
  #maximumBytes;

  constructor({ maximumBytes = 10 * 1024 * 1024 } = {}) {
    this.#maximumBytes = maximumBytes;
  }

  async putBase64({ contentBase64, expectedSha256, mediaType }) {
    validateExpectedHash(expectedSha256);
    const bytes = decodeBase64Strict(contentBase64);
    invariant(bytes.length > 0, 'ARTIFACT_EMPTY', 'Artifact content decoded to zero bytes.');
    invariant(bytes.length <= this.#maximumBytes, 'ARTIFACT_TOO_LARGE', `Artifact exceeds ${this.#maximumBytes} bytes.`, 413);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    if (expectedSha256 !== undefined) {
      invariant(expectedSha256 === sha256, 'ARTIFACT_HASH_MISMATCH', 'Artifact hash does not match the supplied digest.', 422);
    }
    this.#objects.set(sha256, bytes);
    return { sha256, size_bytes: bytes.length, media_type: mediaType ?? 'application/octet-stream', storage_path: `memory://${sha256}` };
  }

  async read(sha256) {
    const bytes = this.#objects.get(sha256);
    invariant(bytes, 'ARTIFACT_NOT_FOUND', 'Artifact was not found.', 404);
    return Buffer.from(bytes);
  }
}
