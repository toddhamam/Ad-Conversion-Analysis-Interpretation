import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // GCM standard
const AUTH_TAG_LENGTH = 16;

/**
 * Get encryption key from environment, validating its format
 */
function getEncryptionKey(): Buffer {
  const keyHex = process.env.CREDENTIAL_ENCRYPTION_KEY;

  if (!keyHex) {
    throw new Error('CREDENTIAL_ENCRYPTION_KEY environment variable is not set');
  }

  // Key must be 32 bytes (64 hex characters) for AES-256
  if (keyHex.length !== 64) {
    throw new Error('CREDENTIAL_ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
  }

  return Buffer.from(keyHex, 'hex');
}

/**
 * Encrypt a plaintext string using AES-256-GCM
 * Returns base64-encoded string: iv + authTag + ciphertext
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  // Combine: iv (12 bytes) + authTag (16 bytes) + ciphertext
  const combined = Buffer.concat([iv, authTag, encrypted]);

  return combined.toString('base64');
}

/**
 * Decrypt a base64-encoded ciphertext string
 */
export function decrypt(ciphertext: string): string {
  const key = getEncryptionKey();
  const combined = Buffer.from(ciphertext, 'base64');

  // Extract components
  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

/**
 * Check if encryption is properly configured
 */
export function isEncryptionConfigured(): boolean {
  try {
    getEncryptionKey();
    return true;
  } catch {
    return false;
  }
}

/**
 * Generate a new random encryption key (for setup)
 * Run: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */
export function generateKey(): string {
  return crypto.randomBytes(32).toString('hex');
}
