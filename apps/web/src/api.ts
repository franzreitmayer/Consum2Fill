export const NETWORK_ERROR_STATUS = 0;

const NETWORK_ERROR_MESSAGE = "Server nicht erreichbar. Bitte die Verbindung prüfen.";

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
}

export type ApiClient = <T>(path: string, options?: RequestOptions) => Promise<T>;

function fallbackMessage(status: number): string {
  return `Die Anfrage ist fehlgeschlagen (Status ${status}).`;
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: unknown };
    return typeof body.message === "string" && body.message !== ""
      ? body.message
      : fallbackMessage(response.status);
  } catch {
    return fallbackMessage(response.status);
  }
}

/** Sends a request and throws ApiError for error responses and network failures. */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, signal } = options;
  const hasBody = body !== undefined;

  let response: Response;
  try {
    response = await fetch(path, {
      method,
      signal,
      headers: hasBody ? { "Content-Type": "application/json" } : undefined,
      body: hasBody ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    if (signal?.aborted) {
      throw error;
    }
    throw new ApiError(NETWORK_ERROR_STATUS, NETWORK_ERROR_MESSAGE);
  }

  if (!response.ok) {
    throw new ApiError(response.status, await readErrorMessage(response));
  }
  if (response.status === 204) {
    return undefined as T;
  }
  try {
    return (await response.json()) as T;
  } catch (error) {
    if (signal?.aborted) {
      throw error;
    }
    throw new ApiError(response.status, NETWORK_ERROR_MESSAGE);
  }
}

/** Client for requests inside a session: a 401 means the session has ended. */
export function createApiClient(onUnauthorized: () => void): ApiClient {
  return async <T>(path: string, options?: RequestOptions) => {
    try {
      return await apiRequest<T>(path, options);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onUnauthorized();
      }
      throw error;
    }
  };
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Ein unbekannter Fehler ist aufgetreten.";
}
