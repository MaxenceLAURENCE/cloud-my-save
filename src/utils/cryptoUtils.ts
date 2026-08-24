import crypto from 'crypto';
import { GOOGLE_CONFIG } from '../config/googleConfig.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 12 octets recommandé pour AES-GCM

export interface EncryptedPayload {
    iv: string;
    authTag: string;
    encryptedData: string;
}

/**
 * Dérive une clé binaire de 32 octets (256 bits) à partir de la clé secrète.
 */
function getEncryptionKey(): Buffer {
    const secret = GOOGLE_CONFIG.encryptionSecret || 'cloud-my-save-default-secret-key-2026';
    return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Chiffre du texte en clair en AES-256-GCM.
 */
export function encryptText(plaintext: string): EncryptedPayload {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag().toString('hex');

    return {
        iv: iv.toString('hex'),
        authTag,
        encryptedData: encrypted,
    };
}

/**
 * Déchiffre du texte chiffré en AES-256-GCM.
 */
export function decryptText(payload: EncryptedPayload): string {
    const key = getEncryptionKey();
    const iv = Buffer.from(payload.iv, 'hex');
    const authTag = Buffer.from(payload.authTag, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);

    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(payload.encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
}
