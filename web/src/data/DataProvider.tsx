import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import type { AppData } from "../types";
import { loadAppData } from "./load";

interface DataState {
  data: AppData | null;
  error: Error | null;
  loading: boolean;
  reload: () => void;
}

const Ctx = createContext<DataState | null>(null);

export function DataProvider({
  children,
  baseUrl,
}: {
  children: ReactNode;
  baseUrl?: string;
}) {
  const [data, setData] = useState<AppData | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    loadAppData(baseUrl)
      .then(setData)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e : new Error(String(e))),
      )
      .finally(() => setLoading(false));
  }, [baseUrl]);

  useEffect(reload, [reload]);

  const value = useMemo(
    () => ({ data, error, loading, reload }),
    [data, error, loading, reload],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useData(): DataState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useData must be used inside <DataProvider>");
  return v;
}
