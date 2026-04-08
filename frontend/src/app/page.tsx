import { Suspense } from "react";

import { PlotimgWorkspace } from "@/components/plotimg/plotimg-workspace";

export default function Home() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(243,217,160,0.3),_transparent_40%),linear-gradient(180deg,#f5fbf7_0%,#eef6f1_100%)] px-6 text-center">
          <div className="rounded-[2rem] border border-white/70 bg-white/75 px-8 py-10 shadow-[0_24px_80px_rgba(17,49,39,0.12)]">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[rgba(17,49,39,0.46)]">
              Plotimg
            </p>
            <h1 className="mt-3 text-2xl font-semibold text-[rgba(17,49,39,0.92)]">
              Loading your studio...
            </h1>
          </div>
        </main>
      }
    >
      <PlotimgWorkspace />
    </Suspense>
  );
}
