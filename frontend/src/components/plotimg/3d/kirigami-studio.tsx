"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import {
  CheckCircle2,
  Download,
  Eye,
  EyeOff,
  Info,
  Layers3,
  LoaderCircle,
  RefreshCcw,
  Upload,
} from "lucide-react";
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
  KIRIGAMI_TEMPLATES,
  findTemplateSafeZone,
  structuralRegionBounds,
  templateSupportSummary,
} from "@/lib/kirigami/templates";
import type {
  KirigamiCamera,
  KirigamiLayerId,
  KirigamiSnapshot,
  KirigamiTemplate,
  KirigamiWarning,
  LayerVisibility,
  OverlayPlacement,
  OverlaySlot,
  OverlayState,
  Rect,
} from "@/lib/kirigami/types";
import {
  createDefaultPlacement,
  importOverlaySvg,
  nestedOverlaySvgMarkup,
  serializeLayeredSvg,
} from "@/lib/kirigami/svg";
import { buildKirigamiWarnings } from "@/lib/kirigami/validation";

const KIRIGAMI_STORAGE_KEY = "plotimg-kirigami-state-v1";
const CAMERA_OPTIONS: KirigamiCamera[] = ["3d", "top", "side", "flat"];
const STEP_LABELS = [
  "Choose a kirigami template",
  "Preview the 90° opened shape",
  "Add SVG to top view",
  "Add SVG to side view",
  "Review cut and fold layers",
  "Download layered SVG",
];
const DEFAULT_LAYER_VISIBILITY: LayerVisibility = {
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
  return slot === "top" ? "Top view" : "Side view";
}

function zoneLabel(slot: OverlaySlot) {
  return slot === "top" ? "Add SVG to top view" : "Add SVG to side view";
}

function complexityToneClasses(tone: KirigamiWarning["tone"]) {
  if (tone === "danger") {
    return "border-[rgba(173,71,44,0.18)] bg-[rgba(173,71,44,0.08)] text-[rgba(122,40,19,0.92)]";
  }

  if (tone === "warning") {
    return "border-[rgba(214,156,78,0.2)] bg-[rgba(214,156,78,0.09)] text-[rgba(120,77,22,0.9)]";
  }

  return "border-[rgba(17,49,39,0.1)] bg-[rgba(17,49,39,0.04)] text-[rgba(17,49,39,0.74)]";
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
        <span className="text-[rgba(17,49,39,0.92)]">{value.toFixed(step < 1 ? 2 : 0)}</span>
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

function TemplateCard({
  template,
  active,
  onSelect,
}: {
  template: KirigamiTemplate;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={clsx(
        "group overflow-hidden rounded-[1.5rem] border text-left transition",
        active
          ? "border-[rgba(17,49,39,0.18)] bg-[rgba(17,49,39,0.06)] shadow-[0_18px_44px_rgba(17,49,39,0.1)]"
          : "border-[rgba(17,49,39,0.08)] bg-white/75 hover:border-[rgba(17,49,39,0.16)] hover:bg-white",
      )}
    >
      <div className="relative aspect-[1.18/1] overflow-hidden bg-[rgba(17,49,39,0.04)]">
        <img
          src={template.thumbnail}
          alt={template.name}
          className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
        />
        <div className="absolute left-3 top-3 rounded-full bg-[rgba(255,255,255,0.9)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[rgba(17,49,39,0.62)]">
          {template.complexityLabel}
        </div>
      </div>
      <div className="space-y-2 px-3.5 py-3.5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-[rgba(17,49,39,0.92)]">
              {template.name}
            </div>
            <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-[rgba(17,49,39,0.48)]">
              {template.difficulty}
            </div>
          </div>
          {active ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-[rgba(46,107,79,0.96)]" /> : null}
        </div>
        <div className="text-[12px] leading-5 text-[rgba(17,49,39,0.68)]">
          {template.previewCaption}
        </div>
        <div className="text-[11px] font-medium text-[rgba(17,49,39,0.54)]">
          {templateSupportSummary(template)}
        </div>
      </div>
    </button>
  );
}

function LayerPreview({
  template,
  topMarkup,
  sideMarkup,
  layerVisibility,
}: {
  template: KirigamiTemplate;
  topMarkup: string | null;
  sideMarkup: string | null;
  layerVisibility: LayerVisibility;
}) {
  return (
    <svg
      viewBox={`0 0 ${template.page.width} ${template.page.height}`}
      className="h-full w-full"
      aria-label="Generated fold and cut layers"
    >
      <rect
        x="0"
        y="0"
        width={template.page.width}
        height={template.page.height}
        rx="28"
        fill="#fffdf9"
      />
      {layerVisibility.cut
        ? template.layers.cut.map((path, index) => (
            <path
              key={`cut-${index}`}
              d={path}
              fill="none"
              stroke="#dd5d43"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))
        : null}
      {layerVisibility.mountain_fold
        ? template.layers.mountain.map((path, index) => (
            <path
              key={`mountain-${index}`}
              d={path}
              fill="none"
              stroke="#3a7cff"
              strokeWidth="2.5"
              strokeDasharray="18 10"
              strokeLinecap="round"
            />
          ))
        : null}
      {layerVisibility.valley_fold
        ? template.layers.valley.map((path, index) => (
            <path
              key={`valley-${index}`}
              d={path}
              fill="none"
              stroke="#26996d"
              strokeWidth="2.5"
              strokeDasharray="6 10"
              strokeLinecap="round"
            />
          ))
        : null}
      {layerVisibility.side_view_plot && sideMarkup ? (
        <g dangerouslySetInnerHTML={{ __html: sideMarkup }} />
      ) : null}
      {layerVisibility.top_view_plot && topMarkup ? (
        <g dangerouslySetInnerHTML={{ __html: topMarkup }} />
      ) : null}
    </svg>
  );
}

function OrthographicPreview({
  title,
  subtitle,
  safeZone,
  overlayMarkup,
  emptyLabel,
}: {
  title: string;
  subtitle: string;
  safeZone: Rect | null;
  overlayMarkup: string | null;
  emptyLabel: string;
}) {
  if (!safeZone) {
    return (
      <div className="flex h-full min-h-[14rem] items-center justify-center rounded-[1.4rem] border border-dashed border-[rgba(17,49,39,0.12)] bg-[rgba(255,255,255,0.64)] px-5 text-center text-sm leading-6 text-[rgba(17,49,39,0.52)]">
        This template does not map a {title.toLowerCase()}.
      </div>
    );
  }

  const margin = 48;
  const viewBox = `${safeZone.x - margin} ${safeZone.y - margin} ${safeZone.width + margin * 2} ${safeZone.height + margin * 2}`;

  return (
    <div className="rounded-[1.45rem] border border-[rgba(17,49,39,0.08)] bg-white/72 p-3">
      <div className="mb-2">
        <div className="text-sm font-semibold text-[rgba(17,49,39,0.88)]">{title}</div>
        <div className="text-[12px] leading-5 text-[rgba(17,49,39,0.58)]">{subtitle}</div>
      </div>
      <div className="overflow-hidden rounded-[1.2rem] border border-[rgba(17,49,39,0.08)] bg-[rgba(255,251,244,0.76)]">
        <svg viewBox={viewBox} className="aspect-[5/3] w-full" aria-label={title}>
          <rect
            x={safeZone.x - margin}
            y={safeZone.y - margin}
            width={safeZone.width + margin * 2}
            height={safeZone.height + margin * 2}
            fill="#fffdf9"
          />
          <rect
            x={safeZone.x}
            y={safeZone.y}
            width={safeZone.width}
            height={safeZone.height}
            rx="18"
            fill="rgba(90,162,127,0.08)"
            stroke="rgba(17,49,39,0.18)"
            strokeDasharray="16 10"
          />
          {overlayMarkup ? (
            <g dangerouslySetInnerHTML={{ __html: overlayMarkup }} />
          ) : (
            <text
              x={safeZone.x + safeZone.width / 2}
              y={safeZone.y + safeZone.height / 2}
              fill="rgba(17,49,39,0.42)"
              fontSize="28"
              fontWeight="600"
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {emptyLabel}
            </text>
          )}
        </svg>
      </div>
    </div>
  );
}

function OpenedShapePreview({
  template,
  camera,
  topOverlay,
  sideOverlay,
}: {
  template: KirigamiTemplate;
  camera: KirigamiCamera;
  topOverlay: OverlayState;
  sideOverlay: OverlayState;
}) {
  if (camera === "flat") {
    const topSafe = template.safeZones.top;
    const sideSafe = template.safeZones.side;

    return (
      <svg
        viewBox={`0 0 ${template.page.width} ${template.page.height}`}
        className="h-full w-full"
        aria-label="Flat unfolded preview"
      >
        <rect
          x="0"
          y="0"
          width={template.page.width}
          height={template.page.height}
          rx="28"
          fill="#fffdf9"
        />
        {template.layers.cut.map((path, index) => (
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
        {template.layers.mountain.map((path, index) => (
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
        {template.layers.valley.map((path, index) => (
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

  const projectedBounds = projectedSurfaceBounds(template.surfaces, camera);
  const padding = 90;
  const viewBox = `${projectedBounds.minX - padding} ${projectedBounds.minY - padding} ${projectedBounds.width + padding * 2} ${projectedBounds.height + padding * 2}`;

  return (
    <svg viewBox={viewBox} className="h-full w-full" aria-label="90 degree opened kirigami preview">
      <defs>
        {template.surfaces.map((surface) => (
          <clipPath key={`${surface.id}-clip`} id={`kirigami-${template.id}-${camera}-${surface.id}`}>
            <rect x="0" y="0" width={surface.size.width} height={surface.size.height} rx="12" />
          </clipPath>
        ))}
      </defs>
      {template.surfaces.map((surface) => {
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
              clipPath={`url(#kirigami-${template.id}-${camera}-${surface.id})`}
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
              ) : (
                <text
                  x="16"
                  y="26"
                  fill="rgba(17,49,39,0.42)"
                  fontSize="18"
                  fontWeight="600"
                  letterSpacing="0.04em"
                >
                  {surface.label}
                </text>
              )}
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

  const [templateId, setTemplateId] = useState(KIRIGAMI_TEMPLATES[0].id);
  const [camera, setCamera] = useState<KirigamiCamera>("3d");
  const [topOverlay, setTopOverlay] = useState<OverlayState>(emptyOverlayState());
  const [sideOverlay, setSideOverlay] = useState<OverlayState>(emptyOverlayState());
  const [layerVisibility, setLayerVisibility] = useState<LayerVisibility>(DEFAULT_LAYER_VISIBILITY);
  const [importingSlot, setImportingSlot] = useState<OverlaySlot | null>(null);
  const [slotErrors, setSlotErrors] = useState<Record<OverlaySlot, string | null>>({
    top: null,
    side: null,
  });
  const [downloadNotice, setDownloadNotice] = useState<string | null>(null);

  const template = KIRIGAMI_TEMPLATE_MAP[templateId] ?? KIRIGAMI_TEMPLATES[0];

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(KIRIGAMI_STORAGE_KEY);
      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw) as Partial<KirigamiSnapshot>;
      if (parsed.templateId && parsed.templateId in KIRIGAMI_TEMPLATE_MAP) {
        setTemplateId(parsed.templateId);
      }

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

      if (parsed.layerVisibility) {
        setLayerVisibility({
          ...DEFAULT_LAYER_VISIBILITY,
          ...parsed.layerVisibility,
        });
      }
    } catch (error) {
      console.warn("Kirigami session restore skipped.", error);
    }
  }, []);

  useEffect(() => {
    const snapshot: KirigamiSnapshot = {
      templateId,
      camera,
      topOverlay: topOverlay,
      sideOverlay: sideOverlay,
      layerVisibility,
    };

    try {
      window.sessionStorage.setItem(KIRIGAMI_STORAGE_KEY, JSON.stringify(snapshot));
    } catch (error) {
      console.warn("Kirigami session persistence skipped.", error);
    }
  }, [camera, layerVisibility, sideOverlay, templateId, topOverlay]);

  const structuralBounds = useMemo(() => structuralRegionBounds(template), [template]);

  const topMarkup = useMemo(() => {
    const safeZone = findTemplateSafeZone(template, "top");
    if (!safeZone || !topOverlay.imported || !topOverlay.placement.visible) {
      return null;
    }

    return nestedOverlaySvgMarkup(topOverlay.imported, topOverlay.placement, safeZone).svg;
  }, [template, topOverlay]);

  const sideMarkup = useMemo(() => {
    const safeZone = findTemplateSafeZone(template, "side");
    if (!safeZone || !sideOverlay.imported || !sideOverlay.placement.visible) {
      return null;
    }

    return nestedOverlaySvgMarkup(sideOverlay.imported, sideOverlay.placement, safeZone).svg;
  }, [template, sideOverlay]);

  const validationWarnings = useMemo(
    () =>
      buildKirigamiWarnings({
        template,
        topOverlay: topOverlay.imported,
        topPlacement: topOverlay.placement,
        sideOverlay: sideOverlay.imported,
        sidePlacement: sideOverlay.placement,
      }),
    [template, topOverlay, sideOverlay],
  );

  const warnings = useMemo(() => {
    const uploadWarnings: KirigamiWarning[] = (["top", "side"] as OverlaySlot[])
      .filter((slot) => slotErrors[slot])
      .map((slot) => ({
        id: `${slot}-error`,
        message: slotErrors[slot]!,
        tone: "danger",
      }));

    return [...uploadWarnings, ...validationWarnings];
  }, [slotErrors, validationWarnings]);

  const handleTemplateSelect = (nextTemplateId: string) => {
    setTemplateId(nextTemplateId);
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
    setSlotErrors((current) => ({ ...current, [slot]: null }));
    setDownloadNotice(null);
  };

  const overlayForSlot = (slot: OverlaySlot) => (slot === "top" ? topOverlay : sideOverlay);
  const slotSupported = (slot: OverlaySlot) =>
    slot === "top" ? template.supportsTopOverlay : template.supportsSideOverlay;

  const handleLayerToggle = (layer: KirigamiLayerId) => {
    setLayerVisibility((current) => ({
      ...current,
      [layer]: !current[layer],
    }));
  };

  const handleDownload = () => {
    const svg = serializeLayeredSvg({
      width: template.page.width,
      height: template.page.height,
      cut: template.layers.cut,
      mountain: template.layers.mountain,
      valley: template.layers.valley,
      topOverlayMarkup: topMarkup,
      sideOverlayMarkup: sideMarkup,
    });

    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `plotimg-kirigami-${template.id}.svg`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setDownloadNotice("Layered SVG downloaded.");
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-[1700px] flex-col px-4 pb-8 pt-4 sm:px-6 lg:px-8">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="text-sm font-semibold uppercase tracking-[0.22em] text-[rgba(17,49,39,0.56)]">
          Plotimg
        </div>
        {modeToggle}
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {STEP_LABELS.map((step, index) => (
          <div
            key={step}
            className="rounded-full border border-[rgba(17,49,39,0.08)] bg-white/76 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[rgba(17,49,39,0.52)]"
          >
            {index + 1}. {step}
          </div>
        ))}
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[22rem_minmax(0,1fr)_23rem]">
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
                <p className="mt-2 text-sm leading-6 text-[rgba(17,49,39,0.64)]">
                  Customize a known 90° pop-up structure with top and side SVG overlays.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                {KIRIGAMI_TEMPLATES.map((entry) => (
                  <TemplateCard
                    key={entry.id}
                    template={entry}
                    active={entry.id === template.id}
                    onSelect={() => handleTemplateSelect(entry.id)}
                  />
                ))}
              </div>

              <div className="rounded-[1.6rem] border border-[rgba(17,49,39,0.08)] bg-white/74 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-[rgba(17,49,39,0.9)]">
                      {template.name}
                    </div>
                    <div className="mt-1 text-sm leading-6 text-[rgba(17,49,39,0.64)]">
                      {template.description}
                    </div>
                  </div>
                  <div className="rounded-full bg-[rgba(17,49,39,0.06)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[rgba(17,49,39,0.54)]">
                    {template.complexityLabel}
                  </div>
                </div>
                <div className="mt-4 grid gap-2 text-[12px] leading-5 text-[rgba(17,49,39,0.62)]">
                  <div>Support: {templateSupportSummary(template)}</div>
                  <div>
                    Minimum bridge: {template.constraints.minBridgeWidth} units · minimum fold gap:{" "}
                    {template.constraints.minFoldGap}
                  </div>
                </div>
              </div>

              {(["top", "side"] as OverlaySlot[]).map((slot) => {
                const overlayState = overlayForSlot(slot);
                const safeZone = findTemplateSafeZone(template, slot);
                const supported = slotSupported(slot);

                return (
                  <div
                    key={slot}
                    className="rounded-[1.6rem] border border-[rgba(17,49,39,0.08)] bg-white/74 p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-sm font-semibold text-[rgba(17,49,39,0.9)]">
                          {zoneLabel(slot)}
                        </div>
                        <div className="mt-1 text-[12px] leading-5 text-[rgba(17,49,39,0.58)]">
                          {supported
                            ? safeZone
                              ? `Safe zone ${Math.round(safeZone.width)} × ${Math.round(safeZone.height)}`
                              : "Safe zone hidden for this template."
                            : "This template does not use this orthographic overlay."}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => updatePlacement(slot, (placement) => ({ ...placement, visible: !placement.visible }))}
                        disabled={!supported}
                        className={clsx(
                          "inline-flex h-10 w-10 items-center justify-center rounded-full border transition",
                          overlayState.placement.visible
                            ? "border-[rgba(17,49,39,0.12)] bg-white text-[rgba(17,49,39,0.78)]"
                            : "border-[rgba(17,49,39,0.08)] bg-[rgba(17,49,39,0.04)] text-[rgba(17,49,39,0.42)]",
                          !supported && "cursor-not-allowed opacity-45",
                        )}
                        aria-label={`${overlayState.placement.visible ? "Hide" : "Show"} ${slotTitle(slot)} overlay`}
                      >
                        {overlayState.placement.visible ? (
                          <Eye className="h-4 w-4" />
                        ) : (
                          <EyeOff className="h-4 w-4" />
                        )}
                      </button>
                    </div>

                    {supported ? (
                      <>
                        <div className="mt-4 flex flex-wrap gap-2">
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
                          <div className="mt-3 rounded-[1.15rem] bg-[rgba(17,49,39,0.04)] px-3.5 py-3 text-[12px] leading-5 text-[rgba(17,49,39,0.64)]">
                            {overlayState.imported.fileName} · {overlayState.imported.elementCount} vector elements
                          </div>
                        ) : null}

                        {slotErrors[slot] ? (
                          <div className="mt-3 rounded-[1.15rem] bg-[rgba(173,71,44,0.08)] px-3.5 py-3 text-[12px] leading-5 text-[rgba(122,40,19,0.92)]">
                            {slotErrors[slot]}
                          </div>
                        ) : null}

                        <div className="mt-4 space-y-3">
                          <SmallRange
                            label="Scale"
                            value={overlayState.placement.scale}
                            min={0.4}
                            max={2.2}
                            step={0.05}
                            onChange={(value) =>
                              updatePlacement(slot, (placement) => ({
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
                              updatePlacement(slot, (placement) => ({
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
                              updatePlacement(slot, (placement) => ({
                                ...placement,
                                offsetY: value,
                              }))
                            }
                          />
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          {([0, 90, 180, 270] as const).map((rotation) => (
                            <button
                              key={rotation}
                              type="button"
                              onClick={() =>
                                updatePlacement(slot, (placement) => ({
                                  ...placement,
                                  rotation,
                                }))
                              }
                              className={clsx(
                                "rounded-full px-3 py-2 text-[12px] font-semibold transition",
                                overlayState.placement.rotation === rotation
                                  ? "bg-[rgba(17,49,39,0.9)] text-white"
                                  : "border border-[rgba(17,49,39,0.1)] bg-white text-[rgba(17,49,39,0.64)]",
                              )}
                            >
                              {rotation}°
                            </button>
                          ))}
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          {(["contain", "cover"] as const).map((fitMode) => (
                            <button
                              key={fitMode}
                              type="button"
                              onClick={() =>
                                updatePlacement(slot, (placement) => ({
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

                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              updatePlacement(slot, (placement) => ({
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
                              updatePlacement(slot, (placement) => ({
                                ...placement,
                                offsetY: 0,
                              }))
                            }
                            className="rounded-full border border-[rgba(17,49,39,0.1)] px-3 py-2 text-[12px] font-medium text-[rgba(17,49,39,0.62)] transition hover:text-[rgba(17,49,39,0.9)]"
                          >
                            Center vertically
                          </button>
                          <button
                            type="button"
                            onClick={() => resetOverlayPlacement(slot)}
                            className="inline-flex items-center gap-2 rounded-full border border-[rgba(17,49,39,0.1)] px-3 py-2 text-[12px] font-medium text-[rgba(17,49,39,0.62)] transition hover:text-[rgba(17,49,39,0.9)]"
                          >
                            <RefreshCcw className="h-3.5 w-3.5" />
                            Reset placement
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="mt-4 rounded-[1.15rem] border border-dashed border-[rgba(17,49,39,0.12)] bg-[rgba(17,49,39,0.03)] px-3.5 py-3 text-[12px] leading-5 text-[rgba(17,49,39,0.56)]">
                        Pick a template that supports {slotTitle(slot).toLowerCase()} overlays if you want to map SVG art onto this view.
                      </div>
                    )}
                  </div>
                );
              })}

              <div className="rounded-[1.6rem] border border-[rgba(17,49,39,0.08)] bg-white/74 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-[rgba(17,49,39,0.88)]">
                  <Layers3 className="h-4 w-4" />
                  Layer visibility
                </div>
                <div className="mt-4 space-y-2.5">
                  {(
                    [
                      ["cut", "Cut"],
                      ["mountain_fold", "Mountain fold"],
                      ["valley_fold", "Valley fold"],
                      ["side_view_plot", "Side view plot"],
                      ["top_view_plot", "Top view plot"],
                    ] as const
                  ).map(([layerId, label]) => (
                    <label
                      key={layerId}
                      className="flex items-center justify-between gap-3 rounded-[1rem] border border-[rgba(17,49,39,0.08)] bg-white/72 px-3.5 py-2.5"
                    >
                      <span className="text-sm text-[rgba(17,49,39,0.72)]">{label}</span>
                      <input
                        type="checkbox"
                        checked={layerVisibility[layerId]}
                        onChange={() => handleLayerToggle(layerId)}
                        className="h-4 w-4 accent-[var(--plotimg-mint-deep)]"
                      />
                    </label>
                  ))}
                </div>
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
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-[rgba(17,49,39,0.9)]">
                    Preview the 90° opened shape
                  </div>
                  <div className="mt-1 text-sm leading-6 text-[rgba(17,49,39,0.62)]">
                    {template.previewCaption} · structural region {Math.round(structuralBounds.width)} ×{" "}
                    {Math.round(structuralBounds.height)}
                  </div>
                </div>

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

              <div className="mt-5 overflow-hidden rounded-[1.7rem] border border-[rgba(17,49,39,0.08)] bg-[radial-gradient(circle_at_top_left,_rgba(243,217,160,0.22),_transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.94),rgba(247,251,248,0.92))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.4)]">
                <div className="aspect-[4/3] w-full">
                  <OpenedShapePreview
                    template={template}
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

        {sectionPanel(
          <div className="max-h-[calc(100vh-2.5rem)] overflow-y-auto px-4 py-4">
            <div className="space-y-4">
              <OrthographicPreview
                title="Top view"
                subtitle="Maps exactly to horizontal-facing surfaces in the opened state."
                safeZone={template.safeZones.top}
                overlayMarkup={topMarkup}
                emptyLabel="Top overlay"
              />

              <OrthographicPreview
                title="Side view"
                subtitle="Maps exactly to the main front-facing surfaces."
                safeZone={template.safeZones.side}
                overlayMarkup={sideMarkup}
                emptyLabel="Side overlay"
              />

              <div className="rounded-[1.45rem] border border-[rgba(17,49,39,0.08)] bg-white/72 p-3">
                <div className="mb-2">
                  <div className="text-sm font-semibold text-[rgba(17,49,39,0.88)]">
                    Review cut and fold layers
                  </div>
                  <div className="text-[12px] leading-5 text-[rgba(17,49,39,0.58)]">
                    Preview colors are only visual guides for fabrication layers.
                  </div>
                </div>
                <div className="overflow-hidden rounded-[1.2rem] border border-[rgba(17,49,39,0.08)] bg-[rgba(255,251,244,0.76)]">
                  <div className="aspect-[5/3] w-full">
                    <LayerPreview
                      template={template}
                      topMarkup={topMarkup}
                      sideMarkup={sideMarkup}
                      layerVisibility={layerVisibility}
                    />
                  </div>
                </div>

                <div className="mt-3 grid gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[rgba(17,49,39,0.52)]">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-6 rounded-full bg-[#dd5d43]" />
                    Cut
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-6 rounded-full bg-[#3a7cff]" />
                    Mountain fold
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-6 rounded-full bg-[#26996d]" />
                    Valley fold
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-6 rounded-full bg-[#222222]" />
                    Top / side plot
                  </div>
                </div>
              </div>

              <div className="rounded-[1.45rem] border border-[rgba(17,49,39,0.08)] bg-white/72 p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[rgba(17,49,39,0.88)]">
                  <Info className="h-4 w-4" />
                  Warnings
                </div>
                <div className="space-y-2.5">
                  {warnings.length ? (
                    warnings.map((warning) => (
                      <div
                        key={warning.id}
                        className={clsx(
                          "rounded-[1.1rem] border px-3.5 py-3",
                          complexityToneClasses(warning.tone),
                        )}
                      >
                        <div className="text-sm font-medium">{warning.message}</div>
                        {warning.detail ? (
                          <div className="mt-1 text-[12px] leading-5 opacity-80">
                            {warning.detail}
                          </div>
                        ) : null}
                      </div>
                    ))
                  ) : (
                    <div className="rounded-[1.1rem] border border-[rgba(17,49,39,0.08)] bg-[rgba(17,49,39,0.03)] px-3.5 py-3 text-sm text-[rgba(17,49,39,0.62)]">
                      No fabrication warnings right now.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>,
        )}
      </div>

      <PlotimgFooterMeta />
    </main>
  );
}
