"use client";

import { Eye, EyeOff, LoaderCircle, Minus, Plus, RefreshCcw } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { clsx } from "clsx";

import { type PlotParameters, type PreviewResult } from "@/lib/plotimg";

type PreviewCanvasProps = {
  preview: PreviewResult;
  params: PlotParameters;
  originalImageSrc: string | null;
  backgroundColor: string;
  lineColor: string;
  isBusy: boolean;
  isOutOfDate: boolean;
  onRefresh: () => void;
  onRevert: () => void;
};

function useMeasuredElement<T extends HTMLElement>() {
  const [element, setElement] = useState<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!element) {
      return;
    }

    const updateSize = () => {
      setSize({
        width: element.clientWidth,
        height: element.clientHeight,
      });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);

    return () => observer.disconnect();
  }, [element]);

  return {
    ref: setElement,
    size,
  };
}

function PlotSvgGraphic({
  preview,
  lineColor,
  backgroundColor,
  className,
}: {
  preview: PreviewResult;
  lineColor: string;
  backgroundColor: string;
  className?: string;
}) {
  return (
    <svg
      viewBox={`0 0 ${preview.viewBox.width} ${preview.viewBox.height}`}
      className={className}
      aria-hidden="true"
      preserveAspectRatio="xMidYMid meet"
    >
      <rect width={preview.viewBox.width} height={preview.viewBox.height} fill={backgroundColor} />
      <g fill="none" stroke={lineColor} strokeWidth={1.15} strokeLinecap="round" strokeLinejoin="round">
        {preview.paths.map((pathData, index) => (
          <path key={`${index}-${pathData.slice(0, 16)}`} d={pathData} />
        ))}
      </g>
    </svg>
  );
}

function OriginalSvgGraphic({
  preview,
  params,
  originalImageSrc,
  className,
}: {
  preview: PreviewResult;
  params: PlotParameters;
  originalImageSrc: string;
  className?: string;
}) {
  const padding = Math.max(16, params.pixelWidth * 2.4);
  const imageWidth = preview.image.width * params.pixelWidth;
  const imageHeight = preview.image.height * params.pixelWidth;

  return (
    <svg
      viewBox={`0 0 ${preview.viewBox.width} ${preview.viewBox.height}`}
      className={className}
      aria-hidden="true"
      preserveAspectRatio="xMidYMid meet"
    >
      <rect width={preview.viewBox.width} height={preview.viewBox.height} fill="#ffffff" />
      <image
        href={originalImageSrc}
        x={padding}
        y={padding}
        width={imageWidth}
        height={imageHeight}
        preserveAspectRatio="none"
      />
    </svg>
  );
}

export function PreviewCanvas({
  preview,
  params,
  originalImageSrc,
  backgroundColor,
  lineColor,
  isBusy,
  isOutOfDate,
  onRefresh,
  onRevert,
}: PreviewCanvasProps) {
  const [pointerRatio, setPointerRatio] = useState<{ x: number; y: number } | null>(null);
  const [hovering, setHovering] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const renderViewport = useMeasuredElement<HTMLDivElement>();
  const originalViewport = useMeasuredElement<HTMLDivElement>();

  const lensSize = 184;
  const lensZoom = 2.35;
  const minZoom = 1;
  const maxZoom = 4;
  const activePointerRatio = pointerRatio ?? { x: 0.5, y: 0.5 };
  const renderScaledWidth = renderViewport.size.width * zoomLevel;
  const renderScaledHeight = renderViewport.size.height * zoomLevel;
  const renderPanX =
    zoomLevel > minZoom && renderViewport.size.width
      ? -(activePointerRatio.x * (renderScaledWidth - renderViewport.size.width))
      : 0;
  const renderPanY =
    zoomLevel > minZoom && renderViewport.size.height
      ? -(activePointerRatio.y * (renderScaledHeight - renderViewport.size.height))
      : 0;
  const originalScaledWidth = originalViewport.size.width * zoomLevel;
  const originalScaledHeight = originalViewport.size.height * zoomLevel;
  const originalPanX =
    zoomLevel > minZoom && originalViewport.size.width
      ? -(activePointerRatio.x * (originalScaledWidth - originalViewport.size.width))
      : 0;
  const originalPanY =
    zoomLevel > minZoom && originalViewport.size.height
      ? -(activePointerRatio.y * (originalScaledHeight - originalViewport.size.height))
      : 0;
  const activeLensPointer = {
    x: activePointerRatio.x * renderViewport.size.width,
    y: activePointerRatio.y * renderViewport.size.height,
  };

  useEffect(() => {
    if (!originalImageSrc) {
      setShowOriginal(false);
    }
  }, [originalImageSrc]);

  function resetZoom() {
    setZoomLevel(1);
    setPointerRatio(null);
  }

  function updatePointerFromEvent(
    event: ReactPointerEvent<HTMLDivElement>,
    element: HTMLDivElement,
  ) {
    const bounds = element.getBoundingClientRect();
    setPointerRatio({
      x: Math.min(Math.max(event.clientX - bounds.left, 0), bounds.width) / Math.max(bounds.width, 1),
      y: Math.min(Math.max(event.clientY - bounds.top, 0), bounds.height) / Math.max(bounds.height, 1),
    });
  }

  const viewportClassName = clsx(
    "relative w-full min-w-0 overflow-hidden rounded-[1.3rem] border border-white/80 bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]",
    zoomLevel <= minZoom ? "cursor-crosshair" : "cursor-move",
  );
  const viewportStyle = {
    aspectRatio: `${preview.viewBox.width} / ${preview.viewBox.height}`,
    width: "100%",
    maxWidth: "100%",
    maxHeight: "clamp(20rem, 62vh, 34rem)",
    height: "auto",
  } as const;
  const renderContentStyle = {
    left: renderPanX,
    top: renderPanY,
    width: renderViewport.size.width ? renderScaledWidth : "100%",
    height: renderViewport.size.height ? renderScaledHeight : "100%",
  };
  const originalContentStyle = {
    left: originalPanX,
    top: originalPanY,
    width: originalViewport.size.width ? originalScaledWidth : "100%",
    height: originalViewport.size.height ? originalScaledHeight : "100%",
  };

  return (
    <section className="relative overflow-hidden rounded-[2.15rem] border border-white/70 bg-[rgba(255,255,255,0.72)] shadow-[0_30px_90px_rgba(17,49,39,0.12)]">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-4 pt-5">
        <div className="flex min-h-9 items-center gap-2">
          {originalImageSrc ? (
            <button
              type="button"
              onClick={() => setShowOriginal((current) => !current)}
              className="inline-flex items-center gap-2 rounded-full border border-[rgba(17,49,39,0.12)] bg-white px-3 py-2 text-sm font-medium text-[rgba(17,49,39,0.72)] transition hover:border-[rgba(17,49,39,0.22)] hover:text-[rgba(17,49,39,0.92)]"
            >
              {showOriginal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              {showOriginal ? "Hide original" : "Show original"}
            </button>
          ) : null}

          {isBusy ? (
            <span className="inline-flex items-center gap-2 rounded-full border border-[rgba(46,107,79,0.14)] bg-[rgba(90,162,127,0.1)] px-3 py-1.5 text-sm font-medium text-[rgba(31,87,62,0.9)]">
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              Updating
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setZoomLevel((current) => Math.max(minZoom, current - 0.5))}
            disabled={zoomLevel <= minZoom}
            className={clsx(
              "inline-flex h-10 w-10 items-center justify-center rounded-full border border-[rgba(17,49,39,0.12)] bg-white text-[rgba(17,49,39,0.72)] transition",
              zoomLevel <= minZoom
                ? "cursor-not-allowed opacity-40"
                : "hover:border-[rgba(17,49,39,0.22)] hover:text-[rgba(17,49,39,0.92)]",
            )}
            aria-label="Zoom out"
          >
            <Minus className="h-4 w-4" />
          </button>

          <div className="rounded-full border border-[rgba(17,49,39,0.08)] bg-white/78 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[rgba(17,49,39,0.52)]">
            {Math.round(zoomLevel * 100)}%
          </div>

          <button
            type="button"
            onClick={() => setZoomLevel((current) => Math.min(maxZoom, current + 0.5))}
            disabled={zoomLevel >= maxZoom}
            className={clsx(
              "inline-flex h-10 w-10 items-center justify-center rounded-full border border-[rgba(17,49,39,0.12)] bg-white text-[rgba(17,49,39,0.72)] transition",
              zoomLevel >= maxZoom
                ? "cursor-not-allowed opacity-40"
                : "hover:border-[rgba(17,49,39,0.22)] hover:text-[rgba(17,49,39,0.92)]",
            )}
            aria-label="Zoom in"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mx-4 mb-4 rounded-[1.8rem] border border-[rgba(17,49,39,0.07)] bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.95),_rgba(242,247,244,0.92)_52%,_rgba(230,239,234,0.94))] p-4">
        <div
          className={clsx(
            "relative min-h-[28rem] min-w-0 items-start md:min-h-[34rem]",
            showOriginal ? "grid gap-3 lg:grid-cols-2" : "flex justify-center",
          )}
        >
          {showOriginal && originalImageSrc ? (
            <div
              ref={originalViewport.ref}
              className={clsx(
                "relative w-full min-w-0 overflow-hidden rounded-[1.3rem] border border-white/80 bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]",
                zoomLevel <= minZoom ? "cursor-default" : "cursor-move",
              )}
              style={viewportStyle}
              onPointerEnter={() => setHovering(true)}
              onPointerLeave={() => {
                setHovering(false);
                setPointerRatio(null);
              }}
              onPointerMove={(event) => updatePointerFromEvent(event, event.currentTarget)}
              onClick={() => {
                if (zoomLevel > minZoom) {
                  resetZoom();
                }
              }}
            >
              <div
                className="absolute transition-[left,top,width,height] duration-150 ease-out"
                style={originalContentStyle}
              >
                <OriginalSvgGraphic
                  preview={preview}
                  params={params}
                  originalImageSrc={originalImageSrc}
                  className="h-full w-full"
                />
              </div>
            </div>
          ) : null}

          <div
            ref={renderViewport.ref}
            className={viewportClassName}
            style={viewportStyle}
            onPointerEnter={() => setHovering(true)}
            onPointerLeave={() => {
              setHovering(false);
              setPointerRatio(null);
            }}
            onPointerMove={(event) => updatePointerFromEvent(event, event.currentTarget)}
            onClick={() => {
              if (zoomLevel > minZoom) {
                resetZoom();
              }
            }}
          >
            <div
              className="absolute transition-[left,top,width,height] duration-150 ease-out"
              style={renderContentStyle}
            >
              <PlotSvgGraphic
                preview={preview}
                lineColor={lineColor}
                backgroundColor={backgroundColor}
                className="h-full w-full"
              />
            </div>

            {!showOriginal &&
            zoomLevel <= minZoom &&
            hovering &&
            renderViewport.size.width &&
            renderViewport.size.height ? (
              <div
                className="pointer-events-none absolute overflow-hidden rounded-[2rem] border border-white/90 bg-white/88 shadow-[0_20px_65px_rgba(17,49,39,0.28)]"
                style={{
                  width: lensSize,
                  height: lensSize,
                  left: activeLensPointer.x - lensSize / 2,
                  top: activeLensPointer.y - lensSize / 2,
                }}
              >
                <div
                  className="absolute"
                  style={{
                    left: lensSize / 2 - activeLensPointer.x * lensZoom,
                    top: lensSize / 2 - activeLensPointer.y * lensZoom,
                    width: renderViewport.size.width * lensZoom,
                    height: renderViewport.size.height * lensZoom,
                  }}
                >
                  <PlotSvgGraphic
                    preview={preview}
                    lineColor={lineColor}
                    backgroundColor={backgroundColor}
                    className="h-full w-full"
                  />
                </div>
              </div>
            ) : null}
          </div>

          {isOutOfDate ? (
            <div className="absolute inset-0 z-20 flex items-center justify-center rounded-[1.6rem] bg-[rgba(35,43,40,0.46)] backdrop-blur-[2px]">
              <div className="flex flex-col items-center gap-3 px-4 text-center">
                <button
                  type="button"
                  onClick={onRevert}
                  disabled={isBusy}
                  className="inline-flex items-center justify-center rounded-full border border-white/30 bg-[rgba(255,255,255,0.14)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-white/88 transition hover:bg-[rgba(255,255,255,0.2)] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Revert changes
                </button>

                <button
                  type="button"
                  onClick={onRefresh}
                  disabled={isBusy}
                  className="inline-flex items-center justify-center gap-2 rounded-[1.35rem] bg-[rgba(17,49,39,0.96)] px-6 py-4 text-base font-semibold text-white shadow-[0_20px_50px_rgba(10,23,19,0.3)] transition hover:bg-[rgba(17,49,39,1)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isBusy ? (
                    <LoaderCircle className="h-5 w-5 animate-spin" />
                  ) : (
                    <RefreshCcw className="h-5 w-5" />
                  )}
                  Refresh preview
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
