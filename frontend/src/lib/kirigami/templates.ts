import { linePath, rectPath, unionRects } from "./geometry";
import type { KirigamiTemplate, PreviewSurface, Rect } from "./types";

const PAGE = {
  width: 1200,
  height: 800,
};

const FOLD_Y = 400;

function overlaySurface(
  id: string,
  label: string,
  plane: "horizontal" | "vertical",
  origin: { x: number; y: number; z: number },
  size: { width: number; height: number },
  flatBounds: Rect,
  overlaySlot: "top" | "side",
  fill: string,
) {
  return {
    id,
    label,
    plane,
    overlaySlot,
    origin,
    size,
    flatBounds,
    fill,
    stroke: "rgba(17,49,39,0.22)",
  } satisfies PreviewSurface;
}

function fixedSurface(
  id: string,
  label: string,
  plane: "horizontal" | "vertical",
  origin: { x: number; y: number; z: number },
  size: { width: number; height: number },
  flatBounds: Rect,
  fill: string,
  opacity = 0.95,
) {
  return {
    id,
    label,
    plane,
    overlaySlot: null,
    origin,
    size,
    flatBounds,
    fill,
    stroke: "rgba(17,49,39,0.18)",
    opacity,
  } satisfies PreviewSurface;
}

function buildTemplateLayers(safeZones: { top: Rect | null; side: Rect | null }) {
  const cut: string[] = [
    linePath({ x: 0, y: FOLD_Y }, { x: 260, y: FOLD_Y }),
    linePath({ x: 940, y: FOLD_Y }, { x: PAGE.width, y: FOLD_Y }),
  ];

  const mountain = [linePath({ x: 0, y: FOLD_Y }, { x: PAGE.width, y: FOLD_Y })];
  const valley: string[] = [];

  if (safeZones.side) {
    cut.push(rectPath(safeZones.side));
    valley.push(linePath({ x: safeZones.side.x, y: safeZones.side.y + safeZones.side.height }, { x: safeZones.side.x + safeZones.side.width, y: safeZones.side.y + safeZones.side.height }));
  }

  if (safeZones.top) {
    cut.push(rectPath(safeZones.top));
    valley.push(linePath({ x: safeZones.top.x, y: safeZones.top.y }, { x: safeZones.top.x + safeZones.top.width, y: safeZones.top.y }));
  }

  return {
    cut,
    mountain,
    valley,
  };
}

const basicStepSide = { x: 340, y: 200, width: 520, height: 140 } satisfies Rect;
const doubleTop = { x: 300, y: 450, width: 560, height: 170 } satisfies Rect;
const doubleSide = { x: 280, y: 190, width: 600, height: 160 } satisfies Rect;
const boxTop = { x: 330, y: 455, width: 540, height: 190 } satisfies Rect;
const boxSide = { x: 330, y: 165, width: 540, height: 185 } satisfies Rect;
const archSide = { x: 300, y: 200, width: 600, height: 180 } satisfies Rect;
const sampleTop = { x: 300, y: 460, width: 540, height: 160 } satisfies Rect;
const sampleSide = { x: 280, y: 170, width: 580, height: 190 } satisfies Rect;

export const KIRIGAMI_TEMPLATES: KirigamiTemplate[] = [
  {
    id: "basic_step_90",
    name: "Basic step 90",
    description: "One raised platform with a single front-facing silhouette panel.",
    thumbnail: "/starter-images/sample-1.jpg",
    difficulty: "Easy",
    complexityLabel: "Starter",
    supportsTopOverlay: false,
    supportsSideOverlay: true,
    previewCaption: "Single-step 90° pop-up",
    page: PAGE,
    foldAxis: {
      orientation: "horizontal",
      value: FOLD_Y,
    },
    safeZones: {
      top: null,
      side: basicStepSide,
    },
    constraints: {
      minCutGap: 14,
      minFoldGap: 18,
      minBridgeWidth: 30,
      minIslandSupport: 28,
      maxStrokeComplexity: 120,
      maxOverlayDetailDensity: 0.9,
    },
    surfaces: [
      fixedSurface(
        "basic-top",
        "Top step",
        "horizontal",
        { x: 340, y: 140, z: 0 },
        { width: 520, height: 190 },
        { x: 340, y: 400, width: 520, height: 190 },
        "#ecf4ee",
      ),
      overlaySurface(
        "basic-side",
        "Front face",
        "vertical",
        { x: 340, y: 0, z: 0 },
        { width: 520, height: 140 },
        basicStepSide,
        "side",
        "#f5ebe1",
      ),
    ],
    layers: buildTemplateLayers({
      top: null,
      side: basicStepSide,
    }),
    notes: ["Best for a single side-view silhouette and quick test builds."],
  },
  {
    id: "double_step_90",
    name: "Double step 90",
    description: "Two terraces with a top deck and vertical face for matched overlays.",
    thumbnail: "/starter-images/sample-2.jpg",
    difficulty: "Intermediate",
    complexityLabel: "Layered",
    supportsTopOverlay: true,
    supportsSideOverlay: true,
    previewCaption: "Two stepped planes",
    page: PAGE,
    foldAxis: {
      orientation: "horizontal",
      value: FOLD_Y,
    },
    safeZones: {
      top: doubleTop,
      side: doubleSide,
    },
    constraints: {
      minCutGap: 16,
      minFoldGap: 20,
      minBridgeWidth: 32,
      minIslandSupport: 28,
      maxStrokeComplexity: 180,
      maxOverlayDetailDensity: 1.1,
    },
    surfaces: [
      overlaySurface(
        "double-top-main",
        "Top deck",
        "horizontal",
        { x: 300, y: 170, z: 0 },
        { width: 560, height: 170 },
        doubleTop,
        "top",
        "#eef4ea",
      ),
      overlaySurface(
        "double-side-main",
        "Front riser",
        "vertical",
        { x: 280, y: 0, z: 0 },
        { width: 600, height: 160 },
        doubleSide,
        "side",
        "#f4e7da",
      ),
      fixedSurface(
        "double-top-back",
        "Rear terrace",
        "horizontal",
        { x: 410, y: 110, z: 190 },
        { width: 340, height: 110 },
        { x: 430, y: 400, width: 320, height: 120 },
        "#ddebdc",
        0.85,
      ),
    ],
    layers: buildTemplateLayers({
      top: doubleTop,
      side: doubleSide,
    }),
    notes: ["Top and side overlays stay independent and never alter the mechanism itself."],
  },
  {
    id: "box_block_90",
    name: "Box block 90",
    description: "A box-like pop-up with a stronger top footprint and a tall front face.",
    thumbnail: "/starter-images/sample-3.jpg",
    difficulty: "Intermediate",
    complexityLabel: "Solid",
    supportsTopOverlay: true,
    supportsSideOverlay: true,
    previewCaption: "Box / block pop-up",
    page: PAGE,
    foldAxis: {
      orientation: "horizontal",
      value: FOLD_Y,
    },
    safeZones: {
      top: boxTop,
      side: boxSide,
    },
    constraints: {
      minCutGap: 18,
      minFoldGap: 22,
      minBridgeWidth: 34,
      minIslandSupport: 30,
      maxStrokeComplexity: 200,
      maxOverlayDetailDensity: 1.15,
    },
    surfaces: [
      overlaySurface(
        "box-top",
        "Block roof",
        "horizontal",
        { x: 330, y: 185, z: 0 },
        { width: 540, height: 190 },
        boxTop,
        "top",
        "#edf5ef",
      ),
      overlaySurface(
        "box-side",
        "Block face",
        "vertical",
        { x: 330, y: 0, z: 0 },
        { width: 540, height: 185 },
        boxSide,
        "side",
        "#efe3d6",
      ),
      fixedSurface(
        "box-side-wall-left",
        "Left return",
        "vertical",
        { x: 330, y: 0, z: 0 },
        { width: 40, height: 185 },
        { x: 330, y: 165, width: 40, height: 185 },
        "#dcebe6",
        0.78,
      ),
      fixedSurface(
        "box-side-wall-right",
        "Right return",
        "vertical",
        { x: 830, y: 0, z: 0 },
        { width: 40, height: 185 },
        { x: 830, y: 165, width: 40, height: 185 },
        "#dcebe6",
        0.78,
      ),
    ],
    layers: buildTemplateLayers({
      top: boxTop,
      side: boxSide,
    }),
    notes: ["Useful for boxy silhouettes and broader top artwork."],
  },
  {
    id: "arch_bridge_90",
    name: "Arch bridge 90",
    description: "A bridge-like silhouette with side-driven storytelling and a narrow top span.",
    thumbnail: "/starter-images/sample-4.jpg",
    difficulty: "Intermediate",
    complexityLabel: "Bridge",
    supportsTopOverlay: false,
    supportsSideOverlay: true,
    previewCaption: "Bridge / arch silhouette",
    page: PAGE,
    foldAxis: {
      orientation: "horizontal",
      value: FOLD_Y,
    },
    safeZones: {
      top: null,
      side: archSide,
    },
    constraints: {
      minCutGap: 14,
      minFoldGap: 20,
      minBridgeWidth: 26,
      minIslandSupport: 24,
      maxStrokeComplexity: 140,
      maxOverlayDetailDensity: 0.8,
    },
    surfaces: [
      overlaySurface(
        "arch-side",
        "Bridge face",
        "vertical",
        { x: 300, y: 0, z: 0 },
        { width: 600, height: 180 },
        archSide,
        "side",
        "#f6eadc",
      ),
      fixedSurface(
        "arch-top",
        "Bridge deck",
        "horizontal",
        { x: 360, y: 180, z: 35 },
        { width: 480, height: 80 },
        { x: 360, y: 400, width: 480, height: 80 },
        "#e4efe5",
      ),
    ],
    layers: {
      ...buildTemplateLayers({
        top: null,
        side: archSide,
      }),
      cut: [
        ...buildTemplateLayers({
          top: null,
          side: archSide,
        }).cut,
        `M 360 ${FOLD_Y + 40} Q 600 ${FOLD_Y - 110} 840 ${FOLD_Y + 40}`,
      ],
    },
    notes: ["This template has narrow bridges; consider simplifying the overlay."],
  },
  {
    id: "sample_reference_01",
    name: "Reference sample 01",
    description: "A starter inspired by the attached reference art, paired with manual geometry.",
    thumbnail: "/kirigami/sample-reference-01.svg",
    difficulty: "Intermediate",
    complexityLabel: "Reference",
    supportsTopOverlay: true,
    supportsSideOverlay: true,
    previewCaption: "Sample-inspired 90° form",
    page: PAGE,
    foldAxis: {
      orientation: "horizontal",
      value: FOLD_Y,
    },
    safeZones: {
      top: sampleTop,
      side: sampleSide,
    },
    constraints: {
      minCutGap: 18,
      minFoldGap: 22,
      minBridgeWidth: 34,
      minIslandSupport: 30,
      maxStrokeComplexity: 190,
      maxOverlayDetailDensity: 1.05,
    },
    surfaces: [
      overlaySurface(
        "sample-top",
        "Reference top",
        "horizontal",
        { x: 300, y: 170, z: 30 },
        { width: 540, height: 160 },
        sampleTop,
        "top",
        "#edf3e9",
      ),
      overlaySurface(
        "sample-side",
        "Reference side",
        "vertical",
        { x: 280, y: 0, z: 0 },
        { width: 580, height: 190 },
        sampleSide,
        "side",
        "#f1e5db",
      ),
      fixedSurface(
        "sample-back-plate",
        "Backdrop",
        "vertical",
        { x: 220, y: 0, z: 200 },
        { width: 700, height: 260 },
        { x: 220, y: 90, width: 700, height: 260 },
        "#ddebe2",
        0.72,
      ),
    ],
    layers: buildTemplateLayers({
      top: sampleTop,
      side: sampleSide,
    }),
    notes: [
      "Sample template preview is based on a raster-backed SVG reference.",
      "The attached reference asset is used only for display, never for fold or cut extraction.",
    ],
  },
];

export const KIRIGAMI_TEMPLATE_MAP = Object.fromEntries(
  KIRIGAMI_TEMPLATES.map((template) => [template.id, template]),
) satisfies Record<string, KirigamiTemplate>;

export function findTemplateSafeZone(
  template: KirigamiTemplate,
  slot: "top" | "side",
) {
  return template.safeZones[slot];
}

export function templateSupportSummary(template: KirigamiTemplate) {
  const summary: string[] = [];

  if (template.supportsTopOverlay) {
    summary.push("Top overlay");
  }

  if (template.supportsSideOverlay) {
    summary.push("Side overlay");
  }

  return summary.length ? summary.join(" · ") : "Structure only";
}

export function structuralRegionBounds(template: KirigamiTemplate) {
  return unionRects(
    template.surfaces.map((surface) => surface.flatBounds),
  );
}
