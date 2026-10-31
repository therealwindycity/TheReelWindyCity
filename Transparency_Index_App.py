#!/usr/bin/env python3
"""
The Real Windy City — Promethean Transparency Index & Forensic Governance Dashboard
Fixed f-string syntax and wired directly to SQLite FTS5 & Veracity Audit tables.
"""
import os
import sqlite3
import pandas as pd
import streamlit as st

st.set_page_config(
    page_title="Promethean CivicWatch | Cheyenne & Laramie County",
    page_icon="⚖️",
    layout="wide",
)

DB_PATH = os.environ.get("PROMETHEAN_DB", "database/promethean_evidence.db")


def get_connection() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    schema_path = "database/schema_rhetorical_profiling.sql"
    if os.path.exists(schema_path):
        with open(schema_path, "r", encoding="utf-8") as f:
            conn.executescript(f.read())
    return conn


conn = get_connection()

st.title("⚖️ The Real Windy City — Promethean Forensic Audit Console")
st.caption("Cheyenne & Laramie County Municipal Veracity Index, Rhetorical Profiling & Statutory Archive")

# Top-Level Telemetry Metrics
col1, col2, col3, col4 = st.columns(4)
items_count = conn.execute("SELECT COUNT(*) FROM governance_items").fetchone()[0]
officials_count = conn.execute("SELECT COUNT(*) FROM officials").fetchone()[0]
audits_count = conn.execute("SELECT COUNT(*) FROM veracity_audit").fetchone()[0]
high_sev_count = conn.execute("SELECT COUNT(*) FROM veracity_audit WHERE severity_score >= 7").fetchone()[0]

col1.metric("Indexed Statutory Packets", items_count)
col2.metric("Profiled Authority Figures", officials_count)
col3.metric("Logged Veracity Audits", audits_count)
col4.metric("High-Severity Contradictions (≥7)", high_sev_count)

tab_fts, tab_veracity, tab_votes, tab_ingest = st.tabs([
    "🔍 FTS5 Forensic Search",
    "⚠️ Veracity & Contradiction Ledger",
    "🗳️ Official Rhetorical Profiles",
    "➕ Log Statement Audit",
])

with tab_fts:
    st.subheader("Full-Text Cross-Examination (FTS5)")
    search_query = st.text_input(
        "Query Ordinances, Resolutions, Agenda Packets, and Veracity Logs:",
        placeholder="e.g., drainage OR budget OR contract OR 'suspend the rules'",
    )
    if search_query:
        try:
            df_fts = pd.read_sql_query(
                """
                SELECT record_type AS Type,
                       primary_actor AS Actor_Or_Body,
                       title_or_claim AS Title_Or_Claim,
                       snippet(fts_forensic_archive, 4, ' **[', ']** ', '...', 35) AS Contextual_Excerpt,
                       metadata_tags AS Tags
                FROM fts_forensic_archive
                WHERE fts_forensic_archive MATCH ?
                ORDER BY rank LIMIT 50
                """,
                conn,
                params=(search_query,),
            )
            st.dataframe(df_fts, use_container_width=True)
        except Exception as exc:
            st.error(f"FTS5 Query Syntax Error: {exc}")

with tab_veracity:
    st.subheader("Veracity Indexing & Statutory Contradictions")
    df_audits = pd.read_sql_query(
        """
        SELECT v.audit_id AS ID,
               v.statement_date AS Date,
               o.full_name AS Official,
               o.role_title AS Role,
               v.contradiction_type AS Contradiction,
               v.severity_score AS Severity,
               v.rhetorical_tactic AS Tactic,
               v.public_claim AS Public_Claim,
               v.statutory_fact AS Statutory_Fact,
               v.evidence_citation AS Citation
        FROM veracity_audit v
        JOIN officials o ON v.official_id = o.official_id
        ORDER BY v.severity_score DESC, v.statement_date DESC
        """,
        conn,
    )
    if df_audits.empty:
        st.info("No veracity contradictions logged yet. Use the 'Log Statement Audit' tab or CLI profiler.")
    else:
        st.dataframe(df_audits, use_container_width=True)

with tab_votes:
    st.subheader("Authority Figure Rhetorical & Voting Baselines")
    df_officials = pd.read_sql_query(
        """
        SELECT o.full_name AS Official,
               o.role_title AS Role,
               COUNT(v.audit_id) AS Audited_Claims,
               ROUND(AVG(v.severity_score), 2) AS Avg_Discrepancy_Severity,
               GROUP_CONCAT(DISTINCT v.rhetorical_tactic) AS Dominant_Rhetorical_Tactics
        FROM officials o
        LEFT JOIN veracity_audit v ON o.official_id = v.official_id
        GROUP BY o.official_id
        ORDER BY Avg_Discrepancy_Severity DESC
        """,
        conn,
    )
    st.dataframe(df_officials, use_container_width=True)

with tab_ingest:
    st.subheader("Record New Public Claim / Statutory Contradiction")
    with st.form("veracity_ingest_form"):
        f_name = st.text_input("Official Full Name")
        f_role = st.text_input("Role / Ward", value="Cheyenne City Council")
        f_date = st.date_input("Statement Date")
        f_type = st.selectbox(
            "Contradiction Classification",
            ["STATUTORY_CONFLICT", "PRIOR_VOTE_REVERSAL", "BUDGET_DISCREPANCY", "PROCEDURAL_BYPASS", "OMISSION_OF_RECORD"],
        )
        f_sev = st.slider("Discrepancy Severity Score", 1, 10, 6)
        f_tactic = st.text_input("Rhetorical Tactic Tag", value="FISCAL_SHIELDING")
        f_claim = st.text_area("Recorded Public Claim (Verbatim or Timestamped Summary)")
        f_fact = st.text_area("Countervailing Statutory Fact")
        f_cite = st.text_input("Evidence Citation (Ordinance #, Granicus Clip, or Packet Page)")
        submitted = st.form_submit_button("Commit Forensic Audit Record")

        if submitted and f_name and f_claim and f_fact:
            cur = conn.cursor()
            cur.execute("INSERT OR IGNORE INTO officials (full_name, role_title) VALUES (?, ?)", (f_name, f_role))
            cur.execute("SELECT official_id FROM officials WHERE full_name = ?", (f_name,))
            off_id = cur.fetchone()[0]
            cur.execute(
                """
                INSERT INTO veracity_audit
                (official_id, statement_date, public_claim, statutory_fact, contradiction_type, severity_score, rhetorical_tactic, evidence_citation)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (off_id, str(f_date), f_claim, f_fact, f_type, f_sev, f_tactic, f_cite),
            )
            conn.commit()
            st.success(f"Committed audit record for {f_name} to SQLite & FTS5 index.")
            st.rerun()
