export const PRODUCTION_VERSION_LABEL = "1.0";
export const PREVIEW_VERSION_LABEL = "1.1-preview";

const PRODUCTION_HOSTS = new Set(["plotimg.com", "www.plotimg.com"]);

export function resolveVersionLabel(hostname: string | null) {
  if (!hostname) {
    return PRODUCTION_VERSION_LABEL;
  }

  return PRODUCTION_HOSTS.has(hostname) ? PRODUCTION_VERSION_LABEL : PREVIEW_VERSION_LABEL;
}
