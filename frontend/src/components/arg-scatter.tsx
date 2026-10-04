import { useMemo } from "react";
import {
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { quantile, results, type Site } from "@/lib/results";

export type SelectedCity = "all" | string;

type Props = {
  selectedId: string | null;
  selectedCity?: SelectedCity;
  onSelect: (id: string) => void;
};

type Point = Site & { x: number; y: number };

function Dot(props: {
  cx?: number;
  cy?: number;
  payload?: Point;
  selectedId: string | null;
  selectedCity: SelectedCity;
}) {
  const { cx = 0, cy = 0, payload, selectedId, selectedCity } = props;
  if (!payload) return null;
  const selected = payload.site === selectedId;
  const flagged = payload.flagged;
  const dimmed =
    selectedCity !== "all" && payload.city !== selectedCity && !selected;
  if (selected) {
    return (
      <g>
        <circle cx={cx} cy={cy} r={9} fill="#faf7f1" stroke="#1a1714" strokeWidth={2} />
        <text
          x={cx}
          y={cy + 1}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#1a1714"
          fontSize="11"
          fontFamily="Fraunces, Georgia, serif"
        >
          *
        </text>
      </g>
    );
  }
  if (flagged) {
    return (
      <circle
        cx={cx}
        cy={cy}
        r={5.5}
        fill="#1e3a36"
        stroke="#1a1714"
        strokeWidth={1.2}
        fillOpacity={dimmed ? 0.35 : 1}
        opacity={dimmed ? 0.45 : 1}
      />
    );
  }
  if (dimmed) {
    return (
      <circle cx={cx} cy={cy} r={3.5} fill="#c8c2b6" fillOpacity={0.42} stroke="none" />
    );
  }
  return <circle cx={cx} cy={cy} r={4} fill="#b0a89a" fillOpacity={0.85} stroke="none" />;
}

function Tip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: Point }>;
}) {
  if (!active || !payload?.[0]) return null;
  const s = payload[0].payload;
  return (
    <div className="rounded-md bg-ink px-3 py-2 text-ink-fg shadow-[0_8px_24px_-12px_rgba(26,23,20,0.5)]">
      <div className="font-mono text-[11px] tracking-wide">
        {s.site}
        <span className="ml-1.5 font-sans text-ink-fg/70">{s.city}</span>
      </div>
      <div className="mt-0.5 text-xs">{s.name}</div>
      <div className="mt-1.5 grid grid-cols-2 gap-x-4 text-[11px] tabular-nums text-ink-fg/80">
        <span>Faecal {s.scores.faecal.toFixed(2)}</span>
        <span>ARG {s.scores.arg.toFixed(2)}</span>
      </div>
    </div>
  );
}

export function ArgScatter({ selectedId, selectedCity = "all", onSelect }: Props) {
  const points: Point[] = useMemo(
    () => results.sites.map((s) => ({ ...s, x: s.scores.faecal, y: s.scores.arg })),
    [],
  );

  const faecalLow = useMemo(
    () => quantile(results.sites.map((s) => s.scores.faecal), 0.25),
    [],
  );
  const argHigh = useMemo(
    () => quantile(results.sites.map((s) => s.scores.arg), 0.75),
    [],
  );

  const others = points.filter((p) => !p.flagged && p.site !== selectedId);
  const flagged = points.filter((p) => p.flagged && p.site !== selectedId);
  const selected = points.filter((p) => p.site === selectedId);

  return (
    <div className="relative h-[28rem] w-full md:h-[32rem]">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 28, right: 16, bottom: 12, left: 4 }}>
          <CartesianGrid stroke="#1c191614" strokeDasharray="3 6" />
          <XAxis
            type="number"
            dataKey="x"
            name="Faecal risk"
            domain={[0, 1]}
            tickCount={6}
            tick={{ fill: "#6f6a62", fontSize: 11 }}
            axisLine={{ stroke: "#1c191633" }}
            tickLine={false}
            label={{
              value: "Faecal risk",
              position: "insideBottom",
              offset: -4,
              fill: "#6f6a62",
              fontSize: 12,
            }}
          />
          <YAxis
            type="number"
            dataKey="y"
            name="ARG risk"
            domain={[0, 1]}
            tickCount={6}
            tick={{ fill: "#6f6a62", fontSize: 11 }}
            axisLine={{ stroke: "#1c191633" }}
            tickLine={false}
            label={{
              value: "ARG risk",
              angle: -90,
              position: "insideLeft",
              fill: "#6f6a62",
              fontSize: 12,
            }}
          />
          <ReferenceLine
            x={faecalLow}
            stroke="#1c19164d"
            strokeDasharray="4 5"
            ifOverflow="extendDomain"
          />
          <ReferenceLine
            y={argHigh}
            stroke="#1c19164d"
            strokeDasharray="4 5"
            ifOverflow="extendDomain"
          />
          <Tooltip content={<Tip />} cursor={{ stroke: "#1c191633", strokeDasharray: "3 3" }} />
          <Scatter
            data={others}
            isAnimationActive={false}
            shape={(p: { cx?: number; cy?: number; payload?: Point }) => (
              <Dot
                cx={p.cx}
                cy={p.cy}
                payload={p.payload}
                selectedId={selectedId}
                selectedCity={selectedCity}
              />
            )}
            onClick={(d) => {
              const site = (d as Point).site;
              if (site) onSelect(site);
            }}
          />
          <Scatter
            data={flagged}
            isAnimationActive={false}
            shape={(p: { cx?: number; cy?: number; payload?: Point }) => (
              <Dot
                cx={p.cx}
                cy={p.cy}
                payload={p.payload}
                selectedId={selectedId}
                selectedCity={selectedCity}
              />
            )}
            onClick={(d) => {
              const site = (d as Point).site;
              if (site) onSelect(site);
            }}
          />
          <Scatter
            data={selected}
            isAnimationActive={false}
            shape={(p: { cx?: number; cy?: number; payload?: Point }) => (
              <Dot
                cx={p.cx}
                cy={p.cy}
                payload={p.payload}
                selectedId={selectedId}
                selectedCity={selectedCity}
              />
            )}
            onClick={(d) => {
              const site = (d as Point).site;
              if (site) onSelect(site);
            }}
          />
        </ScatterChart>
      </ResponsiveContainer>
      <p className="pointer-events-none absolute top-1 left-[18%] max-w-[12rem] text-[11px] leading-snug text-muted">
        Low faecal, high ARG
        <span className="mt-0.5 block text-subtle">
          faecal in the lowest quarter, ARG in the highest quarter
        </span>
      </p>
    </div>
  );
}
