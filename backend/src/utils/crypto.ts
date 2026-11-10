// ============================================================
// CampusSarthi — Cryptographic Utilities
// ============================================================

import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { getConfig } from '../config';

const BCRYPT_COST = 12;
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // GCM standard: 96-bit IV
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const hex = getConfig().encryption.key;
  if (!hex || hex.length < 64) {
    throw new Error('ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
  }
  return Buffer.from(hex, 'hex');
}

/**
 * Encrypt plaintext using AES-256-GCM.
 * Returns a base64 string: iv (12 bytes) + authTag (16 bytes) + ciphertext
 */
export function encrypt(text: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Pack: [iv (12)] [authTag (16)] [ciphertext (variable)]
  const packed = Buffer.concat([iv, authTag, encrypted]);
  return packed.toString('base64');
}

/**
 * Decrypt a base64 string produced by encrypt().
 */
export function decrypt(encryptedBase64: string): string {
  const key = getEncryptionKey();
  const packed = Buffer.from(encryptedBase64, 'base64');

  const iv = packed.subarray(0, IV_LENGTH);
  const authTag = packed.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = packed.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}

/**
 * Hash a plaintext password with bcrypt (cost factor 12).
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

/**
 * Verify a plaintext password against a bcrypt hash.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Generate a cryptographically random hex token.
 * Default length: 32 bytes → 64 hex chars.
 */
export function generateToken(length = 32): string {
  return crypto.randomBytes(length).toString('hex');
}
