import { randomUUID } from "node:crypto";

export type RequestWithId = {
  requestId?: string;
  headers?: Record<string, unknown>;
};

export type ResponseWithHeaders = {
  setHeader: (name: string, value: string) => void;
};

export type NextFunction = () => void;

const requestIdHeader = "x-request-id";
const safeRequestIdPattern = /^[A-Za-z0-9._:-]{8,128}$/;

export function normalizeRequestId(value: unknown): string | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (typeof candidate !== "string") return null;
  const trimmed = candidate.trim();
  if (!safeRequestIdPattern.test(trimmed)) return null;
  return trimmed;
}

export function requestIdMiddleware(request: RequestWithId, response: ResponseWithHeaders, next: NextFunction): void {
  const requestId = normalizeRequestId(request.headers?.[requestIdHeader]) ?? randomUUID();
  request.requestId = requestId;
  response.setHeader(requestIdHeader, requestId);
  next();
}
