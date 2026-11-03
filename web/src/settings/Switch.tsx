/** iOS-style switch row. The whole row toggles; the button carries role="switch". */
export default function Switch({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="row chrome">
      <div className="row-main">
        <b style={{ fontWeight: 400 }}>{label}</b>
        {hint && <span>{hint}</span>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className="switch"
        onClick={() => onChange(!checked)}
      />
    </div>
  );
}
