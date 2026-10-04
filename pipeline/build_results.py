"""Build results.json for the Blind Spot frontend (stdlib only).

Reads: data/snapshot/*.json, data/scale_results.json, data/robustness_results.json,
       data/osm_exposure.json (optional)
Writes: data/results.json and web/public/results.json

Every number shown in the UI comes from this file. Insight sentences are deterministic templates.

Usage (repo root):  python pipeline/build_results.py
"""
import json
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

SNAP, DATA = Path("data/snapshot"), Path("data")
OUT_PATHS = [DATA / "results.json", Path("web/public/results.json")]

HAZ = {"pathogen": "scaledPathogenRisk", "faecal": "scaledFecalRisk", "arg": "scaledArgRisk"}
HAZ_LABEL = {"pathogen": "pathogen risk", "faecal": "faecal risk",
             "arg": "antimicrobial-resistance gene (ARG) risk"}
GAP, HI, LO = 0.5, 0.75, 0.25  # rank-position thresholds
BORDER = 3  # rank positions that count as "near a threshold"


def load(p):
    return json.loads(Path(p).read_text(encoding="utf-8"))


def avg_ranks(values):
    """1-based average ranks (ties averaged); rank n = highest value."""
    n = len(values)
    order = sorted(range(n), key=lambda i: values[i])
    ranks = [0.0] * n
    i = 0
    while i < n:
        j = i
        while j + 1 < n and values[order[j + 1]] == values[order[i]]:
            j += 1
        for k in range(i, j + 1):
            ranks[order[k]] = (i + j) / 2 + 1
        i = j + 1
    return ranks


def ordinal(k):
    k = int(k)
    suf = "th" if 10 <= k % 100 <= 20 else {1: "st", 2: "nd", 3: "rd"}.get(k % 10, "th")
    return f"{k}{suf}"


def hi_rank(r, n):  # "Nth highest of n"
    return int(n + 1 - r + 0.5)


def lo_rank(r):  # "Nth lowest"
    return int(r + 0.5)


def strength(r, n):
    p = r / n
    return "high" if p >= HI else "moderately elevated" if p >= 0.6 else "average"


def pos(rank, n, direction, tied):
    """'the 7th highest' (or 'around the 7th highest' when several sites share the score)."""
    k = hi_rank(rank, n) if direction == "hi" else lo_rank(rank)
    return f"{'around ' if tied else ''}the {ordinal(k)} {'highest' if direction == 'hi' else 'lowest'}"


def sentence(s, n):
    """Deterministic insight sentence. s has ranks r_* (avg ranks), scores and tie flags."""
    c, code = s["city"], s["site"]
    rc, comp, t = s["r_comp"], s["scores"]["composite"], s["_ties"]
    if s["flag_type"] == "masked_arg":
        clause = ("so the composite understates it" if rc / n <= 0.5
                  else "so the composite does not hide it, but faecal indicators alone would not have signalled it")
        return (f"{code} ({c}): faecal risk is low ({pos(s['r_faecal'], n, 'lo', t['faecal'])} of {n}) but "
                f"resistance-gene (ARG) risk is {strength(s['r_arg'], n)} ({pos(s['r_arg'], n, 'hi', t['arg'])} of {n}). "
                f"The composite score of {comp:.2f} ranks {pos(rc, n, 'hi', t['comp'])} of {n}, {clause}. "
                f"In this dataset ARG risk is not predicted by faecal risk or land cover, so this site is a candidate for direct ARG testing.")
    h = s["hidden_hazard"]
    rh = s[f"r_{h}"]
    tail = (" ARG risk cannot be inferred from faecal indicators or land cover in this dataset."
            if h == "arg" else "")
    return (f"{code} ({c}): {HAZ_LABEL[h]} is {strength(rh, n)} ({pos(rh, n, 'hi', t[h])} of {n}), "
            f"but the composite score of {comp:.2f} ranks only {pos(rc, n, 'hi', t['comp'])} of {n} because the other "
            f"components are lower. The composite averages this signal away.{tail}")


def fmt_ci(d):
    return f"{d['rho_within_city']:+.2f}, 95% CI {d['ci95'][0]:+.2f} to {d['ci95'][1]:+.2f}"


def main():
    sites = {s["code"]: s for s in load(SNAP / "sites.json")}
    risk = sorted(load(SNAP / "health_risks.json"), key=lambda r: r["researchSiteCode"])
    n = len(risk)
    rk = {h: avg_ranks([r[col] for r in risk]) for h, col in HAZ.items()}
    rk["comp"] = avg_ranks([r["healthRiskScore"] for r in risk])

    tie_ct = {k: Counter(v) for k, v in {**{h: [r[c] for r in risk] for h, c in HAZ.items()},
                                        "comp": [r["healthRiskScore"] for r in risk]}.items()}
    osm = load(DATA / "osm_exposure.json") if (DATA / "osm_exposure.json").exists() else None

    out_sites = []
    for i, r in enumerate(risk):
        code = r["researchSiteCode"]
        s = sites[code]
        rec = {
            "site": code, "name": s.get("name"), "city": s["city"]["name"],
            "lat": s["latitude"], "lon": s["longitude"],
            "sampling_month": (r.get("samplingDate") or "")[:7],
            "scores": {"pathogen": r["scaledPathogenRisk"], "faecal": r["scaledFecalRisk"],
                       "arg": r["scaledArgRisk"], "composite": r["healthRiskScore"]},
            "r_pathogen": rk["pathogen"][i], "r_faecal": rk["faecal"][i],
            "r_arg": rk["arg"][i], "r_comp": rk["comp"][i],
            "_ties": {"pathogen": tie_ct["pathogen"][r["scaledPathogenRisk"]] > 1,
                      "faecal": tie_ct["faecal"][r["scaledFecalRisk"]] > 1,
                      "arg": tie_ct["arg"][r["scaledArgRisk"]] > 1,
                      "comp": tie_ct["comp"][r["healthRiskScore"]] > 1},
        }
        rec["percentiles"] = {k: round(rk[v][i] / n, 3) for k, v in
                              [("pathogen", "pathogen"), ("faecal", "faecal"), ("arg", "arg"), ("composite", "comp")]}
        # flags (rank arithmetic keeps thresholds exact)
        gaps = {h: rk[h][i] - rk["comp"][i] for h in HAZ}
        hidden = {h: g for h, g in gaps.items() if g >= GAP * n - 1e-9}
        mismatch = rk["faecal"][i] <= LO * n + 1e-9 and rk["arg"][i] >= HI * n - 1e-9
        rec["flag_type"] = "masked_arg" if mismatch else ("composite_understates" if hidden else "none")
        rec["hidden_hazard"] = max(hidden, key=hidden.get) if hidden else None
        rec["flagged"] = rec["flag_type"] != "none"
        # sensitivity: within 3 rank positions of any rule threshold (either side)
        mm = max(rk["faecal"][i] - LO * n, HI * n - rk["arg"][i])
        rec["borderline"] = abs(mm) <= BORDER or any(abs(g - GAP * n) <= BORDER for g in gaps.values())
        rec["tier"] = {"masked_arg": "primary", "composite_understates": "secondary"}.get(rec["flag_type"])
        rec["insight"] = sentence(rec, n) if rec["flagged"] else None
        nb = osm["sites"].get(code) if osm else None
        if nb and "features" in nb:
            nb = {"counts": nb["counts"], "nearest": nb["features"][:12], "n_within_1000m": len(nb["features"])}
        rec["nearby"] = nb
        out_sites.append(rec)
    coverage = {}
    if osm:
        tot, cnt = defaultdict(int), defaultdict(int)
        for rec in out_sites:
            if rec["nearby"]:
                tot[rec["city"]] += sum(rec["nearby"]["counts"]["500"].values())
                cnt[rec["city"]] += 1
        coverage = {c: round(tot[c] / cnt[c], 1) for c in cnt}
    for rec in out_sites:  # drop internal rank helpers from output
        for k in ("r_pathogen", "r_faecal", "r_arg", "r_comp", "_ties"):
            rec.pop(k)

    flagged = [s for s in out_sites if s["flagged"]]
    n_low = sum(1 for x in rk["faecal"] if x <= LO * n + 1e-9)
    n_high = sum(1 for x in rk["arg"] if x >= HI * n - 1e-9)
    expected_masked = n_low * n_high / n
    demo = max((s for s in flagged if s["flag_type"] == "masked_arg"),
               key=lambda s: (s["percentiles"]["arg"] - s["percentiles"]["faecal"], -s["percentiles"]["composite"]),
               default=None)

    # ---- global findings (numbers pulled from analysis outputs)
    rob = load(DATA / "robustness_results.json") if (DATA / "robustness_results.json").exists() else None
    scl = load(DATA / "scale_results.json") if (DATA / "scale_results.json").exists() else None
    claims, seasonality = [], None
    if rob:
        ind = {tuple(d["pair"]): d for d in rob["independence"]}
        af, ap = ind[("arg", "faecal")], ind[("arg", "pathogen")]
        claims.append({"id": "independence",
                       "text": (f"In this dataset, ARG risk shows no detectable relationship with faecal risk "
                                f"(within-city Spearman {fmt_ci(af)}) and at most a weak one with pathogen risk "
                                f"({fmt_ci(ap)}).")})
        cov_min_q = min(c["q"] for c in rob["covariates"] if c["hazard"] == "arg")
        m = rob["meta"]
        pw = rob["min_detectable_abs_rho_80pct_power"]["alpha_0.05"]
        claims.append({"id": "landscape_null",
                       "text": (f"No tested landscape or infrastructure variable explained ARG risk after city adjustment "
                                f"and multiple-testing correction ({m['total_distinct_tests_project']} distinct tests; "
                                f"smallest q for ARG = {cov_min_q:.2f}). With n = {m['n_sites']}, only within-city "
                                f"correlations of about {pw:.2f} or larger could be detected, so small effects cannot be ruled out.")})
    if scl:
        seasonality = scl.get("seasonality")
        arg_min_q = min(c["q"] for c in scl["combos"] if c["hazard"] == "arg")
        claims.append({"id": "arg_scale_null",
                       "text": (f"No landscape metric showed a supported scale of effect for ARG risk across 8 buffer radii "
                                f"(50 to 2000 m); smallest adjusted q = {arg_min_q:.2f}.")})
        exp = [c for c in scl["combos"] if c["evidence"] != "none"]
        exp = sorted(exp, key=lambda c: c["p_adj_radius"])
        exploratory = [{"hazard": c["hazard"], "metric": c["label"], "best_radius_m": c["best_radius"],
                        "rho": c["rho_best"], "q": c["q"], "scale": c["scale_label"],
                        "status": "exploratory, does not survive strict correction" if c["evidence"] == "suggestive"
                        else "supported",
                        "show_on_map": c["evidence"] == "supported"} for c in exp]
    else:
        exploratory = []

    by_type = Counter(s["flag_type"] for s in flagged)
    borderline = sorted(s["site"] for s in out_sites if s["borderline"])
    by_city = Counter(s["city"] for s in flagged)
    claims.insert(1, {"id": "blind_spots",
                      "text": (f"{len(flagged)} of {n} sites are flagged: {by_type.get('masked_arg', 0)} with low faecal but "
                               f"high ARG risk, and {by_type.get('composite_understates', 0)} where the composite averages away "
                               f"a hazard. These are illustrations of the composite's limits, not a prevalence estimate.")})
    claims.insert(2, {"id": "chance_expectation",
                      "text": (f"If faecal and ARG risk were completely independent, about {expected_masked:.0f} of {n} sites "
                               f"would show the 'low faecal, high ARG' pattern by chance; {by_type.get('masked_arg', 0)} were observed. "
                               f"The point is that faecal indicators cannot screen for ARG risk, not that these sites are unusual outliers.")})

    manifest = load(SNAP / "MANIFEST.json") if (SNAP / "MANIFEST.json").exists() else {}
    result = {
        "meta": {
            "generated_utc": datetime.now(timezone.utc).isoformat(),
            "n_sites": n, "demo_site": demo["site"] if demo else None,
            "flag_rules": {"masked_arg": "faecal rank in lowest quarter AND ARG rank in highest quarter",
                           "composite_understates": "a component ranks at least half the dataset higher than the composite does"},
            "limitations": ["One sampling date per site (May to September 2023, one site in 2024)",
                            "City and sampling season are confounded; analyses are within-city",
                            "Cross-sectional association, not causation or prediction",
                            "Measurement noise: one sampling date per site cannot separate true ARG differences from sampling variability",
                            "OpenStreetMap completeness differs between cities, so nearby counts reflect mapping effort as well as what is present; counts use feature centroids and under-count large parks",
                            "Screening tool: flagged sites need direct measurement, not conclusions"],
            "nearby_coverage_mean_features_500m": coverage,
            "osm_raw_elements_per_city": (osm or {}).get("meta", {}).get("raw_elements_per_city"),
            "methods_notes": [
                "Pathogen scores take a few coarse values at the low end, so rank differences among low-pathogen sites carry little meaning.",
                "The composite does not always miss ARG: some sites with the highest ARG scores also rank highly overall.",
                "Flag rules are rank thresholds, not natural categories; {} sites lie within {} rank positions of a threshold, so the list is illustrative.".format(len(borderline), BORDER),
                "Nearby features: same-named features of one category are merged per site; unnamed features cannot be merged, so counts are upper bounds.",
            ],
            "nearby_note": ("Counts within 250/500/1000 m are a presentation choice ('nearby'), not an analysis-derived risk radius."
                            if osm else "OSM nearby layer not built."),
            "attribution": ["Data: OneAquaHealth project via the public Resilience Map API (ENORA). Rights remain with OneAquaHealth and partners.",
                            "Map data: OpenStreetMap contributors (ODbL)."],
            "snapshot": manifest,
        },
        "claims": claims, "exploratory": exploratory, "seasonality": seasonality,
        "summary": {"flagged": len(flagged), "by_type": dict(by_type), "by_city": dict(by_city),
                    "by_tier": dict(Counter(s["tier"] for s in flagged)),
                    "chance_expected_masked": round(expected_masked, 2),
                    "borderline_sites": borderline},
        "sites": out_sites,
    }
    for p in OUT_PATHS:
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps(result, indent=1, ensure_ascii=False), encoding="utf-8")

    print(f"Sites: {n} | flagged: {len(flagged)} {dict(by_type)} | by city: {dict(by_city)}")
    print("Demo site:", result["meta"]["demo_site"])
    print("\nFlagged sites:")
    for s in sorted(flagged, key=lambda s: s["site"]):
        print(f"  {s['site']:<5}{s['city']:<10}{s['flag_type']:<22}hidden={s['hidden_hazard']}")
    print("\nSample insight:\n ", (demo or flagged[0])["insight"] if flagged else "none")
    print("\nClaims:")
    for c in claims:
        print(f"  [{c['id']}] {c['text']}")
    print("\nExploratory:", exploratory)
    print("Wrote:", ", ".join(map(str, OUT_PATHS)))


if __name__ == "__main__":
    main()