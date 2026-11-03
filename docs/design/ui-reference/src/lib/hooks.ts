// Small hand-rolled data-fetching hooks standing in for TanStack Query (which
// requirements.md suggests but isn't available to wire up here -- see
// DECISIONS.md, "Data fetching"). Shaped closely enough to useQuery/useMutation
// that swapping the real library in later is a mechanical change.
import * as React from "react";
import { onRemoteChange, getSyncVersion } from "./api/client";
import { ApiError } from "./api/types";

export interface QueryState<T> {
  data: T | undefined;
  error: ApiError | Error | undefined;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export function useQuery<T>(key: unknown[], fn: () => Promise<T>): QueryState<T> {
  const [data, setData] = React.useState<T | undefined>(undefined);
  const [error, setError] = React.useState<Error | undefined>(undefined);
  const [isLoading, setIsLoading] = React.useState(true);
  const [tick, setTick] = React.useState(0);
  const depsKey = JSON.stringify(key);

  React.useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(undefined);
    fn()
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setIsLoading(false);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e);
          setIsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depsKey, tick]);

  return {
    data,
    error,
    isLoading,
    isError: !!error,
    refetch: () => setTick((t) => t + 1),
  };
}

export interface MutationState<TArgs, TResult> {
  mutate: (args: TArgs) => Promise<TResult>;
  isLoading: boolean;
  error: Error | undefined;
}

export function useMutation<TArgs, TResult>(
  fn: (args: TArgs) => Promise<TResult>,
): MutationState<TArgs, TResult> {
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<Error | undefined>(undefined);
  const mutate = React.useCallback(
    async (args: TArgs) => {
      setIsLoading(true);
      setError(undefined);
      try {
        const result = await fn(args);
        setIsLoading(false);
        return result;
      } catch (e) {
        setError(e as Error);
        setIsLoading(false);
        throw e;
      }
    },
    [fn],
  );
  return { mutate, isLoading, error };
}

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

/**
 * Polls GET /sync/version every 2-3s (NFR-2) and calls onChange when it moves,
 * plus reacts instantly to same-browser changes via BroadcastChannel/storage
 * events so a second tab of this app is a faithful "another device" demo.
 */
export function useSyncVersion(onChange: () => void) {
  const lastVersion = React.useRef<number | null>(null);
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;

  React.useEffect(() => {
    let stopped = false;
    async function poll() {
      try {
        const { version } = await getSyncVersion();
        if (lastVersion.current === null) {
          lastVersion.current = version;
        } else if (version !== lastVersion.current) {
          lastVersion.current = version;
          onChangeRef.current();
        }
      } catch {
        // ignore transient errors
      }
    }
    poll();
    const interval = setInterval(poll, 2500);
    const unsubscribe = onRemoteChange(() => {
      if (!stopped) poll();
    });
    return () => {
      stopped = true;
      clearInterval(interval);
      unsubscribe();
    };
  }, []);
}
