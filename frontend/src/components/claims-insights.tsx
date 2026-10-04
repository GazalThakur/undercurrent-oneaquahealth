import { ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";
import { results, sitesByFlagType } from "@/lib/results";

type Props = {
  onSelectSite: (siteId: string) => void;
};

function ExpandPanel({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div
      className="grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none"
      style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
    >
      <div className="overflow-hidden">
        <div className="pt-2">{children}</div>
      </div>
    </div>
  );
}

export function ClaimsInsights({ onSelectSite }: Props) {
  const [rhoOpen, setRhoOpen] = useState(false);
  const [maskedOpen, setMaskedOpen] = useState(false);
  const [underOpen, setUnderOpen] = useState(false);

  const masked = sitesByFlagType("masked_arg");
  const understates = sitesByFlagType("composite_understates");
  const n = results.meta.n_sites;
  const flagged = results.summary.flagged;
  const nMasked = results.summary.by_type.masked_arg;
  const nUnder = results.summary.by_type.composite_understates;

  return (
    <div className="claims-insights">
      <header className="max-w-3xl">
        <p className="text-[11px] font-medium tracking-[0.2em] text-muted uppercase">
          What the data shows
        </p>
        <h2 className="font-display mt-2 text-4xl tracking-[-0.03em] text-fg md:text-5xl">
          What we can say
        </h2>
      </header>

      <div className="mt-6 grid gap-6 lg:mt-8 lg:grid-cols-2 lg:gap-x-10 lg:gap-y-5">
        <article className="border-t border-line pt-5 lg:pt-6">
          <button
            type="button"
            onClick={() => setRhoOpen((v) => !v)}
            aria-expanded={rhoOpen}
            className="group w-full text-left"
          >
            <p className="font-display text-6xl tabular-nums tracking-[-0.04em] text-fg md:text-7xl">
              −0.03
              <ChevronDown
                className={`ml-2 inline-block size-5 align-middle text-muted transition-transform duration-300 group-hover:text-fg ${rhoOpen ? "rotate-180" : ""}`}
                strokeWidth={1.5}
              />
            </p>
            <p className="mt-2 text-[10px] font-medium tracking-[0.16em] text-muted uppercase">
              ARG ↔ faecal · Spearman
            </p>
          </button>
          <p className="mt-3 max-w-md text-[15px] leading-snug text-fg">
            ARG risk does not track faecal risk in this dataset.
          </p>
          <p className="mt-1 font-mono text-[12px] text-muted">95% CI −0.25 to +0.18</p>
          <ExpandPanel open={rhoOpen}>
            <p className="max-w-md border-l-2 border-line pl-3 text-sm leading-relaxed text-muted">
              Across the {n} sites, the relationship between ARG and faecal risk is effectively
              absent in this dataset. This means faecal indicators cannot be used as a reliable
              screen for ARG risk.
            </p>
          </ExpandPanel>
        </article>

        <article className="border-t border-line pt-5 lg:pt-6">
          <p className="font-display text-5xl tabular-nums tracking-[-0.03em] text-fg md:text-6xl">
            {flagged} / {n}
          </p>
          <p className="mt-1 text-[10px] font-medium tracking-[0.16em] text-muted uppercase">
            sites flagged
          </p>

          <div className="mt-4 space-y-2">
            <div>
              <button
                type="button"
                onClick={() => setMaskedOpen((v) => !v)}
                aria-expanded={maskedOpen}
                className="group flex w-full items-baseline gap-2.5 text-left"
              >
                <span className="font-display text-2xl tabular-nums text-fg">{nMasked}</span>
                <span className="flex-1 text-[11px] font-medium tracking-[0.12em] text-muted uppercase underline decoration-line/80 underline-offset-4 transition-colors group-hover:text-fg">
                  low faecal / high ARG
                </span>
                <ChevronDown
                  className={`size-3.5 shrink-0 text-subtle transition-transform duration-300 ${maskedOpen ? "rotate-180" : ""}`}
                  strokeWidth={1.75}
                />
              </button>
              <ExpandPanel open={maskedOpen}>
                <div className="flex flex-wrap gap-1.5">
                  {masked.map((s) => (
                    <button
                      key={s.site}
                      type="button"
                      onClick={() => onSelectSite(s.site)}
                      className="rounded-full bg-bg-elevated px-2.5 py-1 font-mono text-[11px] text-fg transition-colors duration-150 hover:bg-ink hover:text-ink-fg"
                    >
                      {s.site}
                    </button>
                  ))}
                </div>
              </ExpandPanel>
            </div>

            <div>
              <button
                type="button"
                onClick={() => setUnderOpen((v) => !v)}
                aria-expanded={underOpen}
                className="group flex w-full items-baseline gap-2.5 text-left"
              >
                <span className="font-display text-2xl tabular-nums text-fg">{nUnder}</span>
                <span className="flex-1 text-[11px] font-medium tracking-[0.12em] text-muted uppercase underline decoration-line/80 underline-offset-4 transition-colors group-hover:text-fg">
                  composite-understatement cases
                </span>
                <ChevronDown
                  className={`size-3.5 shrink-0 text-subtle transition-transform duration-300 ${underOpen ? "rotate-180" : ""}`}
                  strokeWidth={1.75}
                />
              </button>
              <ExpandPanel open={underOpen}>
                <div className="flex flex-wrap gap-1.5">
                  {understates.map((s) => (
                    <button
                      key={s.site}
                      type="button"
                      onClick={() => onSelectSite(s.site)}
                      className="rounded-full bg-bg-elevated px-2.5 py-1 font-mono text-[11px] text-fg transition-colors duration-150 hover:bg-ink hover:text-ink-fg"
                    >
                      {s.site}
                    </button>
                  ))}
                </div>
              </ExpandPanel>
            </div>
          </div>

          <p className="mt-3 text-[11px] leading-relaxed text-subtle">
            Illustrations of screening patterns in this dataset, not a prevalence estimate.
          </p>
        </article>

        <article className="border-t border-line pt-5 lg:col-span-1 lg:pt-6">
          <p className="font-display text-xl leading-snug tracking-[-0.02em] text-fg md:text-2xl">
            Individual hazards need to be read separately.
          </p>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">
            A composite score combines pathogen, faecal and ARG signals into one number. When those
            signals differ substantially, the composite can make an individual hazard less visible.
          </p>
          <div className="mt-4 border-l border-line pl-4 font-mono text-[11px] leading-relaxed text-fg md:text-xs">
            <p className="text-[10px] font-medium tracking-[0.14em] text-muted uppercase">
              Pathogen + faecal + ARG
            </p>
            <p className="my-1 text-subtle">↓</p>
            <p className="font-medium">Composite</p>
            <p className="mt-2 max-w-sm font-sans text-[11px] leading-relaxed text-subtle">
              Combining signals is not inherently wrong — it summarises different hazards in one
              score.
            </p>
          </div>
        </article>

        <article className="border-t border-line pt-5 lg:col-span-1 lg:pt-6">
          <p className="font-display text-xl leading-snug tracking-[-0.02em] text-fg md:text-2xl">
            Where should we look next?
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            The flagged sites are screening candidates for direct ARG measurement. The data do not
            support using faecal indicators, land cover or infrastructure as a substitute for
            measuring ARG directly.
          </p>
        </article>
      </div>
    </div>
  );
}
