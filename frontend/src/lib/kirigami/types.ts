export type KirigamiLayerId =
  | "cut"
  | "mountain_fold"
  | "valley_fold"
  | "side_view_plot"
  | "top_view_plot";

export type OverlaySlot = "top" | "side";
export type FitMode = "contain" | "cover";
export type KirigamiCamera = "3d" | "top" | "side" | "flat";

export type Point2 = {
  x: number;
  y: number;
};

export type Point3 = {
  x: number;
  y: number;
  z: number;
};

export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ImportedOverlay = {
  id: string;
  fileName: string;
  markup: string;
  viewBox: {
    minX: number;
    minY: number;
    width: number;
    height: number;
  };
  elementCount: number;
  complexity: number;
  warnings: string[];
  hasText: boolean;
  hasTransforms: boolean;
};

export type OverlayPlacement = {
  visible: boolean;
  scale: number;
  offsetX: number;
  offsetY: number;
  rotation: 0 | 90 | 180 | 270;
  fitMode: FitMode;
};

export type OverlayState = {
  imported: ImportedOverlay | null;
  placement: OverlayPlacement;
};

export type PreviewSurface = {
  id: string;
  label: string;
  plane: "horizontal" | "vertical";
  overlaySlot: OverlaySlot | null;
  origin: Point3;
  size: {
    width: number;
    height: number;
  };
  flatBounds: Rect;
  fill: string;
  stroke: string;
  opacity?: number;
};

export type KirigamiTemplate = {
  id: string;
  name: string;
  description: string;
  thumbnail: string;
  difficulty: "Easy" | "Intermediate";
  complexityLabel: string;
  supportsTopOverlay: boolean;
  supportsSideOverlay: boolean;
  previewCaption: string;
  page: {
    width: number;
    height: number;
  };
  foldAxis: {
    orientation: "horizontal";
    value: number;
  };
  safeZones: {
    top: Rect | null;
    side: Rect | null;
  };
  constraints: {
    minCutGap: number;
    minFoldGap: number;
    minBridgeWidth: number;
    minIslandSupport: number;
    maxStrokeComplexity: number;
    maxOverlayDetailDensity: number;
  };
  surfaces: PreviewSurface[];
  layers: {
    cut: string[];
    mountain: string[];
    valley: string[];
  };
  notes?: string[];
};

export type LayerVisibility = Record<KirigamiLayerId, boolean>;

export type KirigamiWarning = {
  id: string;
  message: string;
  detail?: string;
  tone: "info" | "warning" | "danger";
};

export type KirigamiSnapshot = {
  templateId: string;
  camera: KirigamiCamera;
  topOverlay: {
    imported: ImportedOverlay | null;
    placement: OverlayPlacement;
  };
  sideOverlay: {
    imported: ImportedOverlay | null;
    placement: OverlayPlacement;
  };
  layerVisibility: LayerVisibility;
};
