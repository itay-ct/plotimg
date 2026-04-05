import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { basename } from "node:path";

import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import rawBody from "fastify-raw-body";
import { z } from "zod";

import { config } from "./config.js";
import { database } from "./lib/db.js";
import { sendDownloadEmail } from "./lib/email.js";
import {
  createRenderFingerprint,
  generateSinDrawerArtifact,
  normalizePlotParameters,
  readImageMetadata,
} from "./lib/image-processing.js";
import { isPreviewJobActive, queuePreviewJob } from "./lib/jobs.js";
import { createCheckoutSession, getCheckoutSession, verifyWebhook } from "./lib/polar.js";
import { readUploadFile, saveArtifactSvg, saveUploadFile, sha256 } from "./lib/storage.js";
import { signToken, verifyToken } from "./lib/tokens.js";
import type { PlotParameters, PreviewPayload, PurchaseRecord, StoredUpload } from "./types.js";

const server = Fastify({
  logger: {
    level: config.NODE_ENV === "production" ? "info" : "debug",
  },
});

await server.register(helmet, {
  global: true,
  crossOriginResourcePolicy: false,
});

await server.register(cors, {
  origin(origin, callback) {
    if (!origin) {
      callback(null, true);
      return;
    }

    const exactMatch = config.allowedFrontendOrigins.includes(origin);
    const regexMatch = config.frontendOriginRegex?.test(origin) ?? false;

    if (exactMatch || regexMatch) {
      callback(null, true);
      return;
    }

    callback(new Error("Origin not allowed by CORS"), false);
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "x-plotimg-session"],
});

await server.register(rateLimit, {
  max: 120,
  timeWindow: "1 minute",
});

await server.register(rawBody, {
  field: "rawBody",
  global: false,
  encoding: "utf8",
  runFirst: true,
});

await server.register(multipart, {
  attachFieldsToBody: false,
  limits: {
    files: 1,
    fileSize: config.MAX_UPLOAD_MB * 1024 * 1024,
  },
});

const uploadBodySchema = z.object({
  uploadId: z.string().min(8),
  params: z.unknown(),
});

const checkoutBodySchema = z.object({
  uploadId: z.string().min(8),
  params: z.unknown(),
  currency: z.enum(["USD", "ILS"]).default("USD"),
});

const generateBodySchema = z.object({
  uploadId: z.string().min(8),
  params: z.unknown(),
  couponCode: z.string().trim().max(64).optional(),
  email: z.string().trim().email().optional(),
  purchaseId: z.string().trim().optional(),
  checkoutId: z.string().trim().optional(),
  currency: z.enum(["USD", "ILS"]).default("USD"),
});

type DownloadTokenPayload = {
  artifactId: string;
  purchaseId: string;
  expiresAt: number;
};

function getSessionId(request: { headers: Record<string, unknown> }) {
  const headerValue = request.headers["x-plotimg-session"];

  if (typeof headerValue !== "string" || headerValue.trim().length < 12) {
    throw new Error("Missing or invalid x-plotimg-session header.");
  }

  return headerValue.trim();
}

function getUploadForSession(uploadId: string, sessionId: string): StoredUpload {
  const upload = database.getUpload(uploadId);

  if (!upload || upload.sessionId !== sessionId) {
    throw new Error("Upload not found for this session.");
  }

  return upload;
}

function buildDownloadUrl(artifactId: string, purchaseId: string) {
  const token = signToken(
    {
      artifactId,
      purchaseId,
      expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 7,
    },
    config.DOWNLOAD_TOKEN_SECRET,
  );

  return `${config.PUBLIC_API_URL}/download?token=${encodeURIComponent(token)}`;
}

function serializePreview(payload: PreviewPayload) {
  return JSON.stringify(payload);
}

async function ensureArtifact(params: {
  sessionId: string;
  uploadId: string;
  plotParameters: PlotParameters;
}) {
  const upload = getUploadForSession(params.uploadId, params.sessionId);
  const renderFingerprint = createRenderFingerprint(upload.sourceHash, params.plotParameters);
  const existingArtifact = database.findArtifactBySession(params.sessionId, renderFingerprint);

  if (existingArtifact) {
    return {
      artifact: existingArtifact,
      renderFingerprint,
      upload,
    };
  }

  const buffer = await readUploadFile(upload.filePath);
  const renderArtifact = await generateSinDrawerArtifact(
    buffer,
    upload.fileName,
    params.plotParameters,
    renderFingerprint,
  );

  const svgPath = await saveArtifactSvg(renderArtifact.svgMarkup);
  const artifactRecord = {
    id: randomUUID(),
    sessionId: params.sessionId,
    uploadId: params.uploadId,
    renderFingerprint,
    sourceHash: upload.sourceHash,
    paramsJson: JSON.stringify(params.plotParameters),
    fileName: renderArtifact.fileName,
    svgPath,
    estimatedLineCount: renderArtifact.estimatedLineCount,
    width: renderArtifact.viewBox.width,
    height: renderArtifact.viewBox.height,
    createdAt: new Date().toISOString(),
  };

  database.insertArtifact(artifactRecord);

  return {
    artifact: artifactRecord,
    renderFingerprint,
    upload,
  };
}

async function authorizePurchase(input: {
  sessionId: string;
  uploadId: string;
  plotParameters: PlotParameters;
  couponCode?: string;
  purchaseId?: string;
  checkoutId?: string;
  currency: "USD" | "ILS";
}) {
  const { artifact, renderFingerprint } = await ensureArtifact({
    sessionId: input.sessionId,
    uploadId: input.uploadId,
    plotParameters: input.plotParameters,
  });

  const existingPurchase = database.findFulfilledPurchase(input.sessionId, renderFingerprint);
  if (existingPurchase) {
    return { artifact, purchase: existingPurchase, mode: "existing" as const };
  }

  const normalizedCoupon = input.couponCode?.trim().toUpperCase();
  const freeCoupon = normalizedCoupon ? config.couponCodes[normalizedCoupon] : undefined;

  if (freeCoupon?.kind === "free") {
    const purchase: PurchaseRecord = {
      id: randomUUID(),
      sessionId: input.sessionId,
      artifactId: artifact.id,
      renderFingerprint,
      currency: input.currency,
      couponCode: normalizedCoupon ?? null,
      status: "free",
      checkoutId: null,
      checkoutUrl: null,
      email: null,
      fulfilledAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    database.insertPurchase(purchase);
    return { artifact, purchase, mode: "free" as const };
  }

  if (input.purchaseId && input.checkoutId) {
    const purchase = database.getPurchase(input.purchaseId);
    if (!purchase || purchase.sessionId !== input.sessionId || purchase.artifactId !== artifact.id) {
      throw new Error("Purchase does not match this session.");
    }

    const checkout = await getCheckoutSession(input.checkoutId);
    if (checkout.status !== "succeeded") {
      throw new Error("Payment has not been confirmed yet.");
    }

    database.updatePurchase(purchase.id, {
      status: "paid",
      checkoutId: checkout.id,
      checkoutUrl: checkout.url,
      fulfilledAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const paidPurchase = database.getPurchase(purchase.id);
    if (!paidPurchase) {
      throw new Error("Purchase was not found after confirmation.");
    }

    return { artifact, purchase: paidPurchase, mode: "paid" as const };
  }

  throw new Error("This artwork is not unlocked yet.");
}

server.get("/health", async () => ({
  ok: true,
  environment: config.NODE_ENV,
}));

server.post(
  "/upload",
  {
    config: {
      rateLimit: {
        max: 20,
        timeWindow: "1 minute",
      },
    },
  },
  async (request, reply) => {
    const sessionId = getSessionId(request);
    const file = await request.file();

    if (!file) {
      return reply.code(400).send({ error: "No file was uploaded." });
    }

    const allowedMimeTypes = new Set([
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/svg+xml",
    ]);

    if (!allowedMimeTypes.has(file.mimetype)) {
      return reply.code(415).send({ error: "Unsupported image type." });
    }

    const buffer = await file.toBuffer();
    const metadata = await readImageMetadata(buffer);
    const uploadId = randomUUID();
    const filePath = await saveUploadFile(buffer, file.mimetype);

    database.insertUpload({
      id: uploadId,
      sessionId,
      fileName: file.filename || "upload-image",
      mimeType: file.mimetype,
      width: metadata.width,
      height: metadata.height,
      sourceHash: sha256(buffer),
      filePath,
      createdAt: new Date().toISOString(),
    });

    request.log.info(
      { uploadId, sessionId, fileName: file.filename, width: metadata.width, height: metadata.height },
      "Upload stored",
    );

    return reply.send({
      uploadId,
      fileName: file.filename || basename(filePath),
      dimensions: metadata,
    });
  },
);

server.post(
  "/preview",
  {
    config: {
      rateLimit: {
        max: config.MAX_PREVIEW_JOBS_PER_MINUTE,
        timeWindow: "1 minute",
      },
    },
  },
  async (request, reply) => {
    const sessionId = getSessionId(request);
    const parsedBody = uploadBodySchema.parse(request.body);
    const plotParameters = normalizePlotParameters(parsedBody.params);
    const upload = getUploadForSession(parsedBody.uploadId, sessionId);
    const renderFingerprint = createRenderFingerprint(upload.sourceHash, plotParameters);
    const cached = database.findCompletedPreviewJob(parsedBody.uploadId, sessionId, renderFingerprint);

    if (cached) {
      return reply.send({
        jobId: cached.id,
        status: "completed",
      });
    }

    const jobId = randomUUID();
    database.insertPreviewJob({
      id: jobId,
      sessionId,
      uploadId: parsedBody.uploadId,
      renderFingerprint,
      status: "queued",
      errorMessage: null,
      resultJson: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    queuePreviewJob(
      jobId,
      async () => {
        try {
          database.updatePreviewJob(jobId, {
            status: "processing",
            errorMessage: null,
            resultJson: null,
            updatedAt: new Date().toISOString(),
          });

        const sourceBuffer = await readUploadFile(upload.filePath);
        const preview = await generateSinDrawerArtifact(
          sourceBuffer,
          upload.fileName,
          plotParameters,
          renderFingerprint,
        );

        const payload: PreviewPayload = {
          paths: preview.paths,
          viewBox: preview.viewBox,
          estimatedLineCount: preview.estimatedLineCount,
          pointsPerPath: preview.pointsPerPath,
          previewFingerprint: preview.previewFingerprint,
          fileName: preview.fileName,
          image: preview.image,
        };

        database.updatePreviewJob(jobId, {
          status: "completed",
          errorMessage: null,
          resultJson: serializePreview(payload),
          updatedAt: new Date().toISOString(),
        });
        } catch (error) {
          try {
            database.updatePreviewJob(jobId, {
              status: "failed",
              errorMessage: error instanceof Error ? error.message : "Unknown preview failure",
              resultJson: null,
              updatedAt: new Date().toISOString(),
            });
          } catch (updateError) {
            request.log.error(
              { jobId, updateError },
              "Failed to persist preview job failure state",
            );
          }

          request.log.error({ jobId, error }, "Preview job failed");
        }
      },
      (error) => {
        request.log.error({ jobId, error }, "Preview worker crashed");
      },
    );

    request.log.info({ jobId, sessionId, uploadId: parsedBody.uploadId }, "Preview job queued");

    return reply.send({
      jobId,
      status: "queued",
    });
  },
);

server.get("/status/:jobId", async (request, reply) => {
  const sessionId = getSessionId(request);
  const params = z.object({ jobId: z.string().min(8) }).parse(request.params);
  const job = database.getPreviewJob(params.jobId);

  if (!job || job.sessionId !== sessionId) {
    return reply.code(404).send({ error: "Preview job not found." });
  }

  return reply.send({
    jobId: job.id,
    status: job.status,
    active: isPreviewJobActive(job.id),
    errorMessage: job.errorMessage,
    result: job.resultJson ? (JSON.parse(job.resultJson) as PreviewPayload) : null,
  });
});

server.post("/validate-coupon", async (request, reply) => {
  const sessionId = getSessionId(request);
  const body = z
    .object({
      code: z.string().trim().min(1).max(64),
    })
    .parse(request.body);

  const normalizedCode = body.code.toUpperCase();
  const coupon = config.couponCodes[normalizedCode];

  request.log.info({ sessionId, couponCode: normalizedCode }, "Coupon validated");

  if (!coupon) {
    return reply.send({
      valid: false,
      free: false,
      message: "That code is not available.",
      allowCheckoutDiscountCodes: config.POLAR_ALLOW_DISCOUNT_CODES,
    });
  }

  return reply.send({
    valid: true,
    free: coupon.kind === "free",
    code: normalizedCode,
    message: coupon.label ?? "Coupon applied.",
    allowCheckoutDiscountCodes: config.POLAR_ALLOW_DISCOUNT_CODES,
  });
});

server.post("/checkout", async (request, reply) => {
  const sessionId = getSessionId(request);
  const body = checkoutBodySchema.parse(request.body);
  const plotParameters = normalizePlotParameters(body.params);
  const { artifact, renderFingerprint } = await ensureArtifact({
    sessionId,
    uploadId: body.uploadId,
    plotParameters,
  });

  const existingPurchase = database.findFulfilledPurchase(sessionId, renderFingerprint);
  if (existingPurchase) {
    return reply.send({
      mode: "existing",
      artifactId: artifact.id,
      purchaseId: existingPurchase.id,
      downloadReady: true,
    });
  }

  const purchaseId = randomUUID();
  const createdAt = new Date().toISOString();
  database.insertPurchase({
    id: purchaseId,
    sessionId,
    artifactId: artifact.id,
    renderFingerprint,
    currency: body.currency,
    couponCode: null,
    status: "pending",
    checkoutId: null,
    checkoutUrl: null,
    email: null,
    fulfilledAt: null,
    createdAt,
    updatedAt: createdAt,
  });

  const checkout = await createCheckoutSession({
    artifactId: artifact.id,
    purchaseId,
    renderFingerprint,
    sessionId,
    currency: body.currency,
  });

  database.updatePurchase(purchaseId, {
    checkoutId: checkout.checkoutId,
    checkoutUrl: checkout.checkoutUrl,
    updatedAt: new Date().toISOString(),
  });

  request.log.info({ purchaseId, artifactId: artifact.id, sessionId }, "Checkout created");

  return reply.send({
    mode: "payment",
    artifactId: artifact.id,
    purchaseId,
    checkoutId: checkout.checkoutId,
    checkoutUrl: checkout.checkoutUrl,
  });
});

server.post("/generate-svg", async (request, reply) => {
  const sessionId = getSessionId(request);
  const body = generateBodySchema.parse(request.body);
  const plotParameters = normalizePlotParameters(body.params);

  try {
    const { artifact, purchase, mode } = await authorizePurchase({
      sessionId,
      uploadId: body.uploadId,
      plotParameters,
      couponCode: body.couponCode,
      purchaseId: body.purchaseId,
      checkoutId: body.checkoutId,
      currency: body.currency,
    });

    const downloadUrl = buildDownloadUrl(artifact.id, purchase.id);
    let emailDelivered = false;
    let emailReason: string | undefined;

    if (body.email) {
      const delivery = await sendDownloadEmail({
        email: body.email,
        downloadUrl,
        fileName: artifact.fileName,
      });

      emailDelivered = delivery.delivered;
      emailReason = delivery.reason;

      database.updatePurchase(purchase.id, {
        email: body.email,
        status: delivery.delivered ? "emailed" : purchase.status,
        fulfilledAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    request.log.info(
      { purchaseId: purchase.id, artifactId: artifact.id, sessionId, mode },
      "SVG fulfilled",
    );

    return reply.send({
      artifactId: artifact.id,
      purchaseId: purchase.id,
      mode,
      fileName: artifact.fileName,
      estimatedLineCount: artifact.estimatedLineCount,
      downloadUrl,
      emailDelivered,
      emailReason,
    });
  } catch (error) {
    return reply.code(402).send({
      error: error instanceof Error ? error.message : "SVG generation is not authorized.",
    });
  }
});

server.get("/download", async (request, reply) => {
  const query = z.object({ token: z.string().min(12) }).parse(request.query);
  const decoded = verifyToken<DownloadTokenPayload>(query.token, config.DOWNLOAD_TOKEN_SECRET);

  if (!decoded || decoded.expiresAt < Date.now()) {
    return reply.code(401).send({ error: "Download link is invalid or expired." });
  }

  const purchase = database.getPurchase(decoded.purchaseId);
  const artifact = database.getArtifact(decoded.artifactId);

  if (!purchase || !artifact || purchase.artifactId !== artifact.id) {
    return reply.code(404).send({ error: "Download could not be found." });
  }

  if (!["paid", "free", "emailed"].includes(purchase.status)) {
    return reply.code(403).send({ error: "Purchase is not unlocked." });
  }

  request.log.info({ purchaseId: purchase.id, artifactId: artifact.id }, "SVG downloaded");

  reply.header("Content-Type", "image/svg+xml");
  reply.header("Content-Disposition", `attachment; filename="${artifact.fileName}"`);
  return reply.send(createReadStream(artifact.svgPath));
});

server.post(
  "/webhooks/polar",
  {
    config: {
      rawBody: true,
    },
  },
  async (request, reply) => {
    const raw = (request as typeof request & { rawBody?: string }).rawBody;

    if (!raw) {
      return reply.code(400).send({ error: "Raw webhook body is missing." });
    }

    try {
      const headers = Object.fromEntries(
        Object.entries(request.headers).map(([key, value]) => [key, String(value ?? "")]),
      );
      const payload = await verifyWebhook({
        body: raw,
        headers,
        url: `${config.PUBLIC_API_URL}/webhooks/polar`,
        method: "POST",
      });

      if (payload.type === "order.paid") {
        const purchaseId =
          typeof payload.data.metadata.purchaseId === "string"
            ? payload.data.metadata.purchaseId
            : null;

        if (purchaseId) {
          database.updatePurchase(purchaseId, {
            status: "paid",
            checkoutId: payload.data.checkoutId,
            fulfilledAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
      }

      if (payload.type === "checkout.updated" && payload.data.status === "succeeded") {
        const purchaseId =
          typeof payload.data.metadata.purchaseId === "string"
            ? payload.data.metadata.purchaseId
            : null;

        if (purchaseId) {
          database.updatePurchase(purchaseId, {
            status: "paid",
            checkoutId: payload.data.id,
            checkoutUrl: payload.data.url,
            fulfilledAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
      }

      return reply.send({ received: true });
    } catch (error) {
      request.log.error({ error }, "Polar webhook verification failed");
      return reply.code(400).send({ error: "Webhook verification failed." });
    }
  },
);

server.setErrorHandler((error, request, reply) => {
  request.log.error({ error }, "Unhandled request failure");
  const maybeError = error as { statusCode?: number; message?: string };
  const statusCode = typeof maybeError.statusCode === "number" ? maybeError.statusCode : 500;
  reply.code(statusCode).send({
    error: maybeError.message || "Unexpected server error.",
  });
});

const port = config.PORT;

server.listen({ port, host: "0.0.0.0" }).then(() => {
  server.log.info(`Plotimg API listening on ${port}`);
});
