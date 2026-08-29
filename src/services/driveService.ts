import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { drive_v3 } from 'googleapis';

/**
 * Recherche un dossier sur Google Drive sans le créer s'il n'existe pas.
 * @param drive Instance de l'API Google Drive v3
 * @param folderName Nom du dossier recherché
 * @param parentId ID du dossier parent (optionnel)
 * @returns ID du dossier ou null s'il n'existe pas
 */
export async function findFolder(
    drive: drive_v3.Drive,
    folderName: string,
    parentId?: string
): Promise<string | null> {
    let query = `mimeType = 'application/vnd.google-apps.folder' and name = '${folderName.replace(/'/g, "\\'")}' and trashed = false`;
    if (parentId) {
        query += ` and '${parentId}' in parents`;
    }

    const searchResponse = await drive.files.list({
        q: query,
        fields: 'files(id, name)',
        spaces: 'drive',
    });

    const folders = searchResponse.data.files;
    if (folders && folders.length > 0 && folders[0].id) {
        return folders[0].id;
    }

    return null;
}

/**
 * Recherche ou crée un dossier sur Google Drive.
 * @param drive Instance de l'API Google Drive v3
 * @param folderName Nom du dossier recherché ou à créer
 * @param parentId ID du dossier parent (optionnel)
 * @returns ID du dossier Google Drive
 */
export async function getOrCreateFolder(
    drive: drive_v3.Drive,
    folderName: string,
    parentId?: string
): Promise<string> {
    const existingId = await findFolder(drive, folderName, parentId);
    if (existingId) {
        return existingId;
    }

    // Création du dossier s'il n'existe pas
    const createResponse = await drive.files.create({
        requestBody: {
            name: folderName,
            mimeType: 'application/vnd.google-apps.folder',
            parents: parentId ? [parentId] : undefined,
        },
        fields: 'id, name',
    });

    if (!createResponse.data.id) {
        throw new Error(`Échec de la création du dossier "${folderName}" sur Google Drive.`);
    }

    return createResponse.data.id;
}

/**
 * Téléverse un fichier zip de sauvegarde dans un dossier spécifique sur Google Drive.
 * @param drive Instance de l'API Google Drive v3
 * @param localFilePath Chemin local du fichier zip à envoyer
 * @param fileName Nom du fichier sur Google Drive
 * @param parentFolderId ID du dossier de destination sur Google Drive
 */
export async function uploadZipSave(
    drive: drive_v3.Drive,
    localFilePath: string,
    fileName: string,
    parentFolderId: string
): Promise<{ id: string; name: string; size?: string }> {
    const fileMetadata = {
        name: fileName,
        parents: [parentFolderId],
    };

    const media = {
        mimeType: 'application/zip',
        body: fs.createReadStream(localFilePath),
    };

    const response = await drive.files.create({
        requestBody: fileMetadata,
        media: media,
        fields: 'id, name, size',
    });

    if (!response.data.id || !response.data.name) {
        throw new Error(`Échec du téléversement du fichier "${fileName}" sur Google Drive.`);
    }

    return {
        id: response.data.id,
        name: response.data.name,
        size: response.data.size ?? undefined,
    };
}

/**
 * Exporte une sauvegarde vers Google Drive dans l'arborescence :
 * cloud-my-save / <NomDuJeu> / <NomDuJeu>_<timestamp>.zip
 */
export async function exportSaveToDrive(
    drive: drive_v3.Drive,
    gameName: string,
    localZipPath: string,
    zipFileName: string
) {
    console.log(`\n☁️  Préparation du stockage Google Drive...`);

    // 1. Dossier racine 'cloud-my-save'
    console.log(`📁 Vérification du dossier principal "cloud-my-save"...`);
    const rootFolderId = await getOrCreateFolder(drive, 'cloud-my-save');

    // 2. Sous-dossier du jeu
    console.log(`📁 Vérification du dossier du jeu "${gameName}"...`);
    const gameFolderId = await getOrCreateFolder(drive, gameName, rootFolderId);

    // 3. Téléversement du fichier .zip
    console.log(`⬆️  Téléversement de l'archive "${zipFileName}" sur Google Drive...`);
    const uploadedFile = await uploadZipSave(drive, localZipPath, zipFileName, gameFolderId);

    return {
        file: uploadedFile,
        rootFolderId,
        gameFolderId,
    };
}

/**
 * Récupère la liste de tous les jeux enregistrés dans "cloud-my-save" sur Google Drive.
 * @param drive Instance de l'API Google Drive v3
 */
export async function listGamesOnDrive(drive: drive_v3.Drive): Promise<Array<{ id: string; name: string }>> {
    const rootFolderId = await findFolder(drive, 'cloud-my-save');
    if (!rootFolderId) {
        return [];
    }

    const response = await drive.files.list({
        q: `'${rootFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: 'files(id, name)',
        orderBy: 'name',
    });

    const files = response.data.files || [];
    return files
        .filter((f) => f.id && f.name)
        .map((f) => ({ id: f.id as string, name: f.name as string }));
}

export interface DriveSaveFile {
    id: string;
    name: string;
    size?: string;
    createdTime?: string;
    modifiedTime?: string;
}

/**
 * Récupère la liste des fichiers de sauvegarde (.zip) pour un jeu donné sur Google Drive.
 * @param drive Instance de l'API Google Drive v3
 * @param gameName Nom du jeu recherché
 */
export async function listGameSavesOnDrive(
    drive: drive_v3.Drive,
    gameName: string
): Promise<DriveSaveFile[]> {
    const rootFolderId = await findFolder(drive, 'cloud-my-save');
    if (!rootFolderId) {
        return [];
    }

    const gameFolderId = await findFolder(drive, gameName, rootFolderId);
    if (!gameFolderId) {
        return [];
    }

    const response = await drive.files.list({
        q: `'${gameFolderId}' in parents and mimeType = 'application/zip' and trashed = false`,
        fields: 'files(id, name, size, createdTime, modifiedTime)',
        orderBy: 'createdTime desc',
    });

    const files = response.data.files || [];
    return files
        .filter((f) => f.id && f.name)
        .map((f) => ({
            id: f.id as string,
            name: f.name as string,
            size: f.size ?? undefined,
            createdTime: f.createdTime ?? undefined,
            modifiedTime: f.modifiedTime ?? undefined,
        }));
}

/**
 * Télécharge un fichier depuis Google Drive vers un chemin local.
 * @param drive Instance de l'API Google Drive v3
 * @param fileId ID du fichier Google Drive
 * @param destinationLocalPath Chemin local où écrire le fichier téléchargé
 */
export async function downloadFileFromDrive(
    drive: drive_v3.Drive,
    fileId: string,
    destinationLocalPath: string
): Promise<void> {
    const destDir = path.dirname(destinationLocalPath);
    if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
    }

    const response = await drive.files.get(
        { fileId, alt: 'media' },
        { responseType: 'stream' }
    );

    const stream = response.data as unknown as Readable;

    return new Promise((resolve, reject) => {
        const destStream = fs.createWriteStream(destinationLocalPath);

        stream
            .pipe(destStream)
            .on('finish', () => resolve())
            .on('error', (err) => reject(err));
    });
}
