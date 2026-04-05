export type PlotParameters = {
  processingHeight: number;
  pixelWidth: number;
  resolution: number;
  maxAmplitude: number;
  maxFrequency: number;
};

export type UploadRecord = {
  uploadId: string;
  fileName: string;
  dimensions: {
    width: number;
    height: number;
  };
};

export type PreviewResult = {
  paths: string[];
  viewBox: {
    width: number;
    height: number;
  };
  estimatedLineCount: number;
  pointsPerPath: number;
  previewFingerprint: string;
  fileName: string;
  image: {
    width: number;
    height: number;
  };
};

export type GenerateSvgResponse = {
  artifactId: string;
  purchaseId: string;
  mode: "existing" | "free" | "paid";
  fileName: string;
  estimatedLineCount: number;
  downloadUrl: string;
  emailDelivered: boolean;
  emailReason?: string;
};

export const DEFAULT_PARAMETERS: PlotParameters = {
  processingHeight: 125,
  pixelWidth: 6,
  resolution: 0.75,
  maxAmplitude: 2.7,
  maxFrequency: 9,
};

export const DEFAULT_PREVIEW_BACKGROUND = "#ffffff";
export const DEFAULT_PREVIEW_LINE = "#111111";
export const SESSION_STORAGE_KEY = "plotimg-editor-state-v7";
export const SESSION_ID_STORAGE_KEY = "plotimg-session-id";

export const STARTER_IMAGES = [
  {
    id: "sample-portrait",
    label: "Portrait",
    src: "/starter-images/sample-1.jpg",
  },
  {
    id: "sample-pair",
    label: "Pair",
    src: "/starter-images/sample-2.jpg",
  },
  {
    id: "sample-dog",
    label: "Dog",
    src: "/starter-images/sample-3.jpg",
  },
  {
    id: "sample-family",
    label: "Family",
    src: "/starter-images/sample-4.jpg",
  },
] as const;

export const PRICE_OPTIONS = {
  USD: {
    label: "$3.99 USD",
    helper: "Best for international buyers",
  },
  ILS: {
    label: "₪10 ILS",
    helper: "Fast local checkout",
  },
} as const;

export function estimateLineCount(
  params: PlotParameters,
  image?: { width: number; height: number } | null,
) {
  const sourceWidth = image?.width ?? params.processingHeight;
  const sourceHeight = image?.height ?? params.processingHeight;
  const resizedWidth = Math.max(
    1,
    Math.round((sourceWidth / Math.max(sourceHeight, 1)) * params.processingHeight),
  );
  const pointsPerPath = Math.max(
    1,
    Math.ceil((resizedWidth * params.pixelWidth) / Math.max(params.resolution, 0.1)),
  );
  return Math.round((params.processingHeight * pointsPerPath) / 60);
}

export function getComplexityWarning(lineCount: number) {
  if (lineCount > 4000) {
    return {
      tone: "high" as const,
      message: "High complexity: this file may take a long while to plot.",
    };
  }

  if (lineCount >= 2500) {
    return {
      tone: "medium" as const,
      message: "This preview may take a bit longer to plot.",
    };
  }

  return null;
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}
