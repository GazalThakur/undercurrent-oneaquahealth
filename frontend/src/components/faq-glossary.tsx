import { ChevronDown, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

type KeywordId =
  | "arg"
  | "composite"
  | "faecal"
  | "pathogen"
  | "screening"
  | "spearman";

type KeywordEntry = {
  id: KeywordId;
  label: string;
  simple: string;
  inUndercurrent: string;
};

const KEYWORDS: KeywordEntry[] = [
  {
    id: "arg",
    label: "ARG",
    simple:
      "ARG stands for antimicrobial resistance genes — genes associated with the ability of microbes to resist antimicrobial treatments.",
    inUndercurrent:
      "ARG is one of the individual risk signals in the dataset. Undercurrent shows it separately because ARG risk does not track faecal risk in this dataset.",
  },
  {
    id: "composite",
    label: "Composite",
    simple: "A composite score combines several individual signals into one overall score.",
    inUndercurrent:
      "Undercurrent combines pathogen, faecal and ARG signals into a composite. Looking only at that average can make a difference in one individual hazard less visible.",
  },
  {
    id: "faecal",
    label: "Faecal risk",
    simple: "A score representing faecal contamination risk at a stream site.",
    inUndercurrent:
      "Undercurrent compares faecal risk with ARG risk. The key observation is that the two do not track each other in this dataset.",
  },
  {
    id: "pathogen",
    label: "Pathogen risk",
    simple: "A score representing pathogen-related risk at a stream site.",
    inUndercurrent:
      "Pathogen risk is one of the individual signals shown alongside faecal, ARG and composite scores on the map.",
  },
  {
    id: "screening",
    label: "Screening",
    simple:
      "A way of identifying sites that meet a predefined pattern worth looking at more closely.",
    inUndercurrent:
      "Undercurrent uses rank-based screening rules to flag sites where low faecal/high ARG risk appears, or where a component hazard ranks substantially higher than the composite. Screening is not confirmation.",
  },
  {
    id: "spearman",
    label: "Spearman",
    simple:
      "A statistic that describes how strongly two variables move together in their rankings.",
    inUndercurrent:
      "Undercurrent uses within-dataset Spearman correlation to examine whether ARG risk moves with faecal risk. The observed value is −0.03 within this dataset.",
  },
];

function ExpandPanel({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div
      className="grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none"
      style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
    >
      <div className="min-h-0 overflow-hidden">
        <div className="pt-3">{children}</div>
      </div>
    </div>
  );
}

type Props = {
  onNavigate: (sectionId: string) => void;
  onExploreFlagged: () => void;
};

export function FaqGlossary({ onNavigate, onExploreFlagged }: Props) {
  const [activeKeyword, setActiveKeyword] = useState<KeywordId | null>(null);
  const [popoverStyle, setPopoverStyle] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const [openQuestion, setOpenQuestion] = useState<number | null>(null);
  const keywordRefs = useRef<Partial<Record<KeywordId, HTMLButtonElement | null>>>({});
  const dialogRef = useRef<HTMLDivElement>(null);

  const activeEntry = KEYWORDS.find((k) => k.id === activeKeyword);

  const positionPopover = useCallback(() => {
    if (!activeKeyword) {
      setPopoverStyle(null);
      return;
    }
    const btn = keywordRefs.current[activeKeyword];
    if (!btn) return;

    const margin = 12;
    const maxW = Math.min(360, window.innerWidth - margin * 2);
    const rect = btn.getBoundingClientRect();
    const dialogH = dialogRef.current?.offsetHeight ?? 280;

    let top = rect.bottom + 8;
    if (top + dialogH > window.innerHeight - margin) {
      top = Math.max(margin, rect.top - dialogH - 8);
    }

    let left = rect.left + rect.width / 2 - maxW / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - maxW - margin));

    setPopoverStyle({ top, left, width: maxW });
  }, [activeKeyword]);

  useLayoutEffect(() => {
    positionPopover();
    const id = requestAnimationFrame(() => positionPopover());
    return () => cancelAnimationFrame(id);
  }, [activeKeyword, activeEntry, positionPopover]);

  useEffect(() => {
    if (!activeKeyword) return;
    const onResize = () => positionPopover();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [activeKeyword, positionPopover]);

  useEffect(() => {
    if (!activeKeyword) return;
    function onPointerDown(e: MouseEvent | TouchEvent) {
      const t = e.target as Node;
      if (dialogRef.current?.contains(t)) return;
      if (Object.values(keywordRefs.current).some((btn) => btn?.contains(t))) return;
      setActiveKeyword(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setActiveKeyword(null);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [activeKeyword]);

  const questions = [
    {
      q: "Why can the composite hide a hazard?",
      a: (
        <>
          <p>
            The composite combines multiple hazard signals into one number. When those signals differ
            substantially, an individual hazard can become less visible in the average. The composite
            is not inherently wrong — it simply tells a different story from looking at each hazard
            separately.
          </p>
          <button
            type="button"
            onClick={() => onNavigate("claims")}
            className="mt-3 text-sm text-fg underline decoration-line underline-offset-4 transition-colors hover:text-muted"
          >
            See the claims →
          </button>
        </>
      ),
    },
    {
      q: "Does low faecal risk mean low ARG risk?",
      a: (
        <>
          <p>
            Not in this dataset. ARG and faecal risk show essentially no relationship here, which is
            why faecal indicators cannot be treated as a reliable screen for ARG risk.
          </p>
          <button
            type="button"
            onClick={() => onNavigate("scatter")}
            className="mt-3 text-sm text-fg underline decoration-line underline-offset-4 transition-colors hover:text-muted"
          >
            Explore the scatter →
          </button>
        </>
      ),
    },
    {
      q: "What should I do with a flagged site?",
      a: (
        <>
          <p>
            A flagged site is a candidate for direct ARG measurement or further investigation. The
            screening signal helps indicate where to look next; it does not replace direct measurement
            or establish that a site is hazardous.
          </p>
          <button
            type="button"
            onClick={onExploreFlagged}
            className="mt-3 text-sm text-fg underline decoration-line underline-offset-4 transition-colors hover:text-muted"
          >
            Explore flagged sites →
          </button>
        </>
      ),
    },
  ];

  return (
    <section
      id="faq"
      className="border-t border-line px-5 py-14 md:px-10 md:py-20"
      aria-labelledby="faq-heading"
    >
      <div className="mx-auto max-w-3xl">
        <header className="max-w-2xl">
          <p className="text-[11px] font-medium tracking-[0.2em] text-muted uppercase">
            Questions you might have
          </p>
          <h2
            id="faq-heading"
            className="font-display mt-3 text-4xl tracking-[-0.03em] text-fg md:text-5xl"
          >
            Understand the language
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-muted">
            A few terms you&apos;ll see throughout Undercurrent, explained simply.
          </p>
        </header>

        <div className="mt-12 border-t border-line pt-8">
          <p className="text-[10px] font-medium tracking-[0.18em] text-muted uppercase">
            Common keywords
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-x-1 gap-y-2">
            {KEYWORDS.map((kw, i) => {
              const isActive = activeKeyword === kw.id;
              return (
                <span key={kw.id} className="inline-flex items-center">
                  {i > 0 ? (
                    <span className="mx-1.5 text-subtle select-none" aria-hidden="true">
                      ·
                    </span>
                  ) : null}
                  <button
                    ref={(el) => {
                      keywordRefs.current[kw.id] = el;
                    }}
                    type="button"
                    onClick={() => setActiveKeyword((prev) => (prev === kw.id ? null : kw.id))}
                    aria-expanded={isActive}
                    aria-haspopup="dialog"
                    className={`rounded-full border px-3 py-1.5 text-sm transition-colors duration-150 ${
                      isActive
                        ? "border-fg/30 bg-bg-elevated text-fg"
                        : "border-line bg-transparent text-fg hover:border-fg/20 hover:bg-paper/80"
                    }`}
                  >
                    {kw.label}
                  </button>
                </span>
              );
            })}
          </div>
        </div>

        {activeEntry && popoverStyle ? (
          <div
            ref={dialogRef}
            role="dialog"
            aria-labelledby="keyword-dialog-title"
            className="fixed z-50 rounded-lg border border-line/90 bg-paper p-5 shadow-[0_0_0_1px_rgba(28,25,22,0.04),0_16px_40px_-16px_rgba(28,25,22,0.35)]"
            style={{
              top: popoverStyle.top,
              left: popoverStyle.left,
              width: popoverStyle.width,
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <h3
                id="keyword-dialog-title"
                className="font-display text-2xl tracking-[-0.02em] text-fg"
              >
                {activeEntry.label}
              </h3>
              <button
                type="button"
                onClick={() => setActiveKeyword(null)}
                className="shrink-0 rounded-full p-1.5 text-muted transition-colors hover:bg-bg-elevated hover:text-fg"
                aria-label="Close"
              >
                <X className="size-4" strokeWidth={1.5} />
              </button>
            </div>
            <div className="mt-4 space-y-4 border-t border-line pt-4">
              <div>
                <p className="text-[10px] font-medium tracking-[0.16em] text-muted uppercase">
                  Simple explanation
                </p>
                <p className="mt-2 text-sm leading-relaxed text-fg">{activeEntry.simple}</p>
              </div>
              <div>
                <p className="text-[10px] font-medium tracking-[0.16em] text-muted uppercase">
                  In Undercurrent
                </p>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {activeEntry.inUndercurrent}
                </p>
              </div>
            </div>
          </div>
        ) : null}

        <div className="mt-14 border-t border-line pt-10">
          <p className="text-[10px] font-medium tracking-[0.18em] text-muted uppercase">
            Still wondering?
          </p>
          <ul className="mt-6 divide-y divide-line">
            {questions.map((item, index) => {
              const open = openQuestion === index;
              return (
                <li key={item.q} className="py-1">
                  <button
                    type="button"
                    onClick={() => setOpenQuestion((prev) => (prev === index ? null : index))}
                    aria-expanded={open}
                    className="group flex w-full items-start justify-between gap-4 py-4 text-left"
                  >
                    <span className="font-display text-lg leading-snug tracking-[-0.02em] text-fg md:text-xl">
                      {item.q}
                    </span>
                    <ChevronDown
                      className={`mt-1 size-4 shrink-0 text-subtle transition-transform duration-300 group-hover:text-fg ${open ? "rotate-180" : ""}`}
                      strokeWidth={1.5}
                    />
                  </button>
                  <ExpandPanel open={open}>
                    <div className="max-w-2xl pb-4 text-[15px] leading-relaxed text-muted">
                      {item.a}
                    </div>
                  </ExpandPanel>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="mt-14 border border-line bg-bg-elevated/40 px-6 py-8 md:px-8">
          <p className="text-[10px] font-medium tracking-[0.18em] text-muted uppercase">
            Still curious?
          </p>
          <p className="mt-3 font-display text-xl tracking-[-0.02em] text-fg md:text-2xl">
            Want the numbers, methods and assumptions behind the story?
          </p>
          <button
            type="button"
            onClick={() => onNavigate("methods")}
            className="mt-4 text-sm font-medium text-fg underline decoration-line underline-offset-4 transition-colors hover:text-muted"
          >
            Read the methods →
          </button>
        </div>
      </div>
    </section>
  );
}
