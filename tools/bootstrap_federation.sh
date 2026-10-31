#!/usr/bin/env bash
# Promethean Omnibus Cross-Repo & Rclone Federation Propagator
# Active Federated Sibling Nodes:
#   - Primary Org Repo:        https://github.com/therealwindycity/TheReelWindyCity.git
#   - Secondary Architect Repo: https://github.com/bartimoussmith-oss/therealwindycity.git
set -euo pipefail

PRIMARY_ORG_REPO="https://github.com/therealwindycity/TheReelWindyCity.git"
SECONDARY_ARCHITECT_REPO="https://github.com/bartimoussmith-oss/therealwindycity.git"
FEDERATED_ORGS=("therealwindycity" "bartimoussmith-oss")

BEACON_FILES=(
    "AGENTS.md"
    ".cursorrules"
    "CLAUDE.md"
    "promethean_federation_manifest.json"
    "omnibus_agent_sdk.py"
    ".well-known/ai-plugin.json"
)

PIPELINE_AND_OMNIBUS_FILES=(
    "database/schema_rhetorical_profiling.sql"
    "scrapers/granicus_harvester.py"
    "engine/rhetorical_profiler.py"
    "Transparency_Index_App.py"
    ".github/workflows/promethean_autoharvest.yml"
    "AGENTS.md"
    ".cursorrules"
    "CLAUDE.md"
    "promethean_federation_manifest.json"
    "omnibus_agent_sdk.py"
    ".well-known/ai-plugin.json"
    "tools/bootstrap_federation.sh"
)

CURRENT_ORIGIN=$(git config --get remote.origin.url || echo "")

echo "[*] Copying AGENTS.md to universal agent instruction filenames (.cursorrules, CLAUDE.md)..."
cp AGENTS.md .cursorrules
cp AGENTS.md CLAUDE.md
mkdir -p artifacts

echo "[*] Executing initial Relational Graph build & status snapshot..."
python3 omnibus_agent_sdk.py build-graph --export-json artifacts/entity_graph.json
python3 omnibus_agent_sdk.py status > artifacts/federation_status.json

sync_repo_files() {
    local target_url="$1"
    local mode="$2"
    if [ -n "$CURRENT_ORIGIN" ] && [ "${CURRENT_ORIGIN%.git}" = "${target_url%.git}" ]; then
        echo "[*] Skipping current checkout ($target_url)."
        return 0
    fi

    echo "[*] Wiring Promethean Federation ($mode) into $target_url..."
    local tmp_dir
    tmp_dir=$(mktemp -d)
    if git clone --depth 1 --filter=blob:none "$target_url" "$tmp_dir" 2>/dev/null; then
        local files_to_copy=("${BEACON_FILES[@]}")
        if [ "$mode" = "full" ]; then
            files_to_copy=("${PIPELINE_AND_OMNIBUS_FILES[@]}")
        fi
        for file in "${files_to_copy[@]}"; do
            if [ -f "$file" ]; then
                mkdir -p "$tmp_dir/$(dirname "$file")"
                cp "$file" "$tmp_dir/$file"
            fi
        done
        (
            cd "$tmp_dir"
            git add -A
            if ! git diff --cached --quiet; then
                git commit -m "Promethean Omnibus: Sync Federated Discovery Beacon & Agent SDK"
                git push origin HEAD || true
            fi
        )
    fi
    rm -rf "$tmp_dir"
}

# Propagate full pipeline + discovery beacons across both primary federated sibling repositories
# and beacon files across all other sibling repositories under both organizations.
if command -v gh &> /dev/null && gh auth status &> /dev/null; then
    sync_repo_files "$PRIMARY_ORG_REPO" "full"
    sync_repo_files "$SECONDARY_ARCHITECT_REPO" "full"

    for GH_ORG in "${FEDERATED_ORGS[@]}"; do
        echo "[*] Discovering sibling repositories under $GH_ORG..."
        REPOS=$(gh repo list "$GH_ORG" --limit 25 --json name --jq '.[].name' || true)
        for REPO in $REPOS; do
            REPO_URL="https://github.com/$GH_ORG/$REPO.git"
            if [ "${REPO_URL%.git}" != "${PRIMARY_ORG_REPO%.git}" ] && [ "${REPO_URL%.git}" != "${SECONDARY_ARCHITECT_REPO%.git}" ]; then
                sync_repo_files "$REPO_URL" "beacon"
            fi
        done
    done
fi

# Optional: Sync artifacts to Google Drive via rclone if configured
if command -v rclone &> /dev/null; then
    REMOTES=$(rclone listremotes || true)
    if [ -n "$REMOTES" ]; then
        PRIMARY_REMOTE=$(echo "$REMOTES" | head -n 1)
        echo "[*] Syncing Omnibus Federation Artifacts to $PRIMARY_REMOTE/Promethean_Omnibus..."
        rclone copy artifacts/ "${PRIMARY_REMOTE}Promethean_Omnibus/artifacts/" || true
        rclone copy database/ "${PRIMARY_REMOTE}Promethean_Omnibus/database/" || true
    fi
fi

echo "[+] Omnibus Federation Active. Both Primary ($PRIMARY_ORG_REPO) and Secondary ($SECONDARY_ARCHITECT_REPO) nodes registered."
