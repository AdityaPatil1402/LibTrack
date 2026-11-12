import { useCallback, useEffect, useState } from 'react';

/**
 * Loads data with `load(signal)` and exposes { data, error, loading, reload }.
 * Re-runs when `deps` change; an older request can never overwrite a newer one.
 */
export function useApi(load, deps) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState((prev) => ({ data: prev.data, error: null, loading: true }));
    load(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setState({ data, error: null, loading: false });
      })
      .catch((error) => {
        if (controller.signal.aborted || error.name === 'AbortError') return;
        setState({ data: null, error, loading: false });
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, reload };
}
