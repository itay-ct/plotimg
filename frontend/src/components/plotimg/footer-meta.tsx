"use client";

import { useEffect, useState } from "react";

import { PRODUCTION_VERSION_LABEL, resolveVersionLabel } from "@/lib/version";

export function PlotimgFooterMeta() {
  const [versionLabel, setVersionLabel] = useState(PRODUCTION_VERSION_LABEL);

  useEffect(() => {
    setVersionLabel(resolveVersionLabel(window.location.hostname));
  }, []);

  return (
    <footer className="mt-6 pb-2 text-center text-[11px] tracking-[0.12em] text-[rgba(17,49,39,0.34)]">
      <span>v{versionLabel}</span>
      <span className="mx-2">·</span>
      <a
        href="mailto:support@plotimg.com"
        className="transition hover:text-[rgba(17,49,39,0.58)]"
      >
        support@plotimg.com
      </a>
    </footer>
  );
}
