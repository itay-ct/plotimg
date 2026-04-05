import type {
  CheckoutPriceMap,
  GenerateSvgResponse,
  PlotParameters,
  PreviewResult,
  UploadRecord,
} from "./plotimg";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") || "http://localhost:8081";

async function fetchWithTimeout(input: string, init?: RequestInit, timeoutMs = 20000) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("The Plotimg server took too long to respond. Please try again.");
    }

    if (error instanceof TypeError) {
      throw new Error("Couldn’t reach the Plotimg server. Please try again.");
    }

    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function requestJson<T>(
  path: string,
  sessionId: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetchWithTimeout(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-plotimg-session": sessionId,
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error || "The request could not be completed.");
  }

  return (await response.json()) as T;
}

export async function uploadImage(file: File, sessionId: string): Promise<UploadRecord> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetchWithTimeout(`${API_BASE_URL}/upload`, {
    method: "POST",
    headers: {
      "x-plotimg-session": sessionId,
    },
    body: formData,
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error || "Upload failed.");
  }

  return (await response.json()) as UploadRecord;
}

export async function createPreviewJob(input: {
  uploadId: string;
  params: PlotParameters;
  sessionId: string;
}) {
  return requestJson<{ jobId: string; status: "queued" | "completed" }>(
    "/preview",
    input.sessionId,
    {
      method: "POST",
      body: JSON.stringify({
        uploadId: input.uploadId,
        params: input.params,
      }),
    },
  );
}

export async function getPreviewStatus(jobId: string, sessionId: string) {
  return requestJson<{
    jobId: string;
    status: "queued" | "processing" | "completed" | "failed";
    active: boolean;
    errorMessage: string | null;
    result: PreviewResult | null;
  }>(`/status/${jobId}`, sessionId);
}

export async function validateCoupon(code: string, sessionId: string) {
  return requestJson<{
    valid: boolean;
    free: boolean;
    code?: string;
    message: string;
    allowCheckoutDiscountCodes: boolean;
  }>("/validate-coupon", sessionId, {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export async function createCheckout(input: {
  uploadId: string;
  params: PlotParameters;
  currency: "USD" | "ILS";
  sessionId: string;
}) {
  return requestJson<{
    mode: "payment" | "existing";
    artifactId: string;
    purchaseId: string;
    checkoutId?: string;
    checkoutUrl?: string;
    downloadReady?: boolean;
  }>("/checkout", input.sessionId, {
    method: "POST",
    body: JSON.stringify({
      uploadId: input.uploadId,
      params: input.params,
      currency: input.currency,
    }),
  });
}

export async function generateSvg(input: {
  uploadId?: string;
  params?: PlotParameters;
  sessionId: string;
  currency?: "USD" | "ILS";
  couponCode?: string;
  email?: string;
  purchaseId?: string;
  checkoutId?: string;
}) {
  return requestJson<GenerateSvgResponse>("/generate-svg", input.sessionId, {
    method: "POST",
    body: JSON.stringify({
      uploadId: input.uploadId,
      params: input.params,
      couponCode: input.couponCode,
      email: input.email,
      purchaseId: input.purchaseId,
      checkoutId: input.checkoutId,
      currency: input.currency,
    }),
  });
}

export async function getCheckoutConfig(sessionId: string) {
  return requestJson<{
    allowCheckoutDiscountCodes: boolean;
    prices: CheckoutPriceMap;
  }>("/checkout-config", sessionId, {
    method: "GET",
  });
}
