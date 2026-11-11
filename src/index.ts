import readline from 'readline/promises';
import { authenticate, getDriveService } from './auth/googleAuth.js';
import { runExportCli } from './cli/exportCli.js';
import { runImportCli } from './cli/importCli.js';

async function main() {
    console.log('🚀 Démarrage de cloud-my-save\n');

    try {
        // 1. Authentification de l'utilisateur (charge token.enc ou ouvre le navigateur)
        const authClient = await authenticate();
        const drive = getDriveService(authClient);

        // 2. Menu principal interactif
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });

        console.log('\n======================================================');
        console.log('🎮  MENU PRINCIPAL - cloud-my-save');
        console.log('======================================================');
        console.log('  1. 📦 Exporter une sauvegarde (Local ➔ Google Drive)');
        console.log('  2. 📥 Importer une sauvegarde (Google Drive ➔ Local)');
        console.log('  3. 🚪 Quitter');
        console.log('======================================================\n');

        const actionChoice = await rl.question('👉 Votre choix (1/2/3) : ');
        rl.close();

        const trimmed = actionChoice.trim();
        if (trimmed === '1' || trimmed.toLowerCase() === 'export' || trimmed.toLowerCase() === 'exporter') {
            await runExportCli(drive);
        } else if (trimmed === '2' || trimmed.toLowerCase() === 'import' || trimmed.toLowerCase() === 'importer') {
            await runImportCli(drive);
        } else if (trimmed === '3' || trimmed.toLowerCase() === 'quitter') {
            console.log('👋 Au revoir !');
        } else {
            console.log('ℹ️ Choix non reconnu. Lancement de l\'exportation par défaut...');
            await runExportCli(drive);
        }
    } catch (error) {
        console.error('❌ Erreur lors de l\'exécution de cloud-my-save :', error);
    }
}

main();
