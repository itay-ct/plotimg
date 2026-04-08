import { overlayTransformMetrics } from "./svg";
import type {
  ImportedOverlay,
  KirigamiTemplate,
  KirigamiWarning,
  OverlayPlacement,
} from "./types";

function warningsFromOverlay(
  overlay: ImportedOverlay | null,
  placement: OverlayPlacement,
  template: KirigamiTemplate,
  slot: "top" | "side",
) {
  if (!overlay) {
    return [] satisfies KirigamiWarning[];
  }

  const safeZone = template.safeZones[slot];
  if (!safeZone) {
    return [] satisfies KirigamiWarning[];
  }

  const metrics = overlayTransformMetrics(overlay, placement, safeZone);
  const warnings: KirigamiWarning[] = overlay.warnings.map((message, index) => ({
    id: `${slot}-import-${index}`,
    message,
    tone: "info",
  }));

  if (metrics.clipped) {
    warnings.push({
      id: `${slot}-clipped`,
      message: `${slot === "top" ? "Top" : "Side"} overlay was clipped to template safe area.`,
      detail: "Adjust scale or offset if you want to keep more of the SVG inside the printable zone.",
      tone: "warning",
    });
  }

  if (metrics.smallestFeature < template.constraints.minCutGap / 2) {
    warnings.push({
      id: `${slot}-detail`,
      message: `${slot === "top" ? "Top" : "Side"} overlay contains very small details that may not plot cleanly.`,
      detail: `This template is safest when features stay above about ${Math.round(template.constraints.minCutGap / 2)} units in the mapped zone.`,
      tone: "warning",
    });
  }

  if (overlay.complexity > template.constraints.maxStrokeComplexity) {
    warnings.push({
      id: `${slot}-complexity`,
      message: "Imported SVG is denser than this template usually likes.",
      detail: "Consider simplifying the artwork before export.",
      tone: "danger",
    });
  }

  return warnings;
}

export function buildKirigamiWarnings(input: {
  template: KirigamiTemplate;
  topOverlay: ImportedOverlay | null;
  topPlacement: OverlayPlacement;
  sideOverlay: ImportedOverlay | null;
  sidePlacement: OverlayPlacement;
}) {
  const warnings: KirigamiWarning[] = [
    ...warningsFromOverlay(input.topOverlay, input.topPlacement, input.template, "top"),
    ...warningsFromOverlay(input.sideOverlay, input.sidePlacement, input.template, "side"),
  ];

  if (input.template.constraints.minBridgeWidth <= 28) {
    warnings.push({
      id: "bridge-width",
      message: "This template has narrow bridges; consider simplifying the overlay.",
      tone: "warning",
    });
  }

  if (input.template.id === "sample_reference_01") {
    warnings.push({
      id: "sample-reference",
      message: "Sample template preview is based on a raster-backed SVG reference.",
      detail: "The attached source asset is used only as a visual reference, not to derive fold or cut geometry.",
      tone: "info",
    });
  }

  return warnings;
}
