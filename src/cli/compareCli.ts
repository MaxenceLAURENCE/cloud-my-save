import { drive_v3 } from 'googleapis';
import { listGamesOnDrive } from '../services/driveService.js';
import { listRegisteredLocalManifests } from '../services/localRegistryService.js';
import { compareGameVersions, VersionComparisonResult } from '../services/versionService.js';

/**
 * Affiche le tableau comparatif des versions pour l'ensemble des jeux (Local vs Google Drive).
 */
export async function runCompareCli(drive: drive_v3.Drive): Promise<void> {
    console.log('\n======================================================');
    console.log('⚖️   cloud-my-save - Comparateur de Versions & Conflits');
    console.log('======================================================\n');

    console.log('🔍 Analyse des sauvegardes sur Google Drive et sur votre machine locale...\n');

    // 1. Récupération des jeux en ligne et des jeux enregistrés localement
    const onlineGames = await listGamesOnDrive(drive);
    const localManifests = listRegisteredLocalManifests();

    // Fusion de la liste unique des noms de jeux
    const allGameNames = Array.from(
        new Set([
            ...onlineGames.map((g) => g.name),
            ...localManifests.map((m) => m.game),
        ])
    );

    if (allGameNames.length === 0) {
        console.log('ℹ️ Aucun jeu trouvé ni sur Google Drive ni dans le registre local.');
        console.log('💡 Utilisez l\'option 1 (Exporter) pour sauvegarder un premier jeu.\n');
        return;
    }

    const results: VersionComparisonResult[] = [];

    for (const gameName of allGameNames) {
        const comparison = await compareGameVersions(drive, gameName);
        results.push(comparison);
    }

    console.log('---------------------------------------------------------------------------------------------------------');
    console.log(
        ` ${'JEU'.padEnd(20)} | ${'STATUT'.padEnd(25)} | ${'VERSION LOCALE'.padEnd(20)} | ${'VERSION CLOUD'.padEnd(20)}`
    );
    console.log('---------------------------------------------------------------------------------------------------------');

    results.forEach((res) => {
        let statusBadge = '';
        switch (res.status) {
            case 'ONLINE_NEWER':
                statusBadge = '☁️  Cloud + récent (Import)';
                break;
            case 'LOCAL_NEWER':
                statusBadge = '⚠️  Local + récent (Export)';
                break;
            case 'IN_SYNC':
                statusBadge = '✅  Synchronisé';
                break;
            case 'NO_LOCAL_SAVE':
                statusBadge = '☁️  Cloud uniquement';
                break;
            case 'NO_ONLINE_SAVE':
                statusBadge = '💻  Local uniquement';
                break;
        }

        const localStr = (res.localDateFormatted || 'Non configuré').padEnd(20);
        const onlineStr = (res.onlineDateFormatted || 'Aucune').padEnd(20);
        const nameStr = res.gameName.substring(0, 18).padEnd(20);
        const statusStr = statusBadge.padEnd(25);

        console.log(` ${nameStr} | ${statusStr} | ${localStr} | ${onlineStr}`);
    });

    console.log('---------------------------------------------------------------------------------------------------------\n');
}
