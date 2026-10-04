"""Gate check (stdlib only): join snapshot data, validate it, measure hazard divergence.

Usage (from repo root):  python pipeline/divergence_stdlib.py
Output: printed report + data/divergence.csv
"""
import csv
import json
from collections import Counter, defaultdict
from pathlib import Path
from statistics import mean

SNAP = Path("data/snapshot")
HAZ = {"pathogen": "scaledPathogenRisk", "faecal": "scaledFecalRisk", "arg": "scaledArgRisk"}


def load(name):
    return json.loads((SNAP / f"{name}.json").read_text(encoding="utf-8"))


def pct_rank(values):
    """Average-rank percentile in (0, 1], same convention as pandas rank(pct=True)."""
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


def pearson(a, b):
    ma, mb = mean(a), mean(b)
    num = sum((x - ma) * (y - mb) for x, y in zip(a, b))
    da = sum((x - ma) ** 2 for x in a) ** 0.5
    db = sum((y - mb) ** 2 for y in b) ** 0.5
    return num / (da * db) if da and db else float("nan")


def spearman(a, b):
    return pearson(pct_rank(a), pct_rank(b))


def validate(sites, risk, urban):
    print("=== JOIN / DATA CHECKS ===")
    print(f"sites: {len(sites)} | risk: {len(risk)} | urban: {len(urban)}")
    for name, rows, key in [("sites", sites, "code"), ("risk", risk, "researchSiteCode"),
                            ("urban", urban, "researchSiteCode")]:
        dup = [k for k, c in Counter(r[key] for r in rows).items() if c > 1]
        print(f"duplicate site codes in {name}: {dup}")
    s = {r["code"] for r in sites}
    r_ = {r["researchSiteCode"] for r in risk}
    u = {r["researchSiteCode"] for r in urban}
    print(f"risk sites missing from sites: {sorted(r_ - s)}")
    print(f"risk sites missing urban params: {sorted(r_ - u)}")
    print(f"urban sites without risk data: {sorted(u - r_)}")
    print(f"sites without risk data: {sorted(s - r_)}")
    for col in list(HAZ.values()) + ["healthRiskScore"]:
        print(f"missing {col}: {sum(1 for r in risk if r.get(col) is None)}")
    dates = Counter((r.get("samplingDate") or "none")[:7] for r in risk)
    print("sampling months (risk):", dict(sorted(dates.items())))


def urban_sanity(urban):
    print("\n=== URBAN PARAMETER SANITY ===")
    cols = urban[0].keys()
    pct_cols = [c for c in cols if c.startswith(("imperviousPct", "urbanPct"))]
    frac_cols = [c for c in cols if c.startswith("vegCoverFrac")]
    pd_cols = [c for c in cols if c.startswith("patchDensity") and "Veg" not in c]

    def col_max(c):
        v = [r[c] for r in urban if r.get(c) is not None]
        return round(max(v), 2) if v else None

    over = sum(1 for r in urban for c in pct_cols if (r.get(c) or 0) > 100)
    print("pct values > 100:", over)
    print("vegCoverFrac max by radius:", {c: col_max(c) for c in frac_cols})
    print("(values > 1 => units unclear; check ENORA docs before using)")
    print("patchDensity (non-veg) max:", {c: col_max(c) for c in pd_cols})
    miss = {c: sum(1 for r in urban if r.get(c) is None) for c in cols}
    print("columns with missing values:", {c: n for c, n in miss.items() if n})


def main():
    sites = load("sites")
    risk = load("health_risks")
    urban = load("urban_parameters")
    validate(sites, risk, urban)

    city = {s["code"]: (s["city"]["name"] if isinstance(s.get("city"), dict) else None) for s in sites}
    rows = [r for r in risk if all(r.get(c) is not None for c in list(HAZ.values()) + ["healthRiskScore"])]
    n = len(rows)

    # composite vs plain mean
    diffs = [abs(r["healthRiskScore"] - mean(r[c] for c in HAZ.values())) for r in rows]
    print("\n=== COMPOSITE vs MEAN OF 3 COMPONENTS ===")
    print(f"max abs diff: {max(diffs):.4f} | mean abs diff: {mean(diffs):.4f}")
    print("(near zero => composite is a plain mean)")

    # percentiles
    pcts = {k: pct_rank([r[c] for r in rows]) for k, c in HAZ.items()}
    comp_pct = pct_rank([r["healthRiskScore"] for r in rows])

    out = []
    for i, r in enumerate(rows):
        d = {
            "site": r["researchSiteCode"],
            "city": city.get(r["researchSiteCode"]),
            "pathogen": r["scaledPathogenRisk"],
            "faecal": r["scaledFecalRisk"],
            "arg": r["scaledArgRisk"],
            "composite": r["healthRiskScore"],
            "pathogen_pct": round(pcts["pathogen"][i], 3),
            "faecal_pct": round(pcts["faecal"][i], 3),
            "arg_pct": round(pcts["arg"][i], 3),
            "comp_pct": round(comp_pct[i], 3),
        }
        max_c = max(pcts[k][i] for k in HAZ)
        d["rule_gap"] = (max_c - comp_pct[i]) >= 0.5
        d["rule_hidden_arg"] = pcts["faecal"][i] <= 0.25 and pcts["arg"][i] >= 0.75
        d["arg_gap"] = round(pcts["arg"][i] - comp_pct[i], 3)
        d["divergent"] = d["rule_gap"] or d["rule_hidden_arg"]
        out.append(d)

    print(f"\n=== DIVERGENCE COUNTS (n={n}) ===")
    print("any component >=2 quartiles above composite:", sum(d["rule_gap"] for d in out))
    print("faecal bottom quartile & ARG top quartile:", sum(d["rule_hidden_arg"] for d in out))
    print("ARG >=2 quartiles above composite:", sum(d["arg_gap"] >= 0.5 for d in out))
    print("divergent (either rule):", sum(d["divergent"] for d in out))
    by_city = defaultdict(lambda: [0, 0])
    for d in out:
        by_city[d["city"]][0] += d["divergent"]
        by_city[d["city"]][1] += 1
    print("by city (divergent / total):", {k: f"{v[0]}/{v[1]}" for k, v in by_city.items()})

    print("\n=== COMPONENT CORRELATIONS (Spearman) ===")
    series = {k: [r[c] for r in rows] for k, c in HAZ.items()}
    series["composite"] = [r["healthRiskScore"] for r in rows]
    names = list(series)
    print(" " * 11 + "".join(f"{x:>11}" for x in names))
    for a in names:
        print(f"{a:>11}" + "".join(f"{spearman(series[a], series[b]):>11.2f}" for b in names))

    hdr = f"{'site':<6}{'city':<10}{'path':>7}{'faec':>7}{'arg':>7}{'comp':>7}{'comp%':>7}{'arg%':>7}{'faec%':>7}"

    def line(d):
        return (f"{d['site']:<6}{(d['city'] or '?'):<10}{d['pathogen']:>7.3f}{d['faecal']:>7.3f}"
                f"{d['arg']:>7.3f}{d['composite']:>7.3f}{d['comp_pct']:>7.2f}{d['arg_pct']:>7.2f}{d['faecal_pct']:>7.2f}")

    print("\n=== TOP DIVERGENT SITES (by ARG gap) ===")
    print(hdr)
    for d in sorted([d for d in out if d["divergent"]], key=lambda d: -d["arg_gap"])[:15]:
        print(line(d))

    print("\n=== EXAMPLE SITES FROM THE PLAN ===")
    print(hdr)
    ex = [d for d in out if d["site"] in ("T10", "T12", "O14")]
    for d in ex:
        print(line(d))
    if not ex:
        print("none found")

    urban_sanity(urban)

    Path("data").mkdir(exist_ok=True)
    with open("data/divergence.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(out[0].keys()))
        w.writeheader()
        w.writerows(out)
    print("\nWrote data/divergence.csv")


if __name__ == "__main__":
    main()