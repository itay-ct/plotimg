"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { ChevronDown, Download, LoaderCircle, RefreshCcw, Upload } from "lucide-react";
import { clsx } from "clsx";

import { PlotimgFooterMeta } from "@/components/plotimg/footer-meta";
import {
  planeBasis,
  projectedSurfaceBounds,
  projectPoint,
  surfaceCorners,
} from "@/lib/kirigami/geometry";
import {
  KIRIGAMI_TEMPLATE_MAP,
  findTemplateSafeZone,
} from "@/lib/kirigami/templates";
import type {
  KirigamiCamera,
  KirigamiSnapshot,
  LayerVisibility,
  OverlayPlacement,
  OverlaySlot,
  OverlayState,
} from "@/lib/kirigami/types";
import {
  createDefaultPlacement,
  importOverlaySvg,
  nestedOverlaySvgMarkup,
  serializeLayeredSvg,
} from "@/lib/kirigami/svg";

const KIRIGAMI_STORAGE_KEY = "plotimg-kirigami-state-v2";
const CAMERA_OPTIONS: KirigamiCamera[] = ["3d", "top", "side", "flat"];
const TEMPLATE_ID = "sample_reference_01";
const TEMPLATE = KIRIGAMI_TEMPLATE_MAP[TEMPLATE_ID];
const SNAPSHOT_LAYER_VISIBILITY: LayerVisibility = {
  cut: true,
  mountain_fold: true,
  valley_fold: true,
  side_view_plot: true,
  top_view_plot: true,
};

function emptyOverlayState(): OverlayState {
  return {
    imported: null,
    placement: createDefaultPlacement(),
  };
}

function slotTitle(slot: OverlaySlot) {
  return slot === "top" ? "Top SVG" : "Side SVG";
}

function slotDescription(slot: OverlaySlot) {
  return slot === "top"
    ? "Maps to the horizontal-facing surfaces."
    : "Maps to the front-facing surfaces.";
}

function sectionPanel(children: ReactNode, className?: string) {
  return (
    <section
      className={clsx(
        "plotimg-panel plotimg-shadow overflow-hidden rounded-[2rem] border border-white/75",
        className,
      )}
    >
      {children}
    </section>
  );
}

function SmallRange({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="space-y-1.5">
      <div className="flex items-center justify-between gap-4 text-[12px] font-medium text-[rgba(17,49,39,0.66)]">
        <span>{label}</span>
        <span className="text-[rgba(17,49,39,0.9)]">{value.toFixed(step < 1 ? 2 : 0)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="plotimg-range h-1.5 w-full cursor-pointer rounded-full bg-[rgba(17,49,39,0.1)]"
      />
    </label>
  );
}

function OverlayAdjustPanel({
  overlayState,
  onChange,
  onReset,
}: {
  overlayState: OverlayState;
  onChange: (updater: (placement: OverlayPlacement) => OverlayPlacement) => void;
  onReset: () => void;
}) {
  return (
    <div className="space-y-3 border-t border-[rgba(17,49,39,0.08)] px-3 pb-3 pt-3">
      <label className="flex items-center justify-between gap-3 rounded-[1rem] border border-[rgba(17,49,39,0.08)] bg-white/72 px-3.5 py-2.5">
        <span className="text-sm text-[rgba(17,49,39,0.72)]">Show overlay</span>
        <input
          type="checkbox"
          checked={overlayState.placement.visible}
          onChange={(event) =>
            onChange((placement) => ({
              ...placement,
              visible: event.target.checked,
            }))
          }
          className="h-4 w-4 accent-[var(--plotimg-mint-deep)]"
        />
      </label>

      <SmallRange
        label="Scale"
        value={overlayState.placement.scale}
        min={0.4}
        max={2.2}
        step={0.05}
        onChange={(value) =>
          onChange((placement) => ({
            ...placement,
            scale: value,
          }))
        }
      />
      <SmallRange
        label="Horizontal"
        value={overlayState.placement.offsetX}
        min={-100}
        max={100}
        step={1}
        onChange={(value) =>
          onChange((placement) => ({
            ...placement,
            offsetX: value,
          }))
        }
      />
      <SmallRange
        label="Vertical"
        value={overlayState.placement.offsetY}
        min={-100}
        max={100}
        step={1}
        onChange={(value) =>
          onChange((placement) => ({
            ...placement,
            offsetY: value,
          }))
        }
      />

      <div className="space-y-2">
        <div className="text-[12px] font-medium text-[rgba(17,49,39,0.66)]">Rotation</div>
        <div className="flex flex-wrap gap-2">
          {([0, 90, 180, 270] as const).map((rotation) => (
            <button
              key={rotation}
              type="button"
              onClick={() =>
                onChange((placement) => ({
                  ...placement,
                  rotation,
                }))
              }
              className={clsx(
                "rounded-full px-3 py-2 text-[12px] font-semibold transition",
                overlayState.placement.rotation === rotation
                  ? "bg-[rgba(17,49,39,0.92)] text-white"
                  : "border border-[rgba(17,49,39,0.1)] bg-white text-[rgba(17,49,39,0.62)]",
              )}
            >
              {rotation}°
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-[12px] font-medium text-[rgba(17,49,39,0.66)]">Fit</div>
        <div className="flex flex-wrap gap-2">
          {(["contain", "cover"] as const).map((fitMode) => (
            <button
              key={fitMode}
              type="button"
              onClick={() =>
                onChange((placement) => ({
                  ...placement,
                  fitMode,
                }))
              }
              className={clsx(
                "rounded-full px-3 py-2 text-[12px] font-semibold capitalize transition",
                overlayState.placement.fitMode === fitMode
                  ? "bg-[rgba(90,162,127,0.15)] text-[rgba(31,87,62,0.92)]"
                  : "border border-[rgba(17,49,39,0.1)] bg-white text-[rgba(17,49,39,0.62)]",
              )}
            >
              {fitMode}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() =>
            onChange((placement) => ({
              ...placement,
              offsetX: 0,
            }))
          }
          className="rounded-full border border-[rgba(17,49,39,0.1)] px-3 py-2 text-[12px] font-medium text-[rgba(17,49,39,0.62)] transition hover:text-[rgba(17,49,39,0.9)]"
        >
          Center horizontally
        </button>
        <button
          type="button"
          onClick={() =>
            onChange((placement) => ({
              ...placement,
              offsetY: 0,
            }))
          }
          className="rounded-full border border-[rgba(17,49,39,0.1)] px-3 py-2 text-[12px] font-medium text-[rgba(17,49,39,0.62)] transition hover:text-[rgba(17,49,39,0.9)]"
        >
          Center vertically
        </button>
      </div>

      <button
        type="button"
        onClick={onReset}
        className="inline-flex items-center gap-2 rounded-full border border-[rgba(17,49,39,0.1)] px-3 py-2 text-[12px] font-medium text-[rgba(17,49,39,0.62)] transition hover:text-[rgba(17,49,39,0.9)]"
      >
        <RefreshCcw className="h-3.5 w-3.5" />
        Reset placement
      </button>
    </div>
  );
}

function OpenedShapePreview({
  camera,
  topOverlay,
  sideOverlay,
}: {
  camera: KirigamiCamera;
  topOverlay: OverlayState;
  sideOverlay: OverlayState;
}) {
  if (camera === "flat") {
    const topSafe = TEMPLATE.safeZones.top;
    const sideSafe = TEMPLATE.safeZones.side;

    return (
      <svg
        viewBox={`0 0 ${TEMPLATE.page.width} ${TEMPLATE.page.height}`}
        className="h-full w-full"
        aria-label="Flat unfolded preview"
      >
        <rect
          x="0"
          y="0"
          width={TEMPLATE.page.width}
          height={TEMPLATE.page.height}
          rx="28"
          fill="#fffdf9"
        />
        {TEMPLATE.layers.cut.map((path, index) => (
          <path
            key={`cut-${index}`}
            d={path}
            fill="none"
            stroke="rgba(221,93,67,0.8)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        {TEMPLATE.layers.mountain.map((path, index) => (
          <path
            key={`mountain-${index}`}
            d={path}
            fill="none"
            stroke="rgba(58,124,255,0.82)"
            strokeWidth="2.2"
            strokeDasharray="18 10"
            strokeLinecap="round"
          />
        ))}
        {TEMPLATE.layers.valley.map((path, index) => (
          <path
            key={`valley-${index}`}
            d={path}
            fill="none"
            stroke="rgba(38,153,109,0.82)"
            strokeWidth="2.2"
            strokeDasharray="6 10"
            strokeLinecap="round"
          />
        ))}
        {sideSafe ? (
          <rect
            x={sideSafe.x}
            y={sideSafe.y}
            width={sideSafe.width}
            height={sideSafe.height}
            rx="18"
            fill="rgba(241,229,219,0.42)"
            stroke="rgba(17,49,39,0.12)"
          />
        ) : null}
        {topSafe ? (
          <rect
            x={topSafe.x}
            y={topSafe.y}
            width={topSafe.width}
            height={topSafe.height}
            rx="18"
            fill="rgba(236,244,238,0.58)"
            stroke="rgba(17,49,39,0.12)"
          />
        ) : null}
        {sideSafe && sideOverlay.imported && sideOverlay.placement.visible ? (
          <g
            dangerouslySetInnerHTML={{
              __html: nestedOverlaySvgMarkup(sideOverlay.imported, sideOverlay.placement, sideSafe).svg,
            }}
          />
        ) : null}
        {topSafe && topOverlay.imported && topOverlay.placement.visible ? (
          <g
            dangerouslySetInnerHTML={{
              __html: nestedOverlaySvgMarkup(topOverlay.imported, topOverlay.placement, topSafe).svg,
            }}
          />
        ) : null}
      </svg>
    );
  }

  const projectedBounds = projectedSurfaceBounds(TEMPLATE.surfaces, camera);
  const padding = 90;
  const viewBox = `${projectedBounds.minX - padding} ${projectedBounds.minY - padding} ${projectedBounds.width + padding * 2} ${projectedBounds.height + padding * 2}`;

  return (
    <svg viewBox={viewBox} className="h-full w-full" aria-label="90 degree opened kirigami preview">
      <defs>
        {TEMPLATE.surfaces.map((surface) => (
          <clipPath
            key={`${surface.id}-clip`}
            id={`kirigami-${TEMPLATE.id}-${camera}-${surface.id}`}
          >
            <rect x="0" y="0" width={surface.size.width} height={surface.size.height} rx="12" />
          </clipPath>
        ))}
      </defs>

      {TEMPLATE.surfaces.map((surface) => {
        const corners = surfaceCorners(surface).map((point) => projectPoint(point, camera));
        const points = corners.map((point) => `${point.x},${point.y}`).join(" ");
        const basis = planeBasis(surface, camera);
        const overlayState =
          surface.overlaySlot === "top"
            ? topOverlay
            : surface.overlaySlot === "side"
              ? sideOverlay
              : null;
        const overlayMarkup =
          overlayState?.imported && overlayState.placement.visible
            ? nestedOverlaySvgMarkup(overlayState.imported, overlayState.placement, {
                x: 0,
                y: 0,
                width: surface.size.width,
                height: surface.size.height,
              }).svg
            : null;

        return (
          <g key={surface.id}>
            <g
              transform={`matrix(${basis.a} ${basis.b} ${basis.c} ${basis.d} ${basis.origin.x} ${basis.origin.y})`}
              clipPath={`url(#kirigami-${TEMPLATE.id}-${camera}-${surface.id})`}
            >
              <rect
                x="0"
                y="0"
                width={surface.size.width}
                height={surface.size.height}
                rx="12"
                fill={surface.fill}
                opacity={surface.opacity ?? 1}
              />
              {overlayMarkup ? (
                <g dangerouslySetInnerHTML={{ __html: overlayMarkup }} />
              ) : null}
            </g>
            <polygon
              points={points}
              fill="none"
              stroke={surface.stroke}
              strokeWidth="2.5"
              strokeLinejoin="round"
            />
          </g>
        );
      })}
    </svg>
  );
}

export function KirigamiStudio({
  modeToggle,
}: {
  modeToggle: ReactNode;
}) {
  const topInputRef = useRef<HTMLInputElement | null>(null);
  const sideInputRef = useRef<HTMLInputElement | null>(null);

  const [camera, setCamera] = useState<KirigamiCamera>("3d");
  const [topOverlay, setTopOverlay] = useState<OverlayState>(emptyOverlayState());
  const [sideOverlay, setSideOverlay] = useState<OverlayState>(emptyOverlayState());
  const [importingSlot, setImportingSlot] = useState<OverlaySlot | null>(null);
  const [slotErrors, setSlotErrors] = useState<Record<OverlaySlot, string | null>>({
    top: null,
    side: null,
  });
  const [downloadNotice, setDownloadNotice] = useState<string | null>(null);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState<Record<OverlaySlot, boolean>>({
    top: false,
    side: false,
  });

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(KIRIGAMI_STORAGE_KEY);
      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw) as Partial<KirigamiSnapshot>;
      if (
        parsed.camera === "3d" ||
        parsed.camera === "top" ||
        parsed.camera === "side" ||
        parsed.camera === "flat"
      ) {
        setCamera(parsed.camera);
      }

      if (parsed.topOverlay?.placement) {
        setTopOverlay({
          imported: parsed.topOverlay.imported ?? null,
          placement: {
            ...createDefaultPlacement(),
            ...parsed.topOverlay.placement,
          },
        });
      }

      if (parsed.sideOverlay?.placement) {
        setSideOverlay({
          imported: parsed.sideOverlay.imported ?? null,
          placement: {
            ...createDefaultPlacement(),
            ...parsed.sideOverlay.placement,
          },
        });
      }
    } catch (error) {
      console.warn("Kirigami session restore skipped.", error);
    }
  }, []);

  useEffect(() => {
    const snapshot: KirigamiSnapshot = {
      templateId: TEMPLATE.id,
      camera,
      topOverlay,
      sideOverlay,
      layerVisibility: SNAPSHOT_LAYER_VISIBILITY,
    };

    try {
      window.sessionStorage.setItem(KIRIGAMI_STORAGE_KEY, JSON.stringify(snapshot));
    } catch (error) {
      console.warn("Kirigami session persistence skipped.", error);
    }
  }, [camera, sideOverlay, topOverlay]);

  const topMarkup = useMemo(() => {
    const safeZone = findTemplateSafeZone(TEMPLATE, "top");
    if (!safeZone || !topOverlay.imported || !topOverlay.placement.visible) {
      return null;
    }

    return nestedOverlaySvgMarkup(topOverlay.imported, topOverlay.placement, safeZone).svg;
  }, [topOverlay]);

  const sideMarkup = useMemo(() => {
    const safeZone = findTemplateSafeZone(TEMPLATE, "side");
    if (!safeZone || !sideOverlay.imported || !sideOverlay.placement.visible) {
      return null;
    }

    return nestedOverlaySvgMarkup(sideOverlay.imported, sideOverlay.placement, safeZone).svg;
  }, [sideOverlay]);

  const updatePlacement = (
    slot: OverlaySlot,
    updater: (placement: OverlayPlacement) => OverlayPlacement,
  ) => {
    if (slot === "top") {
      setTopOverlay((current) => ({
        ...current,
        placement: updater(current.placement),
      }));
      return;
    }

    setSideOverlay((current) => ({
      ...current,
      placement: updater(current.placement),
    }));
  };

  const resetOverlayPlacement = (slot: OverlaySlot) => {
    updatePlacement(slot, () => createDefaultPlacement());
  };

  const clearOverlay = (slot: OverlaySlot) => {
    if (slot === "top") {
      setTopOverlay(emptyOverlayState());
    } else {
      setSideOverlay(emptyOverlayState());
    }

    setAdjustOpen((current) => ({
      ...current,
      [slot]: false,
    }));
    setSlotErrors((current) => ({ ...current, [slot]: null }));
    setDownloadNotice(null);
  };

  const handleOverlayImport = async (slot: OverlaySlot, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setImportingSlot(slot);
    setSlotErrors((current) => ({ ...current, [slot]: null }));
    setDownloadNotice(null);

    try {
      if (!(file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg"))) {
        throw new Error("Only SVG overlays are supported in 3D mode.");
      }

      const imported = await importOverlaySvg(file);
      const nextState: OverlayState = {
        imported,
        placement: createDefaultPlacement(),
      };

      if (slot === "top") {
        setTopOverlay(nextState);
      } else {
        setSideOverlay(nextState);
      }

      setAdjustOpen((current) => ({
        ...current,
        [slot]: false,
      }));
    } catch (error) {
      setSlotErrors((current) => ({
        ...current,
        [slot]: error instanceof Error ? error.message : "The SVG could not be imported.",
      }));
    } finally {
      setImportingSlot(null);
      event.target.value = "";
    }
  };

  const handleDownload = () => {
    const svg = serializeLayeredSvg({
      width: TEMPLATE.page.width,
      height: TEMPLATE.page.height,
      cut: TEMPLATE.layers.cut,
      mountain: TEMPLATE.layers.mountain,
      valley: TEMPLATE.layers.valley,
      topOverlayMarkup: topMarkup,
      sideOverlayMarkup: sideMarkup,
    });

    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `plotimg-kirigami-${TEMPLATE.id}.svg`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setDownloadNotice("Layered SVG downloaded.");
  };

  const overlayForSlot = (slot: OverlaySlot) => (slot === "top" ? topOverlay : sideOverlay);

  return (
    <main className="mx-auto flex min-h-screen max-w-[1600px] flex-col px-4 pb-8 pt-4 sm:px-6 lg:px-8">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="text-sm font-semibold uppercase tracking-[0.22em] text-[rgba(17,49,39,0.56)]">
          Plotimg
        </div>
        {modeToggle}
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[22rem_minmax(0,1fr)]">
        {sectionPanel(
          <div className="max-h-[calc(100vh-2.5rem)] overflow-y-auto px-4 py-4">
            <div className="space-y-5">
              <div>
                <div className="text-sm font-semibold uppercase tracking-[0.2em] text-[rgba(17,49,39,0.48)]">
                  3D mode
                </div>
                <h1 className="mt-2 text-[1.65rem] font-semibold tracking-[-0.03em] text-[rgba(17,49,39,0.9)]">
                  Choose a kirigami template
                </h1>
              </div>

              <div className="overflow-hidden rounded-[1.6rem] border border-[rgba(17,49,39,0.08)] bg-white/78">
                <div className="relative aspect-[1.08/1] overflow-hidden bg-[rgba(17,49,39,0.04)]">
                  <img
                    src={TEMPLATE.thumbnail}
                    alt={TEMPLATE.name}
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="space-y-2 px-4 py-4">
                  <div className="text-lg font-semibold text-[rgba(17,49,39,0.9)]">
                    {TEMPLATE.name}
                  </div>
                  <div className="text-sm leading-6 text-[rgba(17,49,39,0.64)]">
                    {TEMPLATE.description}
                  </div>
                </div>
              </div>

              <div className="rounded-[1.55rem] border border-[rgba(17,49,39,0.08)] bg-white/76">
                <button
                  type="button"
                  onClick={() => setCustomizeOpen((current) => !current)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-[rgba(17,49,39,0.84)]"
                  aria-expanded={customizeOpen}
                >
                  <span>Customize</span>
                  <ChevronDown
                    className={clsx(
                      "h-4 w-4 text-[rgba(17,49,39,0.56)] transition-transform",
                      customizeOpen && "rotate-180",
                    )}
                  />
                </button>

                {customizeOpen ? (
                  <div className="space-y-3 border-t border-[rgba(17,49,39,0.08)] px-3 pb-3 pt-3">
                    {(["top", "side"] as OverlaySlot[]).map((slot) => {
                      const overlayState = overlayForSlot(slot);

                      return (
                        <div
                          key={slot}
                          className="rounded-[1.3rem] border border-[rgba(17,49,39,0.08)] bg-white/74"
                        >
                          <div className="space-y-3 px-3 py-3">
                            <div>
                              <div className="text-sm font-semibold text-[rgba(17,49,39,0.88)]">
                                {slotTitle(slot)}
                              </div>
                              <div className="mt-1 text-[12px] leading-5 text-[rgba(17,49,39,0.58)]">
                                {slotDescription(slot)}
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  slot === "top"
                                    ? topInputRef.current?.click()
                                    : sideInputRef.current?.click()
                                }
                                className="inline-flex items-center gap-2 rounded-full bg-[rgba(17,49,39,0.94)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[rgba(17,49,39,1)]"
                              >
                                {importingSlot === slot ? (
                                  <LoaderCircle className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Upload className="h-4 w-4" />
                                )}
                                {overlayState.imported ? "Replace SVG" : "Upload SVG"}
                              </button>

                              {overlayState.imported ? (
                                <button
                                  type="button"
                                  onClick={() => clearOverlay(slot)}
                                  className="rounded-full border border-[rgba(17,49,39,0.1)] px-4 py-2.5 text-sm font-medium text-[rgba(17,49,39,0.62)] transition hover:text-[rgba(17,49,39,0.9)]"
                                >
                                  Remove
                                </button>
                              ) : null}
                            </div>

                            {overlayState.imported ? (
                              <div className="rounded-[1rem] bg-[rgba(17,49,39,0.04)] px-3.5 py-3 text-[12px] leading-5 text-[rgba(17,49,39,0.64)]">
                                {overlayState.imported.fileName}
                              </div>
                            ) : null}

                            {slotErrors[slot] ? (
                              <div className="rounded-[1rem] bg-[rgba(173,71,44,0.08)] px-3.5 py-3 text-[12px] leading-5 text-[rgba(122,40,19,0.92)]">
                                {slotErrors[slot]}
                              </div>
                            ) : null}
                          </div>

                          {overlayState.imported ? (
                            <>
                              <button
                                type="button"
                                onClick={() =>
                                  setAdjustOpen((current) => ({
                                    ...current,
                                    [slot]: !current[slot],
                                  }))
                                }
                                className="flex w-full items-center justify-between border-t border-[rgba(17,49,39,0.08)] px-3 py-3 text-left text-[13px] font-semibold text-[rgba(17,49,39,0.78)]"
                                aria-expanded={adjustOpen[slot]}
                              >
                                <span>Adjust</span>
                                <ChevronDown
                                  className={clsx(
                                    "h-4 w-4 text-[rgba(17,49,39,0.56)] transition-transform",
                                    adjustOpen[slot] && "rotate-180",
                                  )}
                                />
                              </button>

                              {adjustOpen[slot] ? (
                                <OverlayAdjustPanel
                                  overlayState={overlayState}
                                  onChange={(updater) => updatePlacement(slot, updater)}
                                  onReset={() => resetOverlayPlacement(slot)}
                                />
                              ) : null}
                            </>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            </div>

            <input
              ref={topInputRef}
              type="file"
              accept=".svg,image/svg+xml"
              className="hidden"
              onChange={(event) => void handleOverlayImport("top", event)}
            />
            <input
              ref={sideInputRef}
              type="file"
              accept=".svg,image/svg+xml"
              className="hidden"
              onChange={(event) => void handleOverlayImport("side", event)}
            />
          </div>,
        )}

        <div className="min-w-0 space-y-5">
          {sectionPanel(
            <div className="px-5 py-5">
              <div className="flex justify-end">
                <div className="inline-flex rounded-full border border-[rgba(17,49,39,0.08)] bg-white/84 p-1">
                  {CAMERA_OPTIONS.map((option) => {
                    const active = option === camera;
                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setCamera(option)}
                        className={clsx(
                          "rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition",
                          active
                            ? "bg-[rgba(17,49,39,0.92)] text-white"
                            : "text-[rgba(17,49,39,0.58)] hover:text-[rgba(17,49,39,0.88)]",
                        )}
                      >
                        {option}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-4 overflow-hidden rounded-[1.7rem] border border-[rgba(17,49,39,0.08)] bg-[radial-gradient(circle_at_top_left,_rgba(243,217,160,0.22),_transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.94),rgba(247,251,248,0.92))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.4)]">
                <div className="aspect-[4/3] w-full">
                  <OpenedShapePreview
                    camera={camera}
                    topOverlay={topOverlay}
                    sideOverlay={sideOverlay}
                  />
                </div>
              </div>
            </div>,
          )}

          {downloadNotice ? (
            <div className="rounded-[1.45rem] border border-[rgba(46,107,79,0.16)] bg-[rgba(90,162,127,0.12)] px-4 py-3 text-sm font-medium text-[rgba(31,87,62,0.92)]">
              {downloadNotice}
            </div>
          ) : null}

          <div className="sticky bottom-4 z-20">
            <div className="rounded-[2rem] border border-white/80 bg-[rgba(255,255,255,0.8)] p-3 shadow-[0_24px_70px_rgba(17,49,39,0.16)] backdrop-blur-xl">
              <button
                type="button"
                onClick={handleDownload}
                className="inline-flex w-full items-center justify-center gap-3 rounded-[1.55rem] bg-[rgba(17,49,39,0.96)] px-6 py-4 text-lg font-semibold text-white shadow-[0_18px_40px_rgba(17,49,39,0.22)] transition hover:bg-[rgba(17,49,39,1)]"
              >
                <Download className="h-5 w-5" />
                Download layered SVG
              </button>
            </div>
          </div>
        </div>
      </div>

      <PlotimgFooterMeta />
    </main>
  );
}
