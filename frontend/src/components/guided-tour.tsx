import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export const GUIDED_TOUR_STORAGE_KEY = "undercurrent-guided-tour-v1";

export const CONTENT_STEP_COUNT = 5;

export type GuidedTourStep = {
  target: string;
  fallbackTarget?: string;
  title: string;
  body: string;
};

type Rect = { top: number; left: number; width: number; height: number };

type Placement = "top" | "bottom" | "left" | "right";

export function queryTourTarget(selector: string, fallback?: string): Element | null {
  const el = document.querySelector(selector);
  if (el) return el;
  if (fallback) return document.querySelector(fallback);
  return null;
}

function padRect(rect: DOMRect, pad: number): Rect {
  return {
    top: rect.top - pad,
    left: rect.left - pad,
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
  };
}

function rectsOverlap(a: Rect, b: Rect, gap: number): boolean {
  return !(
    a.left + a.width + gap <= b.left ||
    b.left + b.width + gap <= a.left ||
    a.top + a.height + gap <= b.top ||
    b.top + b.height + gap <= a.top
  );
}

function clampCallout(rect: Rect, vw: number, vh: number, pad: number): Rect {
  const w = rect.width;
  const h = rect.height;
  let left = Math.max(pad, Math.min(rect.left, vw - w - pad));
  let top = Math.max(pad, Math.min(rect.top, vh - h - pad));
  return { top, left, width: w, height: h };
}

/** Place callout beside target without overlapping; prefer below, then above, then sides. */
export function positionTourCallout(
  target: Rect,
  calloutW: number,
  calloutH: number,
): { top: number; left: number; placement: Placement } {
  const gap = 14;
  const arrow = 12;
  const pad = 12;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const tcx = target.left + target.width / 2;
  const tcy = target.top + target.height / 2;

  const placements: Placement[] = ["bottom", "top", "right", "left"];

  const candidates: Array<{ top: number; left: number; placement: Placement; overlap: number }> =
    [];

  for (const side of placements) {
    let top = 0;
    let left = 0;
    if (side === "bottom") {
      top = target.top + target.height + gap + arrow;
      left = tcx - calloutW / 2;
    } else if (side === "top") {
      top = target.top - gap - arrow - calloutH;
      left = tcx - calloutW / 2;
    } else if (side === "right") {
      top = tcy - calloutH / 2;
      left = target.left + target.width + gap + arrow;
    } else {
      top = tcy - calloutH / 2;
      left = target.left - gap - arrow - calloutW;
    }

    const clamped = clampCallout(
      { top, left, width: calloutW, height: calloutH },
      vw,
      vh,
      pad,
    );
    const overlap = rectsOverlap(clamped, target, gap) ? 1 : 0;
    candidates.push({ ...clamped, placement: side, overlap });
  }

  const clear = candidates.filter((c) => c.overlap === 0);
  const pool = clear.length > 0 ? clear : candidates;
  const preferred = pool.find((c) => c.placement === "bottom") ?? pool[0];

  return { top: preferred.top, left: preferred.left, placement: preferred.placement };
}

export function setCalloutArrow(
  el: HTMLElement,
  placement: Placement,
  callout: Rect,
  target: Rect,
) {
  const tcx = target.left + target.width / 2;
  const tcy = target.top + target.height / 2;
  if (placement === "bottom") {
    el.style.setProperty("--tour-arrow-x", `${tcx - callout.left}px`);
    el.style.setProperty("--tour-arrow-y", "-5px");
  } else if (placement === "top") {
    el.style.setProperty("--tour-arrow-x", `${tcx - callout.left}px`);
    el.style.setProperty("--tour-arrow-y", `${callout.height - 5}px`);
  } else if (placement === "right") {
    el.style.setProperty("--tour-arrow-x", "-5px");
    el.style.setProperty("--tour-arrow-y", `${tcy - callout.top}px`);
  } else {
    el.style.setProperty("--tour-arrow-x", `${callout.width - 5}px`);
    el.style.setProperty("--tour-arrow-y", `${tcy - callout.top}px`);
  }
  el.dataset.tourPlacement = placement;
}

function DimmingShades({ target }: { target: Rect | null }) {
  if (!target) {
    return <div className="guided-tour-shade guided-tour-shade--full" aria-hidden="true" />;
  }
  const { top, left, width, height } = target;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const right = left + width;
  const bottom = top + height;
  return (
    <>
      <div className="guided-tour-shade" style={{ top: 0, left: 0, width: vw, height: top }} />
      <div
        className="guided-tour-shade"
        style={{ top: bottom, left: 0, width: vw, height: vh - bottom }}
      />
      <div className="guided-tour-shade" style={{ top, left: 0, width: left, height }} />
      <div
        className="guided-tour-shade"
        style={{ top, left: right, width: vw - right, height }}
      />
    </>
  );
}

type Props = {
  open: boolean;
  step: number;
  steps: GuidedTourStep[];
  finalStep: { title: string; body: string };
  onBack: () => void;
  onNext: () => void;
  onClose: (completed: boolean) => void;
  nextDisabled?: boolean;
  /** Hide Next (action-triggered steps). */
  hideNext?: boolean;
};

export function GuidedTour({
  open,
  step,
  steps,
  finalStep,
  onBack,
  onNext,
  onClose,
  nextDisabled = false,
  hideNext = false,
}: Props) {
  const calloutRef = useRef<HTMLDivElement>(null);
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const [calloutPos, setCalloutPos] = useState<{
    top: number;
    left: number;
    placement: Placement;
  } | null>(null);
  const [missingTarget, setMissingTarget] = useState(false);

  const isFinal = step >= steps.length;
  const current = isFinal ? null : steps[step];

  const measure = useCallback(() => {
    if (!open) return;
    if (isFinal) {
      setTargetRect(null);
      setMissingTarget(false);
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const w = Math.min(300, vw - 24);
      setCalloutPos({
        top: Math.max(24, vh / 2 - 110),
        left: (vw - w) / 2,
        placement: "bottom",
      });
      return;
    }
    if (!current) return;
    const el = queryTourTarget(current.target, current.fallbackTarget);
    const calloutEl = calloutRef.current;
    if (!el || !calloutEl) {
      if (!el) {
        setTargetRect(null);
        setMissingTarget(true);
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        setCalloutPos({ top: vh / 2 - 100, left: vw / 2 - 150, placement: "bottom" });
      }
      return;
    }
    setMissingTarget(false);
    const rect = padRect(el.getBoundingClientRect(), 8);
    setTargetRect(rect);
    const cw = calloutEl.offsetWidth;
    const ch = calloutEl.offsetHeight;
    const pos = positionTourCallout(rect, cw, ch);
    setCalloutPos(pos);
    const calloutRect: Rect = { top: pos.top, left: pos.left, width: cw, height: ch };
    setCalloutArrow(calloutEl, pos.placement, calloutRect, rect);
  }, [open, isFinal, current]);

  useLayoutEffect(() => {
    measure();
  }, [measure, step, open]);

  useEffect(() => {
    if (!open) return;
    const onScroll = () => measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    const ro = new ResizeObserver(() => measure());
    if (calloutRef.current) ro.observe(calloutRef.current);
    const id = window.setInterval(measure, 200);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      ro.disconnect();
      window.clearInterval(id);
    };
  }, [open, measure]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  const title = isFinal ? finalStep.title : current?.title;
  const body = isFinal ? finalStep.body : current?.body;
  const showBack = step > 0;

  return createPortal(
    <div
      className="guided-tour-root"
      role="dialog"
      aria-modal="true"
      aria-labelledby="guided-tour-title"
    >
      <DimmingShades target={isFinal ? null : targetRect} />
      {targetRect ? (
        <div
          className="guided-tour-spotlight"
          style={{
            top: targetRect.top,
            left: targetRect.left,
            width: targetRect.width,
            height: targetRect.height,
          }}
          aria-hidden="true"
        />
      ) : null}
      <div
        ref={calloutRef}
        className={`guided-tour-callout guided-tour-callout--${calloutPos?.placement ?? "bottom"}${missingTarget ? " guided-tour-callout--fallback" : ""}`}
        style={
          calloutPos
            ? {
                top: calloutPos.top,
                left: calloutPos.left,
                maxWidth: "min(18.5rem, calc(100vw - 1.5rem))",
              }
            : undefined
        }
      >
        {!isFinal ? (
          <p className="guided-tour-step" aria-hidden="true">
            {step + 1}/{CONTENT_STEP_COUNT}
          </p>
        ) : null}
        <h2 id="guided-tour-title" className="guided-tour-title">{title}</h2>
        <p className="guided-tour-body">{body}</p>
        <div className="guided-tour-actions">
          <button type="button" className="guided-tour-end" onClick={() => onClose(false)}>
            End tour
          </button>
          <div className="guided-tour-nav">
            {showBack ? (
              <button type="button" className="guided-tour-back" onClick={onBack}>
                Back
              </button>
            ) : null}
            {isFinal ? (
              <button type="button" className="guided-tour-next" onClick={() => onClose(true)}>
                Finish
              </button>
            ) : hideNext ? null : (
              <button
                type="button"
                className="guided-tour-next"
                onClick={onNext}
                disabled={nextDisabled}
              >
                Next
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
