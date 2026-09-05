import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * The sealed box the Discord authorization is kept in.
 *
 * Linking a Discord account is the one place where the web platform keeps a
 * secret on somebody's behalf: the refresh token Discord hands back when a
 * person accepts the linked roles step, which is what lets the facts behind
 * those roles be refreshed later without asking the person again. It is stored
 * sealed and opened only at the moment it is used, so a copy of the database
 * on its own is not a set of Discord authorizations.
 *
 * AES-256-GCM, with a fresh initialisation vector for every value and the
 * authentication tag stored beside it. The tag is what makes a changed byte a
 * refusal rather than a different plain text, which matters because what comes
 * out of here is presented to Discord as somebody's authorization.
 *
 * The key is DISCORD_LINK_KEY, thirty two bytes written as sixty four
 * hexadecimal characters, generated the same way as the other secrets:
 * openssl rand -hex 32.
 */

const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

/**
 * The key as bytes, from the sixty four hexadecimal characters it is written
 * as. Anything else throws, because a key that is quietly wrong seals values
 * nothing can open afterwards.
 *
 * @param {string} hex
 * @returns {Buffer}
 */
export function keyFromHex(hex) {
  if (typeof hex !== 'string' || !/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error('DISCORD_LINK_KEY has to be 64 hexadecimal characters, which is 32 bytes.');
  }
  return Buffer.from(hex, 'hex');
}

/**
 * The key the environment carries, or null when linking is running without
 * the linked roles step and no authorization is being kept.
 *
 * @param {Record<string, string|undefined>} [env]
 * @returns {Buffer|null}
 */
export function readKey(env = process.env) {
  const hex = env.DISCORD_LINK_KEY;
  if (!hex) return null;
  return keyFromHex(hex);
}

/**
 * Seal a string. The result is the initialisation vector, the authentication
 * tag and the ciphertext, in that order, which is what the varbinary column
 * holds.
 *
 * @param {string} plaintext
 * @param {Buffer} key
 * @returns {Buffer}
 */
export function seal(plaintext, key) {
  if (!Buffer.isBuffer(key) || key.length !== KEY_BYTES) {
    throw new Error('A sealed value needs a 32 byte key.');
  }
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]);
}

/**
 * Open a sealed value. A wrong key, a truncated value or a changed byte all
 * throw rather than returning anything.
 *
 * @param {Buffer|Uint8Array} sealed
 * @param {Buffer} key
 * @returns {string}
 */
export function open(sealed, key) {
  if (!Buffer.isBuffer(key) || key.length !== KEY_BYTES) {
    throw new Error('A sealed value needs a 32 byte key.');
  }
  const bytes = Buffer.isBuffer(sealed) ? sealed : Buffer.from(sealed ?? []);
  if (bytes.length <= IV_BYTES + TAG_BYTES) {
    throw new Error('That value is too short to be a sealed value.');
  }
  const iv = bytes.subarray(0, IV_BYTES);
  const tag = bytes.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const body = bytes.subarray(IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
}
