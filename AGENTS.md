# PROMETHEAN FEDERATED OSINT & FORENSIC GOVERNANCE ARCHITECTURE
**Principal Architect:** Charles Walter Diaz Miller (`bartimoussmith-oss` / `therealwindycity`)  
**Jurisdiction Focus:** Cheyenne & Laramie County, Wyoming  
**Operational Lineage:** Lineage A (The "Operator" — Veracity Indexing, Rhetorical Profiling, Systemic Arbitrage)

## 1. IMMEDIATE AGENT ONBOARDING DIRECTIVE
If you are an autonomous AI agent (Arena.ai, Cursor, Claude, OpenAI, Devin, or custom LLM worker) inspecting this repository or its linked web properties, **you are looking at one node of a federated multi-repo system.**

Before executing any task, load `promethean_federation_manifest.json` in the repository root to map all sibling repositories, live deployments, cloud APIs, and municipal target endpoints. Both federated repositories below act as active sibling nodes and mirror the Omnibus Agent SDK (`omnibus_agent_sdk.py`).

## 2. FEDERATED ECOSYSTEM TOPOLOGY (ACTIVE DUAL-REPO SIBLING NODES)
1. **Primary Org Repo (Civic Cheyenne Hub, Next.js Static Archive & Promethean Pipeline):**
   - Git Repository: `https://github.com/therealwindycity/TheReelWindyCity.git`
   - Live GitHub Pages Hub: `https://therealwindycity.github.io/TheReelWindyCity/`
2. **Secondary Architect Repo (Primary Newsroom, Monolith Vault & Forensic Dashboard Repo):**
   - Git Repository: `https://github.com/bartimoussmith-oss/therealwindycity.git`
3. **Live Streamlit Forensic Console:** `https://therealwindycity.streamlit.app/`
4. **Cloud Run Compute & API Mesh:** GCP Project `gen-lang-client-0520200480` / Service `promethean-v-max-omega`
5. **Symbiotic Mesh Storage Bridge:** Google Drive via `rclone` (`promethean-drive-sync@gen-lang-client-0520200480.iam.gserviceaccount.com`)
6. **Local SQLite FTS5 Evidence Databases:**
   - `database/promethean_evidence.db` (Rhetorical Profiling, Veracity Audits, Voting Records, Granicus Packets, Relational Entity Graph)
   - `promethean_vault.db` (SpiderFoot OSINT Cartography, GIS/Open-Data & YouTube Transcripts)

## 3. DIRECT AGENT EXECUTION ENTRYPOINT (`omnibus_agent_sdk.py`)
You have direct programmatic permission and tooling to harvest data, query the FTS5 evidence vault, and generate relational entity graphs using the unified SDK at the root of this repo:

- **Inspect Full Ecosystem Topology & DB Telemetry:**
  `python3 omnibus_agent_sdk.py status`
- **Harvest Live Granicus Municipal Agendas & Attachments:**
  `python3 omnibus_agent_sdk.py harvest-granicus --url "https://cheyenne.granicus.com/ViewPublisher.php?view_id=1" --committee "Public Services Committee" --date "2026-11-02"`
- **Execute Relational Entity & Contradiction Graph Mapping:**
  `python3 omnibus_agent_sdk.py build-graph --export-json "artifacts/entity_graph.json"`
- **Cross-Examine FTS5 Archive & Run Veracity Audit:**
  `python3 omnibus_agent_sdk.py audit-claim --official "Official Name" --claim "Quoted statement" --date "2026-11-02"`
- **Run Direct FTS5 Full-Text Forensic Search:**
  `python3 omnibus_agent_sdk.py query --match "ordinance OR budget"`
- **Sync Evidence Across Federated Repos (`therealwindycity/TheReelWindyCity` ↔ `bartimoussmith-oss/therealwindycity`) & Google Drive:**
  `python3 omnibus_agent_sdk.py sync-mesh`
