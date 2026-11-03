# Nomifier demo rubric

**Demo values in Nomi's format, not Nomi's rubric. Not medical advice.** `model_version: "nomifier-demo-0"`,
`rubric_version: "demo-0"`, every product `review_status: "unreviewed"`.

## Constants (frozen in `contracts/api.md`)

| Constant | Value |
| --- | --- |
| `base_score` | 100 |
| `tier_bands` | green ≥ 75, yellow (orange on screen) ≥ 50, else red |
| `combine` | `max_plus_stacking`, 5 points per extra ingredient scoring on the same dimension |
| Severity → points | 1 → 8, 2 → 20, 3 → 40 (bands from Nomi `docs/scoring/dimensions.md`) |
| Explanation band | points < 15 `low`, < 35 `moderate`, else `high` → template `<dimension>_<band>` |

`scripts/score.py` is the reference implementation; `scripts/validate_data.py` enforces these constants.

## How points are chosen

- Each term row is one ingredient (active-moiety UNII), one dimension, one persona, optionally one condition **or**
  one medication type. Condition / medication rows add to the base row.
- A row exists only with a citation: an FDA label (DailyMed set id, section, short exact quote) or an ACB /
  STOPP/START criterion. No citation, no row.
- Hard stops only where a label says "do not use" for that persona or condition, or STOPP says avoid.
- `data/rated_ingredients.json` lists every ingredient reviewed, including ones with no rows, so the app can tell
  "reviewed, no concerns" from "never looked at" (unrated, never colored).

## Golden vectors (`data/golden.json`)

`{ndc11, profile: {persona, conditions, medication_types}, expected: {score, tier} | {status: "unrated"}, tables?, note?}`.
`tables: "nomi_sample"` scores against Nomi's own sample term table and product (`vendor/nomi/samples/`);
otherwise the repo's `data/` files are used. C4's engine must reproduce every vector exactly.

## Missing

_To be filled when the term tables are drafted: every value that couldn't be cited, so it was left out._
