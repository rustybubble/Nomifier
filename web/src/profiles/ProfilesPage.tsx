import { useState } from "react";
import Page from "../shell/Page";
import Sheet from "../shell/Sheet";
import Switch from "../settings/Switch";
import { useSettings } from "../settings/store";
import { describeProfile, useProfiles } from "./store";
import { PROFILE_SCOPE } from "../types";
import type { Condition, MedicationType, Persona, UserProfile } from "../types";
import "../cabinet/lists.css";

const PERSONA_LABEL: Record<string, string> = {
  adult_18_64: "Adult 18-64",
  adult_65_plus: "65+",
};
const COND_LABEL: Record<string, string> = {
  hypertension: "High blood pressure",
  kidney_disease: "Kidney disease",
  glaucoma: "Glaucoma",
  enlarged_prostate: "Enlarged prostate",
};
const MED_LABEL: Record<string, string> = { anticoagulants: "Blood thinners" };

const blank = (): UserProfile => ({
  id: `p${Date.now().toString(36)}`,
  name: "",
  persona: "adult_18_64",
  conditions: [],
  medication_types: [],
});

const toggle = <T,>(xs: T[], x: T, on: boolean) =>
  on ? [...xs, x] : xs.filter((y) => y !== x);

export default function ProfilesPage() {
  const { profiles, active, setActive, upsert, remove } = useProfiles();
  const settings = useSettings();
  const [draft, setDraft] = useState<UserProfile | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const isNew = draft !== null && !profiles.some((p) => p.id === draft.id);
  const close = () => {
    setDraft(null);
    setConfirmDel(false);
  };

  return (
    <Page title="Profiles">
      <ul className="grp">
        {profiles.map((p) => (
          <li key={p.id}>
            <div className="row">
              <button
                type="button"
                className="row-main"
                style={{ textAlign: "left", minHeight: 40 }}
                aria-pressed={p.id === active.id}
                onClick={() => setActive(p.id)}
              >
                <b>
                  {p.id === active.id && (
                    <span style={{ color: "var(--tint)" }}>{"✓"} </span>
                  )}
                  {p.name}
                </b>
                <span>{describeProfile(p)}</span>
              </button>
              <button
                type="button"
                className="row-link"
                aria-label={`Edit ${p.name}`}
                onClick={() => setDraft({ ...p })}
              >
                Edit
              </button>
            </div>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="btn-tint"
        style={{ width: "100%", marginBottom: 12 }}
        onClick={() => setDraft(blank())}
      >
        Add profile
      </button>
      <p className="grp-note" style={{ margin: "0 16px 24px" }}>
        Profiles stay on this phone. They are never sent to our server or the
        Bots.
      </p>

      <h3 className="grp-title">Settings</h3>
      <ul className="grp">
        <li>
          <Switch
            label="Large text"
            checked={settings.largeText}
            onChange={(v) => settings.set("largeText", v)}
          />
        </li>
        <li>
          <Switch
            label="Show CV HUD"
            checked={settings.showHud}
            onChange={(v) => settings.set("showHud", v)}
          />
        </li>
        <li>
          <Switch
            label="Sounds"
            checked={settings.sound}
            onChange={(v) => settings.set("sound", v)}
          />
        </li>
      </ul>

      <Sheet
        open={draft !== null}
        onClose={close}
        detent="full"
        title={isNew ? "New profile" : "Edit profile"}
      >
        {draft && (
          <div className="editor">
            <input
              className="field selectable"
              aria-label="Name"
              placeholder="Name"
              value={draft.name}
              maxLength={30}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
            <div
              className="seg chrome"
              role="radiogroup"
              aria-label="Age group"
            >
              {PROFILE_SCOPE.personas.map((p: Persona) => (
                <button
                  key={p}
                  type="button"
                  role="radio"
                  aria-checked={draft.persona === p}
                  onClick={() => setDraft({ ...draft, persona: p })}
                >
                  {PERSONA_LABEL[p] ?? p}
                </button>
              ))}
            </div>
            <h3 className="grp-title">Conditions</h3>
            <ul className="grp">
              {PROFILE_SCOPE.conditions.map((c: Condition) => (
                <li key={c}>
                  <Switch
                    label={COND_LABEL[c] ?? c}
                    checked={draft.conditions.includes(c)}
                    onChange={(on) =>
                      setDraft({
                        ...draft,
                        conditions: toggle(draft.conditions, c, on),
                      })
                    }
                  />
                </li>
              ))}
            </ul>
            <h3 className="grp-title">Medications</h3>
            <ul className="grp">
              {PROFILE_SCOPE.medication_types.map((m: MedicationType) => (
                <li key={m}>
                  <Switch
                    label={MED_LABEL[m] ?? m}
                    checked={draft.medication_types.includes(m)}
                    onChange={(on) =>
                      setDraft({
                        ...draft,
                        medication_types: toggle(draft.medication_types, m, on),
                      })
                    }
                  />
                </li>
              ))}
            </ul>
            <div className="btn-row">
              <button type="button" className="btn-ghost" onClick={close}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-tint"
                disabled={!draft.name.trim()}
                onClick={() => {
                  upsert({ ...draft, name: draft.name.trim() });
                  close();
                }}
              >
                Save
              </button>
            </div>
            {!isNew &&
              profiles.length > 1 &&
              (confirmDel ? (
                <div className="confirm">
                  <span>Delete {draft.name}?</span>
                  <button
                    type="button"
                    className="row-link"
                    onClick={() => setConfirmDel(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="row-link danger"
                    onClick={() => {
                      remove(draft.id);
                      close();
                    }}
                  >
                    Delete
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="row-link danger"
                  style={{ width: "100%" }}
                  onClick={() => setConfirmDel(true)}
                >
                  Delete profile
                </button>
              ))}
          </div>
        )}
      </Sheet>
    </Page>
  );
}
