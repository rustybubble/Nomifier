// Beep (+ vibrate where supported) when a red-scored box crosses the screen center.
import { useMemo, useRef } from "react";
import type { Track } from "../types";
import { COLORS, type ScreenTrack, type TrackStyle } from "../scan/overlay";

const COOLDOWN_MS = 3000;

export function useRedCenterAlert({
  enabled,
  sound = true,
}: {
  enabled: boolean;
  sound?: boolean;
}) {
  const cfg = useRef({ enabled, sound });
  cfg.current = { enabled, sound };
  const audio = useRef<AudioContext | null>(null);
  const last = useRef<{ id: number; at: number } | null>(null);

  return useMemo(() => {
    const beep = () => {
      const ac = audio.current;
      if (!ac || ac.state !== "running") return;
      const t = ac.currentTime;
      for (const [i, f] of [880, 660].entries()) {
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t + i * 0.14);
        g.gain.exponentialRampToValueAtTime(0.25, t + i * 0.14 + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.14 + 0.12);
        o.connect(g).connect(ac.destination);
        o.start(t + i * 0.14);
        o.stop(t + i * 0.14 + 0.13);
      }
    };
    return {
      /** Call from the first user tap (iOS needs a gesture). */
      unlock(): void {
        audio.current ??= new AudioContext();
        void audio.current.resume();
      },
      check(
        displayed: ReadonlyArray<ScreenTrack>,
        styleFor: (t: Track) => TrackStyle,
        viewW: number,
        viewH: number,
      ): { trackId: number } | null {
        if (!cfg.current.enabled) return null;
        const cx = viewW / 2;
        const cy = viewH / 2;
        const hit = displayed.find(({ track, screenBox: b }) => {
          return (
            b[0] <= cx && cx <= b[2] && b[1] <= cy && cy <= b[3] &&
            styleFor(track).color === COLORS.red
          );
        });
        if (!hit) return null;
        const id = hit.track.id;
        const now = performance.now();
        if (last.current?.id === id && now - last.current.at < COOLDOWN_MS)
          return null;
        last.current = { id, at: now };
        if (cfg.current.sound) beep();
        navigator.vibrate?.(60);
        return { trackId: id };
      },
    };
  }, []);
}
