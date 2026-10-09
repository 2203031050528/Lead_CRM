/**
 * Chart colour roles. One series everywhere, so one hue: the brand indigo, validated with the
 * dataviz palette checks against the white card surface (lightness band, chroma floor,
 * ≥3:1 contrast). Chrome uses the app's slate neutrals. Text never wears the series colour.
 */
export const CHART = {
  series: "#4f46e5", // indigo-600
  track: "#e0e7ff", // indigo-100: meter track, same ramp as the fill
  grid: "#e2e8f0", // slate-200 hairline
  baseline: "#cbd5e1", // slate-300
  muted: "#64748b", // slate-500: axis ticks and labels (4.8:1 on white)
  secondary: "#475569", // slate-600
  primary: "#0f172a", // slate-900
  hover: "rgba(15, 23, 42, 0.04)",
  surface: "#ffffff",
} as const;
