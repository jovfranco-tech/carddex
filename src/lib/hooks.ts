import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type CollectionState,
  type CollectionCardMeta,
} from '@/types/collection';
import {
  getCollection,
  getCardMeta,
  summarize,
  subscribe,
  type CollectionSummary,
} from '@/lib/collectionStorage';
import { isAbortError } from '@/lib/pokemonTcgApi';

/* ------------------------------------------------------------------------- */
/* Reactive collection state                                                  */
/* ------------------------------------------------------------------------- */

export function useCollection(): CollectionState {
  const [state, setState] = useState<CollectionState>(() => getCollection());
  useEffect(() => {
    const unsub = subscribe(() => setState(getCollection()));
    return unsub;
  }, []);
  return state;
}

export function useCardMeta(
  cardId: string | undefined | null,
): CollectionCardMeta | undefined {
  const [meta, setMeta] = useState<CollectionCardMeta | undefined>(() =>
    cardId ? getCardMeta(cardId) : undefined,
  );
  useEffect(() => {
    if (!cardId) {
      setMeta(undefined);
      return;
    }
    setMeta(getCardMeta(cardId));
    const unsub = subscribe(() => setMeta(getCardMeta(cardId)));
    return unsub;
  }, [cardId]);
  return meta;
}

export function useCollectionSummary(): CollectionSummary {
  const [s, setS] = useState<CollectionSummary>(() => summarize());
  useEffect(() => {
    const unsub = subscribe(() => setS(summarize()));
    return unsub;
  }, []);
  return s;
}

/* ------------------------------------------------------------------------- */
/* Async wrappers                                                             */
/* ------------------------------------------------------------------------- */

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * useAsync — run an async function whenever `deps` change, with stale-result
 * protection and automatic AbortController teardown.
 *
 * The function receives an AbortSignal it should forward to fetch() so that
 * in-flight requests are cancelled when the component unmounts or the deps
 * change. Aborts are ignored (no spurious error in state).
 */
export function useAsync<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  deps: ReadonlyArray<unknown>,
): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  // Ignore stale responses if the effect re-runs.
  const reqId = useRef(0);

  useEffect(() => {
    const myId = ++reqId.current;
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    fn(ctrl.signal)
      .then((result) => {
        if (reqId.current !== myId) return;
        setData(result);
        setLoading(false);
      })
      .catch((err) => {
        if (reqId.current !== myId) return;
        if (isAbortError(err)) return; // expected; keep loading state? no — drop.
        setError(err instanceof Error ? err.message : 'Algo salió mal.');
        setLoading(false);
      });
    return () => {
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, loading, error, reload };
}

/**
 * Debounce a value (used for the search box so we don't hammer the API on
 * every keystroke).
 */
export function useDebounced<T>(value: T, delay = 320): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setV(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);
  return v;
}
