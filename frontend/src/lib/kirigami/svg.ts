import type {
  ImportedOverlay,
  OverlayPlacement,
  Rect,
} from "./types";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const ALLOWED_TAGS = new Set([
  "g",
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "text",
  "tspan",
]);
const BLOCKED_TAGS = new Set(["script", "foreignObject", "iframe", "object"]);

function parseLength(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sanitizeAttributes(element: Element) {
  for (const attribute of [...element.attributes]) {
    const name = attribute.name;
    if (name.startsWith("on")) {
      element.removeAttribute(name);
      continue;
    }

    if (name === "href" || name === "xlink:href") {
      element.removeAttribute(name);
      continue;
    }
  }
}

function sanitizeElementTree(element: Element) {
  const tag = element.tagName;
  if (tag === "image") {
    throw new Error("Imported SVG contains raster content. Please vectorize it first.");
  }

  if (BLOCKED_TAGS.has(tag)) {
    element.remove();
    return;
  }

  if (!ALLOWED_TAGS.has(tag)) {
    if (tag !== "svg") {
      element.remove();
      return;
    }
  }

  sanitizeAttributes(element);

  for (const child of [...element.children]) {
    sanitizeElementTree(child);
  }
}

function svgInnerMarkup(svg: SVGSVGElement) {
  const serializer = new XMLSerializer();
  return [...svg.childNodes]
    .map((node) => serializer.serializeToString(node))
    .join("");
}

function getSvgViewBox(svg: SVGSVGElement) {
  const rawViewBox = svg.getAttribute("viewBox");
  if (rawViewBox) {
    const values = rawViewBox
      .split(/[,\s]+/)
      .map((value) => Number.parseFloat(value))
      .filter((value) => Number.isFinite(value));

    if (values.length === 4) {
      return {
        minX: values[0],
        minY: values[1],
        width: values[2],
        height: values[3],
      };
    }
  }

  const width = parseLength(svg.getAttribute("width")) ?? 512;
  const height = parseLength(svg.getAttribute("height")) ?? 512;

  return {
    minX: 0,
    minY: 0,
    width,
    height,
  };
}

export async function importOverlaySvg(file: File) {
  const raw = await file.text();
  const parser = new DOMParser();
  const parsed = parser.parseFromString(raw, "image/svg+xml");
  const root = parsed.documentElement;

  if (root.tagName !== "svg") {
    throw new Error("The uploaded file is not a valid SVG.");
  }

  const hasParserError = parsed.getElementsByTagName("parsererror").length > 0;
  if (hasParserError) {
    throw new Error("The SVG could not be read.");
  }

  const hasText = root.querySelector("text, tspan") !== null;
  const hasTransforms = root.querySelector("[transform]") !== null;

  sanitizeElementTree(root);

  const svgRoot = root as unknown as SVGSVGElement;
  const viewBox = getSvgViewBox(svgRoot);
  const markup = svgInnerMarkup(svgRoot);
  if (!markup.trim()) {
    throw new Error("The SVG does not contain visible vector content.");
  }

  const elementCount = root.querySelectorAll(
    "path, rect, circle, ellipse, line, polyline, polygon, text, tspan",
  ).length;

  const warnings: string[] = [];

  if (hasTransforms) {
    warnings.push("Some paths were imported with transform data.");
  }

  if (hasText) {
    warnings.push("Text elements were preserved. Convert them to outlines for the most reliable fabrication output.");
  }

  return {
    id: `${file.name}-${crypto.randomUUID()}`,
    fileName: file.name,
    markup,
    viewBox,
    elementCount,
    complexity: elementCount,
    warnings,
    hasText,
    hasTransforms,
  } satisfies ImportedOverlay;
}

export function createDefaultPlacement(): OverlayPlacement {
  return {
    visible: true,
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    rotation: 0,
    fitMode: "contain",
  };
}

export function overlayTransformMetrics(
  overlay: ImportedOverlay,
  placement: OverlayPlacement,
  target: Rect,
) {
  const rotation = placement.rotation % 180 === 0 ? placement.rotation : 90;
  const rotatedWidth = rotation === 90 ? overlay.viewBox.height : overlay.viewBox.width;
  const rotatedHeight = rotation === 90 ? overlay.viewBox.width : overlay.viewBox.height;

  const baseScale =
    placement.fitMode === "cover"
      ? Math.max(target.width / rotatedWidth, target.height / rotatedHeight)
      : Math.min(target.width / rotatedWidth, target.height / rotatedHeight);

  const scale = baseScale * placement.scale;
  const contentWidth = rotatedWidth * scale;
  const contentHeight = rotatedHeight * scale;
  const offsetRangeX = target.width * 0.32;
  const offsetRangeY = target.height * 0.32;
  const x = (target.width - contentWidth) / 2 + (placement.offsetX / 100) * offsetRangeX;
  const y = (target.height - contentHeight) / 2 + (placement.offsetY / 100) * offsetRangeY;
  const clipped =
    x < 0 ||
    y < 0 ||
    x + contentWidth > target.width ||
    y + contentHeight > target.height;

  const smallestFeature =
    Math.min(target.width, target.height) / Math.max(overlay.complexity, 1) / Math.max(scale, 0.001);

  return {
    rotation,
    scale,
    x,
    y,
    clipped,
    smallestFeature,
  };
}

export function nestedOverlaySvgMarkup(
  overlay: ImportedOverlay,
  placement: OverlayPlacement,
  target: Rect,
) {
  const metrics = overlayTransformMetrics(overlay, placement, target);
  const cx = target.width / 2;
  const cy = target.height / 2;

  return {
    clipped: metrics.clipped,
    smallestFeature: metrics.smallestFeature,
    svg: `<svg x="${target.x}" y="${target.y}" width="${target.width}" height="${target.height}" viewBox="0 0 ${target.width} ${target.height}" overflow="hidden"><g transform="translate(${cx} ${cy}) rotate(${metrics.rotation}) translate(${-cx} ${-cy}) translate(${metrics.x} ${metrics.y}) scale(${metrics.scale}) translate(${-overlay.viewBox.minX} ${-overlay.viewBox.minY})">${overlay.markup}</g></svg>`,
  };
}

export function overlayViewportProps(
  overlay: ImportedOverlay,
  placement: OverlayPlacement,
  target: Rect,
) {
  const metrics = overlayTransformMetrics(overlay, placement, target);
  const cx = target.width / 2;
  const cy = target.height / 2;

  return {
    clipped: metrics.clipped,
    smallestFeature: metrics.smallestFeature,
    viewBox: `0 0 ${target.width} ${target.height}`,
    transform: `translate(${cx} ${cy}) rotate(${metrics.rotation}) translate(${-cx} ${-cy}) translate(${metrics.x} ${metrics.y}) scale(${metrics.scale}) translate(${-overlay.viewBox.minX} ${-overlay.viewBox.minY})`,
  };
}

export function serializeLayeredSvg(input: {
  width: number;
  height: number;
  cut: string[];
  mountain: string[];
  valley: string[];
  topOverlayMarkup: string | null;
  sideOverlayMarkup: string | null;
}) {
  const renderPaths = (paths: string[], attrs: string) =>
    paths.map((path, index) => `<path d="${path}" ${attrs} data-path-index="${index}" />`).join("");

  return [
    `<svg xmlns="${SVG_NAMESPACE}" viewBox="0 0 ${input.width} ${input.height}" width="${input.width}" height="${input.height}">`,
    `<g id="cut">${renderPaths(input.cut, 'fill="none" stroke="#111111" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"')}</g>`,
    `<g id="mountain_fold">${renderPaths(input.mountain, 'fill="none" stroke="#111111" stroke-width="1.5" stroke-dasharray="14 8" stroke-linecap="round"')}</g>`,
    `<g id="valley_fold">${renderPaths(input.valley, 'fill="none" stroke="#111111" stroke-width="1.5" stroke-dasharray="4 8" stroke-linecap="round"')}</g>`,
    `<g id="side_view_plot">${input.sideOverlayMarkup ?? ""}</g>`,
    `<g id="top_view_plot">${input.topOverlayMarkup ?? ""}</g>`,
    "</svg>",
  ].join("");
}
