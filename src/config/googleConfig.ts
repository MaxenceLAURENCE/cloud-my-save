import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const GOOGLE_CONFIG = {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/oauth2callback',
    // Fichier chiffré conservé à la racine des fichiers du projet
    tokenPath: path.resolve(process.cwd(), 'token.enc'),
    // Clé secrète utilisée pour dériver la clé AES-256 de chiffrement local
    encryptionSecret: process.env.ENCRYPTION_SECRET || 'cloud-my-save-default-secret-key-2026',
    // Scope d'accès Google Drive
    scopes: [
        'https://www.googleapis.com/auth/drive.file',
    ],
};
