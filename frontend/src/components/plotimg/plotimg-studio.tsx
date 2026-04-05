"use client";

import Image from "next/image";
import { useSearchParams } from "next/navigation";
import {
  startTransition,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
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
  validateCoupon,
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
      status: "uploading" | "generating" | "ready";
      message: string;
    }
  | {
      status: "error";
      message: string;
      error: string;
    };

type CouponState = {
  status: "idle" | "checking" | "valid" | "invalid";
  free: boolean;
  code?: string;
  message?: string;
  allowCheckoutDiscountCodes: boolean;
};

type UnlockContext =
  | { mode: "free"; couponCode: string }
  | { mode: "paid"; purchaseId: string; checkoutId: string }
  | { mode: "existing"; purchaseId: string };

type CheckoutStage =
  | "idle"
  | "creating"
  | "redirecting"
  | "awaiting-email"
  | "fulfilling"
  | "completed"
  | "error";

type EditorSnapshot = {
  upload: UploadRecord | null;
  params: PlotParameters;
  renderedParams: PlotParameters | null;
  previewBackground: string;
  previewLine: string;
  couponCode: string;
  selectedCurrency: "USD" | "ILS";
  originalImageSrc: string | null;
};

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

function InfoTooltip({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  return (
    <span className={clsx("group/tooltip relative inline-flex", className)}>
      <button
        type="button"
        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[rgba(17,49,39,0.12)] bg-white/78 text-[rgba(17,49,39,0.56)] transition hover:text-[rgba(17,49,39,0.9)] focus-visible:outline-none"
        aria-label={content}
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      <span className="pointer-events-none absolute left-1/2 top-full z-20 hidden w-48 -translate-x-1/2 rounded-[1rem] bg-[rgba(17,49,39,0.96)] px-3 py-2 text-[11px] leading-5 text-white shadow-[0_16px_42px_rgba(17,49,39,0.26)] group-hover/tooltip:block group-focus-within/tooltip:block">
        {content}
      </span>
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
  selectedCurrency,
  onCurrencyChange,
  couponCode,
  onCouponCodeChange,
  couponState,
  onValidateCoupon,
  checkoutStage,
  checkoutNotice,
  email,
  onEmailChange,
  onCheckoutStart,
  onFulfillment,
  downloadResult,
}: {
  open: boolean;
  onClose: () => void;
  selectedCurrency: "USD" | "ILS";
  onCurrencyChange: (currency: "USD" | "ILS") => void;
  couponCode: string;
  onCouponCodeChange: (value: string) => void;
  couponState: CouponState;
  onValidateCoupon: () => void;
  checkoutStage: CheckoutStage;
  checkoutNotice: string | null;
  email: string;
  onEmailChange: (value: string) => void;
  onCheckoutStart: () => void;
  onFulfillment: () => void;
  downloadResult: GenerateSvgResponse | null;
}) {
  if (!open) {
    return null;
  }

  const showEmailStep =
    checkoutStage === "awaiting-email" ||
    checkoutStage === "fulfilling" ||
    checkoutStage === "completed";

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
          <div className="grid grid-cols-2 gap-3">
            {(Object.keys(PRICE_OPTIONS) as Array<keyof typeof PRICE_OPTIONS>).map((currency) => (
              <button
                key={currency}
                type="button"
                onClick={() => onCurrencyChange(currency)}
                className={clsx(
                  "rounded-[1.25rem] border px-4 py-3 text-left text-sm font-semibold transition",
                  selectedCurrency === currency
                    ? "border-[rgba(46,107,79,0.34)] bg-[rgba(90,162,127,0.12)] text-[rgba(17,49,39,0.92)]"
                    : "border-[rgba(17,49,39,0.08)] bg-white text-[rgba(17,49,39,0.68)]",
                )}
              >
                {PRICE_OPTIONS[currency].label}
              </button>
            ))}
          </div>

          {!showEmailStep ? (
            <div className="rounded-[1.45rem] border border-[rgba(17,49,39,0.08)] bg-white/78 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[rgba(17,49,39,0.88)]">
                <TicketPercent className="h-4 w-4" />
                Coupon
              </div>
              <div className="flex gap-2">
                <input
                  value={couponCode}
                  onChange={(event) => onCouponCodeChange(event.target.value.toUpperCase())}
                  placeholder="FREE"
                  className="min-w-0 flex-1 rounded-full border border-[rgba(17,49,39,0.12)] bg-white px-4 py-2.5 text-sm text-[rgba(17,49,39,0.88)] outline-none transition focus:border-[rgba(46,107,79,0.45)]"
                />
                <button
                  type="button"
                  onClick={onValidateCoupon}
                  disabled={couponState.status === "checking"}
                  className="rounded-full border border-[rgba(17,49,39,0.12)] bg-white px-4 py-2.5 text-sm font-semibold text-[rgba(17,49,39,0.72)] transition hover:border-[rgba(17,49,39,0.22)] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {couponState.status === "checking" ? "Checking..." : "Apply"}
                </button>
              </div>
              {couponState.message ? (
                <div
                  className={clsx(
                    "mt-3 rounded-[1rem] px-3 py-2 text-sm",
                    couponState.status === "valid"
                      ? "bg-[rgba(90,162,127,0.12)] text-[rgba(31,87,62,0.92)]"
                      : "bg-[rgba(173,71,44,0.08)] text-[rgba(122,40,19,0.92)]",
                  )}
                >
                  {couponState.message}
                </div>
              ) : null}
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
            </div>
          ) : null}

          {checkoutNotice ? (
            <div
              className={clsx(
                "rounded-[1.25rem] px-4 py-3 text-sm",
                checkoutStage === "error"
                  ? "bg-[rgba(173,71,44,0.08)] text-[rgba(122,40,19,0.92)]"
                  : "bg-[rgba(17,49,39,0.05)] text-[rgba(17,49,39,0.72)]",
              )}
            >
              {checkoutNotice}
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
            disabled={
              showEmailStep
                ? !email.trim() || checkoutStage === "fulfilling"
                : checkoutStage === "creating" || checkoutStage === "redirecting"
            }
            className="inline-flex w-full items-center justify-center gap-2 rounded-[1.35rem] bg-[rgba(17,49,39,0.95)] px-4 py-3.5 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(17,49,39,0.24)] transition hover:bg-[rgba(17,49,39,1)] disabled:cursor-not-allowed disabled:opacity-45"
          >
            {checkoutStage === "creating" ||
            checkoutStage === "redirecting" ||
            checkoutStage === "fulfilling" ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : showEmailStep ? (
              <Mail className="h-4 w-4" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {showEmailStep ? "Email + download" : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function PlotimgStudio() {
  const searchParams = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const activePreviewRequest = useRef(0);
  const handledCheckoutRedirect = useRef(false);
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
  const [couponCode, setCouponCode] = useState("");
  const [couponState, setCouponState] = useState<CouponState>({
    status: "idle",
    free: false,
    allowCheckoutDiscountCodes: true,
  });
  const [checkoutStage, setCheckoutStage] = useState<CheckoutStage>("idle");
  const [checkoutNotice, setCheckoutNotice] = useState<string | null>(null);
  const [unlockContext, setUnlockContext] = useState<UnlockContext | null>(null);
  const [selectedCurrency, setSelectedCurrency] = useState<"USD" | "ILS">("USD");
  const [email, setEmail] = useState("");
  const [downloadResult, setDownloadResult] = useState<GenerateSvgResponse | null>(null);
  const [starterBusyId, setStarterBusyId] = useState<string | null>(null);
  const [showSamples, setShowSamples] = useState(false);
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState<"idle" | "downloading" | "error">("idle");
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
  const downloadDisabled =
    !upload || !previewReady || pendingChanges || previewBusy || downloadStatus === "downloading";
  const showDownloadCta = latestPreviewReady || !!downloadResult;

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
    setUnlockContext(null);
    setCheckoutStage("idle");
    setCheckoutNotice(null);
    setDownloadResult(null);
    setDownloadStatus("idle");
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
        setCouponCode(parsed.couponCode);
        setSelectedCurrency(parsed.selectedCurrency);
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
      couponCode,
      selectedCurrency,
      originalImageSrc: originalImageSrc?.startsWith("blob:") ? null : originalImageSrc,
    });
  }, [
    couponCode,
    originalImageSrc,
    params,
    persistSnapshot,
    renderedParams,
    previewBackground,
    previewLine,
    selectedCurrency,
    sessionId,
    upload,
  ]);

  useEffect(() => {
    if (!sessionId || handledCheckoutRedirect.current) {
      return;
    }

    const purchaseId = searchParams.get("purchaseId");
    const checkoutId = searchParams.get("checkout_id");

    if (!purchaseId || !checkoutId) {
      return;
    }

    handledCheckoutRedirect.current = true;
    setUnlockContext({
      mode: "paid",
      purchaseId,
      checkoutId,
    });
    setCheckoutStage("awaiting-email");
    setCheckoutNotice("Payment confirmed.");
    setCheckoutModalOpen(true);
    window.history.replaceState({}, "", window.location.pathname);
  }, [searchParams, sessionId]);

  useEffect(() => {
    if (!checkoutModalOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setCheckoutModalOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [checkoutModalOpen]);

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
    setCouponState({
      status: "idle",
      free: false,
      allowCheckoutDiscountCodes: true,
    });

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

  async function handleValidateCoupon() {
    if (!sessionId || !couponCode.trim()) {
      setCouponState({
        status: "invalid",
        free: false,
        message: "Enter a code first.",
        allowCheckoutDiscountCodes: true,
      });
      return;
    }

    setCouponState((current) => ({
      ...current,
      status: "checking",
    }));

    try {
      const result = await validateCoupon(couponCode, sessionId);
      setCouponState({
        status: result.valid ? "valid" : "invalid",
        free: result.free,
        code: result.code,
        message: result.message,
        allowCheckoutDiscountCodes: result.allowCheckoutDiscountCodes,
      });
    } catch (error) {
      setCouponState({
        status: "invalid",
        free: false,
        message: error instanceof Error ? error.message : "Coupon check failed.",
        allowCheckoutDiscountCodes: true,
      });
    }
  }

  async function handleCheckoutStart() {
    if (!upload || !sessionId) {
      return;
    }

    if (couponState.status === "valid" && couponState.free && couponState.code) {
      setUnlockContext({
        mode: "free",
        couponCode: couponState.code,
      });
      setCheckoutStage("awaiting-email");
      setCheckoutNotice("FREE applied.");
      return;
    }

    if (unlockContext?.mode === "paid" || unlockContext?.mode === "existing") {
      setCheckoutStage("awaiting-email");
      setCheckoutNotice("Add your email.");
      return;
    }

    setCheckoutStage("creating");
    setCheckoutNotice("Opening secure checkout…");

    try {
      const response = await createCheckout({
        uploadId: upload.uploadId,
        params,
        currency: selectedCurrency,
        sessionId,
      });

      if (response.mode === "existing") {
        setUnlockContext({
          mode: "existing",
          purchaseId: response.purchaseId,
        });
        setCheckoutStage("awaiting-email");
        setCheckoutNotice("Already unlocked in this session.");
        return;
      }

      setCheckoutStage("redirecting");
      setCheckoutNotice("Redirecting…");
      window.location.assign(response.checkoutUrl || "");
    } catch (error) {
      setCheckoutStage("error");
      setCheckoutNotice(error instanceof Error ? error.message : "Checkout failed.");
    }
  }

  async function handleFulfillment() {
    if (!upload || !sessionId || !email.trim()) {
      return;
    }

    setCheckoutStage("fulfilling");
    setCheckoutNotice("Preparing your download…");

    try {
      const response = await generateSvg({
        uploadId: upload.uploadId,
        params,
        sessionId,
        currency: selectedCurrency,
        couponCode: unlockContext?.mode === "free" ? unlockContext.couponCode : undefined,
        purchaseId:
          unlockContext?.mode === "paid" || unlockContext?.mode === "existing"
            ? unlockContext.purchaseId
            : undefined,
        checkoutId: unlockContext?.mode === "paid" ? unlockContext.checkoutId : undefined,
        email,
      });

      setDownloadResult(response);
      setCheckoutStage("completed");
      setCheckoutNotice(response.emailDelivered ? "Email sent." : response.emailReason || "Ready.");
      triggerDownload(response.downloadUrl);
    } catch (error) {
      setCheckoutStage("error");
      setCheckoutNotice(error instanceof Error ? error.message : "Download failed.");
    }
  }

  async function handleDirectDownload() {
    if (!upload || !sessionId) {
      return;
    }

    setDownloadStatus("downloading");
    setDownloadError(null);

    try {
      const response = await generateSvg({
        uploadId: upload.uploadId,
        params,
        sessionId,
        currency: "USD",
        couponCode: "FREE",
      });

      setDownloadResult(response);
      setDownloadStatus("idle");
      triggerDownload(response.downloadUrl);
    } catch (error) {
      setDownloadStatus("error");
      setDownloadError(error instanceof Error ? error.message : "Download failed.");
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-[1600px] flex-col px-4 pb-8 pt-4 sm:px-6 lg:px-8">
      <div className="grid items-start gap-5 lg:grid-cols-[19rem_minmax(0,1fr)]">
        <details className="plotimg-panel plotimg-shadow overflow-hidden rounded-[2rem] border border-white/70 lg:hidden" open>
          <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-[rgba(17,49,39,0.84)]">
            Controls
          </summary>
          <div className="border-t border-[rgba(17,49,39,0.08)] px-5 pb-5 pt-5">
            <ControlRail
              upload={upload}
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
        </details>

        <aside className="plotimg-panel plotimg-shadow hidden rounded-[2rem] border border-white/70 lg:block">
          <div className="max-h-[calc(100vh-2.5rem)] overflow-y-auto px-5 py-5">
            <ControlRail
              upload={upload}
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
                if (downloadResult && downloadStatus !== "downloading") {
                  triggerDownload(downloadResult.downloadUrl);
                  return;
                }
                void handleDirectDownload();
              }}
              disabled={downloadDisabled}
              className={clsx(
                "inline-flex w-full items-center justify-center gap-3 rounded-[1.55rem] px-6 py-4 text-lg font-semibold transition",
                "bg-[rgba(17,49,39,0.95)] text-white shadow-[0_18px_40px_rgba(17,49,39,0.24)] hover:bg-[rgba(17,49,39,1)]",
                downloadDisabled && "cursor-not-allowed opacity-45",
              )}
            >
              {downloadStatus === "downloading" ? (
                <LoaderCircle className="h-5 w-5 animate-spin" />
              ) : (
                <Download className="h-5 w-5" />
              )}
              Download SVG
            </button>
          </div>
        </div>
      ) : null}

      <CheckoutModal
        open={checkoutModalOpen}
        onClose={() => setCheckoutModalOpen(false)}
        selectedCurrency={selectedCurrency}
        onCurrencyChange={setSelectedCurrency}
        couponCode={couponCode}
        onCouponCodeChange={(value) => {
          setCouponCode(value);
          setCouponState({
            status: "idle",
            free: false,
            allowCheckoutDiscountCodes: true,
          });
        }}
        couponState={couponState}
        onValidateCoupon={() => void handleValidateCoupon()}
        checkoutStage={checkoutStage}
        checkoutNotice={checkoutNotice}
        email={email}
        onEmailChange={setEmail}
        onCheckoutStart={() => void handleCheckoutStart()}
        onFulfillment={() => void handleFulfillment()}
        downloadResult={downloadResult}
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
