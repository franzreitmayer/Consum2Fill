import { useCallback, useEffect, useRef, useState } from "react";
import { type ApiClient, errorMessage } from "./api";

export type ResourceState<T> =
  { kind: "loading" } | { kind: "loaded"; data: T } | { kind: "failed"; message: string };

/**
 * Loads a resource on mount; reload retries and setData applies local changes.
 * refresh loads in the background: the current state stays until newer data arrives, and a failure
 * keeps it. Local changes and reload cancel a running refresh, its answer could be older than they are.
 */
export function useApiResource<T>(api: ApiClient, path: string) {
  const [state, setState] = useState<ResourceState<T>>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const refreshRequest = useRef<AbortController | null>(null);

  const cancelRefresh = useCallback(() => refreshRequest.current?.abort(), []);
  useEffect(() => cancelRefresh, [cancelRefresh]);

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
    cancelRefresh();
    setState({ kind: "loading" });
    setAttempt((current) => current + 1);
  }, [cancelRefresh]);

  const refresh = useCallback(() => {
    cancelRefresh();
    const controller = new AbortController();
    refreshRequest.current = controller;
    api<T>(path, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setState({ kind: "loaded", data });
      })
      .catch(() => undefined);
  }, [api, path, cancelRefresh]);

  const setData = useCallback(
    (data: T) => {
      cancelRefresh();
      setState({ kind: "loaded", data });
    },
    [cancelRefresh],
  );

  /** Like setData, but based on the latest data, which a refresh may have replaced meanwhile. */
  const updateData = useCallback(
    (change: (data: T) => T) => {
      cancelRefresh();
      setState((current) =>
        current.kind === "loaded" ? { kind: "loaded", data: change(current.data) } : current,
      );
    },
    [cancelRefresh],
  );

  return { state, reload, refresh, setData, updateData };
}
