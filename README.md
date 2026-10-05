# Undercurrent

**See what the composite hides.**

*Clean on the surface, resistant underneath.*

**IEEE OneAquaHealth Global Hackathon 2026 · Track 2: Data-to-Insight**

- **Live demo:** https://undercurrent-oneaquahealth.vercel.app/
- **Demo video:** https://youtu.be/p-zv8WdWXUQ

<!-- Add 3-4 screenshots here after the final UI pass (store in docs/images/):
     hero, ARG lens on the map, ARG vs faecal scatter, site panel for T10. -->

---

## The insight

OneAquaHealth's Resilience Map reports pathogen, faecal, and antimicrobial-resistance gene (ARG) risk for each urban stream site, then combines them into a single composite score. The composite is the plain mean of the three components (verified: maximum difference 0.0001). Faecal and pathogen risk move together (within-city Spearman **+0.69**, 95% CI **+0.51 to +0.80**), so they largely drive the average. ARG risk does not track faecal risk (**−0.03**, 95% CI **−0.25 to +0.18**) and shows at most a weak association with pathogen risk (**+0.18**, 95% CI **−0.02 to +0.36**).

**Consequence:** a site can look unremarkable on the composite while ARG risk sits in the top tier. ARG needs its own measurement; Undercurrent shows which sites are worth examining first.

**Example: site T10 (Toulouse, Canal de Saint Martory).** Faecal risk is the **2nd lowest** of 96 sites; ARG risk is the **4th highest**; the composite ranks it **61st highest** of 96 (score **0.23**). T10 is a candidate for direct ARG testing.

---

## What you can explore

The app is a single-page experience in `frontend/`:

- **Editorial landing** that scrolls into a full-viewport **map** of all sites (Leaflet / OpenStreetMap tiles)
- **Lens switching** among Composite, Pathogen risk, Faecal risk, and ARG risk (marker colour and legend update per lens)
- **City pills** to focus the map and open sites by city
- **Flagged sites** list (desktop sidebar; horizontal chips on small screens) with links to each site
- **Site panel** with four rank scores, screening flag, plain-language insight, and **nearby** OpenStreetMap context (schools, kindergartens, playgrounds, parks, allotments at **250 / 500 / 1000 m**)
- **ARG vs faecal scatter plot** with **linked selection** to the map (flagged sites highlighted)
- **Claims**: "What we can say" with expandable detail on correlations and flagged sites
- **FAQ / glossary** (ARG, composite, screening, Spearman, and related terms)
- **Methods**: in-app "How it works" (sites, scores, flag rules, map behaviour)
- **Guided tour** on first visit (replay via **Guide** in the header)

**Sites in this build:**

| City | Sites |
|------|------:|
| Benevento | 20 |
| Coimbra | 18 |
| Ghent | 17 |
| Oslo | 20 |
| Toulouse | 21 |
| **Total** | **96** |

One sampling date per site (May to September 2023; one Benevento site in 2024). City and season overlap, so comparisons are **within-city**.

**Screening (8 of 96 sites, in 4 of 5 cities; none in Benevento):**

- **5 `masked_arg`:** faecal rank in the lowest quarter **and** ARG rank in the highest quarter
- **3 `composite_understates`:** a component ranks at least half the dataset higher than the composite does

If faecal and ARG were independent, about **6.25** sites would show the low-faecal / high-ARG pattern by chance; **5** were observed. These flags illustrate the composite's limits; they are not a prevalence estimate.

---

## Why you can trust the numbers

- **Within-city statistics**, so differences between cities do not drive the headline associations
- **City-stratified bootstrap** confidence intervals for hazard correlations (`pipeline/robustness.py`)
- **Permutation tests** that account for choosing the best of **8** buffer radii, with **Benjamini–Hochberg** correction across the tested landscape family (`pipeline/scale_of_effect.py`, `pipeline/robustness.py`)
- **Leave-one-city-out** checks on scale-of-effect results
- **Hashed snapshot** of the API pulls in `data/snapshot/` (`MANIFEST.json`)
- **Fixed random seeds** in every stochastic step
- **Reproducible pipeline**: analysis scripts use only the Python standard library, except `fetch_data.py` (needs `requests`)
- **Static front end**: reads a bundled `results.json`; no live API at runtime

Full methods, limitations, and exploratory results: [`docs/methods.md`](docs/methods.md) (and `data/results.json` → `claims`, `meta.limitations`).

**No landscape signal for ARG:** no tested landscape or infrastructure variable explained ARG after city adjustment and multiple-testing correction (**24** distinct tests; smallest **q** for ARG **≈ 0.67**). With **n = 96**, only within-city correlations of about **0.29** or larger were detectable. Land cover and faecal indicators cannot substitute for measuring ARG directly.

---

## Hackathon alignment: Track 2, Data-to-Insight

| | |
|---|---|
| **Problem** | Multiple stream-health signals are hard to interpret together; one composite number can hide component differences. |
| **Approach** | Turn snapshotted OneAquaHealth health-risk data into an interactive map, scatter comparison, and rank-based screening workflow. |
| **Output** | Patterns, discrepancies, and candidate sites for follow-up measurement are easier to see and discuss. |
| **One Health relevance** | Clearer reading of urban freshwater monitoring supports investigation of environmental conditions tied to ecosystem and human well-being. |
| **Storytelling** | Editorial landing, guided tour, and site-level narratives (e.g. T10) connect the statistics to decisions. |

**Proposed next step:** bring future citizen-science observations alongside these research-grade snapshots using the same screening workflow (not implemented in this prototype).

---

## Built to scale

Adding a city means: site coordinates and health-risk scores in the snapshot, an OpenStreetMap fetch for that bounding box (`pipeline/fetch_osm.py`), then re-running the analysis scripts and `build_results.py`. The screening logic and front end stay the same; only the JSON bundle changes.

---

## Scope

This prototype describes **associations in one cross-sectional dataset** (one sampling date per site; city and season overlap). It does not support prevalence estimates, causation, diagnosis, or automated screening decisions. Flagged sites are **candidates for direct measurement**. Two weak exploratory links (faecal vs human-density proxy at **1500 m**, pathogen vs vegetation cover at **1000 m**) do not survive strict correction and are **not shown on the map** (they live in `data/results.json` → `exploratory`). Nearby distances are a **presentation choice**; OpenStreetMap completeness differs by city, so nearby counts should not be compared across cities.

---

## Data and attribution

- **Data:** OneAquaHealth project via the public Resilience Map API (ENORA). Rights remain with OneAquaHealth and partners. Snapshotted unchanged under `data/snapshot/`, used for a hackathon prototype; removal on request.
- **Map data:** OpenStreetMap contributors (ODbL).

---

## Technical implementation

| Layer | Technology |
|-------|------------|
| UI | React 19, TypeScript |
| App / routing | TanStack Router, TanStack Start |
| Build | Vite 8 |
| Styling | Tailwind CSS v4 |
| Map | Leaflet 1.9 |
| Charts | Recharts 2 |
| Runtime data | `frontend/src/data/results.json` via `frontend/src/lib/results.ts` |
| Analysis | Python 3, `pipeline/*.py` → `data/results.json` |

Dev server: `npm run dev` in `frontend/` (Vite on port **8080**, host `0.0.0.0`).

---

## Repository structure

```text
data/
  snapshot/              # Frozen ENORA API JSON + MANIFEST.json
  results.json           # Canonical bundle for analysis and UI
  robustness_results.json, scale_results.json, divergence.csv, osm_exposure.json
docs/
  methods.md             # Full methods and limitations
pipeline/
  fetch_data.py          # Optional refresh (requires requests)
  scale_of_effect.py
  robustness.py
  fetch_osm.py           # Optional OSM nearby features
  divergence_stdlib.py   # Divergence / screening utilities
  build_results.py       # Writes data/results.json and frontend/src/data/results.json
frontend/
  src/components/        # Map, scatter, claims, FAQ, site panel, tour
  src/lib/results.ts
  src/data/results.json  # Bundled data (written by build_results.py)
LICENSE
README.md
```

---

## Run locally

```bash
cd frontend
npm install
npm run dev
```

Other useful commands: `npm run build`, `npm run typecheck`, `npm run preview`.

**Regenerate analysis output** (from repository root):

```bash
python pipeline/scale_of_effect.py
python pipeline/robustness.py
python pipeline/fetch_osm.py    # optional; needs network
python pipeline/build_results.py
```

`build_results.py` writes both `data/results.json` and `frontend/src/data/results.json`, so no manual copy is needed before rebuilding the front end. Optional fresh API pull: `pip install requests` then `python pipeline/fetch_data.py`.

---
