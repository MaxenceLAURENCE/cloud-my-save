import fs from 'fs';
import path from 'path';
import readline from 'readline/promises';
import { getRegisteredLocalManifest, saveLocalManifest } from '../services/localRegistryService.js';
import { getLatestLocalMtime } from '../services/versionService.js';
import { SaveManifest, ZipSource } from '../utils/zipUtils.js';

/**
 * Lance l'assistant interactif pour localiser et enregistrer un jeu dans le registre local.
 */
export async function runInitGameCli(): Promise<void> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    console.log('\n======================================================');
    console.log('➕  cloud-my-save - Initialisation d\'un Jeu Localement');
    console.log('======================================================\n');

    try {
        // 1. Saisie du nom du jeu
        let gameName = '';
        while (!gameName.trim()) {
            gameName = await rl.question('🎮 Entrez le nom du jeu à configurer : ');
            if (!gameName.trim()) {
                console.log('⚠️ Le nom du jeu ne peut pas être vide.\n');
            }
        }
        gameName = gameName.trim();

        // 2. Vérification si le jeu est déjà enregistré
        const existingManifest = getRegisteredLocalManifest(gameName);
        if (existingManifest) {
            console.log(`\nℹ️ Le jeu "${gameName}" est déjà configuré sur cette machine avec ${existingManifest.sources.length} emplacement(s) :`);
            existingManifest.sources.forEach((s, idx) => {
                console.log(`   ${idx + 1}. [${s.folder}] ➔ ${s.path}`);
            });
            console.log('');

            const overwriteChoice = await rl.question('👉 Souhaitez-vous reconfigurer ses emplacements ? (O/n) : ');
            if (overwriteChoice.trim().toLowerCase() === 'n' || overwriteChoice.trim().toLowerCase() === 'non') {
                console.log('\n🛑 Configuration annulée. Les paramètres existants sont conservés.');
                return;
            }
            console.log('');
        }

        // 3. Saisie des chemins de sauvegarde / mods
        console.log(`📁 Localisation des fichiers/dossiers de sauvegarde pour "${gameName}" :`);
        console.log('(Entrez les chemins un par un. Tapez "fin" ou appuyez sur Entrée à vide pour terminer)\n');

        const sources: ZipSource[] = [];
        let index = 1;

        while (true) {
            const rawPath = await rl.question(`👉 Chemin local n°${index} (ou 'fin' pour terminer) : `);
            const trimmed = rawPath.trim();

            if (!trimmed || trimmed.toLowerCase() === 'fin' || trimmed.toLowerCase() === 'done') {
                if (sources.length === 0) {
                    console.log('⚠️ Vous devez renseigner au moins un chemin de sauvegarde pour configurer le jeu.\n');
                    continue;
                }
                break;
            }

            const cleanPath = trimmed.replace(/^['"]|['"]$/g, '');
            const absolutePath = path.resolve(cleanPath);

            // Vérification de l'existence
            if (!fs.existsSync(absolutePath)) {
                console.log(`❌ Erreur : Le chemin "${absolutePath}" n'existe pas. Veuillez vérifier.\n`);
                continue;
            }

            // Vérification des droits en lecture
            try {
                fs.accessSync(absolutePath, fs.constants.R_OK);
            } catch {
                console.log(`❌ Erreur : Impossible de lire "${absolutePath}" (droits d'accès insuffisants).\n`);
                continue;
            }

            // Vérification des doublons
            const alreadyAdded = sources.some((s) => path.resolve(s.path) === absolutePath);
            if (alreadyAdded) {
                console.log(`⚠️ Ce chemin a déjà été ajouté à la configuration.\n`);
                continue;
            }

            const folderName = path.basename(absolutePath);
            sources.push({
                path: absolutePath,
                name: folderName,
            });

            console.log(`✅ Emplacement validé : "${folderName}" (${absolutePath})\n`);
            index++;
        }

        // 4. Calcul de l'horodatage initial basé sur les fichiers réels sur le disque
        const diskMtime = getLatestLocalMtime(sources.map((s) => s.path));
        const effectiveTimestamp = diskMtime > 0 ? diskMtime : Date.now();
        const effectiveDate = new Date(effectiveTimestamp).toISOString();
        const osType = process.platform === 'win32' ? 'windows' : (process.platform === 'linux' ? 'linux' : process.platform);

        // 5. Construction du manifest d'initialisation
        const initialManifest: SaveManifest = {
            game: gameName,
            os: osType,
            date: effectiveDate,
            timestamp: effectiveTimestamp,
            sources: sources.map((s) => ({
                folder: s.name || path.basename(s.path),
                path: path.resolve(s.path),
            })),
        };

        // 6. Enregistrement dans le registre local
        saveLocalManifest(initialManifest);

        console.log('\n======================================================');
        console.log(`🎉 JEU "${gameName.toUpperCase()}" CONFIGURÉ ET INITIALISÉ AVEC SUCCÈS !`);
        console.log('======================================================');
        console.log(`🎮 Jeu                : ${initialManifest.game}`);
        console.log(`💻 Système            : ${initialManifest.os}`);
        console.log(`📅 Date de référence  : ${new Date(initialManifest.timestamp).toLocaleString('fr-FR')}`);
        console.log(`📂 Emplacements (${initialManifest.sources.length})  :`);
        initialManifest.sources.forEach((s, idx) => {
            console.log(`   ${idx + 1}. [${s.folder}] ➔ ${s.path}`);
        });
        console.log('======================================================');
        console.log('💡 Le manifest d\'initialisation a été enregistré dans "games_registry.json".\n');
    } catch (error) {
        console.error('\n❌ Erreur durant l\'initialisation du jeu :', error);
    } finally {
        rl.close();
    }
}
