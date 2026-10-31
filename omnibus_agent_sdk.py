#!/usr/bin/env python3
"""
PROMETHEAN OMNIBUS AGENT SDK (v3.0)
Single-entrypoint autonomous controller for AI agents inspecting any repository or web node
in Charles Miller's federated OSINT & Forensic Governance infrastructure.
"""
import os
import re
import sys
import json
import sqlite3
import hashlib
import argparse
import subprocess
from datetime import datetime, timezone
from urllib.parse import urljoin

try:
    import requests
    from bs4 import BeautifulSoup
except ImportError:
    requests = None
    BeautifulSoup = None

MANIFEST_PATH = "promethean_federation_manifest.json"
DB_PATH = os.environ.get("PROMETHEAN_DB", "database/promethean_evidence.db")
SCHEMA_PATH = "database/schema_rhetorical_profiling.sql"


class PrometheanOmnibusAgent:
    def __init__(self, db_path: str = DB_PATH):
        self.db_path = db_path
        self.manifest = self._load_manifest()
        self.conn = self._init_database()

    def _load_manifest(self) -> dict:
        if os.path.exists(MANIFEST_PATH):
            with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        return {"system_name": "Promethean Fallback Node", "federated_nodes": {}}

    def _init_database(self) -> sqlite3.Connection:
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        if os.path.exists(SCHEMA_PATH):
            with open(SCHEMA_PATH, "r", encoding="utf-8") as f:
                conn.executescript(f.read())
        # Ensure Relational Graph Edge Table exists for complex multi-hop mapping
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS entity_edges (
                edge_id INTEGER PRIMARY KEY AUTOINCREMENT,
                source_type TEXT NOT NULL,
                source_name TEXT NOT NULL,
                relation_type TEXT NOT NULL,
                target_type TEXT NOT NULL,
                target_name TEXT NOT NULL,
                weight REAL DEFAULT 1.0,
                evidence_ref TEXT,
                discovered_at TEXT DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(source_name, relation_type, target_name, evidence_ref)
            );
            """
        )
        conn.commit()
        return conn

    def close(self) -> None:
        if getattr(self, "conn", None) is not None:
            self.conn.commit()
            self.conn.close()
            self.conn = None

    def get_ecosystem_status(self) -> dict:
        cur = self.conn.cursor()
        counts = {}
        for tbl in ["officials", "governance_items", "voting_record", "veracity_audit", "entity_edges"]:
            try:
                counts[tbl] = cur.execute(f"SELECT COUNT(*) FROM {tbl}").fetchone()[0]
            except Exception:
                counts[tbl] = 0

        return {
            "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "system_name": self.manifest.get("system_name"),
            "federated_nodes": self.manifest.get("federated_nodes"),
            "target_endpoints": self.manifest.get("target_jurisdiction_endpoints"),
            "database_telemetry": counts,
        }

    def harvest_granicus(self, url: str, prefix: str, committee: str, meeting_date: str) -> dict:
        """Delegates to scrapers/granicus_harvester.py and auto-extracts relational edges."""
        cmd = [
            sys.executable,
            "scrapers/granicus_harvester.py",
            url,
            "--prefix", prefix,
            "--committee", committee,
            "--date", meeting_date,
        ]
        res = subprocess.run(cmd, capture_output=True, text=True)
        print(res.stdout)
        if res.stderr:
            print(res.stderr, file=sys.stderr)
        edges_created = self.extract_relational_entities()
        return {
            "status": "completed" if res.returncode == 0 else "warning",
            "return_code": res.returncode,
            "new_relational_edges": edges_created,
        }

    def extract_relational_entities(self) -> int:
        """
        Scans all indexed governance_items and veracity_audit records to build a multi-hop
        relational graph linking Officials, Ordinances, Dollar Amounts, Contractors, and Committees.
        """
        cur = self.conn.cursor()
        items = cur.execute(
            "SELECT item_id, committee_or_body, ordinance_or_res_num, title, extracted_text, source_url FROM governance_items"
        ).fetchall()
        officials = [r["full_name"] for r in cur.execute("SELECT full_name FROM officials").fetchall()]

        ord_pattern = re.compile(r"\b(?:Ordinance|Resolution|Ord\.|Res\.)\s*(?:No\.?\s*)?([0-9]{2,4}-[0-9]+|\d+)\b", re.I)
        money_pattern = re.compile(r"\$[0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]{2})?")
        llc_pattern = re.compile(r"\b([A-Z][A-Za-z0-9&.,\- ]{2,45}\s+(?:LLC|Inc\.|Corp\.|Company|Associates|Construction|Engineering))\b")

        inserted = 0
        for item in items:
            blob = f"{item['title']} \n {item['extracted_text'] or ''}"
            cite = f"Item #{item['item_id']} ({item['source_url']})"
            body = item["committee_or_body"]
            item_node = item["ordinance_or_res_num"] or f"AgendaItem_{item['item_id']}"

            # Edge 1: Committee -> Reviews -> Item
            cur.execute(
                """
                INSERT OR IGNORE INTO entity_edges (source_type, source_name, relation_type, target_type, target_name, weight, evidence_ref)
                VALUES ('COMMITTEE', ?, 'REVIEWS_ITEM', 'GOVERNANCE_ITEM', ?, 1.0, ?)
                """,
                (body, item_node, cite),
            )
            inserted += cur.rowcount

            # Edge 2: Mentioned Ordinances / Resolutions
            for ord_match in set(ord_pattern.findall(blob)):
                cur.execute(
                    """
                    INSERT OR IGNORE INTO entity_edges (source_type, source_name, relation_type, target_type, target_name, weight, evidence_ref)
                    VALUES ('GOVERNANCE_ITEM', ?, 'REFERENCES_STATUTE', 'STATUTE', ?, 1.5, ?)
                    """,
                    (item_node, f"Ord/Res {ord_match}", cite),
                )
                inserted += cur.rowcount

            # Edge 3: Private Contractors / Vendors (Systemic Arbitrage & Procurement Tracking)
            for vendor in set(llc_pattern.findall(blob)):
                clean_vendor = " ".join(vendor.split())
                cur.execute(
                    """
                    INSERT OR IGNORE INTO entity_edges (source_type, source_name, relation_type, target_type, target_name, weight, evidence_ref)
                    VALUES ('GOVERNANCE_ITEM', ?, 'INVOLVES_VENDOR', 'VENDOR_ENTITY', ?, 2.0, ?)
                    """,
                    (item_node, clean_vendor, cite),
                )
                inserted += cur.rowcount

            # Edge 4: Fiscal Allocations
            for amount in set(money_pattern.findall(blob)):
                cur.execute(
                    """
                    INSERT OR IGNORE INTO entity_edges (source_type, source_name, relation_type, target_type, target_name, weight, evidence_ref)
                    VALUES ('GOVERNANCE_ITEM', ?, 'FISCAL_ALLOCATION', 'BUDGET_FIGURE', ?, 1.2, ?)
                    """,
                    (item_node, amount, cite),
                )
                inserted += cur.rowcount

            # Edge 5: Profiled Officials Mentioned in Packet
            for off_name in officials:
                last_name = off_name.split()[-1]
                if len(last_name) > 3 and re.search(rf"\b{re.escape(last_name)}\b", blob, re.I):
                    cur.execute(
                        """
                        INSERT OR IGNORE INTO entity_edges (source_type, source_name, relation_type, target_type, target_name, weight, evidence_ref)
                        VALUES ('OFFICIAL', ?, 'APPEARS_IN_RECORD', 'GOVERNANCE_ITEM', ?, 1.5, ?)
                        """,
                        (off_name, item_node, cite),
                    )
                    inserted += cur.rowcount

        # Edge 6: Veracity Audit Contradictions -> High-Weight Adversarial Edges
        audits = cur.execute(
            """
            SELECT v.audit_id, o.full_name, v.contradiction_type, v.severity_score, v.evidence_citation
            FROM veracity_audit v JOIN officials o ON v.official_id = o.official_id
            """
        ).fetchall()
        for a in audits:
            cur.execute(
                """
                INSERT OR IGNORE INTO entity_edges (source_type, source_name, relation_type, target_type, target_name, weight, evidence_ref)
                VALUES ('OFFICIAL', ?, ?, 'EVIDENCE_CITATION', ?, ?, ?)
                """,
                (a["full_name"], a["contradiction_type"], a["evidence_citation"], float(a["severity_score"]), f"Audit #{a['audit_id']}"),
            )
            inserted += cur.rowcount

        self.conn.commit()
        return inserted

    def export_relational_graph(self, out_json: str = "artifacts/entity_graph.json") -> dict:
        self.extract_relational_entities()
        cur = self.conn.cursor()
        edges = [dict(r) for r in cur.execute("SELECT * FROM entity_edges ORDER BY weight DESC").fetchall()]
        nodes = {}
        for e in edges:
            nodes[e["source_name"]] = {"id": e["source_name"], "type": e["source_type"]}
            nodes[e["target_name"]] = {"id": e["target_name"], "type": e["target_type"]}

        payload = {
            "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "node_count": len(nodes),
            "edge_count": len(edges),
            "nodes": list(nodes.values()),
            "edges": edges,
        }
        out_dir = os.path.dirname(out_json)
        if out_dir:
            os.makedirs(out_dir, exist_ok=True)
        with open(out_json, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2)
        return payload

    def query_fts5(self, match_expr: str, limit: int = 20) -> list[dict]:
        cur = self.conn.cursor()
        rows = cur.execute(
            """
            SELECT record_type, reference_id, primary_actor, title_or_claim,
                   snippet(fts_forensic_archive, 4, '[', ']', '...', 40) AS excerpt,
                   metadata_tags
            FROM fts_forensic_archive
            WHERE fts_forensic_archive MATCH ?
            ORDER BY rank LIMIT ?
            """,
            (match_expr, limit),
        ).fetchall()
        return [dict(r) for r in rows]


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Promethean Omnibus Agent SDK")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("status", help="Output full federated topology and database telemetry as JSON")

    p_harv = sub.add_parser("harvest-granicus", help="Harvest Granicus agenda packet and build entity edges")
    p_harv.add_argument("--url", required=True)
    p_harv.add_argument("--prefix", default="Cheyenne_Omnibus_Harvest")
    p_harv.add_argument("--committee", default="Public Services Committee")
    p_harv.add_argument("--date", default=datetime.now(timezone.utc).strftime("%Y-%m-%d"))

    p_graph = sub.add_parser("build-graph", help="Extract relational entities and export graph JSON")
    p_graph.add_argument("--export-json", default="artifacts/entity_graph.json")

    p_fts = sub.add_parser("query", help="Run FTS5 full-text forensic search")
    p_fts.add_argument("--match", required=True, help="FTS5 query expression")

    p_audit = sub.add_parser("audit-claim", help="Run rhetorical & veracity audit on an official's claim")
    p_audit.add_argument("--official", required=True)
    p_audit.add_argument("--role", default="Cheyenne City Council")
    p_audit.add_argument("--date", default=datetime.now(timezone.utc).strftime("%Y-%m-%d"))
    p_audit.add_argument("--claim", required=True)

    sub.add_parser("sync-mesh", help="Sync federation beacons and artifacts across sibling repositories and rclone")

    args = parser.parse_args()
    agent = PrometheanOmnibusAgent()
    try:
        if args.command == "status":
            print(json.dumps(agent.get_ecosystem_status(), indent=2))
        elif args.command == "harvest-granicus":
            print(json.dumps(agent.harvest_granicus(args.url, args.prefix, args.committee, args.date), indent=2))
        elif args.command == "build-graph":
            graph = agent.export_relational_graph(args.export_json)
            print(f"[+] Relational Graph Exported: {graph['node_count']} nodes, {graph['edge_count']} edges -> {args.export_json}")
        elif args.command == "query":
            print(json.dumps(agent.query_fts5(args.match), indent=2))
        elif args.command == "audit-claim":
            subprocess.run([
                sys.executable, "engine/rhetorical_profiler.py",
                "--official", args.official,
                "--role", args.role,
                "--date", args.date,
                "--claim", args.claim,
            ], check=True)
            agent.extract_relational_entities()
        elif args.command == "sync-mesh":
            agent.close()
            subprocess.run(["bash", "tools/bootstrap_federation.sh"], check=True)
    finally:
        agent.close()
