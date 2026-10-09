"use client";

import type { ReactNode } from "react";
import { Area, AreaChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { ChartTooltip } from "./ChartCard";
import { CHART } from "./tokens";

export interface TrendDatum {
  label: string;
  value: number;
  display: string;
}

/** Single-series trend: 2px line over a ~10% wash, hairline grid, crosshair + tooltip, end label. */
export function TrendArea({
  data,
  tickFormat,
  tooltip,
  height = 240,
}: {
  data: TrendDatum[];
  tickFormat: (v: number) => string;
  tooltip?: (d: TrendDatum) => ReactNode;
  height?: number;
}) {
  const last = data.length - 1;
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 20, right: 24, bottom: 0, left: 0 }} accessibilityLayer>
          <CartesianGrid vertical={false} stroke={CHART.grid} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={{ stroke: CHART.baseline }}
            tick={{ fill: CHART.muted, fontSize: 12 }}
            interval="preserveStartEnd"
            minTickGap={12}
          />
          <YAxis
            tickFormatter={tickFormat}
            tickLine={false}
            axisLine={false}
            width={56}
            tick={{ fill: CHART.muted, fontSize: 12 }}
            allowDecimals={false}
          />
          <Tooltip
            cursor={{ stroke: CHART.muted, strokeWidth: 1 }}
            isAnimationActive={false}
            content={({ active, payload, label }) => (
              <ChartTooltip
                active={active}
                payload={payload as never}
                label={label}
                value={(row) => (tooltip ? tooltip(row as unknown as TrendDatum) : (row as unknown as TrendDatum).display)}
              />
            )}
          />
          <Area
            type="linear"
            dataKey="value"
            stroke={CHART.series}
            strokeWidth={2}
            fill={CHART.series}
            fillOpacity={0.1}
            dot={false}
            activeDot={{ r: 4, fill: CHART.series, stroke: CHART.surface, strokeWidth: 2 }}
            isAnimationActive={false}
          >
            {/* Label only the end point; the axis, tooltip and table carry the rest. Put it on the
                side the line isn't coming from, so the text never sits on the stroke. */}
            <LabelList
              dataKey="display"
              content={({ x, y, index, value }) => {
                if (index !== last) return null;
                const falling = last > 0 && data[last - 1].value > data[last].value;
                return (
                  <text
                    x={Number(x)}
                    y={Number(y) + (falling ? 20 : -10)}
                    textAnchor="end"
                    fontSize={12}
                    fontWeight={600}
                    fill={CHART.primary}
                  >
                    {value}
                  </text>
                );
              }}
            />
          </Area>
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
