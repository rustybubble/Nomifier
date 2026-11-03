// "I need…" capsule chips over the camera. Single-select; tap the selected chip to clear.
import "./ar.css";

export const FILTER_LABELS: Array<{ id: string; label: string }> = [
  { id: "pain", label: "Pain" },
  { id: "allergy", label: "Allergy" },
  { id: "sleep", label: "Sleep" },
  { id: "cough", label: "Cough & cold" },
  { id: "stomach", label: "Stomach" },
];

export const USE_FILTERS: Record<string, string[]> = {
  pain: ["pain", "fever"],
  allergy: ["allergy"],
  sleep: ["sleep"],
  cough: ["cough", "congestion"],
  stomach: ["stomach", "heartburn", "digestive", "diarrhea", "nausea"],
};

export interface FilterChipsProps {
  value: string | null;
  onChange: (id: string | null) => void;
}

export default function FilterChips({ value, onChange }: FilterChipsProps) {
  return (
    <div className="ar-chips" role="group" aria-label="I need relief for">
      {FILTER_LABELS.map(({ id, label }) => {
        const on = value === id;
        return (
          <button
            key={id}
            type="button"
            className={on ? "ar-chip ar-chip-on" : "ar-chip"}
            aria-pressed={on}
            onClick={() => onChange(on ? null : id)}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
