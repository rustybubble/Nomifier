import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";

const ToastCtx = createContext<(msg: string) => void>(() => {});

export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<{ id: number; text: string } | null>(null);
  const timer = useRef<number>(0);
  const show = useCallback((text: string) => {
    window.clearTimeout(timer.current);
    setMsg({ id: Date.now(), text });
    timer.current = window.setTimeout(() => setMsg(null), 2500);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && (
        <div
          key={msg.id}
          className="toast chrome"
          role="status"
          aria-live="polite"
        >
          {msg.text}
        </div>
      )}
    </ToastCtx.Provider>
  );
}
