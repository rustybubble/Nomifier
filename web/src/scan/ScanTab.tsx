// Scan tab: live AR view colored by on-device scores for the active profile, plus the detail sheet,
// safer-pick arrows, "I need…" chips, barcode lock, Bot sheets and the CV HUD.
import { useMemo, useRef, useState } from "react";
import type { Product, Track } from "../types";
import type { ScanSocket } from "../api";
import { useData } from "../data/DataProvider";
import { describeProfile, useProfiles } from "../profiles/store";
import { cabinetProducts, useCabinet } from "../cabinet/store";
import { recordView } from "../history/store";
import { useSettings } from "../settings/store";
import { scoreMemo } from "../scoring/memo";
import { alternatives } from "../scoring/alternatives";
import DetailSheet from "../detail/DetailSheet";
import CompareSheet from "../compare/CompareSheet";
import FilterChips, { USE_FILTERS } from "../ar/FilterChips";
import HudDetails from "../ar/HudDetails";
import { makeDrawExtras, type Pulse } from "../ar/extras";
import { useRedCenterAlert } from "../ar/redAlert";
import { useBarcodeLock } from "../barcode/useBarcodeLock";
import BarcodeScanner from "../barcode/BarcodeScanner";
import FindNearbySheet from "../bots/FindNearbySheet";
import ClerkSheet from "../bots/ClerkSheet";
import { useToast } from "../shell/Toast";
import ScanView from "./ScanView";
import { makeStyleFor } from "./scoredStyle";

type Target =
  | { kind: "product"; product: Product }
  | { kind: "family"; family: string; members: Product[] }
  | { kind: "unknown"; trackId: number };

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
  const cab = useCabinet();
  const settings = useSettings();
  const toast = useToast();

  const socketRef = useRef<ScanSocket | null>(null);
  const tracksRef = useRef<Track[]>([]);
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const [inView, setInView] = useState<Set<string>>(new Set());

  const [filter, setFilter] = useState<string | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const [still, setStill] = useState<HTMLCanvasElement | null>(null);
  const [hud, setHud] = useState<Track | null>(null);
  const [compare, setCompare] = useState<[Product, Product] | null>(null);
  const [findFor, setFindFor] = useState<Product | null>(null);
  const [clerkTrack, setClerkTrack] = useState<number | null>(null);
  const [scanning, setScanning] = useState(false);

  // Stable object mutated in place, so the draw loop sees a new pulse without rebuilding extras.
  const pulse = useRef<Pulse>({ trackId: -1, until: 0 }).current;
  const alert = useRedCenterAlert({ enabled: true, sound: settings.sound });

  const uses = filter ? USE_FILTERS[filter] : null;
  const cabinet = useMemo(
    () => (data ? cabinetProducts(cab.items, data) : []),
    [cab.items, data],
  );
  const focusNdc = target?.kind === "product" ? target.product.ndc11 : null;

  const styleFor = useMemo(
    () =>
      data
        ? makeStyleFor({ data, profile: active, cabinet, useFilter: uses })
        : undefined,
    [data, active, cabinet, uses],
  );
  const extras = useMemo(
    () =>
      data
        ? makeDrawExtras({
            data,
            profile: active,
            useFilter: uses,
            focusNdc,
            pulse,
          })
        : undefined,
    [data, active, uses, focusNdc, pulse],
  );
  const drawExtras = useMemo(
    () =>
      extras && styleFor
        ? (
            ctx: CanvasRenderingContext2D,
            displayed: Parameters<typeof extras>[1],
          ) => {
            const r = alert.check(
              displayed,
              styleFor,
              ctx.canvas.clientWidth,
              ctx.canvas.clientHeight,
            );
            if (r) {
              pulse.trackId = r.trackId;
              pulse.until = performance.now() + 1500;
            }
            extras(ctx, displayed);
          }
        : undefined,
    [extras, styleFor, alert, pulse],
  );

  const onTracks = (tracks: Track[]) => {
    tracksRef.current = tracks;
    const ids = tracks.flatMap((t) =>
      t.status === "named" && t.product_id ? [t.product_id] : [],
    );
    setInView((prev) =>
      ids.length === prev.size && ids.every((i) => prev.has(i))
        ? prev
        : new Set(ids),
    );
  };

  const openProduct = (product: Product) => {
    setTarget({ kind: "product", product });
    if (data) {
      const r = scoreMemo(product, active, data);
      recordView({
        ndc11: product.ndc11,
        score: r.status === "scored" ? r.score : null,
        tier: r.status === "scored" ? r.tier : null,
        profileName: active.name,
      });
    }
  };

  const onTapTrack = (t: Track, s: HTMLCanvasElement | null) => {
    if (!data) return;
    setStill(s);
    if (t.status === "named" && t.product_id) {
      const p = data.productsByNdc.get(t.product_id);
      if (p) openProduct(p);
      else setTarget({ kind: "unknown", trackId: t.id });
    } else if (t.status === "family" && t.family) {
      const members = (data.families[t.family] ?? []).flatMap(
        (n) => data.productsByNdc.get(n) ?? [],
      );
      setTarget({ kind: "family", family: t.family, members });
    } else if (t.status === "unknown") {
      setTarget({ kind: "unknown", trackId: t.id });
    }
  };

  useBarcodeLock({
    video,
    tracksRef,
    socketRef,
    data,
    enabled: !!data && !scanning,
    onLocked: (_id, p) => toast(`Barcode confirmed: ${p.brand_name}`),
    onNotInCatalog: (code) => toast(`Barcode ${code} isn't in our data yet`),
  });

  const onCompare = (p: Product) => {
    if (!data) return;
    const alt =
      alternatives(p, active, data, inView).find((a) => a.inView) ??
      alternatives(p, active, data, inView)[0];
    const other = alt && data.productsByNdc.get(alt.ndc11);
    const fallback = cabinet.find((c) => c.ndc11 !== p.ndc11);
    const b = other ?? fallback;
    if (b) setCompare([p, b]);
    else toast("Nothing to compare with yet");
  };

  // One tap cycles profiles; the change recolors the overlay on the next frame with no network call.
  const next = () => {
    const i = profiles.findIndex((p) => p.id === active.id);
    setActive(profiles[(i + 1) % profiles.length].id);
  };

  const sheetOpen = !!target || !!compare || !!findFor || clerkTrack !== null;

  return (
    <div
      style={{ position: "absolute", inset: 0 }}
      onPointerDown={() => alert.unlock()}
    >
      <ScanView
        styleFor={styleFor}
        drawExtras={drawExtras}
        onTracks={onTracks}
        onTapTrack={onTapTrack}
        onVideo={setVideo}
        onLongPressTrack={setHud}
        socketRef={socketRef}
        showHud={settings.showHud}
        paused={sheetOpen || scanning}
      />
      <button
        type="button"
        style={chip}
        onClick={next}
        aria-label={`Scoring for ${active.name}. Tap to switch profile.`}
      >
        For {active.name}: {describeProfile(active)} ▾
      </button>
      <FilterChips value={filter} onChange={setFilter} />
      <button
        type="button"
        onClick={() => setScanning(true)}
        aria-label="Scan a barcode"
        style={{
          ...chip,
          left: "auto",
          right: 12,
          maxWidth: "none",
          width: 44,
          padding: 0,
          textAlign: "center",
          fontSize: 20,
        }}
      >
        ▥
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

      {hud && (
        <HudDetails
          track={hud}
          product={
            hud.product_id ? data?.productsByNdc.get(hud.product_id) : undefined
          }
          onClose={() => setHud(null)}
        />
      )}

      {data && (
        <>
          <DetailSheet
            open={!!target}
            onClose={() => setTarget(null)}
            target={target}
            profile={active}
            data={data}
            cabinet={cabinet}
            inView={inView}
            still={still}
            inCabinet={focusNdc ? cab.has(focusNdc) : false}
            onAddToCabinet={(p) => {
              cab.add(p.ndc11);
              toast(`Added ${p.brand_name} to your cabinet`);
            }}
            onRemoveFromCabinet={(p) => cab.remove(p.ndc11)}
            onCompare={onCompare}
            onFindNearby={(p) => {
              setTarget(null);
              setFindFor(p);
            }}
            onSendToClerk={(id) => {
              setTarget(null);
              setClerkTrack(id);
            }}
          />
          <CompareSheet
            open={!!compare}
            onClose={() => setCompare(null)}
            a={compare?.[0] ?? null}
            b={compare?.[1] ?? null}
            profile={active}
            data={data}
          />
          <FindNearbySheet
            open={!!findFor}
            onClose={() => setFindFor(null)}
            product={findFor}
            data={data}
          />
          <ClerkSheet
            open={clerkTrack !== null}
            onClose={() => setClerkTrack(null)}
            trackId={clerkTrack}
            requestCrop={(id) =>
              socketRef.current
                ? socketRef.current.requestCrop(id)
                : Promise.reject(new Error("Not connected"))
            }
          />
          <BarcodeScanner
            open={scanning}
            onClose={() => setScanning(false)}
            data={data}
            onProduct={(p) => {
              setScanning(false);
              openProduct(p);
            }}
          />
        </>
      )}
    </div>
  );
}
