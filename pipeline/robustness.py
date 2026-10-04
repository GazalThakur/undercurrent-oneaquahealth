"""Robustness checks for the 'Blind Spot' claims (stdlib only).

1. Independence of hazards, WITHIN cities, with city-stratified bootstrap CIs
   (this is the headline claim: ARG is not predictable from faecal / pathogen risk).
2. Exploratory covariates (cropland, motorway, living-street, altitude, hospital, sewage distance)
   vs each hazard: within-city Spearman, within-city permutation p, BH over the whole family.
3. Power note: smallest within-city correlation detectable at this n.

Usage (repo root):  python pipeline/robustness.py
Output: printed report + data/robustness_results.json
"""
import json
import math
import operator
import random
import time
from collections import defaultdict
from pathlib import Path
from statistics import NormalDist

SNAP = Path("data/snapshot")
OUT = Path("data/robustness_results.json")
SEED, N_BOOT, N_PERM = 7, 2000, 5000
Q_SUPPORTED, P_SUGGESTIVE = 0.10, 0.05

HAZ = {"pathogen": "scaledPathogenRisk", "faecal": "scaledFecalRisk", "arg": "scaledArgRisk"}
COVARS = {  # name: (label, source)
    "distChampCulture": ("Distance to cropland", "urban"),
    "distanceToMotorwayRoad": ("Distance to motorways", "urban"),
    "distanceToLivingStreetRoad": ("Distance to living-street roads", "urban"),
    "altitude": ("Altitude", "site"),
    "distanceToHospitals": ("Distance to hospitals", "urban"),
    "distanceToSewageStations": ("Distance to sewage stations", "urban"),
}
PAIRS = [("arg", "faecal"), ("arg", "pathogen"), ("faecal", "pathogen"), ("arg", "composite")]


def load(name):
    return json.loads((SNAP / f"{name}.json").read_text(encoding="utf-8"))


def pct_rank(values):
    n = len(values)
    order = sorted(range(n), key=lambda i: values[i])
    ranks = [0.0] * n
    i = 0
    while i < n:
        j = i
        while j + 1 < n and values[order[j + 1]] == values[order[i]]:
            j += 1
        avg = (i + j) / 2 + 1
        for k in range(i, j + 1):
            ranks[order[k]] = avg
        i = j + 1
    return [r / n for r in ranks]


def wc_rank(vals, bounds):
    out = [0.0] * len(vals)
    for s, e in bounds:
        r = pct_rank(vals[s:e])
        m = sum(r) / len(r)
        for k, rr in enumerate(r):
            out[s + k] = rr - m
    return out


def norm(a):
    return math.sqrt(sum(x * x for x in a))


def corr(a, b, na=None, nb=None):
    na = norm(a) if na is None else na
    nb = norm(b) if nb is None else nb
    if na == 0 or nb == 0:
        return 0.0
    return sum(map(operator.mul, a, b)) / (na * nb)


def pooled_spearman(x, y):
    rx, ry = pct_rank(x), pct_rank(y)
    mx, my = sum(rx) / len(rx), sum(ry) / len(ry)
    return corr([v - mx for v in rx], [v - my for v in ry])


def bh(ps):
    m = len(ps)
    order = sorted(range(m), key=lambda i: ps[i])
    q, prev = [0.0] * m, 1.0
    for rank in range(m, 0, -1):
        i = order[rank - 1]
        prev = min(prev, ps[i] * m / rank)
        q[i] = prev
    return q


def pct(v, p):
    v = sorted(v)
    k = (len(v) - 1) * p
    lo, hi = math.floor(k), math.ceil(k)
    return v[lo] + (v[hi] - v[lo]) * (k - lo)


def blocks(cities):
    """Contiguous (start, end) blocks for a city list sorted by city."""
    out, s = [], 0
    for i in range(1, len(cities) + 1):
        if i == len(cities) or cities[i] != cities[s]:
            out.append((s, i))
            s = i
    return out


def main():
    t0 = time.time()
    rng = random.Random(SEED)
    sites = {s["code"]: s for s in load("sites")}
    urban = {u["researchSiteCode"]: u for u in load("urban_parameters")}
    rows = []
    for r in load("health_risks"):
        c = r["researchSiteCode"]
        rows.append({"site": c, "city": sites[c]["city"]["name"], "risk": r, "urban": urban[c], "siterec": sites[c]})
    rows.sort(key=lambda x: (x["city"], x["site"]))
    n = len(rows)
    cities_list = [r["city"] for r in rows]
    cities = sorted(set(cities_list))
    bnds = blocks(cities_list)

    series = {h: [r["risk"][c] for r in rows] for h, c in HAZ.items()}
    series["composite"] = [r["risk"]["healthRiskScore"] for r in rows]

    # ---------------- 1. independence of hazards
    print(f"n = {n} sites, {len(cities)} cities")
    obs_wc, obs_pool = {}, {}
    W = {k: wc_rank(v, bnds) for k, v in series.items()}
    for a, b in PAIRS:
        obs_wc[(a, b)] = corr(W[a], W[b])
        obs_pool[(a, b)] = pooled_spearman(series[a], series[b])

    boots = {p: [] for p in PAIRS}
    for _ in range(N_BOOT):
        bidx = []
        for s, e in bnds:
            bidx += [rng.randrange(s, e) for _ in range(e - s)]
        BW = {k: wc_rank([v[i] for i in bidx], bnds) for k, v in series.items()}
        BN = {k: norm(v) for k, v in BW.items()}
        for a, b in PAIRS:
            boots[(a, b)].append(corr(BW[a], BW[b], BN[a], BN[b]))

    per_city = {}
    for (a, b) in PAIRS:
        per_city[(a, b)] = {}
        for c, (s, e) in zip(cities, bnds):
            ra, rb = pct_rank(series[a][s:e]), pct_rank(series[b][s:e])
            ma, mb = sum(ra) / len(ra), sum(rb) / len(rb)
            per_city[(a, b)][c] = round(corr([x - ma for x in ra], [x - mb for x in rb]), 3)

    independence = []
    for p in PAIRS:
        independence.append({
            "pair": list(p),
            "rho_within_city": round(obs_wc[p], 3),
            "ci95": [round(pct(boots[p], 0.025), 3), round(pct(boots[p], 0.975), 3)],
            "rho_pooled": round(obs_pool[p], 3),
            "per_city": per_city[p],
            "note": "mechanical (composite contains ARG)" if "composite" in p else "",
        })

    # ---------------- 2. exploratory covariates
    tests = []
    for cov, (label, src) in COVARS.items():
        vals = [(r["urban"] if src == "urban" else r["siterec"]).get(cov) for r in rows]
        keep = [i for i in range(n) if vals[i] is not None]
        kb = blocks([cities_list[i] for i in keep])
        x = wc_rank([vals[i] for i in keep], kb)
        nx = norm(x)
        for h in HAZ:
            y = wc_rank([series[h][i] for i in keep], kb)
            ny = norm(y)
            rho = corr(x, y, nx, ny)
            tests.append({"covariate": cov, "label": label, "hazard": h, "rho": rho,
                          "n": len(keep), "_x": x, "_y": y, "_nx": nx, "_ny": ny, "_kb": kb, "_cnt": 0})
    for _ in range(N_PERM):
        cache = {}
        for t in tests:
            key = t["n"], tuple(t["_kb"])
            if key not in cache:
                pi = list(range(t["n"]))
                for s, e in t["_kb"]:
                    seg = pi[s:e]
                    rng.shuffle(seg)
                    pi[s:e] = seg
                cache[key] = pi
            pi = cache[key]
            yp = [t["_y"][i] for i in pi]
            if abs(corr(t["_x"], yp, t["_nx"], t["_ny"])) >= abs(t["rho"]) - 1e-12:
                t["_cnt"] += 1
    qs = bh([(t["_cnt"] + 1) / (N_PERM + 1) for t in tests])
    cov_out = []
    for t, q in zip(tests, qs):
        p = (t["_cnt"] + 1) / (N_PERM + 1)
        ev = "supported" if q <= Q_SUPPORTED else "suggestive" if p <= P_SUGGESTIVE else "none"
        cov_out.append({"covariate": t["covariate"], "label": t["label"], "hazard": t["hazard"],
                        "rho": round(t["rho"], 3), "p": round(p, 4), "q": round(q, 4),
                        "n": t["n"], "evidence": ev, "closer_means_higher": t["rho"] < 0})

    # ---------------- 3. power
    nd = NormalDist()
    n_eff = n - len(cities)
    power = {}
    for alpha in (0.05, 0.01):
        z = (nd.inv_cdf(1 - alpha / 2) + nd.inv_cdf(0.8)) / math.sqrt(n_eff - 3)
        power[f"alpha_{alpha}"] = round(math.tanh(z), 3)

    result = {
        "meta": {"n_sites": n, "n_effective_df": n_eff, "n_bootstrap": N_BOOT, "n_permutations": N_PERM,
                 "family_size_covariates": len(tests), "seed": SEED,
                 "total_distinct_tests_project": 12 + len(tests) - 6},
        "independence": independence, "covariates": cov_out,
        "min_detectable_abs_rho_80pct_power": power,
    }
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(result, indent=1), encoding="utf-8")

    # ---------------- report
    print("\n=== HAZARD INDEPENDENCE (within-city Spearman, 95% stratified bootstrap CI) ===")
    for d in independence:
        a, b = d["pair"]
        pc = " ".join(f"{c[:3]}={v:+.2f}" for c, v in d["per_city"].items())
        print(f"{a:>8} vs {b:<9} within={d['rho_within_city']:+.2f}  CI[{d['ci95'][0]:+.2f}, {d['ci95'][1]:+.2f}]"
              f"  pooled={d['rho_pooled']:+.2f}  {d['note']}")
        print(f"{'':>20}per city: {pc}")

    print(f"\n=== EXPLORATORY COVARIATES (family size = {len(tests)}, BH-corrected) ===")
    print(f"{'hazard':<9}{'covariate':<34}{'rho':>7}{'p':>8}{'q':>8}  {'evidence':<11}direction")
    for c in sorted(cov_out, key=lambda c: c["p"]):
        dirn = "closer => higher" if c["closer_means_higher"] else "closer => lower"
        if c["covariate"] == "altitude":
            dirn = "lower alt => higher" if c["closer_means_higher"] else "higher alt => higher"
        print(f"{c['hazard']:<9}{c['label']:<34}{c['rho']:>+7.2f}{c['p']:>8.3f}{c['q']:>8.3f}  {c['evidence']:<11}{dirn}")

    print("\n=== POWER ===")
    print(f"effective df ~ {n_eff}. Smallest within-city |rho| detectable with 80% power: "
          f"{power['alpha_0.05']} (alpha 0.05), {power['alpha_0.01']} (alpha 0.01)")
    print("=> correlations smaller than this cannot be ruled out; 'no detectable association' != 'no association'.")
    print(f"\nDistinct tests across the project (scale-of-effect 12 + covariates {len(tests)} - 6 shared): "
          f"{result['meta']['total_distinct_tests_project']}")
    print(f"Wrote {OUT}  [{time.time() - t0:.0f}s]")


if __name__ == "__main__":
    main()