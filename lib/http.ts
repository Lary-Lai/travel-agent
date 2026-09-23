/** Uniform JSON responses + typed errors for every Route Handler. */
import { NextResponse } from "next/server";
import { ZodError } from "zod";

import type { ApiResponse } from "../types";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new ApiError(400, "BAD_REQUEST", message, details);

export const unauthorized = (message = "请先登录后再进行此操作") =>
  new ApiError(401, "UNAUTHORIZED", message);

export const forbidden = (message = "没有权限访问该资源") => new ApiError(403, "FORBIDDEN", message);

export const notFound = (message = "资源不存在") => new ApiError(404, "NOT_FOUND", message);

export const conflict = (message: string, details?: unknown) =>
  new ApiError(409, "CONFLICT", message, details);

export const unprocessable = (message: string, details?: unknown) =>
  new ApiError(422, "UNPROCESSABLE", message, details);

export function ok<T>(data: T, init?: ResponseInit): NextResponse<ApiResponse<T>> {
  return NextResponse.json<ApiResponse<T>>({ ok: true, data }, init);
}

/** Turn any thrown value into the standard failure envelope. */
export function errorResponse(error: unknown): NextResponse<ApiResponse<never>> {
  if (error instanceof ApiError) {
    return NextResponse.json<ApiResponse<never>>(
      { ok: false, error: { code: error.code, message: error.message, details: error.details } },
      { status: error.status },
    );
  }

  if (error instanceof ZodError) {
    const details = error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    }));
    return NextResponse.json<ApiResponse<never>>(
      { ok: false, error: { code: "VALIDATION_ERROR", message: "请求参数不合法", details } },
      { status: 400 },
    );
  }

  // Unexpected: log server-side, return a generic message to the client.
  console.error("[api] unhandled error:", error);
  return NextResponse.json<ApiResponse<never>>(
    { ok: false, error: { code: "INTERNAL_ERROR", message: "服务器内部错误，请稍后重试" } },
    { status: 500 },
  );
}

/** Wrap a Route Handler so thrown errors become proper JSON responses. */
export function handler<Args extends unknown[]>(
  fn: (...args: Args) => Promise<NextResponse>,
): (...args: Args) => Promise<NextResponse> {
  return async (...args: Args) => {
    try {
      return await fn(...args);
    } catch (error) {
      return errorResponse(error);
    }
  };
}
