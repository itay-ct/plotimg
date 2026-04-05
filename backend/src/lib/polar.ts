import { Polar } from "@polar-sh/sdk";

import { config } from "../config.js";

const polar =
  config.POLAR_ACCESS_TOKEN &&
  (config.POLAR_PRODUCT_ID || config.POLAR_PRODUCT_ID_USD || config.POLAR_PRODUCT_ID_ILS)
    ? new Polar({
        accessToken: config.POLAR_ACCESS_TOKEN,
        server: config.POLAR_SERVER,
      })
    : null;

function getProductIdForCurrency(currency: "USD" | "ILS"): string | null {
  if (currency === "USD") {
    return config.POLAR_PRODUCT_ID_USD ?? config.POLAR_PRODUCT_ID ?? null;
  }

  return config.POLAR_PRODUCT_ID_ILS ?? config.POLAR_PRODUCT_ID ?? null;
}

function getPresentmentCurrency(currency: "USD" | "ILS"): "usd" | "ils" {
  return currency === "USD" ? "usd" : "ils";
}

function formatPriceLabel(currency: "USD" | "ILS", amountInMinorUnits: number) {
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amountInMinorUnits / 100);

  return `${formatted} ${currency}`;
}

async function getProductPriceLabel(currency: "USD" | "ILS") {
  if (!polar) {
    return null;
  }

  const productId = getProductIdForCurrency(currency);

  if (!productId) {
    return null;
  }

  const product = await polar.products.get({
    id: productId,
  });

  const matchingPrice = product.prices.find((price) => {
    if (price.isArchived || price.amountType !== "fixed") {
      return false;
    }

    return price.priceCurrency.toUpperCase() === currency;
  });

  if (!matchingPrice || matchingPrice.amountType !== "fixed") {
    return null;
  }

  return formatPriceLabel(currency, matchingPrice.priceAmount);
}

async function getSafeProductPriceLabel(currency: "USD" | "ILS") {
  try {
    return await getProductPriceLabel(currency);
  } catch {
    return null;
  }
}

export async function getCheckoutDisplayPrices() {
  const [usdLabel, ilsLabel] = await Promise.all([
    getSafeProductPriceLabel("USD"),
    getSafeProductPriceLabel("ILS"),
  ]);

  return {
    USD: {
      label: usdLabel,
    },
    ILS: {
      label: ilsLabel,
    },
  };
}

export async function createCheckoutSession(input: {
  artifactId: string;
  purchaseId: string;
  renderFingerprint: string;
  sessionId: string;
  currency: "USD" | "ILS";
  appOrigin: string;
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
    embedOrigin: input.appOrigin,
    externalCustomerId: input.sessionId,
    metadata: {
      artifactId: input.artifactId,
      purchaseId: input.purchaseId,
      renderFingerprint: input.renderFingerprint,
      sessionId: input.sessionId,
    },
    products: [productId],
    returnUrl: input.appOrigin,
    successUrl: `${input.appOrigin}/?purchaseId=${input.purchaseId}&checkout_id={CHECKOUT_ID}`,
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
