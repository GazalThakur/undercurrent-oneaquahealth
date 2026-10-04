import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import { ArgScatter } from "@/components/arg-scatter";
import { CityPills } from "@/components/city-pills";
import { ClaimsInsights } from "@/components/claims-insights";
import { FaqGlossary } from "@/components/faq-glossary";
import {
  GuidedTour,
  GUIDED_TOUR_STORAGE_KEY,
  type GuidedTourStep,
} from "@/components/guided-tour";
import { SitePanel } from "@/components/site-panel";
import { StreamMap } from "@/components/stream-map";
import {
  HAZARDS,
  citiesFromSites,
  flaggedSites,
  results,
  siteById,
  type Hazard,
  type NearbyRadius,
} from "@/lib/results";

export const Route = createFileRoute("/")({ component: Home });

function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <circle cx="16" cy="16" r="16" fill="currentColor" />
      <path
        d="M6.5 12.2c2.4-2.1 4.6 2.1 7 0s4.6 2.1 7 0 4.6 2.1 7 0"
        fill="none"
        stroke="#f3efe6"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M6.5 16c2.4-2.1 4.6 2.1 7 0s4.6 2.1 7 0 4.6 2.1 7 0"
        fill="none"
        stroke="#f3efe6"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M6.5 19.8c2.4-2.1 4.6 2.1 7 0s4.6 2.1 7 0 4.6 2.1 7 0"
        fill="none"
        stroke="#f3efe6"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Sticky pin scroll budget (container height minus one viewport). */
const LANDING_PIN_SCROLL_VH = 1.85;
/** Scroll distance over which landing → map progress runs 0→1. */
const LANDING_TRANSITION_VH = 1.45;
/** “Explore the map” lands at full transition, inside the post-transition hold. */
const EXPLORE_MAP_SCROLL_VH = 1.52;

const GUIDED_TOUR_STEPS: GuidedTourStep[] = [
  {
    target: '[data-tour="explore-map"]',
    title: "Start with the map",
    body: `Explore ${results.meta.n_sites} stream sites across five cities. Each site carries four different risk signals.`,
  },
  {
    target: '[data-tour="map-marker"]',
    fallbackTarget: '[data-tour="map-canvas"]',
    title: "Inspect a site",
    body: "Click a site marker to see what sits behind its score.",
  },
  {
    target: '[data-tour="map-lens"]',
    fallbackTarget: "#map-stage",
    title: "Switch the lens",
    body: "Try a different lens to see how the same sites change across Composite, Pathogen, Faecal and ARG risk.",
  },
  {
    target: '[data-tour="site-scores"]',
    fallbackTarget: '[data-tour="site-panel"]',
    title: "Read the four signals",
    body: "These scores are ranked separately. A high composite score does not necessarily mean every hazard is high.",
  },
  {
    target: '[data-tour="scatter-viz"]',
    fallbackTarget: "#scatter",
    title: "See the relationship",
    body: "Compare ARG and faecal risk across all 96 sites. Dark points highlight sites flagged by the screening rules.",
  },
];

const GUIDED_TOUR_FINAL = {
  title: "You're ready to explore.",
  body: "Follow the data, compare the signals, and see what the composite can hide.",
};

function exploreMap() {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({
    top: window.innerHeight * EXPLORE_MAP_SCROLL_VH,
    behavior: reduce ? "auto" : "smooth",
  });
}

function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

/** Smooth 0→1 ramp between scroll edges (Hermite ease). */
function smoothRange(edge0: number, edge1: number, x: number) {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function useScrollReveal<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    if (visible) return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  return {
    ref,
    className: `scroll-reveal${visible ? " is-visible" : ""}`,
  };
}

function ScrollReveal({
  children,
  className = "",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const { ref, className: revealClass } = useScrollReveal<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={`${revealClass}${className ? ` ${className}` : ""}`}
      style={delay > 0 ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}

function Home() {
  const [hazard, setHazard] = useState<Hazard>("composite");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [radius, setRadius] = useState<NearbyRadius>("500");
  const [progress, setProgress] = useState(0);
  const [flyToken, setFlyToken] = useState(0);
  const [cityFocus, setCityFocus] = useState<{ lat: number; lon: number; key: number } | null>(
    null,
  );
  const [tourOpen, setTourOpen] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  const [scatterScrollPending, setScatterScrollPending] = useState(false);
  const tourExplorePendingRef = useRef(false);
  const tourMarkerBaselineRef = useRef<string | null>(null);

  const cities = useMemo(() => citiesFromSites(results.sites), []);
  const flagged = useMemo(() => flaggedSites(), []);
  const selected = siteById(selectedId);
  const cityCount = cities.length;
  const blend = smoothRange(0, 1, progress);
  const heroOpacity = 1 - blend;
  const chrome = smoothRange(0.34, 0.9, progress);
  const interactive = smoothRange(0.58, 0.84, progress) > 0.5;
  useEffect(() => {
    const scrollSpan = () => window.innerHeight * LANDING_TRANSITION_VH;
    const read = () => clamp01(window.scrollY / scrollSpan());

    let target = read();
    let current = target;
    let raf = 0;

    const setSmoothed = (v: number) => {
      current = v;
      setProgress(v);
    };

    const frame = () => {
      target = read();
      const next = current + (target - current) * 0.22;
      if (Math.abs(target - next) < 0.0006) {
        setSmoothed(target);
        raf = 0;
        return;
      }
      setSmoothed(next);
      raf = requestAnimationFrame(frame);
    };

    const kick = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };

    setSmoothed(read());
    window.addEventListener("scroll", kick, { passive: true });
    window.addEventListener("resize", kick);
    return () => {
      window.removeEventListener("scroll", kick);
      window.removeEventListener("resize", kick);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (tourOpen) return;
      if (e.key === "Escape") setSelectedId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tourOpen]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(GUIDED_TOUR_STORAGE_KEY)) return;
    const timer = window.setTimeout(() => {
      setTourStep(0);
      setTourOpen(true);
    }, 1200);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!tourOpen || tourStep !== 0 || !tourExplorePendingRef.current) return;
    if (chrome >= 0.48) {
      tourExplorePendingRef.current = false;
      setTourStep(1);
    }
  }, [tourOpen, tourStep, chrome]);

  useEffect(() => {
    if (!tourOpen || tourStep !== 1) return;
    tourMarkerBaselineRef.current = selectedId;
  }, [tourOpen, tourStep]);

  useEffect(() => {
    if (!tourOpen || tourStep !== 1 || !selectedId) return;
    if (selectedId === tourMarkerBaselineRef.current) return;
    setTourStep(2);
  }, [tourOpen, tourStep, selectedId]);

  useEffect(() => {
    if (!scatterScrollPending) return;
    const scatterVisible = () => {
      const el = document.querySelector('[data-tour="scatter-viz"]');
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      return r.top < vh * 0.62 && r.bottom > 80 && r.height > 60;
    };
    const tick = () => {
      if (scatterVisible()) {
        setScatterScrollPending(false);
        setTourStep(4);
      }
    };
    tick();
    const id = window.setInterval(tick, 100);
    return () => window.clearInterval(id);
  }, [scatterScrollPending]);

  function ensureTourDemoSite() {
    if (!selectedId) setSelectedId(results.meta.demo_site);
  }

  function closeTour(completed: boolean) {
    setScatterScrollPending(false);
    setTourOpen(false);
    try {
      window.localStorage.setItem(GUIDED_TOUR_STORAGE_KEY, completed ? "completed" : "dismissed");
    } catch {
      /* ignore */
    }
  }

  function onExploreMapClick() {
    exploreMap();
    if (tourOpen && tourStep === 0) tourExplorePendingRef.current = true;
  }

  function replayTour() {
    setScatterScrollPending(false);
    tourExplorePendingRef.current = false;
    setSelectedId(null);
    setTourStep(0);
    setTourOpen(true);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  }

  function handleTourNext() {
    if (scatterScrollPending) return;
    switch (tourStep) {
      case 2:
        ensureTourDemoSite();
        setTourStep(3);
        break;
      case 3:
        ensureTourDemoSite();
        scrollToId("scatter");
        setScatterScrollPending(true);
        break;
      case 4:
        setTourStep(5);
        break;
      default:
        break;
    }
  }

  function handleTourBack() {
    setScatterScrollPending(false);
    if (tourStep === 5) {
      setTourStep(4);
      return;
    }
    if (tourStep === 4) {
      exploreMap();
      setTourStep(3);
      return;
    }
    if (tourStep === 1) {
      tourExplorePendingRef.current = false;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    }
    if (tourStep > 0) setTourStep(tourStep - 1);
  }

  const tourDisplayStep = scatterScrollPending ? 3 : tourStep;

  function selectSite(id: string | null, fly = false) {
    setSelectedId(id);
    if (id && fly) setFlyToken((n) => n + 1);
  }

  function goToSiteOnMap(siteId: string) {
    selectSite(siteId, true);
    exploreMap();
  }

  const hazardIndex = HAZARDS.findIndex((h) => h.id === hazard);

  return (
    <main className="bg-bg text-fg">
      <header className="pointer-events-none fixed inset-x-0 top-0 z-40 flex items-center justify-between px-4 py-4 md:px-7 md:py-5">
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
          }}
          className="pointer-events-auto flex items-center gap-3"
        >
          <Logo className="size-10 text-ink md:size-11" />
          <span className="leading-tight">
            <span className="block font-display text-[1.15rem] tracking-[-0.02em] text-fg">
              Undercurrent
            </span>
            <span className="block text-[12px] text-muted">Urban stream health</span>
          </span>
        </a>
        <div className="pointer-events-auto flex items-center gap-1">
          <button
            type="button"
            onClick={replayTour}
            className="min-h-10 rounded-full px-3 text-sm text-muted transition-colors duration-150 hover:text-fg"
            aria-label="Open guided tour"
          >
            Guide
          </button>
          <nav className="hidden items-center gap-1 sm:flex">
            {[
              ["map-stage", "Map"],
              ["scatter", "Scatter"],
              ["claims", "Claims"],
              ["faq", "FAQ"],
              ["methods", "Methods"],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => (id === "map-stage" ? exploreMap() : scrollToId(id))}
                className="min-h-10 rounded-full px-3 text-sm text-muted transition-colors duration-150 hover:text-fg"
              >
                {label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <GuidedTour
        open={tourOpen}
        step={tourDisplayStep}
        steps={GUIDED_TOUR_STEPS}
        finalStep={GUIDED_TOUR_FINAL}
        onBack={handleTourBack}
        onNext={handleTourNext}
        onClose={closeTour}
        nextDisabled={scatterScrollPending}
        hideNext={tourDisplayStep < 2}
      />

      <div
        id="top"
        className="relative"
        style={{ height: `${(1 + LANDING_PIN_SCROLL_VH) * 100}vh` }}
      >
        <div id="map-stage" className="sticky top-0 h-dvh overflow-hidden">
          <div
            className="absolute inset-x-3 top-[4.75rem] bottom-3 overflow-hidden rounded-xl md:inset-x-6 md:bottom-5 md:top-20"
          >
            <div
              className="absolute inset-0 origin-center"
              style={{
                transform: `scale(${1.04 - blend * 0.04})`,
                filter: `grayscale(${0.55 * (1 - blend)}) contrast(${1 + 0.08 * (1 - blend)})`,
                pointerEvents: interactive ? "auto" : "none",
              }}
            >
              <StreamMap
                hazard={hazard}
                selectedId={selectedId}
                onSelect={(id) => selectSite(id, false)}
                interactive={interactive}
                flyToken={flyToken}
                cityFocus={cityFocus}
              />
            </div>

            <div
              className="pointer-events-none absolute inset-0 z-10"
              style={{
                background: `radial-gradient(ellipse 78% 58% at 50% 40%, rgba(243,239,230,${0.96 * (1 - blend)}) 0%, rgba(243,239,230,${0.9 * (1 - blend)}) 38%, rgba(243,239,230,${0.35 * (1 - blend)}) 68%, rgba(243,239,230,${0.08 * (1 - blend)}) 100%)`,
              }}
              aria-hidden="true"
            />

            <div
              className="pointer-events-none absolute inset-x-0 top-2 z-30 flex flex-col gap-3 px-2 md:top-3 md:px-3"
              style={{
                opacity: chrome,
                transform: `translateY(${(1 - chrome) * 12}px)`,
              }}
            >
              <div className="pointer-events-auto flex flex-wrap items-start justify-between gap-3 lg:flex-nowrap">
                <div
                  data-tour="map-lens"
                  className="seg-track max-w-full rounded-full bg-paper/95 p-[3px] shadow-[0_0_0_1px_rgba(28,25,22,0.06),0_10px_28px_-16px_rgba(28,25,22,0.35)]"
                  style={{ "--seg-count": 4, "--seg-index": hazardIndex } as CSSProperties}
                >
                  <span className="seg-pill" />
                  {HAZARDS.map((h) => (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => setHazard(h.id)}
                      className={`relative z-10 min-h-10 min-w-[4.6rem] px-3 text-xs font-medium transition-colors duration-150 sm:text-sm ${
                        hazard === h.id ? "text-ink-fg" : "text-muted hover:text-fg"
                      }`}
                      aria-pressed={hazard === h.id}
                    >
                      {h.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 rounded-full bg-paper/95 px-3 py-2 text-[11px] text-muted shadow-[0_0_0_1px_rgba(28,25,22,0.06),0_10px_28px_-16px_rgba(28,25,22,0.35)]">
                  <span className="text-subtle">Low</span>
                  <span
                    className="h-2 w-20 rounded-full sm:w-28"
                    style={{
                      background:
                        "linear-gradient(90deg, var(--color-hazard-low), var(--color-hazard-high))",
                    }}
                  />
                  <span className="text-fg">High {HAZARDS.find((h) => h.id === hazard)?.label}</span>
                </div>
              </div>
              <CityPills
                selectedId={selectedId}
                onCityFocus={(c) => setCityFocus({ lat: c.lat, lon: c.lon, key: Date.now() })}
                onSelectSite={(id) => selectSite(id, true)}
              />
              <div className="pointer-events-auto flex max-w-full gap-1.5 overflow-x-auto pb-1 lg:hidden">
                {flagged.map((s) => (
                  <button
                    key={s.site}
                    type="button"
                    onClick={() => selectSite(s.site, true)}
                    className={`shrink-0 rounded-full px-3 py-2 font-mono text-xs shadow-[0_0_0_1px_rgba(28,25,22,0.06)] ${
                      selectedId === s.site ? "bg-ink text-ink-fg" : "bg-paper/95 text-fg"
                    }`}
                  >
                    {s.site}
                  </button>
                ))}
              </div>
            </div>

            <div
              className="pointer-events-none absolute right-2 z-30 hidden w-56 md:right-3 lg:top-[calc(0.75rem+2.5rem+0.375rem)] lg:block"
              style={{ opacity: chrome }}
            >
              <div className="pointer-events-auto rounded-lg bg-paper/95 p-3 shadow-[0_0_0_1px_rgba(28,25,22,0.06),0_10px_28px_-16px_rgba(28,25,22,0.35)]">
                <p className="text-[10px] font-medium tracking-[0.16em] text-muted uppercase">
                  Flagged sites
                </p>
                <ul className="mt-2 space-y-1">
                  {flagged.map((s) => (
                    <li key={s.site}>
                      <button
                        type="button"
                        onClick={() => selectSite(s.site, true)}
                        className={`flex w-full items-baseline justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors duration-150 ${
                          selectedId === s.site ? "bg-ink text-ink-fg" : "hover:bg-bg-elevated"
                        }`}
                      >
                        <span className="font-mono">{s.site}</span>
                        <span className={selectedId === s.site ? "text-ink-fg/70" : "text-subtle"}>
                          {s.city}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[10px] leading-relaxed text-subtle">
                  {results.summary.flagged} of {results.meta.n_sites} sites, across {cityCount}{" "}
                  cities. Illustrations of the composite's limits, not a prevalence estimate.
                </p>
              </div>
            </div>

            <SitePanel
              site={selected}
              hazard={hazard}
              radius={radius}
              onRadius={setRadius}
              onClose={() => setSelectedId(null)}
              visible={chrome > 0.48 || (tourOpen && tourDisplayStep === 3 && Boolean(selected))}
            />
          </div>

          <div
            className="relative z-20 flex h-full flex-col items-center justify-center px-5 pt-16 text-center"
            style={{
              opacity: heroOpacity,
              transform: `translateY(${blend * -28}px)`,
              filter: `blur(${blend * 5}px)`,
              pointerEvents: heroOpacity > 0.12 ? "auto" : "none",
            }}
          >
            <p className="hero-enter rounded-full border border-line bg-paper/70 px-3 py-1 text-[10px] font-medium tracking-[0.22em] text-muted uppercase">
              OneAquaHealth · Five cities
            </p>
            <h1 className="hero-enter hero-enter-delay-1 font-display mt-6 max-w-3xl text-[2.65rem] leading-[1.05] tracking-[-0.03em] text-fg sm:text-6xl md:text-7xl">
              See what the
              <br />
              composite <em className="font-normal text-muted italic">hides</em>
            </h1>
            <p className="hero-enter hero-enter-delay-2 mx-auto mt-6 max-w-md text-base leading-relaxed text-muted sm:text-lg">
              A map of urban streams where faecal scores look fine — and resistance-gene risk does
              not.
            </p>
            <button
              type="button"
              data-tour="explore-map"
              onClick={onExploreMapClick}
              className="hero-enter hero-enter-delay-3 mt-8 inline-flex min-h-12 items-center gap-2 rounded-full bg-ink px-6 pr-5 text-sm font-medium text-ink-fg transition-transform duration-150 ease-out hover:bg-fg active:scale-[0.96]"
            >
              Explore the map
              <ChevronDown className="size-4" strokeWidth={2} />
            </button>
          </div>
        </div>
      </div>

      <section
        id="scatter"
        data-tour="scatter"
        className="relative border-t border-line px-5 py-14 md:px-10 md:py-20"
      >
        <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.2fr)] lg:items-end">
          <div className="space-y-4">
            <ScrollReveal>
              <p className="text-[11px] font-medium tracking-[0.2em] text-muted uppercase">
                All {results.meta.n_sites} sites
              </p>
              <h2 className="font-display mt-3 text-4xl tracking-[-0.03em] text-fg md:text-5xl">
                ARG vs faecal risk
              </h2>
            </ScrollReveal>
            <ScrollReveal delay={70}>
              <p className="max-w-md text-[15px] leading-relaxed text-muted">
                ARG risk does not track faecal risk in this dataset.
              </p>
            </ScrollReveal>
            <ScrollReveal delay={120}>
              <p className="text-xs leading-relaxed text-subtle">
                Dark points are flagged sites. Click a point to select it on the map.
              </p>
            </ScrollReveal>
            <ScrollReveal delay={170}>
              <div className="flex flex-wrap gap-2 pt-2">
                {flagged.map((s) => (
                  <button
                    key={s.site}
                    type="button"
                    onClick={() => {
                      selectSite(s.site, true);
                      exploreMap();
                    }}
                    className={`rounded-full px-3 py-2 font-mono text-xs transition-colors duration-150 ${
                      selectedId === s.site
                        ? "bg-ink text-ink-fg"
                        : "bg-bg-elevated text-fg hover:bg-bg-deep"
                    }`}
                  >
                    {s.site}
                  </button>
                ))}
              </div>
            </ScrollReveal>
          </div>
          <ScrollReveal delay={90} className="min-w-0">
            <div data-tour="scatter-viz">
              <ArgScatter
                selectedId={selectedId}
                onSelect={(id) => {
                  selectSite(id, true);
                  exploreMap();
                }}
              />
            </div>
          </ScrollReveal>
        </div>
      </section>

      <section
        id="claims"
        className="claims-section--frame border-t border-line px-5 py-12 md:px-10 md:py-14"
      >
        <div className="mx-auto max-w-6xl">
          <ClaimsInsights onSelectSite={goToSiteOnMap} />
        </div>
      </section>

      <FaqGlossary
        onNavigate={scrollToId}
        onExploreFlagged={() => {
          scrollToId("claims");
        }}
      />

      <section id="methods" className="border-t border-line px-5 py-14 md:px-10 md:py-20">
        <div className="mx-auto max-w-3xl">
          <ScrollReveal>
            <h2 className="font-display text-4xl tracking-[-0.03em] text-fg md:text-5xl">
              How it works
            </h2>
          </ScrollReveal>
          <ScrollReveal delay={70} className="mt-6 space-y-6">
            <div>
              <h3 className="text-sm font-medium tracking-[0.14em] text-muted uppercase">
                Sites
              </h3>
              <p className="mt-2 text-[15px] leading-relaxed text-muted">
                {results.meta.n_sites} urban stream sites across {cityCount} cities. One sampling
                date per site (May to September 2023, one site in 2024). Scores are compared
                within cities.
              </p>
            </div>
            <div>
              <h3 className="text-sm font-medium tracking-[0.14em] text-muted uppercase">
                Risk scores
              </h3>
              <p className="mt-2 text-[15px] leading-relaxed text-muted">
                Each site has four rank scores —{" "}
                {HAZARDS.map((h) => h.label).join(", ")}. Use the map control to switch which
                hazard colors the markers.
              </p>
            </div>
            <div>
              <h3 className="text-sm font-medium tracking-[0.14em] text-muted uppercase">
                Flagging
              </h3>
              <ul className="mt-2 space-y-2 text-[15px] leading-relaxed text-muted">
                <li>
                  <span className="font-medium text-fg">Low faecal, high ARG:</span>{" "}
                  {results.meta.flag_rules.masked_arg}
                </li>
                <li>
                  <span className="font-medium text-fg">Composite understates a hazard:</span>{" "}
                  {results.meta.flag_rules.composite_understates}
                </li>
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-medium tracking-[0.14em] text-muted uppercase">
                Map and site panel
              </h3>
              <p className="mt-2 text-[15px] leading-relaxed text-muted">
                Marker color reflects the active hazard. Click a site to inspect all four scores, any
                flag, and nearby OpenStreetMap features at 250–1000&nbsp;m. The scatter plot links to
                the same selection on the map.
              </p>
            </div>
          </ScrollReveal>
        </div>
      </section>

      <footer className="border-t border-line px-5 py-10 md:px-10">
        <div className="mx-auto flex max-w-3xl flex-col gap-3 text-xs leading-relaxed text-subtle">
          {results.meta.attribution.map((line) => (
            <p key={line}>{line}</p>
          ))}
          <p>Built for the IEEE OneAquaHealth Global Hackathon 2026, Track 2: Data-to-Insight.</p>
        </div>
      </footer>
    </main>
  );
}
