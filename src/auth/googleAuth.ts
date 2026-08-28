import fs from 'fs';
import http from 'http';
import { URL } from 'url';
import { google } from 'googleapis';
import { OAuth2Client, Credentials } from 'google-auth-library';
import open from 'open';
import { GOOGLE_CONFIG } from '../config/googleConfig.js';
import { encryptText, decryptText, EncryptedPayload } from '../utils/cryptoUtils.js';

/**
 * Crée une instance client OAuth2 avec la configuration pourvue.
 */
export function createOAuth2Client(): OAuth2Client {
    if (!GOOGLE_CONFIG.clientId || !GOOGLE_CONFIG.clientSecret) {
        throw new Error(
            '❌ Identifiants Google manquants ! Veuillez configurer GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET dans votre fichier .env'
        );
    }

    return new google.auth.OAuth2(
        GOOGLE_CONFIG.clientId,
        GOOGLE_CONFIG.clientSecret,
        GOOGLE_CONFIG.redirectUri
    );
}

/**
 * Charge et déchiffre les jetons d'accès enregistrés depuis le fichier local chiffré.
 */
export function loadSavedTokens(client: OAuth2Client): boolean {
    if (fs.existsSync(GOOGLE_CONFIG.tokenPath)) {
        try {
            const rawData = fs.readFileSync(GOOGLE_CONFIG.tokenPath, 'utf8');
            const payload: EncryptedPayload = JSON.parse(rawData);
            const decryptedJson = decryptText(payload);
            const tokens: Credentials = JSON.parse(decryptedJson);

            if (!tokens || typeof tokens !== 'object' || (!tokens.access_token && !tokens.refresh_token)) {
                console.warn('⚠️ Le fichier de jetons est vide ou malformé. Réauthentification requise.');
                return false;
            }

            client.setCredentials(tokens);
            console.log('🔒 Jetons Google OAuth2 chargés et déchiffrés avec succès depuis token.enc.');
            return true;
        } catch (error) {
            console.warn('⚠️ Impossible de déchiffrer le fichier de jetons (clé secrète modifiée ou fichier altéré). Réauthentification requise.');
        }
    }

    return false;
}

/**
 * Chiffre en AES-256-GCM et enregistre les jetons d'accès dans le fichier local token.enc.
 */
export function saveTokens(tokens: Credentials): void {
    const jsonString = JSON.stringify(tokens, null, 4);
    const encryptedPayload = encryptText(jsonString);

    fs.writeFileSync(GOOGLE_CONFIG.tokenPath, JSON.stringify(encryptedPayload, null, 4), 'utf8');
    console.log(`🔒 Jetons chiffrés et enregistrés avec succès dans : ${GOOGLE_CONFIG.tokenPath}`);
}

/**
 * Demande une autorisation utilisateur via le navigateur et écoute la redirection OAuth.
 */
export async function requestUserAuthorization(client: OAuth2Client): Promise<OAuth2Client> {
    return new Promise((resolve, reject) => {
        const redirectUrlObj = new URL(GOOGLE_CONFIG.redirectUri);
        const port = parseInt(redirectUrlObj.port || '3000', 10);
        const callbackPath = redirectUrlObj.pathname || '/oauth2callback';

        // Création d'un serveur HTTP temporaire pour intercepter le code d'autorisation
        const server = http.createServer(async (req, res) => {
            try {
                if (!req.url) return;

                const reqUrl = new URL(req.url, `http://localhost:${port}`);

                if (reqUrl.pathname === callbackPath) {
                    const authCode = reqUrl.searchParams.get('code');
                    const authError = reqUrl.searchParams.get('error');

                    if (authError) {
                        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
                        res.end(`<h1>Erreur d'authentification</h1><p>${authError}</p>`);
                        server.close();
                        return reject(new Error(`Authentification annulée : ${authError}`));
                    }

                    if (authCode) {
                        // Échange du code contre des jetons d'accès
                        const { tokens } = await client.getToken(authCode);
                        client.setCredentials(tokens);
                        saveTokens(tokens);

                        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                        res.end(`
                            <div style="font-family: sans-serif; text-align: center; margin-top: 50px;">
                                <h1 style="color: #4CAF50;">Authentification réussie ! 🎉</h1>
                                <p>Connexion à Google Drive établie pour <strong>cloud-my-save</strong>.</p>
                                <p>Les jetons ont été chiffrés et sauvegardés localement.</p>
                                <p>Vous pouvez fermer cette fenêtre et retourner à l'application.</p>
                            </div>
                        `);

                        // Fermeture du serveur HTTP local une fois l'authentification terminée
                        server.close(() => {
                            console.log('✅ Connexion OAuth2 réussie et serveur temporaire fermé.');
                            resolve(client);
                        });
                    }
                }
            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end('<h1>Erreur serveur lors de l\'échange de jetons.</h1>');
                server.close();
                reject(err);
            }
        });

        server.listen(port, async () => {
            // Génération de l'URL d'autorisation Google
            const authUrl = client.generateAuthUrl({
                access_type: 'offline', // Permet d'obtenir un refresh_token
                prompt: 'consent',     // Force l'affichage pour garantir la réception du refresh_token
                scope: GOOGLE_CONFIG.scopes,
            });

            console.log(`\n🔑 Ouverture du navigateur pour l'authentification Google Drive...`);
            console.log(`Lien d'autorisation : ${authUrl}\n`);

            // Ouverture automatique du navigateur par défaut
            await open(authUrl);
        });
    });
}

/**
 * Authentifie le client OAuth2 : charge les jetons existants, vérifie/rafraîchit le token ou lance l'authentification navigateur.
 */
export async function authenticate(): Promise<OAuth2Client> {
    const client = createOAuth2Client();

    // Écouter les renouvellements automatiques de jetons par le client OAuth2 pour les persister
    client.on('tokens', (tokens: Credentials) => {
        const mergedTokens: Credentials = {
            ...client.credentials,
            ...tokens,
        };
        saveTokens(mergedTokens);
    });

    // Si des jetons chiffrés sont déjà enregistrés localement
    if (loadSavedTokens(client)) {
        try {
            // getAccessToken() vérifie la validité du token d'accès actuel et utilise le refresh_token pour en obtenir un nouveau si expiré
            const tokenResponse = await client.getAccessToken();
            if (tokenResponse.token) {
                console.log('✅ Jeton Google OAuth2 valide et prêt à l\'emploi.');
                return client;
            }
        } catch (error) {
            console.warn('⚠️ Le jeton d\'accès a expiré et le renouvellement a échoué (jeton révoqué ou expiré).');
            console.warn('🔄 Lancement d\'une nouvelle authentification via le navigateur...');
        }
    }

    return requestUserAuthorization(client);
}

/**
 * Retourne une instance configurée du SDK Google Drive v3.
 */
export function getDriveService(authClient: OAuth2Client) {
    return google.drive({ version: 'v3', auth: authClient });
}

/**
 * Vérifie si un fichier de jetons local existe.
 */
export function hasSavedTokens(): boolean {
    return fs.existsSync(GOOGLE_CONFIG.tokenPath);
}

/**
 * Déconnecte l'utilisateur : révoque les jetons d'accès auprès des serveurs Google et supprime le fichier token.enc local.
 * 
 * @param authClient Optionnel : instance OAuth2Client connectée. Si non fournie, charge les jetons locaux existants pour les révoquer.
 */
export async function logout(authClient?: OAuth2Client): Promise<void> {
    try {
        const client = authClient || createOAuth2Client();

        // Si le client n'a pas de credentials en mémoire, on tente de les charger depuis token.enc
        if (!client.credentials?.access_token && !client.credentials?.refresh_token) {
            loadSavedTokens(client);
        }

        // 1. Révocation des jetons auprès de Google
        if (client.credentials?.access_token || client.credentials?.refresh_token) {
            try {
                await client.revokeCredentials();
                console.log('🔓 Jetons Google révoqués avec succès côté serveur.');
            } catch (revokeError) {
                console.warn('⚠️ La révocation en ligne a échoué (jeton déjà révoqué, expiré ou absence de connexion).');
            }
            // Réinitialisation des credentials en mémoire
            client.setCredentials({});
        }

        // 2. Suppression du fichier local chiffré
        if (fs.existsSync(GOOGLE_CONFIG.tokenPath)) {
            fs.unlinkSync(GOOGLE_CONFIG.tokenPath);
            console.log(`🗑️ Fichier de jetons local supprimé : ${GOOGLE_CONFIG.tokenPath}`);
        }

        console.log('✅ Déconnexion terminée avec succès.');
    } catch (error) {
        console.error('❌ Erreur lors de la déconnexion :', error);
        throw error;
    }
}

