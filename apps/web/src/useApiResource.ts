import { useCallback, useEffect, useState } from "react";
import { type ApiClient, errorMessage } from "./api";

export type ResourceState<T> =
  { kind: "loading" } | { kind: "loaded"; data: T } | { kind: "failed"; message: string };

/** Loads a resource on mount; reload retries and setData applies local changes. */
export function useApiResource<T>(api: ApiClient, path: string) {
  const [state, setState] = useState<ResourceState<T>>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api<T>(path, { signal: controller.signal })
      .then((data) => setState({ kind: "loaded", data }))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setState({ kind: "failed", message: errorMessage(error) });
        }
      });
    return () => controller.abort();
  }, [api, path, attempt]);

  const reload = useCallback(() => {
    setState({ kind: "loading" });
    setAttempt((current) => current + 1);
  }, []);

  const setData = useCallback((data: T) => setState({ kind: "loaded", data }), []);

  return { state, reload, setData };
}
