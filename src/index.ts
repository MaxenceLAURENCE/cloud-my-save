import { authenticate, getDriveService } from './auth/googleAuth.js';

async function main() {
    console.log('🚀 Démarrage du module Backend Google Drive - cloud-my-save');

    try {
        // 1. Authentification de l'utilisateur (charge token.enc ou ouvre le navigateur)
        const authClient = await authenticate();

        // 2. Initialisation du service Google Drive
        const drive = getDriveService(authClient);

        // 3. Test simple : Récupération des fichiers sur Google Drive
        console.log('📂 Interrogation de Google Drive...');
        const response = await drive.files.list({
            pageSize: 5,
            fields: 'files(id, name, mimeType)',
        });

        const files = response.data.files;
        if (files && files.length > 0) {
            console.log('\n📄 Fichiers récents trouvés sur Google Drive :');
            files.forEach((file) => {
                console.log(`- ${file.name} (ID: ${file.id})`);
            });
        } else {
            console.log('📄 Aucun fichier trouvé dans le périmètre d\'accès.');
        }

        console.log('\n✅ Authentification Google Drive opérationnelle !');
    } catch (error) {
        console.error('❌ Erreur lors de l\'initialisation Google Drive :', error);
    }
}

main();
