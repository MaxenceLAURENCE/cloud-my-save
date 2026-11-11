import fs from 'fs';
import path from 'path';
import { drive_v3 } from 'googleapis';
import {
    listGameSavesOnDrive,
    DriveSaveFile,
} from './driveService.js';
import {
    getRegisteredLocalManifest,
} from './localRegistryService.js';

export type VersionStatus =
    | 'ONLINE_NEWER' // La sauvegarde Cloud est plus récente ➔ Import recommandé
    | 'LOCAL_NEWER'  // La sauvegarde Locale est plus récente ➔ Conflit / Alerte écrasement
    | 'IN_SYNC'      // Sauvegardes synchronisées
    | 'NO_ONLINE_SAVE' // Aucune sauvegarde Cloud trouvée
    | 'NO_LOCAL_SAVE'; // Aucun fichier local trouvé

export interface VersionComparisonResult {
    status: VersionStatus;
    gameName: string;
    onlineSave?: DriveSaveFile;
    onlineTimestamp?: number;
    onlineDateFormatted?: string;
    localTimestamp?: number;
    localDateFormatted?: string;
    localSources?: string[];
    timeDifferenceFormatted?: string;
    message: string;
}

/**
 * Extrait le timestamp en millisecondes depuis un nom de fichier zip formaté
 * ex: "Sims4_29J_08M_2026A_01H_36M_57S.zip"
 */
export function parseTimestampFromSaveFilename(filename: string): number | null {
    const match = filename.match(/_(\d{1,2})J_(\d{1,2})M_(\d{4})A_(\d{1,2})H_(\d{1,2})M_(\d{1,2})S/i);
    if (!match) {
        return null;
    }

    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1; // Mois 0-indexé
    const year = parseInt(match[3], 10);
    const hours = parseInt(match[4], 10);
    const minutes = parseInt(match[5], 10);
    const seconds = parseInt(match[6], 10);

    const date = new Date(year, month, day, hours, minutes, seconds);
    return isNaN(date.getTime()) ? null : date.getTime();
}

/**
 * Scanne récursivement un ou plusieurs dossiers/fichiers et retourne le mtime le plus récent en ms.
 */
export function getLatestLocalMtime(targetPaths: string[]): number {
    let latestMtime = 0;

    function scan(currentPath: string) {
        if (!fs.existsSync(currentPath)) return;

        try {
            const stats = fs.statSync(currentPath);
            if (stats.mtimeMs > latestMtime) {
                latestMtime = stats.mtimeMs;
            }

            if (stats.isDirectory()) {
                const entries = fs.readdirSync(currentPath);
                for (const entry of entries) {
                    scan(path.join(currentPath, entry));
                }
            }
        } catch (err) {
            // Ignorer d'éventuels fichiers non accessibles
        }
    }

    for (const targetPath of targetPaths) {
        scan(path.resolve(targetPath));
    }

    return latestMtime;
}

/**
 * Formate une différence de temps en chaîne lisible (ex: "il y a 2 heures", "3 jours plus récent").
 */
function formatTimeDifference(diffMs: number): string {
    const absDiff = Math.abs(diffMs);
    const seconds = Math.floor(absDiff / 1000);
    if (seconds < 60) return `${seconds} seconde(s)`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} minute(s)`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} heure(s) et ${minutes % 60} min`;
    const days = Math.floor(hours / 24);
    return `${days} jour(s) et ${hours % 24} h`;
}

/**
 * Compare l'état local d'un jeu avec la sauvegarde sur Google Drive pour détecter les conflits.
 * 
 * @param drive Instance de l'API Google Drive v3
 * @param gameName Nom du jeu
 * @param specificOnlineSave Optionnel : sauvegarde spécifique à comparer (sinon prend la plus récente)
 * @param toleranceMs Marge de tolérance (par défaut 3000 ms pour compenser l'écriture fichier)
 */
export async function compareGameVersions(
    drive: drive_v3.Drive,
    gameName: string,
    specificOnlineSave?: DriveSaveFile,
    toleranceMs = 3000
): Promise<VersionComparisonResult> {
    // 1. Récupération de la sauvegarde en ligne
    let onlineSave = specificOnlineSave;
    if (!onlineSave) {
        const saves = await listGameSavesOnDrive(drive, gameName);
        if (saves.length > 0) {
            onlineSave = saves[0]; // La plus récente
        }
    }

    // 2. Détermination du timestamp en ligne
    let onlineTimestamp: number | null = null;
    if (onlineSave) {
        onlineTimestamp = parseTimestampFromSaveFilename(onlineSave.name);
        if (!onlineTimestamp && onlineSave.createdTime) {
            onlineTimestamp = new Date(onlineSave.createdTime).getTime();
        }
    }

    // 3. Récupération des informations locales (Registre + fichiers sur disque)
    const localManifest = getRegisteredLocalManifest(gameName);
    const localSources: string[] = [];

    if (localManifest && localManifest.sources) {
        localManifest.sources.forEach((s) => localSources.push(s.path));
    }

    let localTimestamp = 0;
    if (localManifest && localManifest.timestamp) {
        localTimestamp = localManifest.timestamp;
    }

    // Contrôle sur disque si des fichiers existent localement (pour détecter les parties jouées hors-ligne)
    if (localSources.length > 0) {
        const diskMtime = getLatestLocalMtime(localSources);
        if (diskMtime > localTimestamp) {
            localTimestamp = diskMtime;
        }
    }

    const onlineDateStr = onlineTimestamp ? new Date(onlineTimestamp).toLocaleString('fr-FR') : undefined;
    const localDateStr = localTimestamp > 0 ? new Date(localTimestamp).toLocaleString('fr-FR') : undefined;

    // 4. Évaluation des statuts
    if (!onlineSave || !onlineTimestamp) {
        return {
            status: 'NO_ONLINE_SAVE',
            gameName,
            localTimestamp: localTimestamp > 0 ? localTimestamp : undefined,
            localDateFormatted: localDateStr,
            localSources,
            message: `Aucune sauvegarde trouvée sur Google Drive pour "${gameName}".`,
        };
    }

    if (localTimestamp === 0 && localSources.length === 0) {
        return {
            status: 'NO_LOCAL_SAVE',
            gameName,
            onlineSave,
            onlineTimestamp,
            onlineDateFormatted: onlineDateStr,
            message: `Aucune sauvegarde locale configurée. La sauvegarde Cloud est prête à être importée.`,
        };
    }

    const diff = onlineTimestamp - localTimestamp;
    const diffFormatted = formatTimeDifference(diff);

    // Online plus récent
    if (diff > toleranceMs) {
        return {
            status: 'ONLINE_NEWER',
            gameName,
            onlineSave,
            onlineTimestamp,
            onlineDateFormatted: onlineDateStr,
            localTimestamp,
            localDateFormatted: localDateStr,
            localSources,
            timeDifferenceFormatted: diffFormatted,
            message: `☁️ La sauvegarde Cloud est PLUS RÉCENTE que la version locale (+ ${diffFormatted}).`,
        };
    }

    // Local plus récent (CONFLIT)
    if (diff < -toleranceMs) {
        return {
            status: 'LOCAL_NEWER',
            gameName,
            onlineSave,
            onlineTimestamp,
            onlineDateFormatted: onlineDateStr,
            localTimestamp,
            localDateFormatted: localDateStr,
            localSources,
            timeDifferenceFormatted: diffFormatted,
            message: `💻 Votre sauvegarde locale est PLUS RÉCENTE que la version Cloud (+ ${diffFormatted}).`,
        };
    }

    // Synchronisé
    return {
        status: 'IN_SYNC',
        gameName,
        onlineSave,
        onlineTimestamp,
        onlineDateFormatted: onlineDateStr,
        localTimestamp,
        localDateFormatted: localDateStr,
        localSources,
        message: `✅ Les sauvegardes Locale et Cloud sont synchronisées au même niveau.`,
    };
}
