"""Fetch OpenStreetMap features near each site (one Overpass query per city) and count them
within 250 / 500 / 1000 m of each site.

Counts use feature centroids (large parks may be under-counted). Radii are presentation
choices ('nearby'), NOT analysis-derived risk zones.

Usage (repo root, needs internet):  python pipeline/fetch_osm.py
Output: data/osm_exposure.json
"""
import hashlib
import json
import math
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

SNAP = Path("data/snapshot")
OUT = Path("data/osm_exposure.json")
ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]
RADII = [250, 500, 1000]
MARGIN = 0.03  # degrees (~3 km) around the sites of a city
UA = {"User-Agent": "blind-spot-hackathon/1.0 (IEEE OneAquaHealth hackathon prototype)"}

CATEGORIES = {  # category: (osm key, osm value)
    "school": ("amenity", "school"),
    "kindergarten": ("amenity", "kindergarten"),
    "playground": ("leisure", "playground"),
    "park": ("leisure", "park"),
    "allotments": ("landuse", "allotments"),
}


def classify(tags):
    for cat, (k, v) in CATEGORIES.items():
        if tags.get(k) == v:
            return cat
    return None


def haversine(lat1, lon1, lat2, lon2):
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def build_query(south, west, north, east):
    bbox = f"({south:.5f},{west:.5f},{north:.5f},{east:.5f})"
    parts = "".join(f'  nwr["{k}"="{v}"]{bbox};\n' for k, v in CATEGORIES.values())
    return f"[out:json][timeout:120];\n(\n{parts});\nout center tags;"


def compute_exposure(elements, sites):
    """elements: Overpass elements; sites: {code: (lat, lon)} -> {code: {counts, features}}.

    Per site, same-named features of one category are merged (nearest kept), because OSM often
    maps one park or school as several polygons. Unnamed features cannot be merged, so counts
    are upper bounds. `features` lists everything within the largest radius, sorted by distance.
    """
    feats, seen = [], set()
    for el in elements:
        key = (el.get("type"), el.get("id"))
        if key in seen:
            continue
        seen.add(key)
        tags = el.get("tags", {})
        cat = classify(tags)
        if not cat:
            continue
        lat = el.get("lat") or (el.get("center") or {}).get("lat")
        lon = el.get("lon") or (el.get("center") or {}).get("lon")
        if lat is None or lon is None:
            continue
        feats.append((cat, tags.get("name"), lat, lon))

    out = {}
    for code, (slat, slon) in sites.items():
        best, unnamed = {}, []
        for cat, name, lat, lon in feats:
            d = round(haversine(slat, slon, lat, lon))
            if d > max(RADII):
                continue
            if name:
                k = (cat, name)
                if k not in best or d < best[k]:
                    best[k] = d
            else:
                unnamed.append({"category": cat, "name": None, "distance_m": d})
        items = [{"category": c, "name": n, "distance_m": d} for (c, n), d in best.items()] + unnamed
        items.sort(key=lambda x: (x["distance_m"], x["category"]))
        counts = {str(r): {c: 0 for c in CATEGORIES} for r in RADII}
        for it in items:
            for r in RADII:
                if it["distance_m"] <= r:
                    counts[str(r)][it["category"]] += 1
        out[code] = {"counts": counts, "features": items}
    return out


def fetch_city(query):
    last = None
    for ep in ENDPOINTS:
        for attempt in range(3):
            try:
                body = urllib.parse.urlencode({"data": query}).encode()
                req = urllib.request.Request(ep, data=body, headers=UA)
                with urllib.request.urlopen(req, timeout=180) as resp:
                    return json.loads(resp.read().decode("utf-8"))["elements"], ep
            except urllib.error.HTTPError as e:
                last = f"{ep} -> HTTP {e.code}"
            except Exception as e:  # noqa: BLE001
                last = f"{ep} -> {e}"
            time.sleep(5 * (attempt + 1))
    raise SystemExit(f"Overpass failed: {last}")


def main():
    sites = {s["code"]: s for s in json.loads((SNAP / "sites.json").read_text(encoding="utf-8"))}
    risk_codes = [r["researchSiteCode"] for r in json.loads((SNAP / "health_risks.json").read_text(encoding="utf-8"))]
    by_city = defaultdict(dict)
    for c in risk_codes:
        s = sites[c]
        by_city[s["city"]["name"]][c] = (s["latitude"], s["longitude"])

    result, queries, raw_counts = {}, [], {}
    for city, pts in sorted(by_city.items()):
        lats, lons = [p[0] for p in pts.values()], [p[1] for p in pts.values()]
        q = build_query(min(lats) - MARGIN, min(lons) - MARGIN, max(lats) + MARGIN, max(lons) + MARGIN)
        queries.append(q)
        print(f"{city}: {len(pts)} sites, querying Overpass ...")
        elements, ep = fetch_city(q)
        print(f"  {len(elements)} raw elements from {ep}")
        raw_counts[city] = len(elements)
        result.update(compute_exposure(elements, pts))
        time.sleep(3)

    payload = {
        "meta": {
            "fetched_utc": datetime.now(timezone.utc).isoformat(),
            "radii_m": RADII,
            "categories": list(CATEGORIES),
            "method": ("Feature centroid within radius of site coordinates (haversine). Same-named features of one category are merged "
                       "per site (nearest kept); unnamed features cannot be merged, so counts are upper bounds. "
                       "Large parks may be under-counted."),
            "raw_elements_per_city": raw_counts,
            "query_sha256": hashlib.sha256("\n".join(queries).encode()).hexdigest(),
            "attribution": "(c) OpenStreetMap contributors, ODbL 1.0",
        },
        "sites": result,
    }
    OUT.write_text(json.dumps(payload, indent=1, ensure_ascii=False), encoding="utf-8")
    tot = {c: sum(v["counts"]["500"][c] for v in result.values()) for c in CATEGORIES}
    print("\nWrote", OUT, "| total features within 500 m summed over sites:", tot)


if __name__ == "__main__":
    main()