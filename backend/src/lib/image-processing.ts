import { createHash } from "node:crypto";

import sharp from "sharp";
import { z } from "zod";

import type { PlotParameters, RenderArtifact } from "../types.js";

const plotParametersSchema = z.object({
  processingHeight: z.coerce.number().min(30).max(180),
  pixelWidth: z.coerce.number().min(2).max(18),
  resolution: z.coerce.number().min(0.1).max(4),
  maxAmplitude: z.coerce.number().min(0.5).max(12),
  maxFrequency: z.coerce.number().min(1).max(24),
});

export function normalizePlotParameters(input: unknown): PlotParameters {
  const parsed = plotParametersSchema.parse(input);
  return {
    processingHeight: Math.round(parsed.processingHeight),
    pixelWidth: Number(parsed.pixelWidth.toFixed(2)),
    resolution: Number(parsed.resolution.toFixed(2)),
    maxAmplitude: Number(parsed.maxAmplitude.toFixed(2)),
    maxFrequency: Number(parsed.maxFrequency.toFixed(2)),
  };
}

export function createRenderFingerprint(sourceHash: string, params: PlotParameters): string {
  return createHash("sha256")
    .update(JSON.stringify({ sourceHash, params }))
    .digest("hex");
}

export async function readImageMetadata(buffer: Buffer): Promise<{
  width: number;
  height: number;
}> {
  const metadata = await sharp(buffer, { limitInputPixels: false }).rotate().metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error("Could not read image dimensions.");
  }

  return {
    width: metadata.width,
    height: metadata.height,
  };
}

export function buildSafeArtifactFileName(previewFingerprint: string): string {
  return `plotimg-${previewFingerprint.slice(0, 12)}.svg`;
}

function getBrightness(
  pixels: Uint8Array,
  width: number,
  channels: number,
  x: number,
  y: number,
): number {
  const clampedX = Math.max(0, Math.min(width - 1, x));
  const index = (y * width + clampedX) * channels;

  if (channels === 1) {
    return pixels[index] ?? 255;
  }

  const red = pixels[index] ?? 255;
  const green = pixels[index + 1] ?? red;
  const blue = pixels[index + 2] ?? red;
  return Math.round((red + green + blue) / 3);
}

function buildSvgMarkup(paths: string[], width: number, height: number): string {
  const pathMarkup = paths
    .map((pathData) => `<path d="${pathData}" vector-effect="non-scaling-stroke" />`)
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width.toFixed(2)} ${height.toFixed(
    2,
  )}" width="${width.toFixed(2)}" height="${height.toFixed(
    2,
  )}" fill="none" stroke="#111111" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round">
  <g>
    ${pathMarkup}
  </g>
</svg>`;
}

export async function generateSinDrawerArtifact(
  sourceBuffer: Buffer,
  params: PlotParameters,
  previewFingerprint: string,
): Promise<RenderArtifact> {
  const resized = await sharp(sourceBuffer, { limitInputPixels: false })
    .rotate()
    .flatten({ background: "#ffffff" })
    .resize({
      height: params.processingHeight,
      fit: "inside",
      withoutEnlargement: true,
    })
    .grayscale()
    .normalise()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const width = resized.info.width;
  const height = resized.info.height;
  const channels = resized.info.channels;
  const pixels = resized.data;

  const pixelSpan = params.pixelWidth;
  const sampleStep = Math.max(0.1, params.resolution);
  const verticalSpacing = pixelSpan;
  const padding = Math.max(16, pixelSpan * 2.4);
  const viewWidth = padding * 2 + width * pixelSpan;
  const viewHeight = padding * 2 + height * verticalSpacing + params.maxAmplitude * 2;
  const paths: string[] = [];

  for (let y = 0; y < height; y += 1) {
    const baselineY = padding + y * verticalSpacing + verticalSpacing / 2;
    const points: string[] = [`M ${padding.toFixed(2)} ${baselineY.toFixed(2)}`];
    let currentX = padding;
    let currentAmplitude = 0;
    let currentFrequency = 1;
    let currentPhase = 0;

    for (let x = 0; x < width; x += 1) {
      const brightness = getBrightness(pixels, width, channels, x, y);
      const darkness = 1 - brightness / 255;
      const targetAmplitude = darkness * params.maxAmplitude;
      const targetFrequency = Math.max(0.08, darkness * params.maxFrequency);

      for (let offset = 0; offset < pixelSpan; offset += sampleStep) {
        const stepDistance = Math.min(sampleStep, pixelSpan - offset);
        const nextAmplitude = currentAmplitude + (targetAmplitude - currentAmplitude) * stepDistance;
        const nextFrequency = Math.max(
          0.08,
          currentFrequency + (targetFrequency - currentFrequency) * stepDistance,
        );
        currentPhase += nextFrequency * stepDistance;
        currentX += stepDistance;
        currentAmplitude = nextAmplitude;
        currentFrequency = nextFrequency;

        const currentY = baselineY + currentAmplitude * Math.sin(currentPhase);
        points.push(`L ${currentX.toFixed(2)} ${currentY.toFixed(2)}`);
      }
    }

    paths.push(points.join(" "));
  }

  const pointsPerPath = Math.max(1, Math.ceil((width * pixelSpan) / sampleStep));
  const estimatedLineCount = Math.round((height * pointsPerPath) / 60);
  const svgMarkup = buildSvgMarkup(paths, viewWidth, viewHeight);

  return {
    svgMarkup,
    paths,
    viewBox: {
      width: Number(viewWidth.toFixed(2)),
      height: Number(viewHeight.toFixed(2)),
    },
    estimatedLineCount,
    pointsPerPath,
    previewFingerprint,
    fileName: buildSafeArtifactFileName(previewFingerprint),
    image: {
      width,
      height,
    },
  };
}
