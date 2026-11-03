import type { Product, ScoreResult } from "../types";

const synth = () =>
  typeof window !== "undefined" && "speechSynthesis" in window
    ? window.speechSynthesis
    : null;

export const canSpeak = () => synth() !== null;

/** Must be called from a tap handler (iOS). Returns false if speech is unavailable. */
export function speak(text: string, onEnd?: () => void): boolean {
  const s = synth();
  if (!s) return false;
  s.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.95;
  u.lang = "en-US";
  u.onend = u.onerror = () => onEnd?.();
  s.speak(u);
  return true;
}

export function stop(): void {
  synth()?.cancel();
}

const VERDICT = {
  green: "Good choice",
  yellow: "Use with caution",
  red: "Avoid",
};

export function buildSpeech(
  product: Product,
  result: ScoreResult,
  profileText: string,
): string {
  if (result.status !== "scored")
    return `${product.brand_name}. Not rated yet. Ask your pharmacist.`;
  const risks = result.explanation.map((e) => e.text.replace(/[.\s]+$/, ""));
  return [
    `${product.brand_name}. ${VERDICT[result.tier]}, score ${result.score}, for ${profileText}.`,
    ...risks.map((r) => `${r}.`),
  ].join(" ");
}
