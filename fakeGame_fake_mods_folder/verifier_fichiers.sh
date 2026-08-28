#!/usr/bin/env bash
# ==============================================================================
# Script de vérification 
# Vérifie l'ensemble des fichiers, leurs permissions, leurs dates (mtime)
# ainsi que la concordance avec version.txt (fichiers manuels inclus).
# ==============================================================================

set -u

# Support de la couleur ANSI dans le terminal
if [ -t 1 ]; then
    GREEN='\033[0;32m'
    RED='\033[0;31m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    CYAN='\033[0;36m'
    BOLD='\033[1m'
    NC='\033[0m'
else
    GREEN=''
    RED=''
    YELLOW=''
    BLUE=''
    CYAN=''
    BOLD=''
    NC=''
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERSION_FILE="$SCRIPT_DIR/version.txt"

echo -e "${CYAN}${BOLD}====================================================================${NC}"
echo -e "${CYAN}${BOLD}       ANALYSEUR ET VÉRIFICATEUR DE FICHIERS DE SYNCHRONISATION     ${NC}"
echo -e "${CYAN}${BOLD}====================================================================${NC}"
echo -e "Répertoire cible : ${BOLD}$SCRIPT_DIR${NC}\n"

ERRORS=0
TOTAL_ITEMS=0

current_year=$(date +%Y)

# Tableau pour suivre les éléments du disque
declare -A DISK_ITEMS

# Fonction d'inspection d'un élément du disque
inspect_element() {
    local item="$1"
    local rel_path="${item#$SCRIPT_DIR/}"
    
    # Exclure le script lui-même et .git
    if [ "$rel_path" = "verifier_fichiers.sh" ] || [ "$rel_path" = ".git" ]; then
        return
    fi

    TOTAL_ITEMS=$((TOTAL_ITEMS + 1))
    DISK_ITEMS["$rel_path"]=1

    if [ ! -e "$item" ] && [ ! -L "$item" ]; then
        echo -e "${RED}[MANQUANT]${NC} $rel_path"
        ERRORS=$((ERRORS + 1))
        return
    fi

    local perms_octal
    local perms_str
    local mtime_raw
    local size_bytes
    local file_type="Fichier"

    perms_octal=$(stat -c "%a" "$item" 2>/dev/null || echo "???")
    perms_str=$(stat -c "%A" "$item" 2>/dev/null || echo "???")
    mtime_raw=$(stat -c "%y" "$item" 2>/dev/null || echo "???")
    size_bytes=$(stat -c "%s" "$item" 2>/dev/null || echo "0")

    if [ -d "$item" ]; then
        file_type="Dossier"
    fi

    # Analyse des spécifications / particularités
    local particularites=()

    # 1. Caché ?
    local base_name
    base_name=$(basename "$item")
    if [[ "$base_name" == .* ]]; then
        particularites+=("Caché")
    fi

    # 2. Permissions
    if [ "$perms_octal" = "0" ] || [ "$perms_octal" = "000" ] || [ "$perms_octal" = "0000" ]; then
        particularites+=("Aucun droit (000)")
    elif [ "$perms_octal" = "444" ] || [ "$perms_octal" = "400" ]; then
        particularites+=("Lecture seule ($perms_octal)")
    elif [ "$perms_octal" = "222" ] || [ "$perms_octal" = "200" ]; then
        particularites+=("Écriture seule ($perms_octal)")
    elif [ "$perms_octal" = "555" ]; then
        particularites+=("Lecture/Exécution sans écriture (555)")
    elif [ -x "$item" ] && [ ! -d "$item" ]; then
        particularites+=("Exécutable ($perms_octal)")
    fi

    # 3. Horodatage (mtime)
    local year_part
    year_part=$(echo "$mtime_raw" | cut -d'-' -f1)

    if [ -n "$year_part" ] && [ "$year_part" -lt 1980 ] 2>/dev/null; then
        particularites+=("Ancien/Epoch ($year_part)")
    elif [ -n "$year_part" ] && [ "$year_part" -gt "$current_year" ] 2>/dev/null; then
        particularites+=("Futur ($year_part)")
    elif [ -n "$year_part" ] && [ "$year_part" -le 2005 ] 2>/dev/null; then
        particularites+=("Date ancienne ($year_part)")
    fi

    # Affichage
    local specs_txt=""
    if [ ${#particularites[@]} -gt 0 ]; then
        local joined
        joined=$(IFS=", "; echo "${particularites[*]}")
        specs_txt=" --> [${joined}]"
    fi

    local mtime_short="${mtime_raw:0:19}"
    printf "${GREEN}[ OK ]${NC} ${BOLD}%-38s${NC} | %-7s | Perm: %-4s (%s) | Date: %s | %8s octets%b\n" \
        "$rel_path" "$file_type" "$perms_octal" "$perms_str" "$mtime_short" "$size_bytes" "$specs_txt"
}

echo -e "${YELLOW}${BOLD}--- 1. SCAN DE TOUS LES FICHIERS DU DOSSIER (MANUELS & SPÉCIFIQUES) ---${NC}\n"

# Scan récursif du dossier (incluant fichiers cachés)
while IFS= read -r -d '' path; do
    if [ "$path" != "$SCRIPT_DIR" ]; then
        inspect_element "$path"
    fi
done < <(find "$SCRIPT_DIR" -mindepth 1 \( -path "$SCRIPT_DIR/.git" -o -name "verifier_fichiers.sh" \) -prune -o -print0 | sort -z)

echo -e "\n${YELLOW}${BOLD}--- 2. CONCORDANCE AVEC VERSION.TXT ---${NC}\n"

if [ ! -f "$VERSION_FILE" ]; then
    echo -e "${RED}[ERREUR CRITIQUE] Le fichier version.txt est introuvable !${NC}"
    ERRORS=$((ERRORS + 1))
else
    echo -e "${GREEN}[  OK  ]${NC} Le fichier version.txt est présent."
    
    echo -e "Extraction des références citées dans version.txt..."
    
    # Extraire les lignes qui correspondent à un fichier/dossier relatif (en excluant les séparateurs de tirets/égal)
    mapfile -t ref_files < <(grep -E '^\.?[a-zA-Z0-9_\./-]+$' "$VERSION_FILE" | grep -vE '^[=-]+$' | sed 's/\/$//')

    if [ ${#ref_files[@]} -gt 0 ]; then
        echo -e "Fichiers recensés dans version.txt : ${#ref_files[@]}"
        
        declare -A REF_MAP
        for ref in "${ref_files[@]}"; do
            REF_MAP["$ref"]=1
            if [ -e "$SCRIPT_DIR/$ref" ] || [ -L "$SCRIPT_DIR/$ref" ]; then
                echo -e "  ${GREEN}✓${NC} Mentionné dans version.txt & Présent sur disque : ${BOLD}$ref${NC}"
            else
                echo -e "  ${RED}✗${NC} Mentionné dans version.txt mais ABSENT du disque : ${BOLD}$ref${NC}"
                ERRORS=$((ERRORS + 1))
            fi
        done

        # Vérifier s'il y a des fichiers sur disque non listés dans version.txt (ex: nouveaux fichiers ajoutés manuellement)
        non_listed=0
        for item in "${!DISK_ITEMS[@]}"; do
            if [ "$item" != "version.txt" ] && [ -z "${REF_MAP[$item]:-}" ]; then
                if [ $non_listed -eq 0 ]; then
                    echo -e "\n  ${YELLOW}[INFO] Fichiers sur disque non encore référencés dans version.txt :${NC}"
                fi
                echo -e "  ${YELLOW}?${NC} Présent sur disque mais non dans version.txt : ${BOLD}$item${NC}"
                non_listed=$((non_listed + 1))
            fi
        done

    else
        echo -e "  ${YELLOW}!${NC} Aucune référence directe extraite automatiquement de version.txt."
    fi
fi

echo -e "\n${CYAN}${BOLD}====================================================================${NC}"
if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}${BOLD} TEST RÉUSSI : $TOTAL_ITEMS éléments analysés. Tous les fichiers et spécifications sont conformes.${NC}"
else
    echo -e "${RED}${BOLD} TEST ÉCHOUÉ : $ERRORS erreur(s) détectée(s).${NC}"
fi
echo -e "${CYAN}${BOLD}====================================================================${NC}"

exit $ERRORS
