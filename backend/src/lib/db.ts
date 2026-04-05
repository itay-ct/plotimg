import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";

import { config } from "../config.js";
import type {
  ArtifactRecord,
  PreviewJobRecord,
  PurchaseRecord,
  PurchaseStatus,
  StoredUpload,
} from "../types.js";

const databasePath = join(config.storageDir, "plotimg.sqlite");
const db = new DatabaseSync(databasePath);

db.exec(`
  CREATE TABLE IF NOT EXISTS uploads (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    file_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    source_hash TEXT NOT NULL,
    file_path TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS preview_jobs (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    upload_id TEXT NOT NULL,
    render_fingerprint TEXT NOT NULL,
    status TEXT NOT NULL,
    error_message TEXT,
    result_json TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS preview_jobs_lookup
    ON preview_jobs(upload_id, session_id, render_fingerprint, status);

  CREATE TABLE IF NOT EXISTS artifacts (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    upload_id TEXT NOT NULL,
    render_fingerprint TEXT NOT NULL,
    source_hash TEXT NOT NULL,
    params_json TEXT NOT NULL,
    file_name TEXT NOT NULL,
    svg_path TEXT NOT NULL,
    estimated_line_count INTEGER NOT NULL,
    width REAL NOT NULL,
    height REAL NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS artifacts_lookup
    ON artifacts(session_id, render_fingerprint);

  CREATE TABLE IF NOT EXISTS purchases (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    artifact_id TEXT NOT NULL,
    render_fingerprint TEXT NOT NULL,
    currency TEXT NOT NULL,
    coupon_code TEXT,
    status TEXT NOT NULL,
    checkout_id TEXT,
    checkout_url TEXT,
    email TEXT,
    fulfilled_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS purchases_session_lookup
    ON purchases(session_id, render_fingerprint, status);
`);

function toUpload(row: Record<string, unknown>): StoredUpload {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    fileName: String(row.file_name),
    mimeType: String(row.mime_type),
    width: Number(row.width),
    height: Number(row.height),
    sourceHash: String(row.source_hash),
    filePath: String(row.file_path),
    createdAt: String(row.created_at),
  };
}

function toPreviewJob(row: Record<string, unknown>): PreviewJobRecord {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    uploadId: String(row.upload_id),
    renderFingerprint: String(row.render_fingerprint),
    status: row.status as PreviewJobRecord["status"],
    errorMessage: row.error_message ? String(row.error_message) : null,
    resultJson: row.result_json ? String(row.result_json) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function toArtifact(row: Record<string, unknown>): ArtifactRecord {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    uploadId: String(row.upload_id),
    renderFingerprint: String(row.render_fingerprint),
    sourceHash: String(row.source_hash),
    paramsJson: String(row.params_json),
    fileName: String(row.file_name),
    svgPath: String(row.svg_path),
    estimatedLineCount: Number(row.estimated_line_count),
    width: Number(row.width),
    height: Number(row.height),
    createdAt: String(row.created_at),
  };
}

function toPurchase(row: Record<string, unknown>): PurchaseRecord {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    artifactId: String(row.artifact_id),
    renderFingerprint: String(row.render_fingerprint),
    currency: row.currency as PurchaseRecord["currency"],
    couponCode: row.coupon_code ? String(row.coupon_code) : null,
    status: row.status as PurchaseStatus,
    checkoutId: row.checkout_id ? String(row.checkout_id) : null,
    checkoutUrl: row.checkout_url ? String(row.checkout_url) : null,
    email: row.email ? String(row.email) : null,
    fulfilledAt: row.fulfilled_at ? String(row.fulfilled_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export const database = {
  insertUpload(upload: StoredUpload) {
    db.prepare(
      `INSERT INTO uploads (
        id, session_id, file_name, mime_type, width, height, source_hash, file_path, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      upload.id,
      upload.sessionId,
      upload.fileName,
      upload.mimeType,
      upload.width,
      upload.height,
      upload.sourceHash,
      upload.filePath,
      upload.createdAt,
    );
  },

  getUpload(id: string): StoredUpload | null {
    const row = db.prepare("SELECT * FROM uploads WHERE id = ?").get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? toUpload(row) : null;
  },

  insertPreviewJob(job: PreviewJobRecord) {
    db.prepare(
      `INSERT INTO preview_jobs (
        id, session_id, upload_id, render_fingerprint, status, error_message, result_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      job.id,
      job.sessionId,
      job.uploadId,
      job.renderFingerprint,
      job.status,
      job.errorMessage,
      job.resultJson,
      job.createdAt,
      job.updatedAt,
    );
  },

  findCompletedPreviewJob(
    uploadId: string,
    sessionId: string,
    renderFingerprint: string,
  ): PreviewJobRecord | null {
    const row = db
      .prepare(
        `SELECT * FROM preview_jobs
         WHERE upload_id = ?
         AND session_id = ?
         AND render_fingerprint = ?
         AND status = 'completed'
         ORDER BY created_at DESC
         LIMIT 1`,
      )
      .get(uploadId, sessionId, renderFingerprint) as Record<string, unknown> | undefined;
    return row ? toPreviewJob(row) : null;
  },

  updatePreviewJob(
    id: string,
    update: Pick<PreviewJobRecord, "status" | "errorMessage" | "resultJson" | "updatedAt">,
  ) {
    db.prepare(
      `UPDATE preview_jobs
       SET status = ?, error_message = ?, result_json = ?, updated_at = ?
       WHERE id = ?`,
    ).run(update.status, update.errorMessage, update.resultJson, update.updatedAt, id);
  },

  getPreviewJob(id: string): PreviewJobRecord | null {
    const row = db.prepare("SELECT * FROM preview_jobs WHERE id = ?").get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? toPreviewJob(row) : null;
  },

  insertArtifact(artifact: ArtifactRecord) {
    db.prepare(
      `INSERT INTO artifacts (
        id, session_id, upload_id, render_fingerprint, source_hash, params_json, file_name, svg_path,
        estimated_line_count, width, height, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      artifact.id,
      artifact.sessionId,
      artifact.uploadId,
      artifact.renderFingerprint,
      artifact.sourceHash,
      artifact.paramsJson,
      artifact.fileName,
      artifact.svgPath,
      artifact.estimatedLineCount,
      artifact.width,
      artifact.height,
      artifact.createdAt,
    );
  },

  findArtifactBySession(sessionId: string, renderFingerprint: string): ArtifactRecord | null {
    const row = db
      .prepare(
        `SELECT * FROM artifacts
         WHERE session_id = ? AND render_fingerprint = ?
         ORDER BY created_at DESC
         LIMIT 1`,
      )
      .get(sessionId, renderFingerprint) as Record<string, unknown> | undefined;
    return row ? toArtifact(row) : null;
  },

  getArtifact(id: string): ArtifactRecord | null {
    const row = db.prepare("SELECT * FROM artifacts WHERE id = ?").get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? toArtifact(row) : null;
  },

  insertPurchase(purchase: PurchaseRecord) {
    db.prepare(
      `INSERT INTO purchases (
        id, session_id, artifact_id, render_fingerprint, currency, coupon_code, status, checkout_id,
        checkout_url, email, fulfilled_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      purchase.id,
      purchase.sessionId,
      purchase.artifactId,
      purchase.renderFingerprint,
      purchase.currency,
      purchase.couponCode,
      purchase.status,
      purchase.checkoutId,
      purchase.checkoutUrl,
      purchase.email,
      purchase.fulfilledAt,
      purchase.createdAt,
      purchase.updatedAt,
    );
  },

  updatePurchase(
    id: string,
    update: Partial<
      Pick<PurchaseRecord, "status" | "checkoutId" | "checkoutUrl" | "email" | "fulfilledAt">
    > & { updatedAt: string },
  ) {
    const current = this.getPurchase(id);
    if (!current) {
      return;
    }

    db.prepare(
      `UPDATE purchases
       SET status = ?, checkout_id = ?, checkout_url = ?, email = ?, fulfilled_at = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      update.status ?? current.status,
      update.checkoutId ?? current.checkoutId,
      update.checkoutUrl ?? current.checkoutUrl,
      update.email ?? current.email,
      update.fulfilledAt ?? current.fulfilledAt,
      update.updatedAt,
      id,
    );
  },

  getPurchase(id: string): PurchaseRecord | null {
    const row = db.prepare("SELECT * FROM purchases WHERE id = ?").get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? toPurchase(row) : null;
  },

  findPurchaseByCheckoutId(checkoutId: string): PurchaseRecord | null {
    const row = db
      .prepare("SELECT * FROM purchases WHERE checkout_id = ? ORDER BY created_at DESC LIMIT 1")
      .get(checkoutId) as Record<string, unknown> | undefined;
    return row ? toPurchase(row) : null;
  },

  findFulfilledPurchase(sessionId: string, renderFingerprint: string): PurchaseRecord | null {
    const row = db
      .prepare(
        `SELECT * FROM purchases
         WHERE session_id = ?
         AND render_fingerprint = ?
         AND status IN ('paid', 'free', 'emailed')
         ORDER BY created_at DESC
         LIMIT 1`,
      )
      .get(sessionId, renderFingerprint) as Record<string, unknown> | undefined;
    return row ? toPurchase(row) : null;
  },

  findPendingPurchase(
    sessionId: string,
    renderFingerprint: string,
    currency: PurchaseRecord["currency"],
  ): PurchaseRecord | null {
    const row = db
      .prepare(
        `SELECT * FROM purchases
         WHERE session_id = ?
         AND render_fingerprint = ?
         AND currency = ?
         AND status = 'pending'
         AND checkout_id IS NOT NULL
         AND checkout_url IS NOT NULL
         ORDER BY created_at DESC
         LIMIT 1`,
      )
      .get(sessionId, renderFingerprint, currency) as Record<string, unknown> | undefined;
    return row ? toPurchase(row) : null;
  },
};
