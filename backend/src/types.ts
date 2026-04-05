export type PlotParameters = {
  processingHeight: number;
  pixelWidth: number;
  resolution: number;
  maxAmplitude: number;
  maxFrequency: number;
};

export type StoredUpload = {
  id: string;
  sessionId: string;
  fileName: string;
  mimeType: string;
  width: number;
  height: number;
  sourceHash: string;
  filePath: string;
  createdAt: string;
};

export type PreviewPayload = {
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

export type RenderArtifact = PreviewPayload & {
  svgMarkup: string;
};

export type PreviewJobRecord = {
  id: string;
  sessionId: string;
  uploadId: string;
  renderFingerprint: string;
  status: "queued" | "processing" | "completed" | "failed";
  errorMessage: string | null;
  resultJson: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ArtifactRecord = {
  id: string;
  sessionId: string;
  uploadId: string;
  renderFingerprint: string;
  sourceHash: string;
  paramsJson: string;
  fileName: string;
  svgPath: string;
  estimatedLineCount: number;
  width: number;
  height: number;
  createdAt: string;
};

export type PurchaseStatus = "pending" | "paid" | "free" | "emailed";

export type PurchaseRecord = {
  id: string;
  sessionId: string;
  artifactId: string;
  renderFingerprint: string;
  currency: "USD" | "ILS";
  couponCode: string | null;
  status: PurchaseStatus;
  checkoutId: string | null;
  checkoutUrl: string | null;
  email: string | null;
  fulfilledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CouponConfig = {
  kind: "free";
  label?: string;
};
