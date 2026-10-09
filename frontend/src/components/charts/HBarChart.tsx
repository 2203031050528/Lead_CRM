"use client";

import type { ReactNode } from "react";
import { Bar, BarChart, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { ChartTooltip } from "./ChartCard";
import { CHART } from "./tokens";

const ROW = 34;
const CHAR = 7; // ≈ px per character at 12px

export interface BarDatum {
  label: string;
  value: number;
  /** Text at the bar tip and in the tooltip; defaults to the value. */
  display?: string;
}

/**
 * Single-series horizontal bars: one hue, no legend (the card title names the series),
 * value at each tip, 4px rounded data-end, square at the baseline, bars ≤ 24px thick.
 */
export function HBarChart({ data, tooltip }: { data: BarDatum[]; tooltip?: (d: BarDatum) => ReactNode }) {
  const longestLabel = Math.max(...data.map((d) => d.label.length), 4);
  const axisWidth = Math.min(160, Math.max(64, longestLabel * CHAR + 12));
  const maxChars = Math.floor((axisWidth - 12) / CHAR);
  const longestValue = Math.max(...data.map((d) => (d.display ?? String(d.value)).length), 1);
  const height = data.length * ROW + 8;

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: longestValue * CHAR + 16, bottom: 4, left: 0 }}
          accessibilityLayer
        >
          <XAxis type="number" hide domain={[0, (max: number) => Math.max(max, 1)]} />
          <YAxis
            type="category"
            dataKey="label"
            width={axisWidth}
            tickLine={false}
            axisLine={false}
            interval={0}
            tick={({ x, y, payload }) => {
              const text: string = payload.value;
              const short = text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text;
              return (
                <text x={x - 8} y={y} dy={4} textAnchor="end" fontSize={12} fill={CHART.secondary}>
                  <title>{text}</title>
                  {short}
                </text>
              );
            }}
          />
          <ReferenceLine x={0} stroke={CHART.baseline} />
          <Tooltip
            cursor={{ fill: CHART.hover }}
            isAnimationActive={false}
            content={({ active, payload, label }) => (
              <ChartTooltip
                active={active}
                payload={payload as never}
                label={label}
                value={(row) => (tooltip ? tooltip(row as unknown as BarDatum) : ((row as unknown as BarDatum).display ?? String(row.value)))}
              />
            )}
          />
          <Bar dataKey="value" fill={CHART.series} barSize={16} radius={[0, 4, 4, 0]} isAnimationActive={false}>
            <LabelList
              dataKey="display"
              position="right"
              offset={8}
              fontSize={12}
              fill={CHART.secondary}
              className="tabular-nums"
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
