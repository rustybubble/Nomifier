import Sheet from "../shell/Sheet";
import { scoreMemo } from "../scoring/memo";
import { sharedIngredients } from "../scoring/alternatives";
import { TIER_COLOR, TIER_ICON, TIER_WORD } from "../cabinet/tier";
import type { AppData, Product, ScoreResult, UserProfile } from "../types";
import { compareRows } from "./compare";
import "../cabinet/lists.css";

export { dimensionName } from "./compare";

interface Props {
  open: boolean;
  onClose: () => void;
  a: Product | null;
  b: Product | null;
  profile: UserProfile;
  data: AppData;
}

function Card({ p, r }: { p: Product; r: ScoreResult }) {
  return (
    <div className="cmp-card">
      <h3>{p.brand_name}</h3>
      {r.status === "scored" ? (
        <div
          className="cmp-score"
          style={{ color: TIER_COLOR[r.tier] }}
          aria-label={`Score ${r.score}, ${TIER_WORD[r.tier]}`}
        >
          <span aria-hidden="true">{TIER_ICON[r.tier]}</span> {r.score}
          <small>{TIER_WORD[r.tier]}</small>
        </div>
      ) : (
        <div className="cmp-unrated">Not rated yet</div>
      )}
    </div>
  );
}

export default function CompareSheet({
  open,
  onClose,
  a,
  b,
  profile,
  data,
}: Props) {
  const ready = a && b;
  const ra = ready ? scoreMemo(a, profile, data) : null;
  const rb = ready ? scoreMemo(b, profile, data) : null;
  const rows = ra && rb ? compareRows(ra, rb) : [];
  const shared = ready
    ? [...new Set(sharedIngredients(a, [b]).map((s) => s.name))]
    : [];
  const stops = (r: ScoreResult | null, p: Product | null) =>
    r?.status === "scored" && p
      ? r.hard_stops_triggered.map((h) => ({ p, h }))
      : [];
  return (
    <Sheet open={open} onClose={onClose} detent="full" title="Compare">
      {ready && ra && rb && (
        <>
          <div className="cmp-head">
            <Card p={a} r={ra} />
            <Card p={b} r={rb} />
          </div>
          {[...stops(ra, a), ...stops(rb, b)].map(({ p, h }) => (
            <div className="cmp-stop" key={p.ndc11 + h.id}>
              <b>{p.brand_name}:</b> {h.message}
            </div>
          ))}
          {rows.length > 0 && (
            <table className="grp cmp-table" style={{ display: "table" }}>
              <caption className="grp-title" style={{ textAlign: "left" }}>
                Points lost for {profile.name}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Area</th>
                  <th scope="col">{a.brand_name}</th>
                  <th scope="col">{b.brand_name}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.dimension}>
                    <th scope="row">{r.name}</th>
                    <td className={r.worse === "a" ? "worse" : undefined}>
                      {r.a ? `−${r.a}` : "–"}
                    </td>
                    <td className={r.worse === "b" ? "worse" : undefined}>
                      {r.b ? `−${r.b}` : "–"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {shared.length > 0 && (
            <p className="cmp-note">
              Both contain {shared.join(" and ")}. Taking both can double the
              dose.
            </p>
          )}
        </>
      )}
    </Sheet>
  );
}
