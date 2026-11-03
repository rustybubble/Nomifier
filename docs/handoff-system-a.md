# Handoff: System A (Grok Bot + Cursor) work for a local session

You are picking up **System A's tasks** for Nomifier, a hackathon project (BDBI x SpaceXSI Grokathon, judged on
creative use of Cursor and Grok Bot). **Devpost submission is due by 10:20 pm.** A cloud session wrote the code; it
couldn't reach openFDA, DailyMed or a browser, so everything that needs those is yours.

Read first, in the repo: `Nomifier - 3-person implementation plan.md` (section 7 is System A's specs, A1–A9) and
`Nomifier - final writeup.md` (sections 3 and 5). The repo is `rustybubble/nomifier`.

## 1. Where things stand

| Task | PR | State |
| --- | --- | --- |
| A1 scaffold, Nomi vendoring, contract | rustybubble/Nomifier#1 | Done, checks pass. **Merge first.** |
| A4 Bot API + privacy test | rustybubble/Nomifier#2 | Done; 38 tests pass; tested only against a fake webhook |
| A8 shared skill + `bots/routines.md` (+ this file) | rustybubble/Nomifier#3 | Done |
| A2 `scripts/add_product.py` | rustybubble/Nomifier#4 | Code + offline tests pass; **never run on a real box** |
| A3 `score.py`, `validate_data.py`, golden vectors | rustybubble/Nomifier#5 | Code done; **cited data files not drafted** |
| A5–A7 the three Grok Bots | — | **Not started** (needs Chrome) |
| A9 README receipts + Devpost | — | Not started (scheduled 9:35) |

#2–#5 are stacked on #1's branch `a1-scaffold`. Merge #1 with "delete branch" and GitHub retargets the rest to `main`.
Ask the user before merging anything; they review merges.

```bash
git fetch origin && git checkout main && git pull
uv sync && uv run pytest
```

## 2. Do these, in order

### 2a. A2: run the resolver on real products

```bash
uv run python scripts/add_product.py <UPC from the box> --save-fixture scripts/fixtures/<name>
uv run pytest scripts
```

- The SPL XML parsing (`parse_spl`) follows DailyMed's HL7 v3 structure but has **never seen a live label**. If the
  first run fails there, inspect the cached XML in `.cache/add_product/` and fix the XPaths.
- Commit one recorded fixture folder so `test_replay_real_responses` stops skipping.
- Then run it on every product in the team's bag and check the demo beats in the final writeup §5 (red, green with
  the same use, orange, look-alike pair, duplicate ingredient, a bottle, one unknown kept OUT of the catalog). Post
  the NDC11 + ingredient list for the team; B needs it for the catalog.

### 2b. A3: draft the cited knowledge data

Follow plan §7 A3 exactly. The files: `data/term_tables.json`, `data/rated_ingredients.json`,
`data/templates.json`, `data/questions.json`, 12 real-product vectors appended to `data/golden.json`, and the
"missing" list in `docs/rubric-demo.md`.

- **Never invent a value.** Every term row cites an FDA label (DailyMed set id, section, short **exact** quote) or an
  ACB / STOPP criterion. No citation means no row; list it under "missing".
- Citation ids must match `^cit_[a-z0-9_]+$` (Nomi's schema).
- Ingredient keys are **active-moiety UNIIs** (what `add_product.py` writes).
- Frozen constants: base 100, bands 75/50, `max_plus_stacking` 5, severity 1/2/3 → 8/20/40.
- Check with `uv run python scripts/validate_data.py --review`, then the user opens each DailyMed link and confirms
  every quote word for word. That review is the step that makes "every number is cited" true.

### 2c. A5–A8: set up the Grok Bots in Chrome (Claude in Chrome)

Use the Claude in Chrome extension; Grok Bot is a web app. Each Bot's instruction text is in plan §7 (A5, A6, A7),
verbatim. The request/callback shapes are in `bots/routines.md`; the server side is `server/bots.py`.

**Get from the user before starting:**
- **B's URL**, `https://<B>.<tailnet>.ts.net` (B runs `tailscale serve --bg 8000`). It's `PUBLIC_BASE_URL`.
- Permission to generate a **`BOT_TOKEN`**: `uv run python -c "import secrets; print(secrets.token_urlsafe(32))"`.
  It goes into each Bot as a secret and into B's `.env`. Give it to the user to pass to B privately; **never commit
  it** or paste it in a PR.

**For each Bot:**
1. Create it with its instruction, and attach the shared skill (`bots/skills/cite-never-score.md`) to all three.
2. **Aisle Finder:** teach the search-to-cart task once on a pharmacy site that works from the venue network and save
   it as the skill "Aisle Finder lookup". Add a webhook routine plus the **"Ask first"** rule on checkout and payment.
   **Stop at the cart.** Never check out or pay; that stays with the user.
3. **Coverage Clerk:** add a webhook routine, GitHub access to `rustybubble/nomifier` **only**, and approval before
   pushing. It must never open issues or PRs on `gt-big-data/nomi`.
4. **Label Watch:** add a schedule routine, Mondays 9:00 AM ET, then one **Test** run. It must never fake a recall.
5. Record each webhook's URL and key for B's `.env`: `AISLE_FINDER_WEBHOOK_URL/KEY`,
   `COVERAGE_CLERK_WEBHOOK_URL/KEY`. Hand them to the user for B (they're secrets too).
6. Save screenshots to `bots/screenshots/` (routines, the taught task, an Aisle Finder run with the approval, the
   Coverage Clerk PR, the Label Watch Page). A9's README needs them as receipts.

**Pre-flight (plan §12):** from a Bot, `curl <PUBLIC_BASE_URL>/api/health` must return `{"ok":true}`. If it can't
(Bots run in xAI's cloud), B turns on `tailscale funnel --bg 8000` and you recheck.

**Done-when checks (plan §7):**
- A5: `POST /api/find` on B ends with the record `done` and a cart waiting.
- A6: a crop of the bagged unknown product, sent through `/api/unknown`, produces a real PR whose validator passes,
  and the record shows `pr_url`.
- A7: the Page exists, and a PR with `data/label_status.json` is merged.

### 2d. A9 at 9:35: README receipts + Devpost

Follow plan §7 A9. Merged PRs: `gh pr list --state merged --json number,title,author`. Note: this repo's `gh` may
need the REST form (`gh api repos/rustybubble/nomifier/pulls?state=closed`).

## 3. Rules that bite

- **Privacy:** Bots and the server only ever see an NDC11, ingredients, a crop URL, a ZIP or a decision. Never a
  persona, condition or medication. `server/tests/test_privacy.py` fails the build otherwise, and it also scans
  C's `web/src/api.ts` for those words, even in comments.
- `/api/find` returns 404 until `data/products.json` has the product (2a first).
- Aisle Finder's callback may send `ndc11` or `ndc11_if_shown`; the server accepts both.
- Golden vectors with `"tables": "nomi_sample"` score against Nomi's sample files. C4's engine must handle that key.
- `contracts/api.md` is frozen; changing it needs A, B and C to agree.
- Branch per task, small PRs into `main`. Count PRs for the README.
- Cut order if behind (plan §11): A7 Label Watch goes before A5/A6. Aisle Finder approval is in the "never cut" list.
