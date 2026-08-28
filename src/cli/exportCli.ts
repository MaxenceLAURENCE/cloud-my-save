import fs from 'fs';
import path from 'path';
import readline from 'readline/promises';
import { drive_v3 } from 'googleapis';
import { authenticate, getDriveService } from '../auth/googleAuth.js';
import { exportSaveToDrive } from '../services/driveService.js';
import { createZipArchive, generateZipFilename, createManifest, ZipSource } from '../utils/zipUtils.js';

/**
 * Formate une taille en octets en chaîne lisible (Ko, Mo, Go).
 */
function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Octets';
    const k = 1024;
    const sizes = ['Octets', 'Ko', 'Mo', 'Go'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Lance l'interface interactive en ligne de commande pour exporter une sauvegarde.
 */
export async function runExportCli(existingDrive?: drive_v3.Drive): Promise<void> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    console.log('\n======================================================');
    console.log('📦  cloud-my-save - Assistant d\'Exportation de Sauvegarde');
    console.log('======================================================\n');

    try {
        // 1. Demande du nom du jeu
        let gameName = '';
        while (!gameName.trim()) {
            gameName = await rl.question('🎮 Entrez le nom du jeu (ex: Sims 4, Minecraft) : ');
            if (!gameName.trim()) {
                console.log('⚠️ Le nom du jeu ne peut pas être vide.\n');
            }
        }
        gameName = gameName.trim();

        // 2. Collecte des chemins locaux
        const validSources: ZipSource[] = [];
        let pathIndex = 1;

        console.log(`\n📂 Configuration des dossiers / fichiers de sauvegarde pour "${gameName}" :`);

        while (true) {
            const promptText = pathIndex === 1
                ? `👉 Chemin de la sauvegarde n°${pathIndex} : `
                : `👉 Chemin n°${pathIndex} (laisser vide ou taper 'fin' pour terminer) : `;

            const rawPath = await rl.question(promptText);
            const trimmedPath = rawPath.trim().replace(/^['"]|['"]$/g, ''); // Nettoyage guillemets éventuels

            // Condition d'arrêt pour les chemins supplémentaires
            if (pathIndex > 1 && (!trimmedPath || trimmedPath.toLowerCase() === 'fin' || trimmedPath.toLowerCase() === 'n')) {
                break;
            }

            if (!trimmedPath) {
                console.log('⚠️ Vous devez renseigner au moins un premier chemin valide.\n');
                continue;
            }

            const resolvedPath = path.resolve(trimmedPath);

            if (!fs.existsSync(resolvedPath)) {
                console.log(`❌ Le chemin "${resolvedPath}" n'existe pas. Veuillez réessayer.\n`);
                continue;
            }

            try {
                fs.accessSync(resolvedPath, fs.constants.R_OK);
            } catch {
                console.log(`❌ Droits insuffisants : impossible d'accéder en lecture à "${resolvedPath}" (Permission denied).\n`);
                continue;
            }

            const stats = fs.statSync(resolvedPath);
            const typeStr = stats.isDirectory() ? 'Dossier' : 'Fichier';
            console.log(`   ✅ ${typeStr} valide : ${resolvedPath}`);

            validSources.push({
                path: resolvedPath,
                name: path.basename(resolvedPath),
            });

            pathIndex++;
        }

        console.log('\n------------------------------------------------------');
        console.log(`📋 Récapitulatif pour "${gameName}" :`);
        console.log(`   - Nombre d'éléments à sauvegarder : ${validSources.length}`);
        validSources.forEach((src, idx) => {
            console.log(`     ${idx + 1}. ${src.path}`);
        });
        console.log('------------------------------------------------------\n');

        // 3. Compression en archive .zip avec manifest.json
        const zipFilename = generateZipFilename(gameName);
        const tempZipDir = path.resolve(process.cwd(), '.tmp');
        const tempZipPath = path.resolve(tempZipDir, zipFilename);

        const manifest = createManifest(gameName, validSources);
        console.log(`📄 Génération du manifest.json pour "${gameName}" (${manifest.os})...`);

        console.log(`🗜️  Compression des fichiers et intégration du manifest dans "${zipFilename}"...`);
        const archiveSize = await createZipArchive(validSources, tempZipPath, manifest);
        console.log(`✅ Archive créée avec succès ! Taille : ${formatBytes(archiveSize)}`);

        // 4. Authentification & Connexion Google Drive
        let drive = existingDrive;
        if (!drive) {
            console.log('\n🔑 Connexion à Google Drive...');
            const authClient = await authenticate();
            drive = getDriveService(authClient);
        }

        // 5. Téléversement sur Google Drive (cloud-my-save / <gameName> / <zip>)
        const result = await exportSaveToDrive(drive, gameName, tempZipPath, zipFilename);

        // 6. Nettoyage du fichier zip temporaire local
        try {
            if (fs.existsSync(tempZipPath)) {
                fs.unlinkSync(tempZipPath);
                console.log('🧹 Nettoyage local du fichier zip temporaire effectué.');
            }
        } catch (cleanupErr) {
            console.warn('⚠️ Impossible de supprimer le fichier temporaire local :', cleanupErr);
        }

        // 7. Message de succès final
        console.log('\n======================================================');
        console.log('🎉 SAUVEGARDE EXPORTÉE SUR GOOGLE DRIVE AVEC SUCCÈS !');
        console.log('======================================================');
        console.log(`📁 Dossier racine Drive : cloud-my-save (ID: ${result.rootFolderId})`);
        console.log(`📂 Dossier jeu Drive   : ${gameName} (ID: ${result.gameFolderId})`);
        console.log(`📄 Fichier sauvegardé  : ${result.file.name}`);
        console.log(`🆔 ID du fichier Drive : ${result.file.id}`);
        console.log('======================================================\n');
    } catch (error) {
        console.error('\n❌ Erreur durant l\'exportation de la sauvegarde :', error);
    } finally {
        rl.close();
    }
}
