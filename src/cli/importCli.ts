import fs from 'fs';
import path from 'path';
import readline from 'readline/promises';
import { drive_v3 } from 'googleapis';
import { authenticate, getDriveService } from '../auth/googleAuth.js';
import {
    listGamesOnDrive,
    listGameSavesOnDrive,
    downloadFileFromDrive,
    DriveSaveFile,
} from '../services/driveService.js';
import { extractZipArchive, readManifestFromDir, importSourcesFromDir } from '../utils/zipUtils.js';

/**
 * Formate une taille en octets en chaîne lisible (Ko, Mo, Go).
 */
function formatBytes(bytes?: string | number): string {
    if (!bytes) return 'Taille inconnue';
    const numBytes = typeof bytes === 'string' ? parseInt(bytes, 10) : bytes;
    if (isNaN(numBytes) || numBytes === 0) return '0 Octets';
    const k = 1024;
    const sizes = ['Octets', 'Ko', 'Mo', 'Go'];
    const i = Math.floor(Math.log(numBytes) / Math.log(k));
    return parseFloat((numBytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Formate une date ISO en chaîne lisible.
 */
function formatDate(dateStr?: string): string {
    if (!dateStr) return 'Date inconnue';
    try {
        const d = new Date(dateStr);
        return d.toLocaleString('fr-FR');
    } catch {
        return dateStr;
    }
}

/**
 * Lance l'interface interactive en ligne de commande pour importer / restaurer une sauvegarde.
 */
export async function runImportCli(existingDrive?: drive_v3.Drive): Promise<void> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    console.log('\n======================================================');
    console.log('📥  cloud-my-save - Assistant d\'Importation de Sauvegarde');
    console.log('======================================================\n');

    const tempDir = path.resolve(process.cwd(), '.tmp', 'import_' + Date.now());

    try {
        // 1. Authentification & Connexion Google Drive
        let drive = existingDrive;
        if (!drive) {
            console.log('🔑 Connexion à Google Drive...');
            const authClient = await authenticate();
            drive = getDriveService(authClient);
        }

        // 2. Sélection du jeu
        console.log('🔍 Recherche des jeux enregistrés sur Google Drive...');
        const availableGames = await listGamesOnDrive(drive);

        let selectedGame = '';

        if (availableGames.length > 0) {
            console.log('\n🎮 Jeux disponibles sur Google Drive :');
            availableGames.forEach((g, idx) => {
                console.log(`   ${idx + 1}. ${g.name}`);
            });
            console.log('');

            while (!selectedGame.trim()) {
                const choice = await rl.question('👉 Choisissez le numéro du jeu ou entrez un nom : ');
                const trimmedChoice = choice.trim();

                const parsedIndex = parseInt(trimmedChoice, 10);
                if (!isNaN(parsedIndex) && parsedIndex >= 1 && parsedIndex <= availableGames.length) {
                    selectedGame = availableGames[parsedIndex - 1].name;
                } else if (trimmedChoice) {
                    selectedGame = trimmedChoice;
                } else {
                    console.log('⚠️ Veuillez sélectionner un jeu valide.\n');
                }
            }
        } else {
            console.log('ℹ️ Aucun jeu trouvé automatiquement dans "cloud-my-save".');
            while (!selectedGame.trim()) {
                selectedGame = await rl.question('🎮 Entrez le nom du jeu recherché : ');
                if (!selectedGame.trim()) {
                    console.log('⚠️ Le nom du jeu ne peut pas être vide.\n');
                }
            }
        }

        selectedGame = selectedGame.trim();
        console.log(`\n📂 Recherche des sauvegardes pour "${selectedGame}"...`);

        // 3. Récupération des sauvegardes disponibles
        const saves: DriveSaveFile[] = await listGameSavesOnDrive(drive, selectedGame);

        if (saves.length === 0) {
            console.log(`❌ Aucune sauvegarde (.zip) trouvée pour "${selectedGame}" sur Google Drive.`);
            return;
        }

        console.log(`\n💾 Sauvegardes trouvées pour "${selectedGame}" :`);
        saves.forEach((save, idx) => {
            const sizeStr = formatBytes(save.size);
            const dateStr = formatDate(save.createdTime || save.modifiedTime);
            console.log(`   ${idx + 1}. ${save.name} (${sizeStr} | Date : ${dateStr})`);
        });
        console.log('');

        // 4. Choix de la sauvegarde à importer
        let selectedSave: DriveSaveFile | null = null;
        while (!selectedSave) {
            const saveChoice = await rl.question(`👉 Numéro de la sauvegarde à importer (1-${saves.length}) : `);
            const saveIndex = parseInt(saveChoice.trim(), 10);

            if (!isNaN(saveIndex) && saveIndex >= 1 && saveIndex <= saves.length) {
                selectedSave = saves[saveIndex - 1];
            } else {
                console.log(`⚠️ Veuillez entrer un numéro valide entre 1 et ${saves.length}.\n`);
            }
        }

        console.log(`\n⬇️  Téléchargement de "${selectedSave.name}" depuis Google Drive...`);
        const downloadZipPath = path.join(tempDir, selectedSave.name);
        const extractPath = path.join(tempDir, 'extracted');

        await downloadFileFromDrive(drive, selectedSave.id, downloadZipPath);
        console.log('✅ Téléchargement terminé.');

        // 5. Décompression de l'archive
        console.log('🗜️  Décompression de l\'archive...');
        await extractZipArchive(downloadZipPath, extractPath);
        console.log('✅ Archive décompressée.');

        // 6. Lecture et analyse du manifest.json
        console.log('📄 Analyse du manifest.json...');
        const manifest = readManifestFromDir(extractPath);

        console.log('\n------------------------------------------------------');
        console.log('📋 Informations de la sauvegarde à importer :');
        console.log(`   - Jeu            : ${manifest.game}`);
        console.log(`   - Système source : ${manifest.os}`);
        console.log(`   - Date           : ${formatDate(manifest.date)} (Timestamp: ${manifest.timestamp})`);
        console.log(`   - Éléments       : ${manifest.sources.length}`);
        manifest.sources.forEach((src, idx) => {
            console.log(`     ${idx + 1}. [Archive: ${src.folder}] ➔ [Destination: ${src.path}]`);
        });
        console.log('------------------------------------------------------\n');

        // 7. Confirmation utilisateur
        const confirm = await rl.question('⚠️  Confirmer l\'importation vers ces emplacements ? (O/n) : ');
        const trimmedConfirm = confirm.trim().toLowerCase();

        if (trimmedConfirm === 'n' || trimmedConfirm === 'non') {
            console.log('\n🛑 Importation annulée par l\'utilisateur.');
            return;
        }

        // 8. Importation des dossiers / fichiers vers leurs emplacements cibles
        console.log('\n🚀 Importation des fichiers en cours...');
        const results = importSourcesFromDir(extractPath, manifest);

        let errorCount = 0;
        results.forEach((res) => {
            if (res.status === 'imported') {
                console.log(`   ✅ Importé avec succès : "${res.folder}" ➔ ${res.targetPath}`);
            } else {
                console.error(`   ❌ Erreur pour "${res.folder}" ➔ ${res.targetPath} : ${res.error}`);
                errorCount++;
            }
        });

        if (errorCount === 0) {
            console.log('\n======================================================');
            console.log('🎉 TOUTES LES SAUVEGARDES ONT ÉTÉ IMPORTÉES AVEC SUCCÈS !');
            console.log('======================================================\n');
        } else {
            console.log('\n⚠️  Importation terminée avec des erreurs. Veuillez vérifier les chemins ci-dessus.\n');
        }
    } catch (error) {
        console.error('\n❌ Erreur durant l\'importation de la sauvegarde :', error);
    } finally {
        // 9. Nettoyage des fichiers temporaires
        try {
            if (fs.existsSync(tempDir)) {
                fs.rmSync(tempDir, { recursive: true, force: true });
                console.log('🧹 Nettoyage des fichiers temporaires d\'importation effectué.');
            }
        } catch (cleanupErr) {
            console.warn('⚠️ Impossible de nettoyer le dossier temporaire :', cleanupErr);
        }
        rl.close();
    }
}
