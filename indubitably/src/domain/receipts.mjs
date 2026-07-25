import { generateKeyPairSync, sign, verify, createPublicKey } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { canonicalJson } from './canonical-json.mjs';

export class PlatformSigner {
  #privateKey;
  #publicKey;
  #keyId;

  constructor({ privateKey, publicKey, keyId = 'platform-phase0' }) {
    this.#privateKey = privateKey;
    this.#publicKey = publicKey ?? createPublicKey(privateKey);
    this.#keyId = keyId;
  }

  static ephemeral(keyId = 'platform-test') {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    return new PlatformSigner({ privateKey, publicKey, keyId });
  }

  static async fromPemFile(path, keyId = 'platform-phase0') {
    await mkdir(dirname(path), { recursive: true });
    let privatePem;
    try {
      privatePem = await readFile(path, 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const { privateKey } = generateKeyPairSync('ed25519');
      privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' });
      await writeFile(path, privatePem, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    }
    return new PlatformSigner({ privateKey: privatePem, keyId });
  }

  signReceipt(receipt) {
    const message = Buffer.from(canonicalJson(receipt));
    return {
      ...receipt,
      platform_signature: {
        algorithm: 'Ed25519',
        key_id: this.#keyId,
        signature_base64: sign(null, message, this.#privateKey).toString('base64')
      }
    };
  }

  verifyReceipt(signedReceipt) {
    const { platform_signature: signature, ...receipt } = signedReceipt;
    return verify(null, Buffer.from(canonicalJson(receipt)), this.#publicKey, Buffer.from(signature.signature_base64, 'base64'));
  }

  exportPublicKeyPem() {
    return this.#publicKey.export({ type: 'spki', format: 'pem' });
  }
}
