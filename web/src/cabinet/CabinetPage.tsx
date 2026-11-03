import { useRef, useState } from "react";
import Page from "../shell/Page";
import { useData } from "../data/DataProvider";
import { useProfiles } from "../profiles/store";
import { scoreMemo } from "../scoring/memo";
import type { AppData, Product, UserProfile } from "../types";
import { cabinetProducts, useCabinet } from "./store";
import { TIER_COLOR, TIER_ICON } from "./tier";
import "./lists.css";

const OPEN = -88;

function joinWords(xs: string[]) {
  return xs.length < 2
    ? xs.join("")
    : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}

/** "Tylenol and NyQuil both contain acetaminophen" for each active ingredient in 2+ cabinet products. */
export function duplicateWarnings(products: Product[]): string[] {
  const by = new Map<string, { name: string; brands: string[] }>();
  for (const p of products)
    for (const i of p.ingredients) {
      const e = by.get(i.unii) ?? { name: i.name, brands: [] };
      if (!e.brands.includes(p.brand_name)) e.brands.push(p.brand_name);
      by.set(i.unii, e);
    }
  return [...by.values()]
    .filter((e) => e.brands.length > 1)
    .map(
      (e) =>
        `${joinWords(e.brands)} ${e.brands.length === 2 ? "both" : "all"} contain ${e.name}`,
    );
}

function Row({
  p,
  profile,
  data,
  editing,
  onDelete,
}: {
  p: Product;
  profile: UserProfile;
  data: AppData;
  editing: boolean;
  onDelete: () => void;
}) {
  const [x, setX] = useState(0);
  const [drag, setDrag] = useState(false);
  const start = useRef({ x: 0, base: 0 });
  const r = scoreMemo(p, profile, data);
  const shown = editing ? OPEN : x;
  const actionable = editing || x < -4;
  return (
    <li className="swipe">
      <button
        type="button"
        className="swipe-del chrome"
        tabIndex={actionable ? 0 : -1}
        aria-hidden={!actionable}
        onClick={onDelete}
      >
        Delete
      </button>
      <div
        className={`row${drag ? " dragging" : ""}`}
        style={{ transform: `translateX(${shown}px)` }}
        onPointerDown={(e) => {
          if (editing) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          start.current = { x: e.clientX, base: x };
          setDrag(true);
        }}
        onPointerMove={(e) => {
          if (!drag) return;
          setX(
            Math.max(
              OPEN - 24,
              Math.min(0, start.current.base + e.clientX - start.current.x),
            ),
          );
        }}
        onPointerUp={() => {
          setDrag(false);
          setX(x < OPEN / 2 ? OPEN : 0);
        }}
        onPointerCancel={() => {
          setDrag(false);
          setX(x < OPEN / 2 ? OPEN : 0);
        }}
      >
        <div className="row-main">
          <b>{p.brand_name}</b>
          <span>{p.generic_name}</span>
        </div>
        <div className="row-side">
          {r.status === "scored" ? (
            <>
              <span
                className="dot"
                style={{ background: TIER_COLOR[r.tier] }}
                aria-hidden="true"
              >
                {TIER_ICON[r.tier]}
              </span>
              <span aria-label={`Score ${r.score} for ${profile.name}`}>
                {r.score}
              </span>
            </>
          ) : (
            <span>Not rated yet</span>
          )}
        </div>
      </div>
    </li>
  );
}

export default function CabinetPage() {
  const { data } = useData();
  const { active } = useProfiles();
  const cab = useCabinet();
  const [editing, setEditing] = useState(false);
  const products = data ? cabinetProducts(cab.items, data) : [];
  const warnings = duplicateWarnings(products);

  return (
    <Page title="Cabinet">
      {products.length === 0 ? (
        <div className="empty chrome">
          <svg
            viewBox="0 0 26 26"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="4" y="3.5" width="18" height="19" rx="2.5" />
            <path d="M4 13h18M11 8h4M11 18h4" />
          </svg>
          <b>Your cabinet is empty</b>
          <span>
            Add medicines you take from a product&apos;s detail sheet. They stay
            on this phone.
          </span>
        </div>
      ) : (
        <>
          {warnings.map((w) => (
            <div className="warn" role="alert" key={w}>
              <span className="warn-icon" aria-hidden="true">
                !
              </span>
              <div>
                <b>{w}</b>
                Taking both can exceed the label&apos;s maximum dose.
              </div>
            </div>
          ))}
          <div className="list-bar">
            <button
              type="button"
              className="row-link"
              onClick={() => setEditing(!editing)}
            >
              {editing ? "Done" : "Edit"}
            </button>
          </div>
          <p className="grp-title">Scores for {active.name}</p>
          <ul className="grp">
            {products.map(
              (p) =>
                data && (
                  <Row
                    key={p.ndc11}
                    p={p}
                    profile={active}
                    data={data}
                    editing={editing}
                    onDelete={() => cab.remove(p.ndc11)}
                  />
                ),
            )}
          </ul>
        </>
      )}
    </Page>
  );
}
