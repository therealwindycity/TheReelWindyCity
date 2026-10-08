"""Snapshot the public GitHub repositories behind Civic Cheyenne.

For each repository (by default, every repository in the README's data table
under github.com/therealwindycity), this script requests its metadata from the
GitHub REST API and writes one JSON record per repository. Each record keeps
the exact URL requested, the UTC capture time, the HTTP status, the parsed
response, and any error. Failed attempts are recorded too, so an outage shows
up in the log instead of leaving a silent gap.

Standard library only; nothing to install.

Usage, from the repository root:
    python3 scripts/audit/run_audit.py
    python3 scripts/audit/run_audit.py --repo TheReelWindyCity
    python3 scripts/audit/run_audit.py --out /some/other/dir

Records go to .cache/audit/ by default, which is git-ignored. The exit status
is 0 only when every requested repository was fetched and parsed as JSON.
"""

import argparse
import http.client
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

OWNER = "therealwindycity"

# Repositories named in the README's "Data" table, with this repository first.
REPOSITORIES = [
    "TheReelWindyCity",
    "The-Real-Windy-City-",
    "cheyenne-archives-2025-2026",
    "cheyenne-archives-2023-2024",
    "cheyenne-archives-2022",
    "cheyenne-archives-2018-2021",
    "cheyenne-archives-2014-2017",
    "cheyenne-archives-2008-2013",
]

API_ROOT = "https://api.github.com"
REQUEST_HEADERS = {
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    # Identify the project honestly, as the other scripts in scripts/ do.
    "User-Agent": (
        "civic-cheyenne-audit/1.0 (+https://github.com/therealwindycity/TheReelWindyCity)"
    ),
}
TIMEOUT_SECONDS = 15

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUT_DIR = REPO_ROOT / ".cache" / "audit"
REPO_NAME_PATTERN = re.compile(r"[A-Za-z0-9_][A-Za-z0-9._-]*")


def utc_now():
    return datetime.now(timezone.utc)


def github_error_message(exc):
    """GitHub explains most error responses in the JSON 'message' field."""
    try:
        message = json.loads(exc.read().decode("utf-8")).get("message")
    except (OSError, http.client.HTTPException, ValueError, AttributeError):
        return None
    return message if isinstance(message, str) else None


def fetch_repository(owner, repo):
    """Request one repository's API metadata and return a record of the attempt."""
    url = f"{API_ROOT}/repos/{urllib.parse.quote(owner)}/{urllib.parse.quote(repo)}"
    record = {
        "repository": f"{owner}/{repo}",
        "source_url": url,
        "captured_utc": utc_now().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "http_status": None,
        "ok": False,
        "error": None,
        "data": None,
    }

    request = urllib.request.Request(url, headers=REQUEST_HEADERS)
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            record["http_status"] = response.status
            body = response.read()
    except urllib.error.HTTPError as exc:
        record["http_status"] = exc.code
        detail = github_error_message(exc)
        record["error"] = f"HTTP {exc.code} {exc.reason}" + (f": {detail}" if detail else "")
        return record
    except (OSError, http.client.HTTPException) as exc:
        record["error"] = f"network error: {exc}"
        return record

    try:
        record["data"] = json.loads(body.decode("utf-8"))
    except ValueError as exc:
        record["error"] = f"response was not JSON: {exc}"
        return record

    record["ok"] = True
    return record


def write_json_atomic(path, payload):
    """Write to a temporary file, then rename, so a crash never leaves a partial record."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_name(path.name + ".tmp")
    tmp_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    os.replace(tmp_path, path)


def repo_name(value):
    if not REPO_NAME_PATTERN.fullmatch(value):
        raise argparse.ArgumentTypeError(f"not a repository name: {value!r}")
    return value


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Snapshot GitHub metadata for the Civic Cheyenne repositories."
    )
    parser.add_argument(
        "--repo",
        action="append",
        type=repo_name,
        metavar="NAME",
        help=f"repository under github.com/{OWNER} (repeatable; default: all {len(REPOSITORIES)})",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=DEFAULT_OUT_DIR,
        metavar="DIR",
        help="output directory (default: .cache/audit under the repository root)",
    )
    args = parser.parse_args(argv)

    repos = args.repo or REPOSITORIES
    run_stamp = utc_now().strftime("%Y-%m-%d_%H%M%S")
    failures = 0

    for repo in repos:
        print(f"[*] GET {API_ROOT}/repos/{OWNER}/{repo}")
        record = fetch_repository(OWNER, repo)
        path = args.out / f"audit_log_{repo}_{run_stamp}.json"
        write_json_atomic(path, record)
        if record["ok"]:
            print(f"[+] {record['repository']}: HTTP {record['http_status']}, saved {path}")
        else:
            failures += 1
            print(f"[!] {record['repository']}: {record['error']} (recorded in {path})")

    print(f"[=] {len(repos) - failures} of {len(repos)} repositories fetched and parsed")
    return 0 if failures == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
