import "dotenv/config";

import { mkdirSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { z } from "zod";

import type { CouponConfig } from "./types.js";

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8080),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  FRONTEND_ORIGIN: z.string().default("http://localhost:3000,http://localhost:3100"),
  FRONTEND_ORIGIN_REGEX: z.string().optional(),
  PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  PUBLIC_API_URL: z.string().url().default("http://localhost:8080"),
  STORAGE_DIR: z.string().default("./storage"),
  MAX_UPLOAD_MB: z.coerce.number().positive().default(15),
  MAX_PREVIEW_JOBS_PER_MINUTE: z.coerce.number().int().positive().default(24),
  POLAR_ACCESS_TOKEN: z.string().optional(),
  POLAR_SERVER: z.enum(["sandbox", "production"]).default("sandbox"),
  POLAR_PRODUCT_ID: z.string().optional(),
  POLAR_PRODUCT_ID_USD: z.string().optional(),
  POLAR_PRODUCT_ID_ILS: z.string().optional(),
  POLAR_WEBHOOK_SECRET: z.string().optional(),
  POLAR_ALLOW_DISCOUNT_CODES: z
    .string()
    .optional()
    .transform((value) => value !== "false"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_SECURE: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  EMAIL_FROM: z.string().default("Plotimg <hello@example.com>"),
  DOWNLOAD_TOKEN_SECRET: z.string().min(8).default("change-me"),
  COUPON_CODE_CONFIG_JSON: z
    .string()
    .default("{}"),
});

function parseCouponConfig(rawValue: string): Record<string, CouponConfig> {
  const parsed = JSON.parse(rawValue) as Record<string, CouponConfig>;
  return Object.fromEntries(
    Object.entries(parsed).map(([key, value]) => [key.trim().toUpperCase(), value]),
  );
}

function parseAllowedOrigins(rawValue: string) {
  return rawValue
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

const parsedEnv = envSchema.parse(process.env);
const storageDir = isAbsolute(parsedEnv.STORAGE_DIR)
  ? parsedEnv.STORAGE_DIR
  : join(process.cwd(), parsedEnv.STORAGE_DIR);

mkdirSync(storageDir, { recursive: true });
mkdirSync(join(storageDir, "uploads"), { recursive: true });
mkdirSync(join(storageDir, "artifacts"), { recursive: true });

export const config = {
  ...parsedEnv,
  allowedFrontendOrigins: parseAllowedOrigins(parsedEnv.FRONTEND_ORIGIN),
  frontendOriginRegex: parsedEnv.FRONTEND_ORIGIN_REGEX
    ? new RegExp(parsedEnv.FRONTEND_ORIGIN_REGEX)
    : null,
  storageDir,
  uploadsDir: join(storageDir, "uploads"),
  artifactsDir: join(storageDir, "artifacts"),
  couponCodes: parseCouponConfig(parsedEnv.COUPON_CODE_CONFIG_JSON),
};
