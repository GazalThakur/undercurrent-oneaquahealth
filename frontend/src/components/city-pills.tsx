import { ChevronDown } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  citiesFromSites,
  results,
  sitesForCity,
  type CityFocus,
} from "@/lib/results";

type Props = {
  selectedId: string | null;
  onCityFocus: (city: Pick<CityFocus, "lat" | "lon">) => void;
  onSelectSite: (siteId: string) => void;
};

export function CityPills({ selectedId, onCityFocus, onSelectSite }: Props) {
  const cities = useMemo(() => citiesFromSites(results.sites), []);
  const [openCity, setOpenCity] = useState<string | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  const selectedCity = useMemo(() => {
    if (!selectedId) return null;
    return results.sites.find((s) => s.site === selectedId)?.city ?? null;
  }, [selectedId]);

  useEffect(() => {
    if (!openCity) return;
    function onPointerDown(e: MouseEvent | TouchEvent) {
      const root = rowRef.current;
      if (!root?.contains(e.target as Node)) setOpenCity(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenCity(null);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [openCity]);

  const pillShadow =
    "shadow-[0_0_0_1px_rgba(28,25,22,0.06),0_10px_28px_-16px_rgba(28,25,22,0.35)]";

  return (
    <div ref={rowRef} className="pointer-events-auto max-w-full">
      <div className="flex max-w-full flex-wrap gap-1.5 pb-1">
        {cities.map((c) => {
          const open = openCity === c.name;
          const active = open || selectedCity === c.name;
          const sites = sitesForCity(c.name, results.sites);

          return (
            <div key={c.name} className="relative shrink-0">
              <div
                className={`flex items-stretch overflow-hidden rounded-full bg-paper/95 text-xs font-medium text-fg transition-colors duration-150 ${pillShadow} ${
                  active ? "ring-1 ring-line/80" : ""
                }`}
              >
                <button
                  type="button"
                  onClick={() => onCityFocus({ lat: c.lat, lon: c.lon })}
                  className="min-h-10 px-3 py-2 text-left transition-colors duration-150 hover:bg-paper active:scale-[0.98]"
                  aria-label={`${c.name}, ${c.n} sites — zoom map`}
                >
                  {c.name}
                  <span className="ml-1.5 text-subtle">{c.n}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setOpenCity((prev) => (prev === c.name ? null : c.name))}
                  className="flex min-h-10 min-w-8 items-center justify-center border-l border-line/60 px-1.5 text-subtle transition-colors duration-150 hover:bg-paper hover:text-fg"
                  aria-expanded={open}
                  aria-haspopup="listbox"
                  aria-label={`${c.name} sites`}
                >
                  <ChevronDown
                    className={`size-3.5 transition-transform duration-200 motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
                    strokeWidth={1.75}
                  />
                </button>
              </div>

              {open ? (
                <ul
                  role="listbox"
                  aria-label={`${c.name} sites`}
                  className="absolute top-full left-0 z-50 mt-1.5 max-h-[min(16rem,50vh)] min-w-[min(100vw-1.5rem,17.5rem)] overflow-y-auto overscroll-contain rounded-lg border border-line/80 bg-paper/98 py-1 shadow-[0_0_0_1px_rgba(28,25,22,0.04),0_12px_32px_-12px_rgba(28,25,22,0.28)]"
                >
                  {sites.map((s) => {
                    const selected = s.site === selectedId;
                    return (
                      <li key={s.site} role="option" aria-selected={selected}>
                        <button
                          type="button"
                          onClick={() => {
                            onSelectSite(s.site);
                            setOpenCity(null);
                          }}
                          className={`block w-full px-3 py-2 text-left text-[11px] leading-snug transition-colors duration-150 ${
                            selected
                              ? "bg-ink/90 text-ink-fg"
                              : "text-fg hover:bg-bg-elevated"
                          }`}
                        >
                          <span className="font-mono text-[10px]">{s.site}</span>
                          <span
                            className={`ml-1.5 ${selected ? "text-ink-fg/80" : "text-muted"}`}
                          >
                            · {s.name ?? s.site}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
