"use client";

import { useEffect, useState } from "react";

import { KirigamiStudio } from "@/components/plotimg/3d/kirigami-studio";

import { PlotimgModeToggle, type PlotimgMode } from "./mode-toggle";
import { PlotimgStudio } from "./plotimg-studio";

const MODE_STORAGE_KEY = "plotimg-workspace-mode-v1";

export function PlotimgWorkspace() {
  const [mode, setMode] = useState<PlotimgMode>("2d");

  useEffect(() => {
    const savedMode = window.sessionStorage.getItem(MODE_STORAGE_KEY);
    if (savedMode === "2d" || savedMode === "3d") {
      setMode(savedMode);
    }
  }, []);

  useEffect(() => {
    window.sessionStorage.setItem(MODE_STORAGE_KEY, mode);
  }, [mode]);

  const toggle = <PlotimgModeToggle mode={mode} onChange={setMode} />;

  return mode === "2d" ? (
    <PlotimgStudio modeToggle={toggle} />
  ) : (
    <KirigamiStudio modeToggle={toggle} />
  );
}
