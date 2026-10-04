"""Scale-of-effect analysis (stdlib only).

For each hazard (pathogen / faecal / ARG) and each landscape metric family, finds the buffer
radius at which landscape pressure is most associated with the hazard, WITHIN cities, and
reports how trustworthy that radius is.

Design (kept deliberately conservative for n=96):
  * City adjustment : hazard and metric are rank-transformed within each city, so between-city
                      differences cannot drive the result.
  * Radius choice   : argmax |Spearman| across the 8 nested buffers.
  * Multiplicity    : permutation (within city) of the MAX |rho| over radii -> p adjusted for
                      picking the best of 8 radii; Benjamini-Hochberg across the 12 tests.
  * Radius stability: stratified (by city) bootstrap of the argmax radius.
  * Robustness      : leave-one-city-out best radius and sign.
  * Mechanistic     : distance to hospitals / sewage stations vs each hazard.

Usage (repo root):  python pipeline/scale_of_effect.py
Output: printed report + data/scale_results.json
"""
import json
import math
import operator
import random
import time
from collections import Counter, defaultdict
from pathlib import Path

SNAP = Path("data/snapshot")
OUT = Path("data/scale_results.json")
SEED, N_BOOT, N_PERM = 42, 1000, 2000
Q_SUPPORTED, P_SUGGESTIVE = 0.10, 0.05

RADII = [50, 100, 250, 500, 750, 1000, 1500, 2000]
FAMILIES = {
    "imperviousPct": "Impervious cover",
    "urbanPct": "Urban cover",
    "vegCoverFrac": "Vegetation cover",
    "humanDensityProxy": "Human density proxy",
}
HAZ = {"pathogen": "scaledPathogenRisk", "faecal": "scaledFecalRisk", "arg": "scaledArgRisk"}
DISTS = {"distanceToHospitals": "Distance to hospitals",
         "distanceToSewageStations": "Distance to sewage stations"}


# ---------------------------------------------------------------- helpers
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
    """Within-city percentile ranks, centred per city (removes city level)."""
    out = [0.0] * len(vals)
    for s, e in bounds:
        r = pct_rank(vals[s:e])
        m = sum(r) / len(r)
        for k, rr in enumerate(r):
            out[s + k] = rr - m
    return out


def norm(a):
    return math.sqrt(sum(x * x for x in a))


def corr(a, b, na, nb):
    if na == 0 or nb == 0:
        return 0.0
    return sum(map(operator.mul, a, b)) / (na * nb)


def corr_idx(a, b, idx):
    sa = math.sqrt(sum(a[i] * a[i] for i in idx))
    sb = math.sqrt(sum(b[i] * b[i] for i in idx))
    if sa == 0 or sb == 0:
        return 0.0
    return sum(a[i] * b[i] for i in idx) / (sa * sb)


def pooled_spearman(x, y):
    rx, ry = pct_rank(x), pct_rank(y)
    mx, my = sum(rx) / len(rx), sum(ry) / len(ry)
    a = [v - mx for v in rx]
    b = [v - my for v in ry]
    return corr(a, b, norm(a), norm(b))


def bh(ps):
    m = len(ps)
    order = sorted(range(m), key=lambda i: ps[i])
    q, prev = [0.0] * m, 1.0
    for rank in range(m, 0, -1):
        i = order[rank - 1]
        prev = min(prev, ps[i] * m / rank)
        q[i] = prev
    return q


def scale_label(freq):
    top = max(freq)
    i = freq.index(top)
    if top >= 0.5:
        return "well-defined", [RADII[i], RADII[i]]
    k = max(range(len(freq) - 1), key=lambda j: freq[j] + freq[j + 1])
    if freq[k] + freq[k + 1] >= 0.7:
        return "broad", [RADII[k], RADII[k + 1]]
    return "unresolved", None


# ---------------------------------------------------------------- data
def build():
    sites = {s["code"]: s for s in load("sites")}
    urban = {u["researchSiteCode"]: u for u in load("urban_parameters")}
    rows = []
    for r in load("health_risks"):
        code = r["researchSiteCode"]
        s, u = sites[code], urban[code]
        rows.append({"site": code, "city": s["city"]["name"], "risk": r, "urban": u})
    rows.sort(key=lambda x: (x["city"], x["site"]))  # contiguous city blocks

    cols = [f"{f}{r}m" for f in FAMILIES for r in RADII] + list(DISTS)
    bad = {c for row in rows for c in cols if row["urban"].get(c) is None}
    if bad:
        raise SystemExit(f"Missing values in used columns: {sorted(bad)}")

    bounds, start = [], 0
    for city, grp in groupby_city(rows):
        bounds.append((city, start, start + len(grp)))
        start += len(grp)
    return rows, bounds


def groupby_city(rows):
    out = defaultdict(list)
    for r in rows:
        out[r["city"]].append(r)
    return sorted(out.items())


# ---------------------------------------------------------------- main
def main():
    t0 = time.time()
    rng = random.Random(SEED)
    rows, cb = build()
    n = len(rows)
    cities = [c for c, _, _ in cb]
    bounds = [(s, e) for _, s, e in cb]

    # season / city diagnostic
    season = defaultdict(Counter)
    for r in rows:
        season[r["city"]][r["risk"]["samplingDate"][:7]] += 1
    print(f"n = {n} sites, {len(cities)} cities")
    print("\n=== SAMPLING MONTH BY CITY (season is confounded with city if one month per city) ===")
    for c in cities:
        print(f"{c:<10}", dict(sorted(season[c].items())))

    # raw vectors
    raw_h = {h: [r["risk"][col] for r in rows] for h, col in HAZ.items()}
    raw_m = {(f, rad): [r["urban"][f"{f}{rad}m"] for r in rows] for f in FAMILIES for rad in RADII}
    raw_d = {d: [r["urban"][d] for r in rows] for d in DISTS}

    # observed (within-city ranked)
    H = {h: wc_rank(v, bounds) for h, v in raw_h.items()}
    Hn = {h: norm(v) for h, v in H.items()}
    M = {k: wc_rank(v, bounds) for k, v in raw_m.items()}
    Mn = {k: norm(v) for k, v in M.items()}
    D = {d: wc_rank(v, bounds) for d, v in raw_d.items()}
    Dn = {d: norm(v) for d, v in D.items()}

    obs = {(h, f): [corr(H[h], M[(f, r)], Hn[h], Mn[(f, r)]) for r in RADII] for h in HAZ for f in FAMILIES}
    obs_max = {k: max(abs(x) for x in v) for k, v in obs.items()}
    obs_d = {(h, d): corr(H[h], D[d], Hn[h], Dn[d]) for h in HAZ for d in DISTS}
    pooled = {(h, f): [pooled_spearman(raw_h[h], raw_m[(f, r)]) for r in RADII] for h in HAZ for f in FAMILIES}

    # permutation (within city): max over radii, plus distance tests
    print(f"\nPermutations ({N_PERM}) ...")
    cnt = Counter()
    cnt_d = Counter()
    for _ in range(N_PERM):
        pi = list(range(n))
        for s, e in bounds:
            seg = pi[s:e]
            rng.shuffle(seg)
            pi[s:e] = seg
        for h in HAZ:
            hp = [H[h][i] for i in pi]
            for f in FAMILIES:
                m = max(abs(corr(hp, M[(f, r)], Hn[h], Mn[(f, r)])) for r in RADII)
                if m >= obs_max[(h, f)] - 1e-12:
                    cnt[(h, f)] += 1
            for d in DISTS:
                if abs(corr(hp, D[d], Hn[h], Dn[d])) >= abs(obs_d[(h, d)]) - 1e-12:
                    cnt_d[(h, d)] += 1
    p_adj = {k: (cnt[k] + 1) / (N_PERM + 1) for k in obs}
    p_d = {k: (cnt_d[k] + 1) / (N_PERM + 1) for k in obs_d}
    keys = list(obs)
    q_vals = dict(zip(keys, bh([p_adj[k] for k in keys])))
    dkeys = list(obs_d)
    qd_vals = dict(zip(dkeys, bh([p_d[k] for k in dkeys])))

    # stratified bootstrap of the best radius
    print(f"Bootstrap ({N_BOOT}) ...")
    boot = {k: [0] * len(RADII) for k in obs}
    for _ in range(N_BOOT):
        bidx = []
        for s, e in bounds:
            bidx += [rng.randrange(s, e) for _ in range(e - s)]
        bh_ = {h: wc_rank([raw_h[h][i] for i in bidx], bounds) for h in HAZ}
        bhn = {h: norm(v) for h, v in bh_.items()}
        bm = {k: wc_rank([v[i] for i in bidx], bounds) for k, v in raw_m.items()}
        bmn = {k: norm(v) for k, v in bm.items()}
        for h in HAZ:
            for f in FAMILIES:
                rs = [abs(corr(bh_[h], bm[(f, r)], bhn[h], bmn[(f, r)])) for r in RADII]
                if max(rs) > 0:
                    boot[(h, f)][rs.index(max(rs))] += 1

    # leave-one-city-out
    loco = {}
    for k in obs:
        h, f = k
        res = {}
        for c, s, e in cb:
            idx = [i for i in range(n) if not (s <= i < e)]
            rs = [corr_idx(H[h], M[(f, r)], idx) for r in RADII]
            j = max(range(len(RADII)), key=lambda x: abs(rs[x]))
            res[c] = {"best_radius": RADII[j], "rho": round(rs[j], 3)}
        loco[k] = res

    # assemble
    combos = []
    for k in keys:
        h, f = k
        rhos = obs[k]
        j = max(range(len(RADII)), key=lambda x: abs(rhos[x]))
        freq = [b / N_BOOT for b in boot[k]]
        lab, rng_ = scale_label(freq)
        sign = 1 if rhos[j] >= 0 else -1
        same_sign = sum(1 for c in cities if (loco[k][c]["rho"] >= 0) == (sign > 0))
        ev = ("supported" if q_vals[k] <= Q_SUPPORTED
              else "suggestive" if p_adj[k] <= P_SUGGESTIVE else "none")
        combos.append({
            "hazard": h, "family": f, "label": FAMILIES[f],
            "rho_by_radius": [round(x, 3) for x in rhos],
            "rho_pooled_by_radius": [round(x, 3) for x in pooled[k]],
            "best_radius": RADII[j], "rho_best": round(rhos[j], 3),
            "p_adj_radius": round(p_adj[k], 4), "q": round(q_vals[k], 4), "evidence": ev,
            "boot_freq": [round(x, 3) for x in freq],
            "scale_label": lab, "scale_range": rng_,
            "loco": loco[k], "loco_same_sign": same_sign,
        })

    primary = {}
    for h in HAZ:
        cand = [c for c in combos if c["hazard"] == h and c["evidence"] != "none"]
        cand.sort(key=lambda c: (c["evidence"] != "supported", c["p_adj_radius"], -abs(c["rho_best"])))
        primary[h] = cand[0] if cand else None

    mech = []
    for k in dkeys:
        h, d = k
        mech.append({"hazard": h, "variable": d, "label": DISTS[d], "rho": round(obs_d[k], 3),
                     "p": round(p_d[k], 4), "q": round(qd_vals[k], 4),
                     "closer_means_higher": obs_d[k] < 0})

    result = {
        "meta": {
            "n_sites": n, "cities": cities, "radii_m": RADII, "seed": SEED,
            "n_bootstrap": N_BOOT, "n_permutations": N_PERM,
            "method": ("Spearman within city (ranks computed per city). Best radius = argmax |rho| over 8 "
                       "nested buffers. p adjusted for radius selection via within-city permutation of "
                       "max|rho|; BH across 12 hazard x metric tests. Radius stability via city-stratified "
                       "bootstrap. Cross-sectional, one sampling date per site: association, not causation."),
            "thresholds": {"supported_q": Q_SUPPORTED, "suggestive_p": P_SUGGESTIVE},
        },
        "seasonality": {c: dict(season[c]) for c in cities},
        "combos": combos, "primary": primary, "mechanistic": mech,
    }
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(result, indent=1), encoding="utf-8")

    # ------------------------------------------------------------ report
    print("\n=== SCALE OF EFFECT (within-city Spearman) ===")
    print(f"{'hazard':<9}{'metric':<20}{'best r':>7}{'rho':>7}{'p_adj':>8}{'q':>7}  {'evidence':<11}{'scale (boot)':<24}LOCO")
    for c in sorted(combos, key=lambda c: (c["hazard"], c["p_adj_radius"])):
        top = max(c["boot_freq"])
        sc = f"{c['scale_label']} ({top:.2f})"
        print(f"{c['hazard']:<9}{c['label']:<20}{c['best_radius']:>6}m{c['rho_best']:>7.2f}"
              f"{c['p_adj_radius']:>8.3f}{c['q']:>7.3f}  {c['evidence']:<11}{sc:<24}{c['loco_same_sign']}/{len(cities)} same sign")

    print("\n=== PRIMARY FINDING PER HAZARD ===")
    for h, c in primary.items():
        if not c:
            print(f"{h:<9}: no metric passes (no detectable landscape association at this n)")
            continue
        print(f"{h:<9}: {c['label']} | best {c['best_radius']} m | rho={c['rho_best']:+.2f} | "
              f"q={c['q']:.3f} | {c['evidence']} | scale {c['scale_label']} {c['scale_range']}")
        print("          rho by radius :", dict(zip(RADII, c["rho_by_radius"])))
        print("          pooled (no city adj.):", dict(zip(RADII, c["rho_pooled_by_radius"])))
        print("          bootstrap freq:", dict(zip(RADII, c["boot_freq"])))
        print("          LOCO best r   :", {k: v["best_radius"] for k, v in c["loco"].items()})

    print("\n=== MECHANISTIC CHECKS (closer to source => higher hazard expected) ===")
    for m in sorted(mech, key=lambda m: (m["hazard"], m["p"])):
        flag = "as expected" if m["closer_means_higher"] else "opposite"
        print(f"{m['hazard']:<9}{m['label']:<26} rho={m['rho']:+.2f}  p={m['p']:.3f}  q={m['q']:.3f}  ({flag})")

    print(f"\nWrote {OUT}  [{time.time() - t0:.0f}s]")


if __name__ == "__main__":
    main()