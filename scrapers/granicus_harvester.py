#!/usr/bin/env python3
"""
Promethean Granicus Harvester v2.0
Zero-touch attachment extraction, SHA-256 deduplication, PDF merging, and SQLite FTS5 ingestion.
"""
import os
import re
import sys
import sqlite3
import hashlib
import argparse
import urllib.parse
from datetime import datetime, timezone
import requests
from bs4 import BeautifulSoup
from pypdf import PdfReader, PdfWriter

DB_PATH = os.environ.get("PROMETHEAN_DB", "database/promethean_evidence.db")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf,*/*;q=0.8",
}

GRANICUS_REGEXES = [
    re.compile(r'(https?://[^"\'\s<>]+(?:meta_id=|attachment_id=|ViewAttachment\.ashx|\.pdf)[^"\'\s<>]*)', re.I),
    re.compile(r'(["\']/(?:AgendaViewer|GeneratedAgendaViewer|ViewAttachment|DocumentViewer)[^"\'\s<>]+["\'])', re.I),
    re.compile(r'meta_id=(\d+)', re.I),
]


def init_db(db_path: str):
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    conn = sqlite3.connect(db_path)
    schema_file = "database/schema_rhetorical_profiling.sql"
    if os.path.exists(schema_file):
        with open(schema_file, "r", encoding="utf-8") as f:
            conn.executescript(f.read())
    return conn


def discover_endpoints(base_url: str, html_text: str, session: requests.Session) -> list[tuple[str, str]]:
    soup = BeautifulSoup(html_text, "html.parser")
    found = {}

    # 1. Traverse iframes if Granicus wraps the true agenda inside an inner frame
    for iframe in soup.find_all("iframe"):
        iframe_src = iframe.get("src")
        if iframe_src:
            inner_url = urllib.parse.urljoin(base_url, iframe_src)
            try:
                resp = session.get(inner_url, timeout=15)
                if resp.ok:
                    html_text += "\n" + resp.text
                    soup = BeautifulSoup(html_text, "html.parser")
            except Exception as exc:
                print(f"[!] Iframe fetch warning ({inner_url}): {exc}")

    # 2. Extract standard DOM links and onclick handlers
    for tag in soup.find_all(["a", "area", "embed", "iframe"]):
        candidates = [tag.get("href"), tag.get("src"), tag.get("onclick"), tag.get("data-url")]
        label = tag.get_text(" ", strip=True) or tag.get("title") or "Granicus_Record"
        for raw in filter(None, candidates):
            js_url = re.search(r"['\"](https?://[^'\"]+|/[^'\"]+)['\"]", raw)
            target = js_url.group(1) if js_url else raw
            if any(token in target.lower() for token in ["meta_id", "attachment", ".pdf", "ashx", "document", "agenda"]):
                abs_url = urllib.parse.urljoin(base_url, target.replace("&amp;", "&"))
                if abs_url not in found or found[abs_url] == "Granicus_Record":
                    found[abs_url] = label[:120]

    # 3. Sweep raw JavaScript blocks for hidden endpoints and bare meta_ids
    parsed_base = urllib.parse.urlparse(base_url)
    host_root = f"{parsed_base.scheme}://{parsed_base.netloc}"

    for pattern in GRANICUS_REGEXES[:2]:
        for match in pattern.findall(html_text):
            clean = match.strip("'\" ").replace("&amp;", "&")
            abs_url = urllib.parse.urljoin(base_url, clean)
            found.setdefault(abs_url, "JS_Extracted_Attachment")

    for meta_id in GRANICUS_REGEXES[2].findall(html_text):
        constructed = f"{host_root}/ViewAttachment.ashx?meta_id={meta_id}"
        found.setdefault(constructed, f"MetaID_{meta_id}_Packet")

    return list(found.items())


def extract_pdf_text(pdf_path: str) -> str:
    try:
        reader = PdfReader(pdf_path)
        pages = [page.extract_text() or "" for page in reader.pages]
        return "\n".join(pages).strip()
    except Exception as exc:
        print(f"[!] Text extraction warning on {pdf_path}: {exc}")
        return ""


def harvest_and_ingest(target_url: str, prefix: str, committee: str, meeting_date: str):
    session = requests.Session()
    session.headers.update(HEADERS)
    conn = init_db(DB_PATH)

    print(f"[*] Auditing Granicus URL: {target_url}")
    resp = session.get(target_url, timeout=25)
    resp.raise_for_status()

    endpoints = discover_endpoints(target_url, resp.text, session)
    print(f"[*] Identified {len(endpoints)} candidate attachment endpoints.")

    raw_dir = os.path.join("artifacts", f"{prefix}_raw")
    os.makedirs(raw_dir, exist_ok=True)
    recovered = []
    seen_hashes = set()

    for idx, (url, title) in enumerate(endpoints, 1):
        try:
            r = session.get(url, timeout=25, allow_redirects=True)
            ctype = r.headers.get("Content-Type", "").lower()
            if "application/pdf" in ctype or r.content[:4] == b"%PDF":
                sha256_hash = hashlib.sha256(r.content).hexdigest()
                if sha256_hash in seen_hashes:
                    continue
                seen_hashes.add(sha256_hash)

                safe_name = re.sub(r"[^a-zA-Z0-9_-]", "_", title)[:50].strip("_") or f"item_{idx}"
                fname = f"{idx:02d}_{safe_name}_{sha256_hash[:10]}.pdf"
                fpath = os.path.join(raw_dir, fname)

                with open(fpath, "wb") as f:
                    f.write(r.content)

                full_text = extract_pdf_text(fpath)
                ord_match = re.search(r"\b(?:Ordinance|Resolution|Ord\.|Res\.)\s*(?:No\.?\s*)?([0-9-]+)", title + " " + full_text[:1000], re.I)
                ord_num = ord_match.group(1) if ord_match else None

                conn.execute(
                    """
                    INSERT OR IGNORE INTO governance_items
                    (meeting_date, committee_or_body, ordinance_or_res_num, title, attachment_sha256, local_pdf_path, source_url, extracted_text)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (meeting_date, committee, ord_num, title, sha256_hash, fpath, url, full_text),
                )
                conn.commit()

                recovered.append({
                    "index": len(recovered) + 1,
                    "title": title,
                    "ord_num": ord_num or "N/A",
                    "hash": sha256_hash[:12],
                    "path": fpath,
                    "url": url,
                    "kb": len(r.content) // 1024,
                })
                print(f"[+] Indexed PDF #{len(recovered)}: {fname} ({len(r.content)//1024} KB)")
        except Exception as exc:
            print(f"[!] Endpoint skip ({url}): {exc}")

    if not recovered:
        print("[!] 0 valid PDF attachments recovered. Check if clip/agenda ID requires headless browser session.")
        conn.close()
        return

    merger = PdfWriter()
    combined_pdf = f"{prefix}_Combined.pdf"
    summary_md = f"{prefix}_Agenda_Summary.md"
    now_iso = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    with open(summary_md, "w", encoding="utf-8") as md:
        md.write(f"# {prefix.replace('_', ' ')} — Forensic Dossier Index\n")
        md.write(f"**Harvest Timestamp:** `{now_iso}`  \n")
        md.write(f"**Source Endpoint:** {target_url}  \n\n")
        md.write("| # | Title | Ord/Res # | Size (KB) | SHA-256 Prefix | Source |\n")
        md.write("|---|---|---|---|---|---|\n")
        for doc in recovered:
            md.write(f"| {doc['index']} | {doc['title']} | `{doc['ord_num']}` | {doc['kb']} KB | `{doc['hash']}` | [Link]({doc['url']}) |\n")
            try:
                merger.append(doc["path"])
            except Exception as exc:
                print(f"[!] Merge skip on {doc['path']}: {exc}")

    with open(combined_pdf, "wb") as out_pdf:
        merger.write(out_pdf)
    merger.close()
    conn.close()
    print(f"[+] Dossier compiled: {combined_pdf} | Summary: {summary_md}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Promethean Granicus Attachment Harvester")
    parser.add_argument("url", help="Target Granicus Agenda or ViewPublisher URL")
    parser.add_argument("--prefix", default="Cheyenne_PS_Committee_Nov2", help="Output file prefix")
    parser.add_argument("--committee", default="Public Services Committee", help="Committee or Governing Body")
    parser.add_argument("--date", default="2026-11-02", help="Meeting date (YYYY-MM-DD)")
    args = parser.parse_args()
    harvest_and_ingest(args.url, args.prefix, args.committee, args.date)
