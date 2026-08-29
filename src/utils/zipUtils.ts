import fs from 'fs';
import path from 'path';
import { ZipArchive } from 'archiver';
import AdmZip from 'adm-zip';

export interface ZipSource {
    path: string;
    name?: string;
}

export interface SaveManifestSource {
    folder: string;
    path: string;
}

export interface SaveManifest {
    game: string;
    os: string;
    date: string;
    timestamp: number;
    sources: SaveManifestSource[];
}

export interface ImportResult {
    folder: string;
    targetPath: string;
    status: 'imported' | 'error';
    error?: string;
}

/**
 * Génère l'objet manifest.json pour une sauvegarde.
 */
export function createManifest(gameName: string, sources: ZipSource[]): SaveManifest {
    const now = new Date();
    const osType = process.platform === 'win32' ? 'windows' : (process.platform === 'linux' ? 'linux' : process.platform);

    return {
        game: gameName,
        os: osType,
        date: now.toISOString(),
        timestamp: now.getTime(),
        sources: sources.map((s) => ({
            folder: s.name || path.basename(path.resolve(s.path)),
            path: path.resolve(s.path),
        })),
    };
}

/**
 * Génère un nom de fichier zip formaté et horodaté pour la sauvegarde d'un jeu.
 */
export function generateZipFilename(gameName: string): string {
    const cleanGameName = gameName
        .trim()
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .replace(/_+/g, '_');

    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');

    const jjJ = `${pad(now.getDate())}J`;
    const mmM_month = `${pad(now.getMonth() + 1)}M`;
    const aaaaA = `${now.getFullYear()}A`;
    const hhH = `${pad(now.getHours())}H`;
    const mmM_min = `${pad(now.getMinutes())}M`;
    const ssS = `${pad(now.getSeconds())}S`;

    const timestamp = `${jjJ}_${mmM_month}_${aaaaA}_${hhH}_${mmM_min}_${ssS}`;

    return `${cleanGameName}_${timestamp}.zip`;
}

/**
 * Compresse un ou plusieurs dossiers/fichiers dans une archive .zip et y insère le manifest.json.
 * @param sources Liste des chemins sources à compresser.
 * @param outputZipPath Chemin complet du fichier .zip de destination.
 * @param manifest Fiche manifest.json facultative à injecter à la racine de l'archive.
 * @returns Taille totale du fichier zip en octets.
 */
export function createZipArchive(
    sources: ZipSource[],
    outputZipPath: string,
    manifest?: SaveManifest
): Promise<number> {
    return new Promise((resolve, reject) => {
        // Assure que le dossier parent existe
        const outputDir = path.dirname(outputZipPath);
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        const output = fs.createWriteStream(outputZipPath);
        const archive = new ZipArchive({
            zlib: { level: 9 }, // Compression maximale
        });

        output.on('close', () => {
            resolve(archive.pointer());
        });

        archive.on('warning', (err: any) => {
            if (err.code === 'ENOENT') {
                console.warn('⚠️ Avertissement archiver :', err.message);
            } else {
                reject(err);
            }
        });

        archive.on('error', (err: Error) => {
            reject(err);
        });

        archive.pipe(output);

        // 1. Injection du manifest.json à la racine du zip
        if (manifest) {
            const manifestJson = JSON.stringify(manifest, null, 4);
            archive.append(manifestJson, { name: 'manifest.json' });
        }

        // 2. Ajout des fichiers et dossiers sources
        for (const source of sources) {
            const absolutePath = path.resolve(source.path);
            const stats = fs.statSync(absolutePath);
            const entryName = source.name || path.basename(absolutePath);

            if (stats.isDirectory()) {
                archive.directory(absolutePath, entryName);
            } else if (stats.isFile()) {
                archive.file(absolutePath, { name: entryName });
            }
        }

        archive.finalize();
    });
}

/**
 * Décompresse une archive .zip vers un dossier de destination.
 * @param zipFilePath Chemin du fichier .zip
 * @param targetExtractDir Dossier où extraire les fichiers
 */
export async function extractZipArchive(zipFilePath: string, targetExtractDir: string): Promise<void> {
    if (!fs.existsSync(targetExtractDir)) {
        fs.mkdirSync(targetExtractDir, { recursive: true });
    }

    const zip = new AdmZip(zipFilePath);
    zip.extractAllTo(targetExtractDir, true);
}

/**
 * Lit et analyse le fichier manifest.json depuis un dossier extrait.
 * @param extractedDir Dossier contenant les fichiers extraits
 * @returns L'objet SaveManifest
 */
export function readManifestFromDir(extractedDir: string): SaveManifest {
    const manifestPath = path.join(extractedDir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
        throw new Error('Le fichier "manifest.json" est introuvable à la racine de l\'archive de sauvegarde.');
    }

    const rawContent = fs.readFileSync(manifestPath, 'utf8');
    const manifest: SaveManifest = JSON.parse(rawContent);

    if (!manifest.game || !manifest.sources || !Array.isArray(manifest.sources)) {
        throw new Error('Le fichier "manifest.json" est invalide ou corrompu (champs "game" ou "sources" manquants).');
    }

    return manifest;
}

/**
 * Importe les dossiers et fichiers extraits vers leurs emplacements cibles décrits dans le manifest.
 * @param extractedDir Dossier source contenant les éléments extraits
 * @param manifest Fiche manifest décrivant les correspondances { folder, path }
 * @returns Résumé de chaque importation
 */
export function importSourcesFromDir(extractedDir: string, manifest: SaveManifest): ImportResult[] {
    const results: ImportResult[] = [];

    for (const source of manifest.sources) {
        const sourceFolderInZip = path.join(extractedDir, source.folder);
        const targetPath = path.resolve(source.path);

        try {
            if (!fs.existsSync(sourceFolderInZip)) {
                throw new Error(`Le dossier/fichier "${source.folder}" n'a pas été trouvé dans l'archive décompressée.`);
            }

            const stats = fs.statSync(sourceFolderInZip);

            // S'assurer que le dossier parent cible existe
            const targetParentDir = path.dirname(targetPath);
            if (!fs.existsSync(targetParentDir)) {
                fs.mkdirSync(targetParentDir, { recursive: true });
            }

            if (stats.isDirectory()) {
                if (!fs.existsSync(targetPath)) {
                    fs.mkdirSync(targetPath, { recursive: true });
                }
                // Copie récursive de tout le contenu du dossier
                fs.cpSync(sourceFolderInZip, targetPath, {
                    recursive: true,
                    force: true,
                    preserveTimestamps: true,
                });
            } else {
                fs.copyFileSync(sourceFolderInZip, targetPath);
            }

            results.push({
                folder: source.folder,
                targetPath,
                status: 'imported',
            });
        } catch (err: any) {
            results.push({
                folder: source.folder,
                targetPath,
                status: 'error',
                error: err.message,
            });
        }
    }

    return results;
}
