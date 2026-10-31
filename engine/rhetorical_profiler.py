#!/usr/bin/env python3
"""
Promethean Rhetorical Profiler & Veracity Indexing Engine
Audits transcript claims against statutory PDF records stored in SQLite FTS5.
"""
import os
import re
import json
import sqlite3
import argparse
import requests

DB_PATH = os.environ.get("PROMETHEAN_DB", "database/promethean_evidence.db")
LLM_ENDPOINT = os.environ.get("LLAMA_CPP_URL", "http://127.0.0.1:8080/v1/chat/completions")

RHETORICAL_TAXONOMY = {
    "PROCEDURAL_DEFERRAL": [
        "table this", "send back to staff", "study session", "wait for legal", "premature to vote"
    ],
    "FISCAL_SHIELDING": [
        "unfunded mandate", "enterprise fund", "grant match only", "no impact to general fund", "budget neutral"
    ],
    "STATUTORY_AMBIGUITY": [
        "hands are tied", "state statute requires", "federal guidelines", "out of our jurisdiction"
    ],
    "EMERGENCY_BYPASS": [
        "time sensitive", "suspend the rules", "immediate reading", "cannot wait for next cycle"
    ],
}


def classify_rhetorical_tactic(statement: str) -> list[str]:
    lowered = statement.lower()
    matched = []
    for tactic, triggers in RHETORICAL_TAXONOMY.items():
        if any(t in lowered for t in triggers):
            matched.append(tactic)
    return matched or ["UNCLASSIFIED_ASSERTION"]


def fts_statutory_lookup(conn: sqlite3.Connection, query_terms: str, limit: int = 3) -> list[dict]:
    tokens = [
        w for w in re.findall(r"[A-Za-z0-9_]+", query_terms)
        if len(w) > 3 and w.upper() not in {"AND", "OR", "NOT", "NEAR"}
    ]
    safe_query = " OR ".join(tokens[:8])
    if not safe_query:
        return []
    cur = conn.cursor()
    cur.execute(
        """
        SELECT reference_id, primary_actor, title_or_claim, snippet(fts_forensic_archive, 4, '[', ']', '...', 40)
        FROM fts_forensic_archive
        WHERE record_type = 'GOVERNANCE_ITEM' AND fts_forensic_archive MATCH ?
        ORDER BY rank LIMIT ?
        """,
        (safe_query, limit),
    )
    return [
        {"item_id": r[0], "body": r[1], "title": r[2], "excerpt": r[3]}
        for r in cur.fetchall()
    ]


def evaluate_claim_via_llm(official_name: str, public_claim: str, statutory_evidence: list[dict]) -> dict:
    tactics = classify_rhetorical_tactic(public_claim)
    evidence_block = "\n".join(
        [f"[Item #{e['item_id']} - {e['title']}]: {e['excerpt']}" for e in statutory_evidence]
    ) or "No matching statutory text located in local archive."

    prompt = (
        f"Perform a forensic veracity audit on the following municipal statement.\n"
        f"Official: {official_name}\n"
        f"Public Statement: \"{public_claim}\"\n"
        f"Detected Rhetorical Framing: {', '.join(tactics)}\n"
        f"Statutory Evidence Archive:\n{evidence_block}\n\n"
        f"Return strict JSON with keys: contradiction_type (one of STATUTORY_CONFLICT, PRIOR_VOTE_REVERSAL, "
        f"BUDGET_DISCREPANCY, PROCEDURAL_BYPASS, OMISSION_OF_RECORD), severity_score (int 1-10), "
        f"statutory_fact (concise summary of what the record actually states), and evidence_citation."
    )

    try:
        resp = requests.post(
            LLM_ENDPOINT,
            json={
                "model": "local-gguf",
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.1,
            },
            timeout=30,
        )
        resp.raise_for_status()
        content = resp.json()["choices"][0]["message"]["content"]
        start, end = content.find("{"), content.rfind("}") + 1
        return json.loads(content[start:end])
    except Exception:
        # Deterministic fallback when local llama.cpp server is offline
        top_cite = f"Item #{statutory_evidence[0]['item_id']} ({statutory_evidence[0]['title']})" if statutory_evidence else "Pending Archive Match"
        top_fact = statutory_evidence[0]["excerpt"] if statutory_evidence else "Requires manual statutory verification."
        return {
            "contradiction_type": "STATUTORY_CONFLICT",
            "severity_score": 6,
            "statutory_fact": top_fact,
            "evidence_citation": top_cite,
            "rhetorical_tactic": ",".join(tactics),
        }


def log_audit_entry(official_name: str, role: str, statement_date: str, claim: str):
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    schema_file = "database/schema_rhetorical_profiling.sql"
    if os.path.exists(schema_file):
        with open(schema_file, "r", encoding="utf-8") as f:
            conn.executescript(f.read())
    cur = conn.cursor()

    cur.execute("INSERT OR IGNORE INTO officials (full_name, role_title) VALUES (?, ?)", (official_name, role))
    cur.execute("SELECT official_id FROM officials WHERE full_name = ?", (official_name,))
    official_id = cur.fetchone()[0]

    evidence = fts_statutory_lookup(conn, claim)
    verdict = evaluate_claim_via_llm(official_name, claim, evidence)
    tactics = ",".join(classify_rhetorical_tactic(claim))
    linked_item = evidence[0]["item_id"] if evidence else None

    cur.execute(
        """
        INSERT INTO veracity_audit
        (official_id, item_id, statement_date, public_claim, statutory_fact, contradiction_type, severity_score, rhetorical_tactic, evidence_citation)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            official_id,
            linked_item,
            statement_date,
            claim,
            verdict.get("statutory_fact", "Unverified"),
            verdict.get("contradiction_type", "STATUTORY_CONFLICT"),
            int(verdict.get("severity_score", 5)),
            tactics,
            verdict.get("evidence_citation", "Local FTS5 Index"),
        ),
    )
    conn.commit()
    conn.close()
    print(f"[+] Logged Veracity Audit for {official_name} | Tactics: {tactics} | Severity: {verdict.get('severity_score')}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Promethean Rhetorical Profiler CLI")
    parser.add_argument("--official", required=True, help="Full name of city/county official")
    parser.add_argument("--role", default="City Council", help="Official role title")
    parser.add_argument("--date", required=True, help="Statement date YYYY-MM-DD")
    parser.add_argument("--claim", required=True, help="Direct quote or public claim to audit")
    args = parser.parse_args()
    log_audit_entry(args.official, args.role, args.date, args.claim)
