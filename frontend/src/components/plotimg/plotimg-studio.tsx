"use client";

import Image from "next/image";
import {
  startTransition,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  ChevronDown,
  Download,
  Info,
  LoaderCircle,
  Mail,
  Minus,
  Plus,
  RefreshCcw,
  Sparkles,
  TicketPercent,
  Upload,
  X,
} from "lucide-react";

import { clsx } from "clsx";

import {
  createCheckout,
  createPreviewJob,
  generateSvg,
  getPreviewStatus,
  uploadImage,
} from "@/lib/api";
import {
  DEFAULT_PARAMETERS,
  DEFAULT_PREVIEW_BACKGROUND,
  DEFAULT_PREVIEW_LINE,
  estimateLineCount,
  getComplexityWarning,
  PRICE_OPTIONS,
  SESSION_ID_STORAGE_KEY,
  SESSION_STORAGE_KEY,
  STARTER_IMAGES,
  type GenerateSvgResponse,
  type PlotParameters,
  type PreviewResult,
  type UploadRecord,
} from "@/lib/plotimg";

import { PreviewCanvas } from "./preview-canvas";

type GenerationState =
  | {
      status: "idle";
      message?: string;
    }
  | {
      status: "uploading" | "generating" | "ready" | "fulfilling" | "completed";
      message: string;
    }
  | {
      status: "error";
      message: string;
      error: string;
    };

type EditorSnapshot = {
  upload: UploadRecord | null;
  params: PlotParameters;
  renderedParams: PlotParameters | null;
  previewBackground: string;
  previewLine: string;
  originalImageSrc: string | null;
};

type UnlockContext =
  | { mode: "paid"; purchaseId: string; checkoutId: string }
  | { mode: "existing"; purchaseId: string };

type CheckoutStage = "idle" | "creating" | "opening" | "awaiting-email";
type CheckoutCurrency = keyof typeof PRICE_OPTIONS;
type PolarCheckoutLoadedDetail = { event: "loaded" };
type PolarCheckoutCloseDetail = { event: "close" };
type PolarCheckoutConfirmedDetail = { event: "confirmed" };
type PolarCheckoutSuccessDetail = {
  event: "success";
  successURL: string;
  redirect: boolean;
};
type PolarEmbedCheckoutInstance = {
  close(): void;
  addEventListener(
    type: "confirmed",
    listener: (event: CustomEvent<PolarCheckoutConfirmedDetail>) => void,
    options?: AddEventListenerOptions | boolean,
  ): void;
  addEventListener(
    type: "success",
    listener: (event: CustomEvent<PolarCheckoutSuccessDetail>) => void,
    options?: AddEventListenerOptions | boolean,
  ): void;
  addEventListener(
    type: "close",
    listener: (event: CustomEvent<PolarCheckoutCloseDetail>) => void,
    options?: AddEventListenerOptions | boolean,
  ): void;
};
type PolarEmbedCheckoutStatic = {
  create(
    url: string,
    options?: {
      theme?: "light" | "dark";
      onLoaded?: (event: CustomEvent<PolarCheckoutLoadedDetail>) => void;
    },
  ): Promise<PolarEmbedCheckoutInstance>;
};

declare global {
  interface Window {
    Polar?: {
      EmbedCheckout?: PolarEmbedCheckoutStatic;
    };
  }
}

let polarEmbedCheckoutLoader: Promise<PolarEmbedCheckoutStatic> | null = null;

const TOOLTIPS = {
  processingHeight: "More rows = more vertical detail.",
  pixelWidth: "How wide each image pixel stretches into the wave drawing.",
  resolution: "Lower is denser and smoother. Higher is faster.",
  maxAmplitude: "How far each line swings away from its baseline.",
  maxFrequency: "How tight the wave oscillates through darker areas.",
  previewBackground: "Preview only. Export stays plotter-neutral.",
  previewLine: "Preview only. Export stays plotter-neutral.",
  complexity: "Estimated from the resized image plus your current sampling settings.",
  pending: "You changed a setting after the last render.",
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function stepValue(value: number, step: number, direction: -1 | 1, min: number, max: number) {
  const precision = step.toString().split(".")[1]?.length ?? 0;
  const nextValue = value + step * direction;
  return clamp(Number(nextValue.toFixed(precision)), min, max);
}

async function loadPolarEmbedCheckout() {
  if (typeof window === "undefined") {
    throw new Error("Polar checkout is only available in the browser.");
  }

  const existingEmbedCheckout = window.Polar?.EmbedCheckout;

  if (existingEmbedCheckout) {
    return existingEmbedCheckout;
  }

  if (polarEmbedCheckoutLoader) {
    return polarEmbedCheckoutLoader;
  }

  polarEmbedCheckoutLoader = new Promise<PolarEmbedCheckoutStatic>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[data-plotimg-polar-embed="true"]',
    );

    const finishResolve = () => {
      const embedCheckout = window.Polar?.EmbedCheckout;

      if (!embedCheckout) {
        polarEmbedCheckoutLoader = null;
        reject(new Error("Polar checkout failed to initialize."));
        return;
      }

      resolve(embedCheckout);
    };

    const handleError = () => {
      polarEmbedCheckoutLoader = null;
      reject(new Error("Polar checkout could not be loaded."));
    };

    if (existingScript) {
      if (existingScript.dataset.loaded === "true") {
        finishResolve();
        return;
      }

      existingScript.addEventListener("load", finishResolve, { once: true });
      existingScript.addEventListener("error", handleError, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/@polar-sh/checkout@0.2.0/dist/embed.global.js";
    script.async = true;
    script.defer = true;
    script.dataset.plotimgPolarEmbed = "true";
    script.addEventListener(
      "load",
      () => {
        script.dataset.loaded = "true";
        finishResolve();
      },
      { once: true },
    );
    script.addEventListener("error", handleError, { once: true });
    document.head.appendChild(script);
  });

  return polarEmbedCheckoutLoader;
}

function InfoTooltip({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const bubbleRef = useRef<HTMLSpanElement | null>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [bubbleStyle, setBubbleStyle] = useState<{
    left: number;
    top: number;
    placement: "top" | "bottom";
  } | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const updatePosition = useEffectEvent(() => {
    if (!triggerRef.current || !bubbleRef.current) {
      return;
    }

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const bubbleRect = bubbleRef.current.getBoundingClientRect();
    const margin = 12;
    const offset = 10;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const clampedLeft = clamp(
      triggerRect.left + triggerRect.width / 2 - bubbleRect.width / 2,
      margin,
      viewportWidth - bubbleRect.width - margin,
    );

    const fitsBelow = triggerRect.bottom + offset + bubbleRect.height <= viewportHeight - margin;
    const fitsAbove = triggerRect.top - offset - bubbleRect.height >= margin;
    const placement = !fitsBelow && fitsAbove ? "top" : "bottom";
    const top =
      placement === "bottom"
        ? Math.min(triggerRect.bottom + offset, viewportHeight - bubbleRect.height - margin)
        : Math.max(triggerRect.top - bubbleRect.height - offset, margin);

    setBubbleStyle({
      left: clampedLeft,
      top,
      placement,
    });
  });

  useLayoutEffect(() => {
    if (!open) {
      return;
    }

    updatePosition();

    const handleWindowChange = () => {
      updatePosition();
    };

    window.addEventListener("resize", handleWindowChange);
    window.addEventListener("scroll", handleWindowChange, true);

    return () => {
      window.removeEventListener("resize", handleWindowChange);
      window.removeEventListener("scroll", handleWindowChange, true);
    };
  }, [open, updatePosition]);

  return (
    <span className={clsx("relative inline-flex", className)}>
      <button
        ref={triggerRef}
        type="button"
        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[rgba(17,49,39,0.12)] bg-white/78 text-[rgba(17,49,39,0.56)] transition hover:text-[rgba(17,49,39,0.9)] focus-visible:outline-none"
        aria-label={content}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      {mounted && open
        ? createPortal(
            <span
              ref={bubbleRef}
              className={clsx(
                "pointer-events-none fixed z-[90] w-48 rounded-[1rem] bg-[rgba(17,49,39,0.96)] px-3 py-2 text-[11px] leading-5 text-white shadow-[0_16px_42px_rgba(17,49,39,0.26)]",
                bubbleStyle ? "opacity-100" : "opacity-0",
              )}
              style={{
                left: bubbleStyle?.left ?? -9999,
                top: bubbleStyle?.top ?? -9999,
              }}
              data-placement={bubbleStyle?.placement ?? "bottom"}
            >
              {content}
            </span>,
            document.body,
          )
        : null}
    </span>
  );
}

function RangeField({
  id,
  label,
  tooltip,
  min,
  max,
  step,
  value,
  valueLabel,
  onChange,
}: {
  id: string;
  label: string;
  tooltip: string;
  min: number;
  max: number;
  step: number;
  value: number;
  valueLabel: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <label htmlFor={id} className="text-[13px] font-medium text-[rgba(17,49,39,0.84)]">
            {label}
          </label>
          <InfoTooltip content={tooltip} />
        </div>
        <span className="text-[13px] font-semibold text-[rgba(17,49,39,0.64)]">{valueLabel}</span>
      </div>

      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={() => onChange(stepValue(value, step, -1, min, max))}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[rgba(17,49,39,0.12)] bg-white/82 text-[rgba(17,49,39,0.74)] transition hover:border-[rgba(17,49,39,0.22)]"
          aria-label={`Decrease ${label}`}
        >
          <Minus className="h-3.5 w-3.5" />
        </button>

        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className="plotimg-range h-1.5 w-full cursor-pointer rounded-full bg-[rgba(17,49,39,0.09)]"
        />

        <button
          type="button"
          onClick={() => onChange(stepValue(value, step, 1, min, max))}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[rgba(17,49,39,0.12)] bg-white/82 text-[rgba(17,49,39,0.74)] transition hover:border-[rgba(17,49,39,0.22)]"
          aria-label={`Increase ${label}`}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function ColorField({
  id,
  label,
  tooltip,
  value,
  onChange,
}: {
  id: string;
  label: string;
  tooltip: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <label htmlFor={id} className="text-[13px] font-medium text-[rgba(17,49,39,0.84)]">
          {label}
        </label>
        <InfoTooltip content={tooltip} />
      </div>

      <label
        htmlFor={id}
        className="flex items-center gap-3 rounded-[1rem] border border-[rgba(17,49,39,0.1)] bg-white px-3 py-2"
      >
        <input
          id={id}
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-7 w-7 cursor-pointer rounded-full border-none bg-transparent p-0"
        />
        <span className="text-[13px] font-medium text-[rgba(17,49,39,0.72)]">{value}</span>
      </label>
    </div>
  );
}

function StarterPicker({
  open,
  onSelect,
  disabledId,
}: {
  open: boolean;
  onSelect: (starterId: string, src: string) => void;
  disabledId: string | null;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="grid grid-cols-4 gap-2">
      {STARTER_IMAGES.map((starter) => (
        <button
          key={starter.id}
          type="button"
          onClick={() => onSelect(starter.id, starter.src)}
          disabled={disabledId === starter.id}
          className={clsx(
            "group relative aspect-[4/5] overflow-hidden rounded-[1.2rem] border border-[rgba(17,49,39,0.08)] bg-white shadow-[0_10px_30px_rgba(17,49,39,0.08)] transition hover:-translate-y-0.5",
            disabledId === starter.id && "cursor-not-allowed opacity-50",
          )}
        >
          <Image
            src={starter.src}
            alt={`${starter.label} starter image`}
            fill
            sizes="(max-width: 1024px) 20vw, 6vw"
            className="object-cover transition duration-500 group-hover:scale-[1.04]"
          />
          <span className="sr-only">{starter.label}</span>
        </button>
      ))}
    </div>
  );
}

function ControlRail({
  upload,
  hasRenderedPreview,
  params,
  previewBackground,
  previewLine,
  showSamples,
  onToggleSamples,
  onUploadClick,
  onStarterSelect,
  starterBusyId,
  onParamChange,
  onPreviewBackgroundChange,
  onPreviewLineChange,
  onGeneratePreview,
  onReset,
  previewBusy,
  pendingChanges,
}: {
  upload: UploadRecord | null;
  hasRenderedPreview: boolean;
  params: PlotParameters;
  previewBackground: string;
  previewLine: string;
  showSamples: boolean;
  onToggleSamples: () => void;
  onUploadClick: () => void;
  onStarterSelect: (starterId: string, src: string) => void;
  starterBusyId: string | null;
  onParamChange: <Key extends keyof PlotParameters>(key: Key, value: PlotParameters[Key]) => void;
  onPreviewBackgroundChange: (value: string) => void;
  onPreviewLineChange: (value: string) => void;
  onGeneratePreview: () => void;
  onReset: () => void;
  previewBusy: boolean;
  pendingChanges: boolean;
}) {
  const [customizeOpen, setCustomizeOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div className="text-sm font-semibold uppercase tracking-[0.22em] text-[rgba(17,49,39,0.56)]">
          Plotimg
        </div>

        <button
          type="button"
          onClick={onUploadClick}
          className="flex w-full items-center justify-center gap-2 rounded-[1.4rem] bg-[rgba(17,49,39,0.94)] px-4 py-3.5 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(17,49,39,0.2)] transition hover:bg-[rgba(17,49,39,1)]"
        >
          <Upload className="h-4 w-4" />
          Upload image
        </button>

        <button
          type="button"
          onClick={onToggleSamples}
          className="inline-flex items-center gap-2 rounded-full px-1 text-sm font-medium text-[rgba(17,49,39,0.56)] transition hover:text-[rgba(17,49,39,0.88)]"
        >
          <Sparkles className="h-4 w-4" />
          Try with sample
        </button>

        <StarterPicker
          open={showSamples}
          onSelect={onStarterSelect}
          disabledId={starterBusyId}
        />
      </div>

      {hasRenderedPreview ? (
        <>
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
              <div className="space-y-2.5 border-t border-[rgba(17,49,39,0.08)] px-3 pb-3 pt-2.5">
                <RangeField
                  id="processing-height"
                  label="Height"
                  tooltip={TOOLTIPS.processingHeight}
                  min={80}
                  max={260}
                  step={1}
                  value={params.processingHeight}
                  valueLabel={`${params.processingHeight}px`}
                  onChange={(value) => onParamChange("processingHeight", value)}
                />
                <RangeField
                  id="pixel-width"
                  label="Pixel width"
                  tooltip={TOOLTIPS.pixelWidth}
                  min={3}
                  max={14}
                  step={0.5}
                  value={params.pixelWidth}
                  valueLabel={`${params.pixelWidth.toFixed(1)} px`}
                  onChange={(value) => onParamChange("pixelWidth", value)}
                />
                <RangeField
                  id="resolution"
                  label="Detail"
                  tooltip={TOOLTIPS.resolution}
                  min={0.25}
                  max={3}
                  step={0.25}
                  value={params.resolution}
                  valueLabel={`${params.resolution.toFixed(2)}x`}
                  onChange={(value) => onParamChange("resolution", value)}
                />
                <RangeField
                  id="max-amplitude"
                  label="Amplitude"
                  tooltip={TOOLTIPS.maxAmplitude}
                  min={0.5}
                  max={6}
                  step={0.1}
                  value={params.maxAmplitude}
                  valueLabel={params.maxAmplitude.toFixed(1)}
                  onChange={(value) => onParamChange("maxAmplitude", value)}
                />
                <RangeField
                  id="max-frequency"
                  label="Frequency"
                  tooltip={TOOLTIPS.maxFrequency}
                  min={2}
                  max={18}
                  step={0.5}
                  value={params.maxFrequency}
                  valueLabel={params.maxFrequency.toFixed(1)}
                  onChange={(value) => onParamChange("maxFrequency", value)}
                />

                <div className="space-y-2.5">
                  <ColorField
                    id="preview-background"
                    label="Background"
                    tooltip={TOOLTIPS.previewBackground}
                    value={previewBackground}
                    onChange={onPreviewBackgroundChange}
                  />
                  <ColorField
                    id="preview-line"
                    label="Line"
                    tooltip={TOOLTIPS.previewLine}
                    value={previewLine}
                    onChange={onPreviewLineChange}
                  />
                </div>

                <button
                  type="button"
                  onClick={onReset}
                  className="w-full rounded-full border border-[rgba(17,49,39,0.12)] bg-white/72 px-4 py-2 text-[13px] font-medium text-[rgba(17,49,39,0.62)] transition hover:border-[rgba(17,49,39,0.22)] hover:text-[rgba(17,49,39,0.88)]"
                >
                  Reset to defaults
                </button>
              </div>
            ) : null}
          </div>

          <div>
            <button
              type="button"
              onClick={onGeneratePreview}
              disabled={!upload || previewBusy}
              className={clsx(
                "inline-flex w-full items-center justify-center gap-2 rounded-[1.4rem] px-4 py-3.5 text-sm font-semibold transition",
                pendingChanges
                  ? "bg-[rgba(46,107,79,0.94)] text-white shadow-[0_16px_36px_rgba(46,107,79,0.26)]"
                  : "border border-[rgba(17,49,39,0.12)] bg-white/82 text-[rgba(17,49,39,0.72)]",
                (!upload || previewBusy) && "cursor-not-allowed opacity-45",
              )}
            >
              {previewBusy ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCcw className="h-4 w-4" />
              )}
              Generate Preview
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

function NoticeBanner({
  tone = "neutral",
  message,
  tooltip,
  action,
}: {
  tone?: "neutral" | "warning" | "danger";
  message: string;
  tooltip?: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      className={clsx(
        "flex flex-wrap items-center justify-between gap-3 rounded-[1.35rem] border px-4 py-3 text-sm",
        tone === "danger" && "border-[rgba(173,71,44,0.18)] bg-[rgba(173,71,44,0.08)] text-[rgba(122,40,19,0.92)]",
        tone === "warning" &&
          "border-[rgba(214,156,78,0.22)] bg-[rgba(214,156,78,0.1)] text-[rgba(120,77,22,0.92)]",
        tone === "neutral" &&
          "border-[rgba(17,49,39,0.1)] bg-white/76 text-[rgba(17,49,39,0.72)]",
      )}
    >
      <div className="flex items-center gap-2">
        {tooltip ? <InfoTooltip content={tooltip} className="shrink-0" /> : <Info className="h-4 w-4" />}
        <span className="font-medium">{message}</span>
      </div>
      {action}
    </div>
  );
}

function EmptyPrompt() {
  return (
    <div className="relative min-h-[34rem] lg:min-h-[42rem]">
      <div className="hidden lg:block">
        <div className="plotimg-hand absolute left-0 top-8 rotate-[-4deg] text-[3rem] text-[rgba(17,49,39,0.48)]">
          upload to get started
        </div>
        <svg
          className="absolute left-28 top-24 h-28 w-52 rotate-[6deg] text-[rgba(17,49,39,0.28)]"
          viewBox="0 0 220 110"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M214 90C180 80 165 56 145 40C117 18 73 14 18 22"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="7 10"
          />
          <path
            d="M27 10L16 22L30 30"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <div className="flex min-h-[34rem] items-center justify-center lg:hidden">
        <div className="plotimg-hand rotate-[-4deg] text-center text-5xl text-[rgba(17,49,39,0.46)]">
          upload to get started
        </div>
      </div>
    </div>
  );
}

function CheckoutModal({
  open,
  onClose,
  onCheckoutStart,
  checkoutCurrency,
  onCheckoutCurrencyChange,
  email,
  onEmailChange,
  onFulfillment,
  downloadResult,
  checkoutStage,
  notice,
}: {
  open: boolean;
  onClose: () => void;
  onCheckoutStart: () => void;
  checkoutCurrency: CheckoutCurrency;
  onCheckoutCurrencyChange: (currency: CheckoutCurrency) => void;
  email: string;
  onEmailChange: (value: string) => void;
  onFulfillment: () => void;
  downloadResult: GenerateSvgResponse | null;
  checkoutStage: CheckoutStage;
  notice: string | null;
}) {
  if (!open) {
    return null;
  }

  const showEmailStep = checkoutStage === "awaiting-email";
  const isBusy = checkoutStage === "creating" || checkoutStage === "opening";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(10,23,19,0.34)] px-4 pb-4 pt-10 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-xl overflow-hidden rounded-[2rem] border border-white/80 bg-[rgba(255,255,255,0.92)] shadow-[0_32px_90px_rgba(17,49,39,0.28)]">
        <div className="flex items-center justify-between border-b border-[rgba(17,49,39,0.08)] px-5 py-4">
          <div className="text-lg font-semibold text-[rgba(17,49,39,0.9)]">Download SVG</div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[rgba(17,49,39,0.1)] bg-white/75 text-[rgba(17,49,39,0.72)] transition hover:text-[rgba(17,49,39,1)]"
            aria-label="Close download options"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          {!showEmailStep ? (
            <div className="rounded-[1.45rem] border border-[rgba(17,49,39,0.08)] bg-white/78 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-[rgba(17,49,39,0.88)]">
                  One-time purchase
                </div>
                <div className="inline-flex rounded-full border border-[rgba(17,49,39,0.08)] bg-[rgba(17,49,39,0.04)] p-1">
                  {(Object.keys(PRICE_OPTIONS) as CheckoutCurrency[]).map((currency) => {
                    const selected = currency === checkoutCurrency;
                    return (
                      <button
                        key={currency}
                        type="button"
                        onClick={() => onCheckoutCurrencyChange(currency)}
                        disabled={isBusy}
                        className={clsx(
                          "rounded-full px-3 py-1.5 text-xs font-semibold transition",
                          selected
                            ? "bg-[rgba(17,49,39,0.92)] text-white shadow-[0_10px_24px_rgba(17,49,39,0.14)]"
                            : "text-[rgba(17,49,39,0.66)] hover:text-[rgba(17,49,39,0.92)]",
                        )}
                      >
                        {currency}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="text-2xl font-semibold text-[rgba(17,49,39,0.92)]">
                {PRICE_OPTIONS[checkoutCurrency].label}
              </div>
              <p className="mt-3 text-sm leading-6 text-[rgba(17,49,39,0.72)]">
                {PRICE_OPTIONS[checkoutCurrency].helper}. Complete checkout in the secure Polar
                overlay without leaving the page.
              </p>
            </div>
          ) : null}

          {!showEmailStep ? (
            <div className="rounded-[1.45rem] border border-[rgba(17,49,39,0.08)] bg-white/78 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[rgba(17,49,39,0.88)]">
                <TicketPercent className="h-4 w-4" />
                Discount Codes
              </div>
              <p className="text-sm leading-6 text-[rgba(17,49,39,0.72)]">
                Enter your launch code directly inside Polar checkout. Your current production code
                is <span className="font-semibold">CIRCUTIL100</span>.
              </p>
            </div>
          ) : null}

          {showEmailStep ? (
            <div className="rounded-[1.45rem] border border-[rgba(17,49,39,0.08)] bg-white/78 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[rgba(17,49,39,0.88)]">
                <Mail className="h-4 w-4" />
                Email
              </div>
              <input
                type="email"
                value={email}
                onChange={(event) => onEmailChange(event.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-[1rem] border border-[rgba(17,49,39,0.12)] bg-white px-4 py-3 text-sm text-[rgba(17,49,39,0.88)] outline-none transition focus:border-[rgba(46,107,79,0.45)]"
              />
              <p className="mt-3 text-sm leading-6 text-[rgba(17,49,39,0.72)]">
                We&apos;ll email the download link and start the SVG download immediately.
              </p>
            </div>
          ) : null}

          {notice ? (
            <div
              className={clsx(
                "rounded-[1.25rem] px-4 py-3 text-sm",
                notice.toLowerCase().includes("failed") || notice.toLowerCase().includes("error")
                  ? "bg-[rgba(173,71,44,0.08)] text-[rgba(122,40,19,0.92)]"
                  : "bg-[rgba(17,49,39,0.05)] text-[rgba(17,49,39,0.72)]",
              )}
            >
              {notice}
            </div>
          ) : null}

          {downloadResult ? (
            <a
              href={downloadResult.downloadUrl}
              className="inline-flex w-full items-center justify-center gap-2 rounded-[1.2rem] border border-[rgba(46,107,79,0.2)] bg-[rgba(90,162,127,0.12)] px-4 py-3 text-sm font-semibold text-[rgba(31,87,62,0.94)] transition hover:bg-[rgba(90,162,127,0.18)]"
            >
              <Download className="h-4 w-4" />
              Download again
            </a>
          ) : null}

          <button
            type="button"
            onClick={showEmailStep ? onFulfillment : onCheckoutStart}
            disabled={showEmailStep ? !email.trim() : isBusy}
            className="inline-flex w-full items-center justify-center gap-2 rounded-[1.35rem] bg-[rgba(17,49,39,0.95)] px-4 py-3.5 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(17,49,39,0.24)] transition hover:bg-[rgba(17,49,39,1)] disabled:cursor-not-allowed disabled:opacity-45"
          >
            {isBusy ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : showEmailStep ? (
              <Mail className="h-4 w-4" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {showEmailStep ? "Email + download" : "Continue to secure checkout"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function PlotimgStudio() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const activePreviewRequest = useRef(0);
  const activeEmbeddedCheckout = useRef<{ close: () => void } | null>(null);
  const originalObjectUrlRef = useRef<string | null>(null);

  const [sessionId, setSessionId] = useState("");
  const [upload, setUpload] = useState<UploadRecord | null>(null);
  const [originalImageSrc, setOriginalImageSrc] = useState<string | null>(null);
  const [params, setParams] = useState<PlotParameters>(DEFAULT_PARAMETERS);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [renderedParams, setRenderedParams] = useState<PlotParameters | null>(null);
  const [previewBackground, setPreviewBackground] = useState(DEFAULT_PREVIEW_BACKGROUND);
  const [previewLine, setPreviewLine] = useState(DEFAULT_PREVIEW_LINE);
  const [pendingChanges, setPendingChanges] = useState(false);
  const [generationState, setGenerationState] = useState<GenerationState>({
    status: "idle",
  });
  const [checkoutCurrency, setCheckoutCurrency] = useState<CheckoutCurrency>("USD");
  const [checkoutStage, setCheckoutStage] = useState<CheckoutStage>("idle");
  const [checkoutNotice, setCheckoutNotice] = useState<string | null>(null);
  const [unlockContext, setUnlockContext] = useState<UnlockContext | null>(null);
  const [email, setEmail] = useState("");
  const [downloadResult, setDownloadResult] = useState<GenerateSvgResponse | null>(null);
  const [starterBusyId, setStarterBusyId] = useState<string | null>(null);
  const [showSamples, setShowSamples] = useState(false);
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const deferredParams = useDeferredValue(params);
  const estimatedLines = estimateLineCount(
    deferredParams,
    upload?.dimensions ?? (preview ? preview.image : null),
  );
  const previewBusy =
    generationState.status === "uploading" || generationState.status === "generating";
  const previewReady = generationState.status === "ready" && !!preview;
  const latestPreviewReady = previewReady && !pendingChanges;
  const activeLineCount = latestPreviewReady ? preview.estimatedLineCount : null;
  const complexityWarning =
    typeof activeLineCount === "number" ? getComplexityWarning(activeLineCount) : null;
  const downloadDisabled = !upload || !previewReady || pendingChanges || previewBusy;
  const showDownloadCta = latestPreviewReady || !!downloadResult;

  useEffect(() => {
    const locale = navigator.language.toLowerCase();
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    if (locale.startsWith("he") || timeZone === "Asia/Jerusalem") {
      setCheckoutCurrency("ILS");
    }
  }, []);

  const persistSnapshot = useEffectEvent((snapshot: EditorSnapshot) => {
    const serializedSnapshot = JSON.stringify(snapshot);

    try {
      window.sessionStorage.setItem(SESSION_STORAGE_KEY, serializedSnapshot);
    } catch (error) {
      console.warn("Plotimg snapshot persistence skipped.", error);

      try {
        window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
        window.sessionStorage.setItem(SESSION_STORAGE_KEY, serializedSnapshot);
      } catch (retryError) {
        console.warn("Plotimg snapshot persistence disabled for this session.", retryError);
      }
    }
  });

  const clearUnlockProgress = useEffectEvent(() => {
    activeEmbeddedCheckout.current?.close();
    activeEmbeddedCheckout.current = null;
    setCheckoutStage("idle");
    setCheckoutNotice(null);
    setUnlockContext(null);
    setDownloadResult(null);
    setDownloadError(null);
    setEmail("");
    setCheckoutModalOpen(false);
  });

  const triggerDownload = useEffectEvent((url: string) => {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.rel = "noopener";
    anchor.download = "";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  });

  const resetToDefaults = useEffectEvent(() => {
    setParams(DEFAULT_PARAMETERS);
    setPreviewBackground(DEFAULT_PREVIEW_BACKGROUND);
    setPreviewLine(DEFAULT_PREVIEW_LINE);
    if (upload) {
      setPendingChanges(true);
    }
    clearUnlockProgress();
  });

  const revertToRenderedPreview = useEffectEvent(() => {
    if (!renderedParams) {
      return;
    }

    setParams(renderedParams);
    setPendingChanges(false);
    setGenerationState(
      preview
        ? {
            status: "ready",
            message: "Ready",
          }
        : {
            status: "idle",
          },
    );
    setDownloadError(null);
    clearUnlockProgress();
  });

  const pollPreviewJob = useEffectEvent(
    async (
      jobId: string,
      requestToken: number,
      completedParams: PlotParameters,
      retryCount = 0,
    ) => {
      let status;

      try {
        status = await getPreviewStatus(jobId, sessionId);
      } catch (error) {
        if (requestToken !== activePreviewRequest.current) {
          return;
        }

        if (retryCount < 4) {
          setGenerationState({
            status: "generating",
            message: retryCount === 0 ? "Checking preview…" : "Reconnecting…",
          });
          window.setTimeout(() => {
            void pollPreviewJob(jobId, requestToken, completedParams, retryCount + 1);
          }, 1200);
          return;
        }

        setGenerationState({
          status: "error",
          message: "Preview paused",
          error:
            error instanceof Error
              ? error.message
              : "The preview server could not be reached. Try refreshing the preview.",
        });
        return;
      }

      if (requestToken !== activePreviewRequest.current) {
        return;
      }

      if (status.status === "completed" && status.result) {
        startTransition(() => {
          setPreview(status.result);
          setRenderedParams(completedParams);
          setPendingChanges(false);
          setGenerationState({
            status: "ready",
            message: "Ready",
          });
        });
        return;
      }

      if (status.status === "failed") {
        setGenerationState({
          status: "error",
          message: "Preview failed",
          error: status.errorMessage ?? "Preview generation failed.",
        });
        return;
      }

      window.setTimeout(() => {
        void pollPreviewJob(jobId, requestToken, completedParams);
      }, 900);
    },
  );

  const beginPreviewGeneration = useEffectEvent(
    async (nextUploadId: string, nextParams: PlotParameters) => {
      const requestToken = activePreviewRequest.current + 1;
      activePreviewRequest.current = requestToken;
      setGenerationState({
        status: "generating",
        message: "Generating preview…",
      });

      const createdJob = await createPreviewJob({
        uploadId: nextUploadId,
        params: nextParams,
        sessionId,
      });

      await pollPreviewJob(createdJob.jobId, requestToken, nextParams);
    },
  );

  useEffect(() => {
    return () => {
      activeEmbeddedCheckout.current?.close();
      activeEmbeddedCheckout.current = null;
      if (originalObjectUrlRef.current) {
        URL.revokeObjectURL(originalObjectUrlRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const existingSessionId = window.localStorage.getItem(SESSION_ID_STORAGE_KEY);
    const nextSessionId = existingSessionId || window.crypto.randomUUID();
    if (!existingSessionId) {
      window.localStorage.setItem(SESSION_ID_STORAGE_KEY, nextSessionId);
    }

    const savedSnapshot = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (savedSnapshot) {
      try {
        const parsed = JSON.parse(savedSnapshot) as EditorSnapshot;
        setUpload(parsed.upload);
        setParams(parsed.params);
        setRenderedParams(parsed.renderedParams ?? null);
        setPreviewBackground(parsed.previewBackground);
        setPreviewLine(parsed.previewLine);
        if (parsed.originalImageSrc) {
          updateOriginalImageSource(parsed.originalImageSrc);
        }
      } catch {
        window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
      }
    }

    setSessionId(nextSessionId);
  }, []);

  useEffect(() => {
    if (!sessionId) {
      return;
    }

    persistSnapshot({
      upload,
      params,
      renderedParams,
      previewBackground,
      previewLine,
      originalImageSrc: originalImageSrc?.startsWith("blob:") ? null : originalImageSrc,
    });
  }, [
    originalImageSrc,
    params,
    persistSnapshot,
    renderedParams,
    previewBackground,
    previewLine,
    sessionId,
    upload,
  ]);

  useEffect(() => {
    if (!checkoutModalOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        activeEmbeddedCheckout.current?.close();
        activeEmbeddedCheckout.current = null;
        setCheckoutModalOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [checkoutModalOpen]);

  const closeCheckoutModal = useEffectEvent(() => {
    activeEmbeddedCheckout.current?.close();
    activeEmbeddedCheckout.current = null;
    setCheckoutModalOpen(false);
  });

  function handleParameterChange<Key extends keyof PlotParameters>(
    key: Key,
    value: PlotParameters[Key],
  ) {
    setParams((current) => ({
      ...current,
      [key]: value,
    }));

    if (upload) {
      setPendingChanges(true);
      if (generationState.status !== "error") {
        if (preview) {
          setGenerationState({
            status: "ready",
            message: "Refresh preview",
          });
        } else {
          setGenerationState({
            status: "idle",
          });
        }
      }
    }

    clearUnlockProgress();
  }

  function updateOriginalImageSource(nextSrc: string | null, trackObjectUrl = false) {
    if (originalObjectUrlRef.current) {
      URL.revokeObjectURL(originalObjectUrlRef.current);
      originalObjectUrlRef.current = null;
    }

    if (trackObjectUrl && nextSrc?.startsWith("blob:")) {
      originalObjectUrlRef.current = nextSrc;
    }

    setOriginalImageSrc(nextSrc);
  }

  async function handleUpload(file: File, sourcePreview?: string) {
    if (!sessionId) {
      return;
    }

    clearUnlockProgress();
    updateOriginalImageSource(sourcePreview ?? URL.createObjectURL(file), !sourcePreview);
    setShowSamples(false);
    setPreview(null);
    setRenderedParams(null);
    setPendingChanges(false);
    setGenerationState({
      status: "uploading",
      message: "Uploading…",
    });

    let nextUpload: UploadRecord;

    try {
      nextUpload = await uploadImage(file, sessionId);
    } catch (error) {
      setGenerationState({
        status: "error",
        message: "Upload failed",
        error: error instanceof Error ? error.message : "Upload failed.",
      });
      return;
    }

    setUpload(nextUpload);
    try {
      await beginPreviewGeneration(nextUpload.uploadId, params);
    } catch (error) {
      setGenerationState({
        status: "error",
        message: "Preview failed",
        error: error instanceof Error ? error.message : "Preview generation failed.",
      });
    }
  }

  async function handleStarterSelect(starterId: string, src: string) {
    setStarterBusyId(starterId);

    try {
      const response = await fetch(src);
      if (!response.ok) {
        throw new Error("Sample image could not be loaded.");
      }
      const blob = await response.blob();
      const extension = src.split(".").pop() ?? "jpg";
      const file = new File([blob], `${starterId}.${extension}`, {
        type: blob.type || "image/jpeg",
      });
      await handleUpload(file, src);
    } catch (error) {
      setGenerationState({
        status: "error",
        message: "Sample unavailable",
        error: error instanceof Error ? error.message : "Sample image could not be loaded.",
      });
    } finally {
      setStarterBusyId(null);
    }
  }

  async function handleManualGenerate() {
    if (!upload) {
      return;
    }

    clearUnlockProgress();
    try {
      await beginPreviewGeneration(upload.uploadId, params);
    } catch (error) {
      setGenerationState({
        status: "error",
        message: "Preview failed",
        error: error instanceof Error ? error.message : "Preview generation failed.",
      });
    }
  }

  async function handleCheckoutStart() {
    if (!upload || !sessionId) {
      return;
    }

    if (unlockContext) {
      setCheckoutStage("awaiting-email");
      setCheckoutNotice("Add your email for instant delivery.");
      return;
    }

    setCheckoutStage("creating");
    setCheckoutNotice("Opening secure checkout…");

    try {
      const response = await createCheckout({
        uploadId: upload.uploadId,
        params,
        currency: checkoutCurrency,
        sessionId,
      });

      if (response.mode === "existing") {
        setUnlockContext({
          mode: "existing",
          purchaseId: response.purchaseId,
        });
        setCheckoutStage("awaiting-email");
        setCheckoutNotice("Already unlocked in this session. Add your email to receive the file.");
        return;
      }

      if (!response.checkoutId || !response.checkoutUrl) {
        throw new Error("Secure checkout could not be created.");
      }

      const checkoutId = response.checkoutId;
      const PolarEmbedCheckout = await loadPolarEmbedCheckout();
      let checkoutSucceeded = false;

      const checkout = await PolarEmbedCheckout.create(response.checkoutUrl, {
        theme: "light",
        onLoaded: () => {
          setCheckoutStage("opening");
          setCheckoutNotice(
            "Secure checkout open. Enter CIRCUTIL100 there if you want to apply the launch discount.",
          );
        },
      });

      activeEmbeddedCheckout.current = checkout;

      checkout.addEventListener(
        "confirmed",
        () => {
          setCheckoutNotice("Payment confirmed. Finalizing with Polar…");
        },
        { once: true },
      );

      checkout.addEventListener(
        "success",
        (event) => {
          checkoutSucceeded = true;
          event.preventDefault();
          activeEmbeddedCheckout.current = null;
          setUnlockContext({
            mode: "paid",
            purchaseId: response.purchaseId,
            checkoutId,
          });
          setCheckoutStage("awaiting-email");
          setCheckoutNotice("Payment confirmed. Add your email for instant delivery.");
          checkout.close();
        },
        { once: true },
      );

      checkout.addEventListener(
        "close",
        () => {
          if (activeEmbeddedCheckout.current === checkout) {
            activeEmbeddedCheckout.current = null;
          }

          if (!checkoutSucceeded) {
            setCheckoutStage("idle");
            setCheckoutNotice("Checkout closed. Reopen it whenever you're ready.");
          }
        },
        { once: true },
      );
    } catch (error) {
      setCheckoutStage("idle");
      setCheckoutNotice(error instanceof Error ? error.message : "Checkout failed.");
    }
  }

  async function handleFulfillment() {
    if (!upload || !sessionId || !email.trim() || !unlockContext) {
      return;
    }

    setGenerationState({
      status: "fulfilling",
      message: "Preparing your download…",
    });
    setCheckoutNotice("Preparing your download…");

    try {
      const response = await generateSvg({
        uploadId: upload.uploadId,
        params,
        sessionId,
        currency: checkoutCurrency,
        purchaseId: unlockContext.purchaseId,
        checkoutId: unlockContext.mode === "paid" ? unlockContext.checkoutId : undefined,
        email,
      });

      setDownloadResult(response);
      setGenerationState({
        status: "completed",
        message: "Ready",
      });
      setCheckoutNotice(response.emailDelivered ? "Email sent." : response.emailReason || "Ready.");
      triggerDownload(response.downloadUrl);
    } catch (error) {
      setGenerationState({
        status: "error",
        message: "Download failed",
        error: error instanceof Error ? error.message : "Download failed.",
      });
      setCheckoutNotice(error instanceof Error ? error.message : "Download failed.");
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-[1600px] flex-col px-4 pb-8 pt-4 sm:px-6 lg:px-8">
      <div className="grid items-start gap-5 lg:grid-cols-[19rem_minmax(0,1fr)]">
        <div className="plotimg-panel plotimg-shadow overflow-hidden rounded-[2rem] border border-white/70 lg:hidden">
          <div className="px-5 py-5">
            <ControlRail
              upload={upload}
              hasRenderedPreview={!!preview}
              params={params}
              previewBackground={previewBackground}
              previewLine={previewLine}
              showSamples={showSamples}
              onToggleSamples={() => setShowSamples((current) => !current)}
              onUploadClick={() => fileInputRef.current?.click()}
              onStarterSelect={(starterId, src) => void handleStarterSelect(starterId, src)}
              starterBusyId={starterBusyId}
              onParamChange={handleParameterChange}
              onPreviewBackgroundChange={setPreviewBackground}
              onPreviewLineChange={setPreviewLine}
              onGeneratePreview={() => void handleManualGenerate()}
              onReset={resetToDefaults}
              previewBusy={previewBusy}
              pendingChanges={pendingChanges}
            />
          </div>
        </div>

        <aside className="plotimg-panel plotimg-shadow hidden rounded-[2rem] border border-white/70 lg:block">
          <div className="max-h-[calc(100vh-2.5rem)] overflow-y-auto px-5 py-5">
            <ControlRail
              upload={upload}
              hasRenderedPreview={!!preview}
              params={params}
              previewBackground={previewBackground}
              previewLine={previewLine}
              showSamples={showSamples}
              onToggleSamples={() => setShowSamples((current) => !current)}
              onUploadClick={() => fileInputRef.current?.click()}
              onStarterSelect={(starterId, src) => void handleStarterSelect(starterId, src)}
              starterBusyId={starterBusyId}
              onParamChange={handleParameterChange}
              onPreviewBackgroundChange={setPreviewBackground}
              onPreviewLineChange={setPreviewLine}
              onGeneratePreview={() => void handleManualGenerate()}
              onReset={resetToDefaults}
              previewBusy={previewBusy}
              pendingChanges={pendingChanges}
            />
          </div>
        </aside>

        <section className="min-w-0 space-y-4 self-start lg:-mt-px">
          {!preview ? (
            <header className="px-1 pt-1">
              <h1 className="plotimg-display max-w-[18ch] text-balance text-[clamp(1.5rem,3vw,2.35rem)] font-medium tracking-[-0.03em] text-[rgba(17,49,39,0.82)]">
                Turn images into plotter-ready art.
              </h1>
            </header>
          ) : null}

          <div className="space-y-3">
            {complexityWarning ? (
              <NoticeBanner
                tone={complexityWarning.tone === "high" ? "danger" : "warning"}
                message={complexityWarning.message}
                tooltip={TOOLTIPS.complexity}
              />
            ) : null}

            {generationState.status === "error" ? (
              <NoticeBanner tone="danger" message={generationState.error} />
            ) : null}

            {downloadError ? <NoticeBanner tone="danger" message={downloadError} /> : null}
          </div>

          {preview ? (
            <PreviewCanvas
              preview={preview}
              params={params}
              originalImageSrc={originalImageSrc}
              backgroundColor={previewBackground}
              lineColor={previewLine}
              isBusy={previewBusy}
              isOutOfDate={pendingChanges}
              onRefresh={() => void handleManualGenerate()}
              onRevert={revertToRenderedPreview}
            />
          ) : previewBusy ? (
            <div className="flex min-h-[34rem] items-center justify-center rounded-[2.15rem] border border-white/70 bg-[rgba(255,255,255,0.62)] shadow-[0_30px_90px_rgba(17,49,39,0.12)] lg:min-h-[42rem]">
              <div className="flex flex-col items-center gap-3">
                <LoaderCircle className="h-8 w-8 animate-spin text-[rgba(17,49,39,0.72)]" />
                <div className="text-sm font-medium text-[rgba(17,49,39,0.68)]">
                  {generationState.message}
                </div>
              </div>
            </div>
          ) : (
            <EmptyPrompt />
          )}
        </section>
      </div>

      {showDownloadCta ? (
        <div className="sticky bottom-4 z-20 mt-6">
          <div className="mx-auto max-w-3xl rounded-[2rem] border border-white/80 bg-[rgba(255,255,255,0.78)] p-3 shadow-[0_24px_70px_rgba(17,49,39,0.16)] backdrop-blur-xl">
            <button
              type="button"
              onClick={() => {
                if (downloadResult) {
                  triggerDownload(downloadResult.downloadUrl);
                  return;
                }
                setCheckoutStage(unlockContext ? "awaiting-email" : "idle");
                setCheckoutNotice(
                  unlockContext ? "Add your email for instant delivery." : null,
                );
                setCheckoutModalOpen(true);
              }}
              disabled={downloadDisabled}
              className={clsx(
                "inline-flex w-full items-center justify-center gap-3 rounded-[1.55rem] px-6 py-4 text-lg font-semibold transition",
                "bg-[rgba(17,49,39,0.95)] text-white shadow-[0_18px_40px_rgba(17,49,39,0.24)] hover:bg-[rgba(17,49,39,1)]",
                downloadDisabled && "cursor-not-allowed opacity-45",
              )}
            >
              <Download className="h-5 w-5" />
              Download SVG
            </button>
          </div>
        </div>
      ) : null}

      <footer className="mt-6 pb-2 text-center text-[11px] tracking-[0.12em] text-[rgba(17,49,39,0.34)]">
        <span>v1.0</span>
        <span className="mx-2">·</span>
        <a
          href="mailto:support@plotimg.com"
          className="transition hover:text-[rgba(17,49,39,0.58)]"
        >
          support@plotimg.com
        </a>
      </footer>

      <CheckoutModal
        open={checkoutModalOpen}
        onClose={closeCheckoutModal}
        onCheckoutStart={() => void handleCheckoutStart()}
        checkoutCurrency={checkoutCurrency}
        onCheckoutCurrencyChange={setCheckoutCurrency}
        email={email}
        onEmailChange={setEmail}
        onFulfillment={() => void handleFulfillment()}
        downloadResult={downloadResult}
        checkoutStage={checkoutStage}
        notice={checkoutNotice}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={(event) => {
          const nextFile = event.target.files?.[0];
          if (nextFile) {
            void handleUpload(nextFile);
          }
          event.currentTarget.value = "";
        }}
      />
    </main>
  );
}
