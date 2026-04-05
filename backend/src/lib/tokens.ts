import { createHmac, timingSafeEqual } from "node:crypto";

function toBase64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function fromBase64Url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

export function signToken(payload: Record<string, unknown>, secret: string): string {
  const body = toBase64Url(JSON.stringify(payload));
  const signature = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function verifyToken<T>(token: string, secret: string): T | null {
  const [body, signature] = token.split(".");

  if (!body || !signature) {
    return null;
  }

  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  const isValid = timingSafeEqual(Buffer.from(signature), Buffer.from(expected));

  if (!isValid) {
    return null;
  }

  return JSON.parse(fromBase64Url(body)) as T;
}
