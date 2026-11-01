import type { ErrorResponse } from "@c2r/shared";
import type { NextFunction, Request, Response } from "express";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function clientErrorStatus(err: unknown): number | null {
  if (typeof err !== "object" || err === null || !("status" in err)) return null;
  const { status } = err;
  return typeof status === "number" && status >= 400 && status < 500 ? status : null;
}

export function apiErrorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) {
    next(err);
    return;
  }
  let status = 500;
  let message = "Interner Serverfehler.";
  if (err instanceof HttpError) {
    status = err.status;
    message = err.message;
  } else if (err instanceof URIError) {
    // An undecodable path parameter cannot name an existing resource
    status = 404;
    message = "Nicht gefunden.";
  } else {
    const clientStatus = clientErrorStatus(err);
    if (clientStatus === null) {
      console.error("Unhandled API error:", err);
    } else {
      status = clientStatus;
      message = "Ungültige Anfrage.";
    }
  }
  const body: ErrorResponse = { message };
  res.status(status).json(body);
}
