import { SurfaceResponseSchema, type SurfaceResponse } from "@fulcrum/shared";

export function normalizeSurfaceResponse(response: SurfaceResponse): SurfaceResponse {
  return SurfaceResponseSchema.parse(response);
}

export function expectSurfaceParity(left: SurfaceResponse, right: SurfaceResponse): void {
  const normalizedLeft = normalizeSurfaceResponse(left);
  const normalizedRight = normalizeSurfaceResponse(right);
  if (normalizedLeft.status !== normalizedRight.status) {
    throw new Error(
      `Surface status mismatch: ${normalizedLeft.status} !== ${normalizedRight.status}`
    );
  }
  if (normalizedLeft.redactionStatus !== normalizedRight.redactionStatus) {
    throw new Error(
      `Surface redaction mismatch: ${normalizedLeft.redactionStatus} !== ${normalizedRight.redactionStatus}`
    );
  }
}
