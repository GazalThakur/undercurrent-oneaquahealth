import raw from "@/data/results.json";

export type Hazard = "composite" | "pathogen" | "faecal" | "arg";

export type NearbyRadius = "250" | "500" | "1000";

export type NearbyCategory =
  | "school"
  | "kindergarten"
  | "playground"
  | "park"
  | "allotments";

export type FlagType = "none" | "masked_arg" | "composite_understates";

export type NearbyFeature = {
  category: NearbyCategory;
  name: string | null;
  distance_m: number;
};

export type SiteNearby = {
  counts: Record<NearbyRadius, Record<NearbyCategory, number>>;
  nearest: NearbyFeature[];
  n_within_1000m: number;
};

export type Site = {
  site: string;
  name: string | null;
  city: string;
  lat: number;
  lon: number;
  sampling_month: string;
  scores: Record<Hazard, number>;
  percentiles: Record<Hazard, number>;
  flag_type: FlagType;
  hidden_hazard: Hazard | null;
  flagged: boolean;
  borderline: boolean;
  tier: "primary" | "secondary" | null;
  insight: string | null;
  nearby: SiteNearby | null;
};

export type Claim = { id: string; text: string };

export type Exploratory = {
  hazard: string;
  metric: string;
  best_radius_m: number;
  rho: number;
  q: number;
  scale: string;
  status: string;
  show_on_map: boolean;
};

export type Results = {
  meta: {
    generated_utc: string;
    n_sites: number;
    demo_site: string | null;
    flag_rules: Record<string, string>;
    limitations: string[];
    nearby_coverage_mean_features_500m: Record<string, number>;
    osm_raw_elements_per_city: Record<string, number>;
    methods_notes: string[];
    nearby_note: string;
    attribution: string[];
    snapshot: Record<string, { fetched_utc: string; url: string }>;
  };
  claims: Claim[];
  exploratory: Exploratory[];
  seasonality: Record<string, Record<string, number>>;
  summary: {
    flagged: number;
    by_type: Record<string, number>;
    by_city: Record<string, number>;
    by_tier: Record<string, number>;
    chance_expected_masked: number;
    borderline_sites: string[];
  };
  sites: Site[];
};

export const results = raw as Results;

export const HAZARDS: { id: Hazard; label: string }[] = [
  { id: "composite", label: "Composite" },
  { id: "pathogen", label: "Pathogen" },
  { id: "faecal", label: "Faecal" },
  { id: "arg", label: "ARG" },
];

export const NEARBY_RADII: NearbyRadius[] = ["250", "500", "1000"];

export const NEARBY_CATEGORIES: { id: NearbyCategory; label: string }[] = [
  { id: "school", label: "Schools" },
  { id: "kindergarten", label: "Kindergartens" },
  { id: "playground", label: "Playgrounds" },
  { id: "park", label: "Parks" },
  { id: "allotments", label: "Allotments" },
];

export function siteById(id: string | null): Site | undefined {
  if (!id) return undefined;
  return results.sites.find((s) => s.site === id);
}

export function flaggedSites(): Site[] {
  return results.sites.filter((s) => s.flagged);
}

export function sitesByFlagType(flagType: Exclude<FlagType, "none">): Site[] {
  return results.sites
    .filter((s) => s.flag_type === flagType)
    .sort((a, b) => a.site.localeCompare(b.site));
}

export type CityFocus = {
  name: string;
  lat: number;
  lon: number;
  n: number;
  flagged: number;
};

/** Sites in one city, same objects as map markers (`results.sites`). */
export function sitesForCity(cityName: string, sites: Site[] = results.sites): Site[] {
  return sites
    .filter((s) => s.city === cityName)
    .sort((a, b) => a.site.localeCompare(b.site, undefined, { numeric: true }));
}

export function citiesFromSites(sites: Site[]): CityFocus[] {
  const map = new Map<string, { lat: number; lon: number; n: number; flagged: number }>();
  for (const s of sites) {
    const cur = map.get(s.city) ?? { lat: 0, lon: 0, n: 0, flagged: 0 };
    cur.lat += s.lat;
    cur.lon += s.lon;
    cur.n += 1;
    if (s.flagged) cur.flagged += 1;
    map.set(s.city, cur);
  }
  return [...map.entries()]
    .map(([name, c]) => ({
      name,
      lat: c.lat / c.n,
      lon: c.lon / c.n,
      n: c.n,
      flagged: c.flagged,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function siteBounds(sites: Site[]): [[number, number], [number, number]] {
  const lats = sites.map((s) => s.lat);
  const lons = sites.map((s) => s.lon);
  return [
    [Math.min(...lats) - 3.5, Math.min(...lons) - 4],
    [Math.max(...lats) + 3.5, Math.max(...lons) + 4],
  ];
}

export function quantile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo] ?? 0;
  const h = pos - lo;
  return (sorted[lo] ?? 0) * (1 - h) + (sorted[hi] ?? 0) * h;
}

export function ordinal(k: number): string {
  const n = Math.round(k);
  const suf =
    n % 100 >= 10 && n % 100 <= 20
      ? "th"
      : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${suf}`;
}

/** Rank phrase from the dataset's 1-based average-rank percentiles (higher = higher risk). */
export function rankPhrase(percentile: number, n: number): string {
  const rank = Math.max(1, Math.min(n, Math.round(percentile * n)));
  const fromTop = n + 1 - rank;
  if (percentile >= 0.5) return `${ordinal(fromTop)} highest of ${n}`;
  return `${ordinal(rank)} lowest of ${n}`;
}

export function formatMonth(ym: string): string {
  if (!ym || ym.length < 7) return ym;
  const year = ym.slice(0, 4);
  const month = Number(ym.slice(5, 7));
  const names = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const label = names[month - 1];
  return label ? `${label} ${year}` : ym;
}

export function flagLabel(site: Site): string | null {
  if (site.flag_type === "masked_arg") return "Low faecal, high ARG";
  if (site.flag_type === "composite_understates") return "Composite averages a hazard away";
  return null;
}

export function scoreLabel(value: number): string {
  return value.toFixed(2);
}

/** Sequential ink–pine scale for hazard scores in 0..1. */
export function riskColor(t: number): string {
  const x = Math.max(0, Math.min(1, t));
  const stops: Array<[number, [number, number, number]]> = [
    [0, [176, 168, 154]],
    [0.35, [130, 138, 128]],
    [0.7, [58, 92, 86]],
    [1, [22, 48, 44]],
  ];
  let i = 0;
  while (i < stops.length - 1 && x > (stops[i + 1]?.[0] ?? 1)) i += 1;
  const a = stops[i];
  const b = stops[i + 1] ?? a;
  if (!a || !b) return "rgb(22, 48, 44)";
  const span = b[0] - a[0] || 1;
  const u = (x - a[0]) / span;
  const rgb = a[1].map((c, idx) => Math.round(c + (b[1][idx]! - c) * u));
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

export function claimById(id: string): Claim | undefined {
  return results.claims.find((c) => c.id === id);
}
