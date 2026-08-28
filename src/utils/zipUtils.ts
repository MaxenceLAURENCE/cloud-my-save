import fs from 'fs';
import path from 'path';
import { ZipArchive } from 'archiver';

export interface ZipSource {
    path: string;
    name?: string;
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
 * Compresse un ou plusieurs dossiers/fichiers dans une archive .zip.
 * @param sources Liste des chemins sources à compresser.
 * @param outputZipPath Chemin complet du fichier .zip de destination.
 * @returns Taille totale du fichier zip en octets.
 */
export function createZipArchive(sources: ZipSource[], outputZipPath: string): Promise<number> {
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
