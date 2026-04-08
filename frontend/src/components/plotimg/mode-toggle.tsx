"use client";

import { clsx } from "clsx";

export type PlotimgMode = "2d" | "3d";

export function PlotimgModeToggle({
  mode,
  onChange,
}: {
  mode: PlotimgMode;
  onChange: (mode: PlotimgMode) => void;
}) {
  return (
    <div className="inline-flex rounded-full border border-[rgba(17,49,39,0.08)] bg-white/84 p-1 shadow-[0_10px_28px_rgba(17,49,39,0.08)]">
      {(["2d", "3d"] as PlotimgMode[]).map((option) => {
        const active = option === mode;
        return (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={clsx(
              "rounded-full px-4 py-2 text-sm font-semibold uppercase tracking-[0.18em] transition",
              active
                ? "bg-[rgba(17,49,39,0.92)] text-white shadow-[0_10px_24px_rgba(17,49,39,0.16)]"
                : "text-[rgba(17,49,39,0.58)] hover:text-[rgba(17,49,39,0.86)]",
            )}
            aria-pressed={active}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}
