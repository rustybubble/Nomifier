import { useState } from "react";
import Page from "../shell/Page";
import { useData } from "../data/DataProvider";
import { TIER_COLOR, TIER_ICON } from "../cabinet/tier";
import { relativeTime, useHistory } from "./store";
import "../cabinet/lists.css";

export default function HistoryPage() {
  const { data } = useData();
  const { entries, clear } = useHistory();
  const [confirm, setConfirm] = useState(false);

  return (
    <Page title="History">
      {entries.length === 0 ? (
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
            <circle cx="13" cy="13" r="9" />
            <path d="M13 7.5V13l3.5 2.5" />
          </svg>
          <b>No history yet</b>
          <span>
            Medicines you open will show up here, with the score at the time.
            It stays on this phone.
          </span>
        </div>
      ) : (
        <>
          {confirm ? (
            <div className="confirm" role="alertdialog" aria-label="Clear history">
              <span>Clear all history?</span>
              <button
                type="button"
                className="row-link"
                onClick={() => setConfirm(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="row-link danger"
                onClick={() => {
                  clear();
                  setConfirm(false);
                }}
              >
                Clear
              </button>
            </div>
          ) : (
            <div className="list-bar">
              <button
                type="button"
                className="row-link"
                onClick={() => setConfirm(true)}
              >
                Clear
              </button>
            </div>
          )}
          <ul className="grp">
            {entries.map((e) => {
              const p = data?.productsByNdc.get(e.ndc11);
              return (
                <li key={e.ndc11 + e.at}>
                  <div className="row">
                    <div className="row-main">
                      <b>{p?.brand_name ?? e.ndc11}</b>
                      <span>
                        {relativeTime(e.at)} &middot; {e.profileName}
                      </span>
                    </div>
                    <div className="row-side">
                      {e.tier && e.score !== null ? (
                        <>
                          <span
                            className="dot"
                            style={{ background: TIER_COLOR[e.tier] }}
                            aria-hidden="true"
                          >
                            {TIER_ICON[e.tier]}
                          </span>
                          <span aria-label={`Score ${e.score}`}>{e.score}</span>
                        </>
                      ) : (
                        <span>Not rated yet</span>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Page>
  );
}
