import { useEffect, useRef, useState } from "react";
import {
  getUnknown,
  poll,
  sendUnknown,
  serverBase,
  type UnknownRecord,
} from "../api";
import Sheet from "../shell/Sheet";
import "./bots.css";

interface Props {
  open: boolean;
  onClose: () => void;
  trackId: number | null;
  requestCrop: (trackId: number) => Promise<string>;
}

type Phase =
  | { k: "cropping" }
  | { k: "reading" }
  | { k: "done"; rec: UnknownRecord }
  | { k: "error"; msg: string };

export default function ClerkSheet({
  open,
  onClose,
  trackId,
  requestCrop,
}: Props) {
  const [phase, setPhase] = useState<Phase>({ k: "cropping" });
  const [crop, setCrop] = useState<string | null>(null);
  const rc = useRef(requestCrop);
  rc.current = requestCrop;

  useEffect(() => {
    if (!open || trackId == null) return;
    const ac = new AbortController();
    setPhase({ k: "cropping" });
    setCrop(null);
    (async () => {
      try {
        const url = await rc.current(trackId);
        setCrop(serverBase().replace(/\/$/, "") + url);
        setPhase({ k: "reading" });
        const { job_id } = await sendUnknown(url);
        const rec = await poll(
          () => getUnknown(job_id),
          (r) => r.status !== "waiting",
          {
            signal: ac.signal,
          },
        );
        setPhase({ k: "done", rec });
      } catch (e) {
        if (ac.signal.aborted) return;
        const msg = e instanceof Error ? e.message : String(e);
        setPhase({
          k: "error",
          msg:
            msg === "timeout"
              ? "Coverage Clerk is taking longer than usual. Please try again."
              : msg,
        });
      }
    })();
    return () => ac.abort();
  }, [open, trackId]);

  const rec = phase.k === "done" ? phase.rec : null;
  return (
    <Sheet open={open} onClose={onClose} detent="full" title="Coverage Clerk">
      <div className="bot-body">
        {crop && <img className="bot-crop" src={crop} alt="This box" />}
        {phase.k === "cropping" && (
          <div className="bot-wait" role="status">
            <div className="bot-spinner" />
            <p>Getting a clear picture of this box…</p>
          </div>
        )}
        {phase.k === "reading" && (
          <div className="bot-wait" role="status">
            <div className="bot-spinner" />
            <p>Coverage Clerk is reading this box…</p>
          </div>
        )}
        {phase.k === "error" && <p className="bot-err">{phase.msg}</p>}
        {rec && rec.status === "done" && (
          <div className="bot-card">
            {(rec.product?.brand_name || rec.product?.generic_name) && (
              <p className="bot-strong">
                {rec.product.brand_name}
                {rec.product.generic_name
                  ? ` (${rec.product.generic_name})`
                  : ""}
              </p>
            )}
            {rec.pr_url && (
              <a
                className="btn-tint bot-wide"
                href={rec.pr_url}
                target="_blank"
                rel="noreferrer"
              >
                Open pull request
              </a>
            )}
            <p className="bot-note">
              A human reviews every addition before it's merged.
            </p>
          </div>
        )}
        {rec && rec.status === "not_identified" && (
          <p className="bot-err">
            Couldn't identify this box{rec.reason ? `: ${rec.reason}` : "."}
          </p>
        )}
        {rec && rec.status !== "done" && rec.status !== "not_identified" && (
          <p className="bot-err">
            {rec.error || "Coverage Clerk couldn't finish this one."}
          </p>
        )}
      </div>
    </Sheet>
  );
}
