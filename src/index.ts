import readline from 'readline/promises';
import { authenticate, getDriveService } from './auth/googleAuth.js';
import { runInitGameCli } from './cli/initGameCli.js';
import { runExportCli } from './cli/exportCli.js';
import { runImportCli } from './cli/importCli.js';
import { runCompareCli } from './cli/compareCli.js';

async function main() {
    console.log('🚀 Démarrage de cloud-my-save\n');

    try {
        // 1. Authentification de l'utilisateur (charge token.enc ou ouvre le navigateur)
        const authClient = await authenticate();
        const drive = getDriveService(authClient);

        let keepRunning = true;

        // 2. Boucle du menu principal interactif
        while (keepRunning) {
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout,
            });

            console.log('\n======================================================');
            console.log('🎮  MENU PRINCIPAL - cloud-my-save');
            console.log('======================================================');
            console.log('  1. ➕ Initialiser / Configurer un jeu localement');
            console.log('  2. 📦 Exporter une sauvegarde (Local ➔ Google Drive)');
            console.log('  3. 📥 Importer une sauvegarde (Google Drive ➔ Local)');
            console.log('  4. ⚖️  Comparer les versions & Conflits (Local vs Cloud)');
            console.log('  5. 🚪 Quitter');
            console.log('======================================================\n');

            const actionChoice = await rl.question('👉 Votre choix (1/2/3/4/5) : ');
            rl.close();

            const trimmed = actionChoice.trim();
            if (trimmed === '1' || trimmed.toLowerCase() === 'init' || trimmed.toLowerCase() === 'configurer') {
                await runInitGameCli();
            } else if (trimmed === '2' || trimmed.toLowerCase() === 'export' || trimmed.toLowerCase() === 'exporter') {
                await runExportCli(drive);
            } else if (trimmed === '3' || trimmed.toLowerCase() === 'import' || trimmed.toLowerCase() === 'importer') {
                await runImportCli(drive);
            } else if (trimmed === '4' || trimmed.toLowerCase() === 'compare' || trimmed.toLowerCase() === 'comparer') {
                await runCompareCli(drive);
            } else if (trimmed === '5' || trimmed.toLowerCase() === 'quitter' || trimmed.toLowerCase() === 'exit' || trimmed.toLowerCase() === 'q') {
                console.log('\n👋 Au revoir !');
                keepRunning = false;
            } else {
                console.log('⚠️ Choix non reconnu. Veuillez saisir un chiffre entre 1 et 5.\n');
            }
        }
    } catch (error) {
        console.error('❌ Erreur lors de l\'exécution de cloud-my-save :', error);
    }
}

main();
