import { Polar } from "@polar-sh/sdk";

import { config } from "../config.js";

const polar =
  config.POLAR_ACCESS_TOKEN && (config.POLAR_PRODUCT_ID_USD || config.POLAR_PRODUCT_ID_ILS)
    ? new Polar({
        accessToken: config.POLAR_ACCESS_TOKEN,
        server: config.POLAR_SERVER,
      })
    : null;

function getProductIdForCurrency(currency: "USD" | "ILS"): string | null {
  if (currency === "USD") {
    return config.POLAR_PRODUCT_ID_USD ?? null;
  }

  return config.POLAR_PRODUCT_ID_ILS ?? null;
}

function getPresentmentCurrency(currency: "USD" | "ILS"): "usd" | "ils" {
  return currency === "USD" ? "usd" : "ils";
}

export async function createCheckoutSession(input: {
  artifactId: string;
  purchaseId: string;
  renderFingerprint: string;
  sessionId: string;
  currency: "USD" | "ILS";
  customerEmail?: string;
}): Promise<{ checkoutId: string; checkoutUrl: string }> {
  if (!polar) {
    throw new Error("Polar is not configured.");
  }

  const productId = getProductIdForCurrency(input.currency);

  if (!productId) {
    throw new Error(`Polar product is missing for currency ${input.currency}.`);
  }

  const checkout = await polar.checkouts.create({
    allowDiscountCodes: config.POLAR_ALLOW_DISCOUNT_CODES,
    currency: getPresentmentCurrency(input.currency),
    customerEmail: input.customerEmail,
    externalCustomerId: input.sessionId,
    metadata: {
      artifactId: input.artifactId,
      purchaseId: input.purchaseId,
      renderFingerprint: input.renderFingerprint,
      sessionId: input.sessionId,
    },
    products: [productId],
    successUrl: `${config.PUBLIC_APP_URL}/?purchaseId=${input.purchaseId}&artifactId=${input.artifactId}&checkout_id={CHECKOUT_ID}`,
  });

  return {
    checkoutId: checkout.id,
    checkoutUrl: checkout.url,
  };
}

export async function getCheckoutSession(checkoutId: string) {
  if (!polar) {
    throw new Error("Polar is not configured.");
  }

  return polar.checkouts.get({
    id: checkoutId,
  });
}

export async function verifyWebhook(input: {
  body: string;
  headers: Record<string, string>;
  url: string;
  method: string;
}) {
  if (!polar || !config.POLAR_WEBHOOK_SECRET) {
    throw new Error("Polar webhook verification is not configured.");
  }

  return polar.validateWebhook({
    request: {
      body: input.body,
      headers: input.headers,
      url: input.url,
      method: input.method,
    },
  });
}
