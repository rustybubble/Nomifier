// Scan tab: live AR view colored by on-device scores for the active profile.
import { useMemo } from "react";
import { useData } from "../data/DataProvider";
import { describeProfile, useProfiles } from "../profiles/store";
import ScanView from "./ScanView";
import { makeStyleFor } from "./scoredStyle";

const chip: React.CSSProperties = {
  position: "absolute",
  top: "calc(var(--sat, env(safe-area-inset-top)) + 48px)",
  left: 12,
  zIndex: 2,
  maxWidth: "70%",
  padding: "8px 14px",
  minHeight: 44,
  borderRadius: 999,
  border: "none",
  background: "rgba(0,0,0,0.6)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  color: "#fff",
  font: "600 14px -apple-system, system-ui, sans-serif",
  textAlign: "left",
};

export default function ScanTab() {
  const { data, error, loading, reload } = useData();
  const { profiles, active, setActive } = useProfiles();

  const styleFor = useMemo(
    () => (data ? makeStyleFor({ data, profile: active }) : undefined),
    [data, active],
  );

  // One tap cycles profiles; the change recolors the overlay on the next frame with no network call.
  const next = () => {
    const i = profiles.findIndex((p) => p.id === active.id);
    setActive(profiles[(i + 1) % profiles.length].id);
  };

  return (
    <>
      <ScanView styleFor={styleFor} />
      <button
        type="button"
        style={chip}
        onClick={next}
        aria-label={`Scoring for ${active.name}. Tap to switch profile.`}
      >
        For {active.name}: {describeProfile(active)} ▾
      </button>
      {error && (
        <button
          type="button"
          style={{ ...chip, top: "auto", bottom: 12 }}
          onClick={reload}
        >
          Couldn't load product data. Tap to retry.
        </button>
      )}
      {loading && !data && (
        <div style={{ ...chip, top: "auto", bottom: 12 }}>
          Loading product data…
        </div>
      )}
    </>
  );
}
