import type {
  KirigamiCamera,
  Point2,
  Point3,
  PreviewSurface,
  Rect,
} from "./types";

export function linePath(from: Point2, to: Point2) {
  return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
}

export function rectPath(rect: Rect) {
  const x2 = rect.x + rect.width;
  const y2 = rect.y + rect.height;
  return `M ${rect.x} ${rect.y} L ${x2} ${rect.y} L ${x2} ${y2} L ${rect.x} ${y2} Z`;
}

export function unionRects(rects: Rect[]) {
  if (rects.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  const minX = Math.min(...rects.map((rect) => rect.x));
  const minY = Math.min(...rects.map((rect) => rect.y));
  const maxX = Math.max(...rects.map((rect) => rect.x + rect.width));
  const maxY = Math.max(...rects.map((rect) => rect.y + rect.height));

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

export function surfaceCorners(surface: PreviewSurface) {
  if (surface.plane === "horizontal") {
    return [
      surface.origin,
      { x: surface.origin.x + surface.size.width, y: surface.origin.y, z: surface.origin.z },
      {
        x: surface.origin.x + surface.size.width,
        y: surface.origin.y,
        z: surface.origin.z + surface.size.height,
      },
      { x: surface.origin.x, y: surface.origin.y, z: surface.origin.z + surface.size.height },
    ] satisfies Point3[];
  }

  return [
    surface.origin,
    { x: surface.origin.x + surface.size.width, y: surface.origin.y, z: surface.origin.z },
    {
      x: surface.origin.x + surface.size.width,
      y: surface.origin.y + surface.size.height,
      z: surface.origin.z,
    },
    { x: surface.origin.x, y: surface.origin.y + surface.size.height, z: surface.origin.z },
  ] satisfies Point3[];
}

export function projectPoint(point: Point3, camera: KirigamiCamera): Point2 {
  if (camera === "top") {
    return {
      x: point.x,
      y: point.z,
    };
  }

  if (camera === "side") {
    return {
      x: point.x,
      y: point.y,
    };
  }

  return {
    x: point.x + point.z * 0.72,
    y: point.y * -1 + point.z * 0.38,
  };
}

export function planeBasis(surface: PreviewSurface, camera: Exclude<KirigamiCamera, "flat">) {
  const origin = projectPoint(surface.origin, camera);

  const xUnit = projectPoint(
    {
      x: surface.origin.x + 1,
      y: surface.origin.y,
      z: surface.origin.z,
    },
    camera,
  );

  const yPoint =
    surface.plane === "horizontal"
      ? {
          x: surface.origin.x,
          y: surface.origin.y,
          z: surface.origin.z + 1,
        }
      : {
          x: surface.origin.x,
          y: surface.origin.y + 1,
          z: surface.origin.z,
        };

  const yUnit = projectPoint(yPoint, camera);

  return {
    origin,
    a: xUnit.x - origin.x,
    b: xUnit.y - origin.y,
    c: yUnit.x - origin.x,
    d: yUnit.y - origin.y,
  };
}

export function projectedSurfaceBounds(
  surfaces: PreviewSurface[],
  camera: Exclude<KirigamiCamera, "flat">,
) {
  const points = surfaces.flatMap((surface) =>
    surfaceCorners(surface).map((point) => projectPoint(point, camera)),
  );
  const minX = Math.min(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxX = Math.max(...points.map((point) => point.x));
  const maxY = Math.max(...points.map((point) => point.y));

  return {
    minX,
    minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}
