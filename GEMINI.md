# GEMINI.md - Directives & Contexte Projet pour l'IA

Ce fichier définit les règles de conduite, les directives d'assistance, les standards d'ingénierie et l'architecture du projet **cloud-my-save**. Ces instructions ont **priorité absolue** sur tout comportement par défaut.

---

> [!CAUTION]
> ## 🚨 1. RÈGLE CRITIQUE SUR LES COMMANDES GIT
> 
> - **COMMANDES GIT STRICTEMENT INTERDITES D'EXÉCUTION DIRECTE :**
>   - Tu ne dois **JAMAIS** exécuter de commande modifiant le dépôt ou son état (`git add`, `git commit`, `git push`, `git checkout`, `git branch`, `git merge`, `git pull`, `git reset`, `git rebase`, `git stash`, etc.).
>   - Si une opération Git est nécessaire, recommandée ou demandée, tu dois **UNIQUEMENT** formuler et afficher la commande exacte dans ta réponse (dans un bloc `bash`) pour que le développeur puisse l'exécuter lui-même dans son terminal.
> 
> - **EXCEPTIONS EXCLUSIVEMENT AUTORISÉES (LECTURE SEULE STRICTE) :**
>   - Tu as le droit d'exécuter directement des commandes d'inspection en lecture seule (`git status`, `git diff`, `git diff --staged`, `git log`, `git branch`, etc.) pour analyser l'état réel du dépôt et les changements locaux sans jamais altérer le dépôt.

---

## 🔒 2. Sécurité, Secrets et Intégrité des Données

1. **Confidentialité des clés et jetons :**
   - Ne jamais afficher, journaliser ni commiter de fichiers contenant des secrets (`.env`, `token.enc`, `client_secret_*.json`, clés API, refresh tokens).
   - Les tokens Google Drive doivent rester chiffrés localement en **AES-256-GCM** via la clé dérivée de `ENCRYPTION_SECRET` (`src/utils/cryptoUtils.ts`).
2. **Intégrité absolue des sauvegardes utilisateur :**
   - Les fichiers de sauvegarde de jeux sont précieux et irremplaçables pour l'utilisateur.
   - Ne jamais écraser ou supprimer de fichiers locaux sans vérification préalable de version et validation explicite en cas de conflit.
   - Toujours créer les répertoires parents manquants lors des restaurations d'archives.

---

## 🎯 3. Présentation & Objectifs du Projet

**cloud-my-save** est un outil multi-plateforme (Linux/Windows) fournissant un système de synchronisation et de sauvegarde cloud sur **Google Drive** pour les jeux vidéo sur PC ne disposant pas de cloud save natif (exemples : *Sims 4*, *Scrap Mechanic*, *The Long Drive*, *My Summer Car*, *Minecraft*, etc.).

### Fonctionnalités principales :
- 🔑 Authentification sécurisée OAuth 2.0 (Google Drive v3) avec tokens chiffrés.
- 📦 Exportation : compression streaming `.zip` avec génération d'un `manifest.json` et upload Google Drive.
- 📥 Importation : téléchargement, vérification de version, décompression et restauration fidèle des dossiers/fichiers.
- ⚖️ Gestion des versions & conflits : comparaison temporelle fine entre sauvegarde Cloud et fichiers locaux (prise en compte du `mtime` réel sur disque pour les sessions hors-ligne).
- 🗃️ Registre local (`games_registry.json`) mémorisant les chemins d'accès configurés par jeu.

---

## 🏛️ 4. Architecture & Séparation Stricte des Responsabilités

> [!IMPORTANT]
> **DÉCOUPLAGE OBLIGATOIRE : AUCUNE LOGIQUE MÉTIER DANS LA CLI / L'UI**
> Les dossiers `src/cli/` (et plus tard toute interface graphique Electron/Tauri/Web) ne doivent contenir **que** l'interaction utilisateur (I/O, invites, menus, mise en forme).
> **Toute la logique métier** (appels Drive, manipulation de fichiers, compression, calculs de dates, registres) doit résider exclusivement dans `src/services/` et `src/utils/`.

### Structure de l'Arborescence :

```text
cloud-my-save/
├── src/
│   ├── auth/              # Gestionnaire OAuth2 Google (serveur temporaire port 3000, refresh token)
│   │   └── googleAuth.ts
│   ├── config/            # Constantes et configuration globale (ports, scopes Drive, env)
│   │   └── googleConfig.ts
│   ├── services/          # COEUR MÉTIER (indépendant de toute interface)
│   │   ├── driveService.ts         # Opérations Google Drive (upload, download, query folders/files)
│   │   ├── localRegistryService.ts # Persistance du registre local (games_registry.json)
│   │   └── versionService.ts       # Comparaison temporelle Cloud vs Local (scan mtime disque)
│   ├── utils/             # Utilitaires purs et partagés
│   │   ├── cryptoUtils.ts          # Chiffrement / Déchiffrement AES-256-GCM
│   │   └── zipUtils.ts             # Compression streaming (archiver), extraction (adm-zip), manifest
│   ├── cli/               # INTERFACE TERMINAL (consommateur des services, sans logique métier)
│   │   ├── compareCli.ts           # Affichage du comparateur de versions
│   │   ├── exportCli.ts            # Assistant interactif d'exportation
│   │   ├── importCli.ts            # Assistant interactif d'importation
│   │   └── initGameCli.ts          # Assistant de configuration d'un jeu
│   └── index.ts           # Point d'entrée principal (boucle du menu CLI)
├── games_registry.json    # Registre local des jeux configurés et chemins associés
├── token.enc              # Jetons OAuth chiffrés
├── .env                   # Variables d'environnement locales (non commité)
└── tsconfig.json          # Configuration TypeScript
```

---

## 💻 5. Standards de Développement & Conventions TypeScript

1. **Module ESM natif (`"type": "module"`) :**
   - **Obligation :** Dans tous les fichiers TypeScript, les imports relatifs **doivent obligatoirement inclure l'extension `.js`** :
     ```typescript
     // ✅ BON
     import { getDriveService } from './auth/googleAuth.js';
     import { SaveManifest } from '../utils/zipUtils.js';

     // ❌ MAUVAIS (provoquera une erreur d'exécution ESM)
     import { getDriveService } from './auth/googleAuth';
     ```
2. **Typage TypeScript strict :**
   - Toujours définir et exporter les interfaces de données (`SaveManifest`, `ZipSource`, `DriveSaveFile`, `VersionComparisonResult`, etc.).
   - Éviter le type `any`. Préférer `unknown` avec type guards si le type n'est pas garanti.
3. **Gestion des flux de fichiers & Mémoire :**
   - **Création de zip :** Toujours utiliser `archiver` en mode streaming (`Readable` / `Writable` streams) pour garantir une empreinte mémoire minime (~30 Mo), même sur des sauvegardes géantes de plusieurs gigaoctets.
   - **Extraction :** `adm-zip` pour l'inspection et le dézippage local.
4. **Gestion des chemins & Multi-plateforme :**
   - Toujours utiliser `path.resolve()`, `path.join()`, `path.normalize()` pour assurer la compatibilité entre Linux (`/`) et Windows (`\`).
   - Normaliser les noms de jeux dans les noms de fichiers pour éviter les caractères spéciaux interdits sur Windows (`:`, `*`, `?`, `"`, `<`, `>`, `|`).

---

## 📄 6. Spécifications des Données & Formats

### 1. Format de Nommage des Archives Zip
Le nom des sauvegardes exportées sur Google Drive suit rigoureusement la convention :
```text
<NomDuJeu>_<Jour>J_<Mois>M_<Année>A_<Heure>H_<Minute>M_<Seconde>S.zip
Exemple : Sims4_29J_08M_2026A_01H_36M_57S.zip
```
Ce format permet le tri alphabétique, l'extraction de date sans métadonnées Drive via regex (`parseTimestampFromSaveFilename`), et la compatibilité tous systèmes.

### 2. Format du `manifest.json` (dans l'archive et le registre)
Chaque archive zip contient à sa racine un fichier `manifest.json` :
```json
{
  "game": "Sims4",
  "os": "linux",
  "date": "2026-08-28T23:36:57.942Z",
  "timestamp": 1787960217942,
  "sources": [
    {
      "folder": "Saves",
      "path": "/home/user/.local/share/Electronic Arts/The Sims 4/saves"
    }
  ]
}
```

---

## 📝 7. Normes de Commits & Pull Requests (Conventional Commits)

### Conventional Commits & Structure Détaillée des Messages
Les commits doivent respecter la norme Conventional Commits :
- **Titre** : `<type>(<scope optionnel>): <description courte en français>`
- **Types valides** : `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `perf`, `ci`, `build`, `revert`.

#### 🔍 Règle Impérative : Vérifier l'état réel du dépôt (`git status` & `git diff`)
- **NE JAMAIS SUPPOSER QU'UN COMMIT PROPOSÉ PRÉCÉDEMMENT A ÉTÉ EXÉCUTÉ.**
- Avant de proposer un message de commit ou la commande associée, l'IA doit **TOUJOURS inspecter au préalable l'état réel du dépôt** via `git status` et `git diff`.
- Le message de commit et les fichiers ciblés dans `git add` doivent correspondre fidèlement aux modifications réelles constatées dans l'arbre de travail (working tree et fichiers untracked), sans omettre d'anciens changements non validés. Si plusieurs fonctionnalités indépendantes coexistent, proposer un découpage en commits cohérents.

#### 📝 Niveau de détail obligatoire pour les messages de commit :
Lorsque le développeur demande de rédiger un message de commit (ou de donner la commande pour commiter), fournir un message richement détaillé structuré comme suit :
1. **Titre** : `<type>(<scope optionnel>): <résumé court en français> (#num_issue/PR si applicable)`
2. **Corps explicatif (Contexte et justification)** :
   - Exposer le problème résolu, l'état antérieur ou le besoin (ex: pourquoi une ancienne approche était insuffisante).
   - Expliquer la solution technique adoptée.
   - **Important** : Ne JAMAIS mentionner dans le corps du commit que les tests passent (c'est normal et implicite qu'ils passent).
3. **Liste détaillée par fichier modifié** :
   - `- <chemin/fichier> : <explication technique et précise de la modification>`
4. **Référence de suivi (si applicable)** :
   - Mention du ticket / issue GitHub associé (ex: `Closes #12`).

#### 💻 Format de commande à fournir :
Toujours fournir la commande prête à copier-coller avec des flags `-m` successifs (pas de syntaxe `EOF`), avec le titre dans le premier `-m` et le corps détaillé / puces directement dans le second `-m` :
```bash
git commit -m "<type>(<scope optionnel>): <titre>" -m "<Paragraphe explicatif si besoin...
- <fichier 1> : <changement>
- <fichier 2> : <changement>

Closes #... (si applicable)>"
```

### Structure des descriptions de Pull Request (PR)
Lorsque le développeur demande de rédiger un message / description de Pull Request, fournir une synthèse claire et structurée de la branche comme suit :

1. **Titre de la PR** : `<type>(<scope optionnel>): <résumé court de la branche>` (norme Conventional Commits)
2. **Section `## Résumé`** :
   - Liste à puces résumant les modifications majeures apportées par la branche :
     - Nouveaux modules, fichiers et variables d'environnement (`.env`) avec leur rôle.
     - Refontes d'options / flags ou restructurations de code.
     - Évolutions de l'interface (CLI/UI) et gestion des paramètres.
     - Nouveaux tests ajoutés et mise à jour de la documentation technique (`README.md`, `explication.md`).

---

## 🛠️ 8. Commandes Utiles & Workflow de Développement

| Commande | Action |
| :--- | :--- |
| `npm run dev` | Lance l'application directement avec `tsx` (TypeScript sans build intermédiaire). |
| `npm run build` | Compile TypeScript (`src/`) vers JavaScript (`dist/`) via `tsc`. |
| `npm start` | Démarre la version compilée en production (`node dist/index.js`). |
| `npx tsc --noEmit` | Vérifie le typage TypeScript de l'ensemble du projet sans générer de fichiers. |

> [!NOTE]
> Toujours exécuter `npx tsc --noEmit` après avoir modifié du code TypeScript pour valider l'absence d'erreurs de type ou d'imports manquants.

---

## 🤝 9. Collaboration avec le Développeur

1. **Style de communication :** Direct, efficace, en français, orienté ingénierie logicielle propre.
2. **Autonomie & Initiative :** Proposer des améliorations architecturales claires tout en respectant l'organisation existante.
3. **Rappels Git :** Dès qu'un lot de travail est terminé ou qu'une modification importante est validée, exécuter au préalable `git status` et `git diff` pour inspecter l'état réel du dépôt, puis afficher systématiquement le bloc `bash` contenant les commandes `git status`, `git add` et `git commit` parfaitement adaptées aux fichiers réellement modifiés/en attente pour que le développeur puisse commiter en toute confiance.
