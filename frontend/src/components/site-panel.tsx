import { X } from "lucide-react";
import type { CSSProperties } from "react";
import {
  HAZARDS,
  NEARBY_CATEGORIES,
  NEARBY_RADII,
  flagLabel,
  formatMonth,
  rankPhrase,
  results,
  scoreLabel,
  type Hazard,
  type NearbyRadius,
  type Site,
} from "@/lib/results";

type Props = {
  site: Site | undefined;
  hazard: Hazard;
  radius: NearbyRadius;
  onRadius: (r: NearbyRadius) => void;
  onClose: () => void;
  visible: boolean;
};

export function SitePanel({ site, hazard, radius, onRadius, onClose, visible }: Props) {
  if (!site || !visible) return null;
  const flag = flagLabel(site);
  const n = results.meta.n_sites;
  const nearby = site.nearby;
  const counts = nearby?.counts[radius];
  const nearest = (nearby?.nearest ?? []).filter((f) => f.distance_m <= Number(radius));

  return (
    <aside
      data-tour="site-panel"
      className="pointer-events-auto absolute inset-x-3 bottom-3 z-30 max-h-[min(48vh,24rem)] overflow-y-auto rounded-xl bg-paper p-3 shadow-[0_0_0_1px_rgba(28,25,22,0.06),0_16px_40px_-20px_rgba(28,25,22,0.35)] md:inset-x-auto md:left-4 md:bottom-4 md:w-[22.5rem] md:p-3.5"
      aria-label={`Site ${site.site}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-ink px-2 py-0.5 font-mono text-[11px] font-medium tracking-wide text-ink-fg">
              {site.site}
            </span>
            <span className="rounded-full bg-bg-elevated px-2 py-0.5 text-[11px] font-medium text-muted">
              {site.city}
            </span>
            {flag ? (
              <span className="rounded-full bg-pine/10 px-2 py-0.5 text-[11px] font-medium text-pine">
                {flag}
              </span>
            ) : null}
          </div>
          <h2 className="font-display mt-2 text-lg leading-snug tracking-[-0.02em] text-fg">
            {site.name ?? site.site}
          </h2>
          <p className="mt-1 text-xs text-muted">
            Sampled {formatMonth(site.sampling_month)}
            {site.borderline
              ? " · Near a screening threshold — flags are illustrative, not natural categories."
              : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="relative -mr-1 -mt-1 size-10 shrink-0 rounded-full text-muted transition-colors duration-150 hover:bg-bg-elevated hover:text-fg active:scale-[0.96]"
          aria-label="Deselect site"
        >
          <X className="mx-auto size-4" strokeWidth={1.75} />
        </button>
      </div>

      <dl className="mt-3 grid grid-cols-4 gap-1" data-tour="site-scores">
        {HAZARDS.map((h) => {
          const active = h.id === hazard;
          const score = site.scores[h.id];
          return (
            <div
              key={h.id}
              className={`rounded-md px-1.5 py-2 ${active ? "bg-ink text-ink-fg" : "bg-bg-elevated text-fg"}`}
            >
              <dt className={`text-[9px] font-medium tracking-[0.12em] uppercase ${active ? "text-ink-fg/70" : "text-muted"}`}>
                {h.label}
              </dt>
              <dd className="font-display mt-1 text-base tabular-nums tracking-tight">
                {scoreLabel(score)}
              </dd>
              <dd className={`mt-0.5 text-[9px] leading-tight ${active ? "text-ink-fg/70" : "text-subtle"}`}>
                {rankPhrase(site.percentiles[h.id], n)}
              </dd>
            </div>
          );
        })}
      </dl>

      {site.insight ? (
        <blockquote className="mt-3 border-l-2 border-pine/40 pl-3 text-xs leading-relaxed text-fg">
          {site.insight}
        </blockquote>
      ) : null}

      {nearby ? (
        <div className="mt-4 border-t border-line pt-4">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-[11px] font-medium tracking-[0.16em] text-muted uppercase">
              Nearby
            </h3>
            <p className="text-[10px] text-subtle">{radius} m</p>
          </div>
          <div
            className="seg-track mt-2 rounded-full bg-bg-elevated p-[3px]"
            style={{ "--seg-count": 3, "--seg-index": NEARBY_RADII.indexOf(radius) } as CSSProperties}
          >
            <span className="seg-pill" />
            {NEARBY_RADII.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => onRadius(r)}
                className={`relative z-10 min-h-10 rounded-full px-2 text-xs font-medium transition-colors duration-150 ${
                  radius === r ? "text-ink-fg" : "text-muted hover:text-fg"
                }`}
              >
                {r} m
              </button>
            ))}
          </div>
          <ul className="mt-3 grid grid-cols-5 gap-1">
            {NEARBY_CATEGORIES.map((c) => (
              <li key={c.id} className="rounded-md bg-bg px-1.5 py-2 text-center">
                <div className="font-display text-base tabular-nums leading-none text-fg">
                  {counts?.[c.id] ?? 0}
                </div>
                <div className="mt-1 text-[9px] leading-tight text-subtle">{c.label}</div>
              </li>
            ))}
          </ul>
          {nearest.length > 0 ? (
            <ul className="mt-3 space-y-1.5">
              {nearest.slice(0, 6).map((f, i) => (
                <li key={`${f.category}-${f.distance_m}-${i}`} className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="min-w-0 truncate text-fg">
                    {f.name ?? NEARBY_CATEGORIES.find((c) => c.id === f.category)?.label ?? f.category}
                  </span>
                  <span className="shrink-0 tabular-nums text-subtle">{Math.round(f.distance_m)} m</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-xs text-muted">No mapped features in this distance.</p>
          )}
          <p className="mt-3 text-[11px] leading-relaxed text-subtle">{results.meta.nearby_note}</p>
        </div>
      ) : null}
    </aside>
  );
}
