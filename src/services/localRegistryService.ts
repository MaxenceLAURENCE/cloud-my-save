import fs from 'fs';
import path from 'path';
import { SaveManifest } from '../utils/zipUtils.js';

export interface LocalRegistry {
    games: Record<string, SaveManifest>;
}

const REGISTRY_FILE_PATH = path.resolve(process.cwd(), 'games_registry.json');

/**
 * Charge le registre local des manifestes.
 */
export function loadLocalRegistry(): LocalRegistry {
    if (!fs.existsSync(REGISTRY_FILE_PATH)) {
        return { games: {} };
    }

    try {
        const rawContent = fs.readFileSync(REGISTRY_FILE_PATH, 'utf8');
        const data = JSON.parse(rawContent);

        // Supporte { games: { ... } } ou directement { "gameName": { ... } }
        if (data && typeof data === 'object') {
            if (data.games && typeof data.games === 'object') {
                return { games: data.games };
            }
            return { games: data };
        }
        return { games: {} };
    } catch (err) {
        console.warn('⚠️ Erreur lors de la lecture de games_registry.json, création d\'un nouveau registre.');
        return { games: {} };
    }
}

/**
 * Enregistre le registre local sur le disque.
 */
export function saveLocalRegistry(registry: LocalRegistry): void {
    try {
        const jsonContent = JSON.stringify(registry, null, 4);
        fs.writeFileSync(REGISTRY_FILE_PATH, jsonContent, 'utf8');
    } catch (err) {
        console.error('❌ Impossible d\'écrire dans games_registry.json :', err);
    }
}

/**
 * Enregistre ou met à jour le manifest d'un jeu dans le registre local.
 */
export function saveLocalManifest(manifest: SaveManifest): void {
    const registry = loadLocalRegistry();
    registry.games[manifest.game] = {
        ...manifest,
        sources: manifest.sources.map((s) => ({
            folder: s.folder,
            path: path.resolve(s.path),
        })),
    };
    saveLocalRegistry(registry);
}

/**
 * Récupère le manifest local d'un jeu donné.
 */
export function getRegisteredLocalManifest(gameName: string): SaveManifest | null {
    const registry = loadLocalRegistry();
    return registry.games[gameName] || null;
}

/**
 * Retourne la liste de tous les manifests enregistrés localement.
 */
export function listRegisteredLocalManifests(): SaveManifest[] {
    const registry = loadLocalRegistry();
    return Object.values(registry.games);
}

/**
 * Supprime un jeu du registre local.
 */
export function unregisterLocalManifest(gameName: string): boolean {
    const registry = loadLocalRegistry();
    if (registry.games[gameName]) {
        delete registry.games[gameName];
        saveLocalRegistry(registry);
        return true;
    }
    return false;
}
