"""Fetch ENORA Resilience Map endpoints once, vendor them as snapshots, print their structure.

Usage:  python pipeline/fetch_data.py
Output: data/snapshot/*.json + data/snapshot/MANIFEST.json
"""
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

import requests

BASE = "https://api.enora-oah.eu"
ENDPOINTS = {
    "sites": "/api/sites/all",
    "health_risks": "/api/resilience-map/health-risks",
    "urban_parameters": "/api/resilience-map/urban-parameters",
    "cities": "/api/cities/all",
}
OUT = Path("data/snapshot")


def describe(obj, name):
    """Print a compact view of the JSON structure."""
    print(f"\n=== {name} ===")
    rows = obj
    if isinstance(obj, dict):
        print("top-level keys:", list(obj.keys())[:15])
        # find the first list value, likely the records
        for k, v in obj.items():
            if isinstance(v, list):
                rows = v
                print(f"records under key '{k}'")
                break
    if isinstance(rows, list):
        print("n records:", len(rows))
        if rows and isinstance(rows[0], dict):
            first = rows[0]
            print("n fields:", len(first))
            print("fields:", list(first.keys()))
            print("first record (truncated):")
            print(json.dumps(first, indent=1, default=str)[:1500])


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = {}
    for name, path in ENDPOINTS.items():
        url = BASE + path
        try:
            r = requests.get(url, timeout=60)
            r.raise_for_status()
        except Exception as e:  # keep going so one failure doesn't block the rest
            print(f"[FAIL] {url}: {e}")
            manifest[name] = {"url": url, "error": str(e)}
            continue
        raw = r.content
        (OUT / f"{name}.json").write_bytes(raw)
        manifest[name] = {
            "url": url,
            "fetched_utc": datetime.now(timezone.utc).isoformat(),
            "bytes": len(raw),
            "sha256": hashlib.sha256(raw).hexdigest(),
        }
        print(f"[OK] {url} ({len(raw)} bytes)")
        describe(r.json(), name)
    (OUT / "MANIFEST.json").write_text(json.dumps(manifest, indent=2))
    print("\nManifest written to", OUT / "MANIFEST.json")


if __name__ == "__main__":
    main()