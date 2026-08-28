import fs from 'fs';
import { drive_v3 } from 'googleapis';

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
    // Construction de la requête de recherche
    let query = `mimeType = 'application/vnd.google-apps.folder' and name = '${folderName.replace(/'/g, "\\'")}' and trashed = false`;
    if (parentId) {
        query += ` and '${parentId}' in parents`;
    }

    const searchResponse = await drive.files.list({
        q: query,
        fields: 'files(id, name)',
        spaces: 'drive',
    });

    const existingFolders = searchResponse.data.files;
    if (existingFolders && existingFolders.length > 0 && existingFolders[0].id) {
        return existingFolders[0].id;
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
