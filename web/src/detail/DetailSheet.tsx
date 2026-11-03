import { useEffect, useMemo, useState } from "react";
import type { Citation } from "@nomi/ts/index";
import { alternatives, sharedIngredients } from "../scoring/alternatives";
import { scoreMemo } from "../scoring/memo";
import { levelOf } from "../scoring/score";
import { describeProfile } from "../profiles/store";
import Pill from "../shell/Pill";
import Sheet from "../shell/Sheet";
import { DISCLAIMER } from "../shell/constants";
import type {
  AppData,
  Product,
  Scored,
  Tier,
  Unrated,
  UserProfile,
} from "../types";
import { citationLabel, dailyMedUrl } from "./citation";
import { pharmacistQuestions } from "./questions";
import { buildSpeech, canSpeak, speak, stop } from "./readAloud";
import "./detail.css";

type Target =
  | { kind: "product"; product: Product }
  | { kind: "family"; family: string; members: Product[] }
  | { kind: "unknown"; trackId: number }
  | null;

export interface DetailSheetProps {
  open: boolean;
  onClose(): void;
  target: Target;
  profile: UserProfile;
  data: AppData;
  cabinet: Product[];
  inView: Set<string>;
  still?: HTMLCanvasElement | null;
  inCabinet?: boolean;
  onAddToCabinet?(p: Product): void;
  onRemoveFromCabinet?(p: Product): void;
  onCompare?(p: Product): void;
  onFindNearby?(p: Product): void;
  onSendToClerk?(trackId: number): void;
}

const TIER = {
  green: { word: "Good choice", icon: "✓", cls: "green", pill: "green" },
  yellow: { word: "Use with caution", icon: "!", cls: "orange", pill: "orange" },
  red: { word: "Avoid", icon: "✕", cls: "red", pill: "red" },
} as const satisfies Record<Tier, unknown>;

const LEVEL = {
  high: { text: "High", tone: "red" },
  moderate: { text: "Moderate", tone: "orange" },
  low: { text: "Low", tone: "green" },
} as const;

export default function DetailSheet(props: DetailSheetProps) {
  const { open, onClose, target } = props;

  // Speech must stop when the sheet closes or the target changes.
  useEffect(() => {
    if (!open) stop();
    return stop;
  }, [open, target]);

  const title =
    target?.kind === "product"
      ? target.product.brand_name
      : target?.kind === "family"
        ? target.family
        : "Unknown product";

  return (
    <Sheet open={open} onClose={onClose} detent="full" title={title}>
      <div className="dt selectable">
        {target?.kind === "product" && (
          <ProductBody key={target.product.ndc11} {...props} product={target.product} />
        )}
        {target?.kind === "family" && (
          <FamilyBody family={target.family} members={target.members} />
        )}
        {target?.kind === "unknown" && (
          <UnknownBody
            key={target.trackId}
            trackId={target.trackId}
            still={props.still}
            onSendToClerk={props.onSendToClerk}
          />
        )}
        <p className="dt-disclaimer">{DISCLAIMER}</p>
      </div>
    </Sheet>
  );
}

// ---------- shared bits ----------

function Source({ c }: { c: Citation }) {
  const url = dailyMedUrl(c);
  return (
    <div className="dt-source">
      <span className="dt-source-name">{citationLabel(c)}</span>
      {c.quote && <q className="dt-quote">{c.quote}</q>}
      {url && (
        <a href={url} target="_blank" rel="noopener noreferrer">
          View on DailyMed
        </a>
      )}
    </div>
  );
}

function Ingredients({ product }: { product: Product }) {
  return (
    <section aria-labelledby="dt-ing">
      <h3 id="dt-ing" className="dt-h">
        Active ingredients
      </h3>
      <ul className="dt-ing">
        {product.ingredients.map((i) => (
          <li key={i.unii}>
            <span>{i.name}</span>
            <span className="dt-dim">
              {i.strength} {i.unit}
              {i.per_amount ? ` per ${i.per_amount} ${i.per_unit ?? ""}` : ""}
            </span>
          </li>
        ))}
      </ul>
      {product.uses.length > 0 && (
        <div className="dt-pills" aria-label="Uses">
          {product.uses.map((u) => (
            <Pill key={u}>{u}</Pill>
          ))}
        </div>
      )}
      {product.review_status === "unreviewed" && (
        <div className="dt-pills">
          <Pill tone="gray">Unreviewed demo data</Pill>
        </div>
      )}
    </section>
  );
}

// ---------- product ----------

function ProductBody(
  props: DetailSheetProps & { product: Product },
) {
  const { product, profile, data } = props;
  const result = scoreMemo(product, profile, data);
  return result.status === "scored" ? (
    <Scored {...props} result={result} />
  ) : (
    <UnratedBody product={product} result={result} data={data} />
  );
}

function UnratedBody({
  product,
  result,
  data,
}: {
  product: Product;
  result: Unrated;
  data: AppData;
}) {
  const names = result.missing.map(
    (u) => product.ingredients.find((i) => i.unii === u)?.name ?? u,
  );
  return (
    <>
      <header className="dt-head dt-gray">
        <div className="dt-head-main">
          <h2 className="dt-verdict">Not rated yet</h2>
          <p className="dt-for">We don't have a safety score for this one.</p>
        </div>
      </header>
      <Names product={product} />
      {names.length > 0 && (
        <p className="dt-note">
          Not rated yet: <b>{names.join(", ")}</b>. We only show a score when
          every active ingredient has been rated.
        </p>
      )}
      {product.scope !== "in_scope" && (
        <p className="dt-note">
          This kind of product is outside what Nomifier rates.
        </p>
      )}
      <Ingredients product={product} />
      <Ask result={result} product={product} data={data} />
    </>
  );
}

function Names({ product }: { product: Product }) {
  return (
    <div className="dt-names">
      <div className="dt-brand">{product.brand_name}</div>
      <div className="dt-dim">{product.generic_name}</div>
    </div>
  );
}

function Scored(
  props: DetailSheetProps & { product: Product; result: Scored },
) {
  const { product, result, profile, data, cabinet, inView } = props;
  const t = TIER[result.tier];
  const who = describeProfile(profile);
  const label = data.labelStatus[product.ndc11];
  const shared = sharedIngredients(product, cabinet);
  const hs = result.hard_stops_triggered.length;
  const hardLines = result.explanation.slice(0, hs);
  const riskLines = result.explanation.slice(hs);
  const alt = useMemo(
    () => alternatives(product, profile, data, inView)[0],
    [product, profile, data, inView],
  );
  const altProduct = alt && data.productsByNdc.get(alt.ndc11);

  return (
    <>
      <header className={`dt-head dt-${t.cls}`}>
        <span className="dt-icon" aria-hidden="true">
          {t.icon}
        </span>
        <div className="dt-head-main">
          <h2 className="dt-verdict">{t.word}</h2>
          <p className="dt-for">for {who}</p>
        </div>
        <div
          className="dt-score"
          role="img"
          aria-label={`Score ${result.score} out of 100, ${t.word.toLowerCase()}`}
        >
          {result.score}
          <small>/100</small>
        </div>
      </header>
      <Names product={product} />

      {label && label.status !== "ok" && (
        <div className="dt-banner dt-warn" role="alert">
          {label.status === "recall"
            ? "This product has a recall notice."
            : "The label for this product was updated since our data."}{" "}
          {label.url && (
            <a href={label.url} target="_blank" rel="noopener noreferrer">
              See the details
            </a>
          )}
        </div>
      )}
      {shared.map((s) => (
        <div className="dt-banner dt-amber" key={`${s.unii}-${s.with.ndc11}`}>
          Also {s.name}: you already take {s.with.brand_name}. Taking both can
          exceed the label's maximum dose.
        </div>
      ))}

      {hardLines.length > 0 && (
        <section aria-label="Do not use" className="dt-hard">
          {hardLines.map((e, i) => (
            <div className="dt-hard-line" key={i}>
              <p>
                <span aria-hidden="true">✕ </span>
                {e.text}
              </p>
              {e.citations.map((c, j) => (
                <Source c={c} key={j} />
              ))}
            </div>
          ))}
        </section>
      )}

      {riskLines.length > 0 && (
        <section aria-labelledby="dt-risks">
          <h3 id="dt-risks" className="dt-h">
            Why this score
          </h3>
          <ul className="dt-risks">
            {riskLines.map((e, i) => {
              const lvl = LEVEL[levelOf(result.contributions[i]?.points ?? 0)];
              return (
                <li key={i}>
                  <div className="dt-risk-top">
                    <p>{e.text}</p>
                    <Pill tone={lvl.tone}>{lvl.text}</Pill>
                  </div>
                  {e.citations.map((c, j) => (
                    <Source c={c} key={j} />
                  ))}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <Ingredients product={product} />

      <section aria-labelledby="dt-alt">
        <h3 id="dt-alt" className="dt-h">
          Safer pick
        </h3>
        {alt && altProduct ? (
          <div className="dt-alt">
            <div>
              <div className="dt-brand">{altProduct.brand_name}</div>
              <div className="dt-dim">
                for {alt.shared_use}
                {alt.inView && (
                  <>
                    {" "}
                    <Pill tone="green">in view</Pill>
                  </>
                )}
              </div>
            </div>
            <div
              className={`dt-alt-score dt-${TIER[alt.tier].cls}`}
              aria-label={`Score ${alt.score}, ${TIER[alt.tier].word.toLowerCase()}`}
            >
              <span aria-hidden="true">{TIER[alt.tier].icon}</span> {alt.score}
            </div>
          </div>
        ) : (
          <p className="dt-note">
            No clearly safer option here. Ask your pharmacist.
          </p>
        )}
        <button
          type="button"
          className="dt-btn dt-btn-full"
          onClick={() => props.onFindNearby?.(product)}
        >
          Find a safer one nearby
        </button>
      </section>

      <Actions {...props} result={result} />
    </>
  );
}

// ---------- actions ----------

function Actions(
  props: DetailSheetProps & { product: Product; result: Scored },
) {
  const { product, result, profile, data, inCabinet } = props;
  const [speaking, setSpeaking] = useState(false);
  const toggleSpeech = () => {
    if (speaking) {
      stop();
      setSpeaking(false);
    } else
      setSpeaking(
        speak(buildSpeech(product, result, describeProfile(profile)), () =>
          setSpeaking(false),
        ),
      );
  };
  return (
    <>
      <div className="dt-actions">
        {inCabinet ? (
          <button
            type="button"
            className="dt-btn"
            onClick={() => props.onRemoveFromCabinet?.(product)}
          >
            Remove from cabinet
          </button>
        ) : (
          <button
            type="button"
            className="dt-btn dt-btn-primary"
            onClick={() => props.onAddToCabinet?.(product)}
          >
            Add to cabinet
          </button>
        )}
        <button
          type="button"
          className="dt-btn"
          onClick={() => props.onCompare?.(product)}
        >
          Compare
        </button>
        {canSpeak() && (
          <button
            type="button"
            className="dt-btn"
            aria-pressed={speaking}
            onClick={toggleSpeech}
          >
            {speaking ? "Stop reading" : "Read aloud"}
          </button>
        )}
      </div>
      <Ask result={result} product={product} data={data} />
    </>
  );
}

function Ask({
  result,
  product,
  data,
}: {
  result: Scored | Unrated;
  product: Product;
  data: AppData;
}) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  const qs = useMemo(
    () => pharmacistQuestions(result, product, data.questions),
    [result, product, data.questions],
  );
  const copy = async () => {
    try {
      await navigator.clipboard?.writeText(qs.map((q) => `- ${q}`).join("\n"));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked: the list is still on screen */
    }
  };
  return (
    <div className="dt-ask">
      <button
        type="button"
        className="dt-btn dt-btn-full"
        aria-expanded={shown}
        onClick={() => setShown(!shown)}
      >
        Ask your pharmacist
      </button>
      {shown && (
        <div className="dt-ask-list">
          {qs.length ? (
            <>
              <ul>
                {qs.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
              <button type="button" className="dt-btn" onClick={copy}>
                Copy questions
              </button>
              <span className="dt-copied" role="status">
                {copied ? "Copied" : ""}
              </span>
            </>
          ) : (
            <p className="dt-note">
              Ask the pharmacist whether this is right for you, and show them
              the box.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- family / unknown ----------

function FamilyBody({
  family,
  members,
}: {
  family: string;
  members: Product[];
}) {
  return (
    <>
      <header className="dt-head dt-gray dt-dashed">
        <div className="dt-head-main">
          <h2 className="dt-verdict">{family}: which one is it?</h2>
        </div>
      </header>
      <p className="dt-note">
        These look alike. Turn the box so the barcode faces the camera to
        confirm.
      </p>
      <ul className="dt-members">
        {members.map((m) => (
          <li key={m.ndc11}>
            <Names product={m} />
          </li>
        ))}
      </ul>
    </>
  );
}

function UnknownBody({
  trackId,
  still,
  onSendToClerk,
}: {
  trackId: number;
  still?: HTMLCanvasElement | null;
  onSendToClerk?(trackId: number): void;
}) {
  const src = useMemo(() => {
    if (!still || !still.width) return null;
    try {
      const w = Math.min(still.width, 480);
      const c = document.createElement("canvas");
      c.width = w;
      c.height = Math.round((still.height * w) / still.width);
      c.getContext("2d")?.drawImage(still, 0, 0, c.width, c.height);
      return c.toDataURL("image/jpeg", 0.8);
    } catch {
      return null;
    }
  }, [still]);
  return (
    <>
      <header className="dt-head dt-gray">
        <div className="dt-head-main">
          <h2 className="dt-verdict">We don't know this product yet</h2>
        </div>
      </header>
      {src && <img className="dt-still" src={src} alt="Photo of the unknown box" />}
      <button
        type="button"
        className="dt-btn dt-btn-primary dt-btn-full"
        onClick={() => onSendToClerk?.(trackId)}
      >
        Send to Coverage Clerk
      </button>
      <p className="dt-note">
        A person reviews every addition before it shows up in the app.
      </p>
    </>
  );
}
