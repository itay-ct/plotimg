import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { join } from "node:path";

import { extension } from "mime-types";

import { config } from "../config.js";

export function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function getExtensionForMimeType(mimeType: string) {
  return extension(mimeType) || "bin";
}

export function buildSafeUploadFileName(uploadId: string, mimeType: string) {
  return `plotimg-upload-${uploadId.slice(0, 8)}.${getExtensionForMimeType(mimeType)}`;
}

export async function saveUploadFile(buffer: Buffer, mimeType: string): Promise<string> {
  const ext = getExtensionForMimeType(mimeType);
  const fileName = `${randomUUID()}.${ext}`;
  const filePath = join(config.uploadsDir, fileName);
  await fs.writeFile(filePath, buffer);
  return filePath;
}

export async function readUploadFile(filePath: string): Promise<Buffer> {
  return fs.readFile(filePath);
}

export async function saveArtifactSvg(svgMarkup: string): Promise<string> {
  const fileName = `${randomUUID()}.svg`;
  const filePath = join(config.artifactsDir, fileName);
  await fs.writeFile(filePath, svgMarkup, "utf8");
  return filePath;
}

export async function readArtifactSvg(filePath: string): Promise<string> {
  return fs.readFile(filePath, "utf8");
}
