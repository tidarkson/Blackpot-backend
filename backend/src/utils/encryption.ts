import crypto from 'crypto';

import { config } from '../config/environment';

const ENCRYPTION_ALGO = 'aes-256-gcm';
const IV_BYTE_LENGTH = 12;

function getEncryptionKey(): Buffer {
  const source = process.env.SETTINGS_ENCRYPTION_KEY || config.SESSION_SECRET;
  return crypto.createHash('sha256').update(source).digest();
}

export function encryptSecret(plainText: string): string {
  const iv = crypto.randomBytes(IV_BYTE_LENGTH);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGO, getEncryptionKey(), iv);

  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decryptSecret(cipherText: string): string {
  const [ivPart, authTagPart, encryptedPart] = cipherText.split(':');

  if (!ivPart || !authTagPart || !encryptedPart) {
    return '';
  }

  const iv = Buffer.from(ivPart, 'base64');
  const authTag = Buffer.from(authTagPart, 'base64');
  const encrypted = Buffer.from(encryptedPart, 'base64');

  const decipher = crypto.createDecipheriv(ENCRYPTION_ALGO, getEncryptionKey(), iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

export function maskSecret(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  if (value.length <= 4) {
    return '****';
  }

  return `${value.slice(0, 4)}****${value.slice(-4)}`;
}
