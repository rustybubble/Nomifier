import { useEffect, useRef, useState } from "react";
import {
  findNearby,
  getFind,
  poll,
  sendApproval,
  type FindRecord,
} from "../api";
import Pill from "../shell/Pill";
import Sheet from "../shell/Sheet";
import type { AppData, Product } from "../types";
import "./bots.css";

interface Props {
  open: boolean;
  onClose: () => void;
  product: Product | null;
  data: AppData | null;
}

type Phase =
  | { k: "idle" }
  | { k: "checking"; zip: string }
  | { k: "done"; rec: FindRecord }
  | { k: "decided"; approved: boolean; link?: string }
  | { k: "timeout" }
  | { k: "error"; msg: string };

const ZIP_KEY = "nomifier.zip";
function loadZip(): string {
  try {
    return localStorage.getItem(ZIP_KEY) || "30332";
  } catch {
    return "30332";
  }
}

export default function FindNearbySheet({
  open,
  onClose,
  product,
  data,
}: Props) {
  const [zip, setZip] = useState(loadZip);
  const [phase, setPhase] = useState<Phase>({ k: "idle" });
  const abort = useRef<AbortController | null>(null);
  const findId = useRef("");

  useEffect(() => {
    if (open) setPhase({ k: "idle" });
    return () => abort.current?.abort();
  }, [open, product?.ndc11]);

  const zipOk = /^\d{5}$/.test(zip);

  const run = async () => {
    if (!product || !zipOk) return;
    try {
      localStorage.setItem(ZIP_KEY, zip);
    } catch {
      /* private mode */
    }
    abort.current?.abort();
    const ac = (abort.current = new AbortController());
    setPhase({ k: "checking", zip });
    try {
      const { find_id } = await findNearby(product.ndc11, zip);
      findId.current = find_id;
      const rec = await poll(
        () => getFind(find_id),
        (r) => r.status !== "waiting",
        { signal: ac.signal },
      );
      if (rec.status === "done") setPhase({ k: "done", rec });
      else
        setPhase({
          k: "error",
          msg: rec.error || "Aisle Finder couldn't finish this search.",
        });
    } catch (e) {
      if (ac.signal.aborted) return;
      const msg = e instanceof Error ? e.message : String(e);
      setPhase(
        msg === "timeout"
          ? { k: "timeout" }
          : {
              k: "error",
              msg: /404/.test(msg)
                ? "That product isn't in our data yet."
                : msg,
            },
      );
    }
  };

  const decide = async (approved: boolean, link?: string) => {
    try {
      await sendApproval(findId.current, approved ? "approve" : "reject");
      setPhase({ k: "decided", approved, link });
    } catch (e) {
      setPhase({ k: "error", msg: e instanceof Error ? e.message : String(e) });
    }
  };

  const name = product
    ? (data?.productsByNdc.get(product.ndc11)?.brand_name ?? product.brand_name)
    : "";

  return (
    <Sheet open={open} onClose={onClose} detent="full" title="Find nearby">
      <div className="bot-body">
        {name && <p className="bot-sub">{name}</p>}

        {(phase.k === "idle" ||
          phase.k === "timeout" ||
          phase.k === "error") && (
          <>
            <label className="bot-field">
              <span>ZIP code</span>
              <input
                inputMode="numeric"
                maxLength={5}
                value={zip}
                onChange={(e) =>
                  setZip(e.target.value.replace(/\D/g, "").slice(0, 5))
                }
              />
            </label>
            <button
              className="btn-tint bot-wide"
              disabled={!zipOk || !product}
              onClick={() => void run()}
            >
              {phase.k === "idle" ? "Ask Aisle Finder" : "Try again"}
            </button>
            <p className="bot-note">
              Only the product code and ZIP are shared.
            </p>
            {phase.k === "timeout" && (
              <p className="bot-err">
                Aisle Finder is taking longer than usual. Please try again in a
                moment.
              </p>
            )}
            {phase.k === "error" && <p className="bot-err">{phase.msg}</p>}
          </>
        )}

        {phase.k === "checking" && (
          <div className="bot-wait" role="status">
            <div className="bot-spinner" />
            <p>Aisle Finder is checking stores near {phase.zip}…</p>
            <p className="bot-note">
              Only the product code and ZIP are shared.
            </p>
          </div>
        )}

        {phase.k === "done" && <Results rec={phase.rec} onDecide={decide} />}

        {phase.k === "decided" && (
          <div className="bot-card">
            <p className="bot-strong">
              {phase.approved
                ? "Pickup order approved. Finish checkout on the store's site."
                : "Cart cleared."}
            </p>
            {phase.approved && phase.link && (
              <a
                className="btn-tint bot-wide"
                href={phase.link}
                target="_blank"
                rel="noreferrer"
              >
                Open store
              </a>
            )}
          </div>
        )}
      </div>
    </Sheet>
  );
}

function Results({
  rec,
  onDecide,
}: {
  rec: FindRecord;
  onDecide: (approved: boolean, link?: string) => void;
}) {
  const options = rec.options ?? [];
  const isMock = JSON.stringify(rec).includes("MOCK");
  const first = options.find((o) => o.in_stock) ?? options[0];
  return (
    <>
      {isMock && <Pill tone="gray">Mock data</Pill>}
      {options.length === 0 && (
        <p className="bot-err">No stores found nearby.</p>
      )}
      {options.map((o, i) => {
        const ndc = o.ndc11 ?? o.ndc11_if_shown;
        return (
          <div className="bot-card" key={i}>
            <div className="bot-row">
              <span className="bot-strong">{o.store}</span>
              {o.in_stock != null && (
                <Pill tone={o.in_stock ? "green" : "gray"}>
                  {o.in_stock ? "In stock" : "Out of stock"}
                </Pill>
              )}
            </div>
            <div>{o.product}</div>
            <div className="bot-row">
              {o.price != null && (
                <span>
                  {typeof o.price === "number"
                    ? `$${o.price.toFixed(2)}`
                    : o.price}
                </span>
              )}
              {ndc && <span className="bot-note">NDC {ndc}</span>}
            </div>
            <a
              href={o.link}
              target="_blank"
              rel="noreferrer"
              className="bot-link"
            >
              View at store
            </a>
          </div>
        );
      })}
      {rec.evidence_url && (
        <a
          href={rec.evidence_url}
          target="_blank"
          rel="noreferrer"
          className="bot-link"
        >
          See the evidence
        </a>
      )}
      {rec.cart && <p className="bot-note">Cart: {rec.cart}</p>}
      <div className="bot-actions">
        <button
          className="btn-tint"
          onClick={() => onDecide(true, first?.link)}
        >
          Approve
        </button>
        <button className="bot-reject" onClick={() => onDecide(false)}>
          Reject
        </button>
      </div>
    </>
  );
}
