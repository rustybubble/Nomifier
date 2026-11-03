# Nomifier: 3-person implementation plan

_Companion to `Nomifier - final writeup.md` (the final plan). **Submit by 10:20 pm** (Devpost closes 10:30). Judges visit tables before the closing ceremony._

The split is by **machine**. Every task below is computer work with a written spec, a list of files it produces, and a "Done when" check that can fail. Each spec is written so it can be pasted straight into a coding agent (Cursor on System A, the agent of your choice on B and C).

---

## 1. Machines and owners

| System         | What it has                                       | Owner role                                  | Owns                                                                                                                                                |
| -------------- | ------------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A: Crew**    | **Grok Bot + Cursor** installed                   | Cursor cloud-agent dispatcher + Bot builder | Repo scaffold, product resolver, demo knowledge data (term tables etc.), Bot API, all 3 Grok Bots + shared skill, README receipts, Devpost          |
| **B: Compute** | **The most compute** (GPU: CUDA or Apple Silicon) | Vision + server host                        | Recognition server (`/ws/scan`), catalog, identification, eval/tuning, crops, **hosts the production FastAPI app + Tailscale**, concept reel render |
| **C: General** | This laptop (Claude Code)                         | App builder                                 | The iPhone-style **PWA**: shell, camera, AR overlay, scoring engine, every user-facing feature, mock server, front-end tests                        |

**Why this split:** Cursor cloud agents are A's force multiplier, so A launches agents on well-specified backend chunks (scaffold, resolver, Bot API, data drafting) and spends its own time teaching the Grok Bots. B runs everything that needs the GPU, and since the phone talks to B's GPU anyway, B also serves the production app. C has the biggest code surface (the app) and nothing blocking it, thanks to a mock server.

---

## 2. Before kickoff (setup, ~20 min, at home)

- [ ] **All three laptops + the team iPhones:** install Tailscale, join one tailnet. In the admin console: enable **MagicDNS** and **HTTPS certificates**, and allow **Funnel** for System B (needed for judges' phones and Grok Bot callbacks).
- [ ] **B:** Python 3.12, `uv`, CUDA/MPS working PyTorch, `ultralytics`, `transformers`, `opencv-python`; pre-download the YOLOE and DINOv2 weights (venue Wi-Fi is slow).
- [ ] **C:** Node 22 + pnpm.
- [ ] **A:** Grok Bot signed in, Cursor signed in with cloud agents enabled, GitHub CLI authenticated.
- [ ] **Products:** collect the team's boxes and bottles into one bag. Shoot the **Publix concept-reel video** (rules in §10). Message the Nomi leads (A).

---

## 3. Working rules

- One repo, **`nomifier`** (ours). From Nomi, copy **only** what's listed in A1, with credit and the leads' OK. **Never** open PRs or issues on `gt-big-data/nomi`.
- Branch per task (`a2-resolver`, `c4-scoring`…), small PRs into `main`, merge `main` into your branch before each PR. A's Cursor agents open their own PRs; A reviews and merges. **Count PRs for the README.**
- `contracts/api.md` is **frozen at 7:10**. Changing it needs all three to agree.
- Secrets (`BOT_TOKEN`, webhook keys) live in `.env` on B only; `.env.example` is committed.
- **Privacy rule (enforced by a test in A4):** no request, WebSocket message, Bot payload or log line may contain persona, condition or medication-type keys or values from Nomi's enums.

---

## 4. Repo layout

```
nomifier/
  contracts/api.md                         # A1, frozen 7:10
  vendor/nomi/                             # A1 (credited in vendor/nomi/CREDITS.md)
    schemas/*.json  ts/*.ts  samples/*.json
    barcode.ts  barcode.py  barcodes.json
  server/main.py                           # A1 skeleton; B mounts /ws/scan; A4 adds routers
  server/bots.py  server/db.py  server/tests/   # A4
  vision/realtime.py  vision/identify.py  vision/catalog.py
  vision/eval.py  vision/bench.py  vision/render_reel.py   # B
  data/products.json                       # A2
  data/term_tables.json  data/rated_ingredients.json  data/templates.json
  data/questions.json  data/golden.json    # A3
  data/label_status.json                   # A7 (Label Watch PRs)
  data/catalog/<ndc11>/*.jpg               # B3 (gitignored)
  data/catalog/families.json  data/catalog/index.npz   # B3/B5
  scripts/add_product.py  scripts/score.py  scripts/validate_data.py   # A2/A3
  web/                                     # C (Vite + React + TS PWA)
  tools/mock_ws.py                         # C2
  bots/skills/*.md  bots/routines.md  bots/screenshots/   # A5–A8
  docs/demo.md  docs/rubric-demo.md        # A
  README.md                                # A9
```

---

## 5. Frozen contract (`contracts/api.md`, agreed by 7:10)

```jsonc
// ---------- WebSocket /ws/scan (B serves, C consumes) ----------
// phone → server: a JSON text message, then one binary message (the 640px-wide JPEG)
{ "type":"frame", "frame_id":42, "w":640, "h":480, "ts":1730594400123 }

// server → phone, after processing that frame. The phone sends its next frame only after this arrives.
{ "type":"tracks", "frame_id":42, "proc_ms":38, "fps":11.8, "dropped":0,
  "tracks":[ { "id":7, "box":[x1,y1,x2,y2],            // pixels in that frame
               "status":"named|family|unknown|pending",
               "product_id":"50580044902"|null,        // ndc11
               "family":"tylenol-line"|null,
               "similarity":0.86, "source":"vision|barcode", "age":14 } ] }

// phone → server: barcode lock (C6). Server sets that track to named/barcode and never overrides it.
{ "type":"pin", "track_id":7, "product_id":"50580044902" }

// phone → server: best crop of a track (for Coverage Clerk)
{ "type":"crop_request", "track_id":12 }
// server → phone
{ "type":"crop", "track_id":12, "crop_url":"/media/c_12_1730594400.jpg" }

// ---------- REST (A4 writes, runs on B) ----------
// GET  /api/health                                    → {"ok":true}
// GET  /api/vision/health                             → {"device","detector","embedder","catalog_size","fps"}   (B6)
// POST /api/find     {"ndc11":"…","zip":"30332"}       → {"find_id":"f_1"}     forwards to Aisle Finder webhook
// POST /api/unknown  {"crop_url":"/media/…"}          → {"job_id":"u_1"}      forwards to Coverage Clerk webhook
// GET  /api/finds/{id}, /api/unknowns/{id}            → current record (phone polls every 2 s)
// Bot callbacks (header Authorization: Bearer BOT_TOKEN):
//   POST /api/finds/{id}    {"options":[{"store","product","ndc11","price","in_stock","link"}],"cart":"pending","evidence_url"}
//   POST /api/unknowns/{id} {"pr_url","product":{…},"validated":true,"dailymed_setid"} | {"status":"not_identified","reason"}
// POST /api/approvals/{id} {"decision":"approve|reject"}  → forwarded to the Bot's routine as a follow-up message

// ---------- Static files the PWA loads (served from /data, precached by the service worker) ----------
// products.json          Nomi Product[]                    (A2)
// term_tables.json       Nomi TermTables                   (A3)
// rated_ingredients.json [{"unii","name"}]                 (A3)
// templates.json         {"<dimension>_<low|moderate|high>": "text with {ingredient}"}   (A3)
// questions.json         {"<dimension>": ["question with {ingredient}", …]}            (A3)
// label_status.json      {"<ndc11>": {"status":"ok|label_updated|recall","url","checked_at"}}   (A7)
// catalog/families.json  {"<family>": ["<ndc11>", …]}      (B5)
```

**Colors (C draws):** tier `green` #16A34A ✓ · tier `yellow` **orange #F97316 !** · tier `red` #DC2626 ✕ · `family` gray dashed · `unknown` thin gray · `unrated` thin gray "Not rated yet" · `pending` nothing. 4 px rounded outlines, score badge top-left.

**Scoring constants (A3 writes, C4 reads from the file, never hard-codes):** base 100, `tier_bands` green ≥ 75 / yellow ≥ 50, `combine` `max_plus_stacking` 5, severity 1/2/3 → 8/20/40 points.

**Profile scope (the picker offers only these):** personas `adult_18_64`, `adult_65_plus`; conditions `hypertension`, `kidney_disease`, `glaucoma`, `enlarged_prostate`; medication type `anticoagulants`.

---

## 6. Timeline

| Time                                 | A: Crew (Grok + Cursor)                                                         | B: Compute (GPU)                                             | C: General (PWA)                                                           |
| ------------------------------------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------- |
| **6:45–7:15** kickoff                | A1 scaffold (Cursor agent); launch A2 agent; message leads                      | B1 detector bake-off on our real products                    | C1 PWA shell; C2 mock server                                               |
| **7:15–8:15** M1: boxes on the phone | Run A2 on every product (triage); launch A3 + A4 agents; start A5 Aisle Finder  | B2 live `/ws/scan` + Tailscale serve; record a session for C | C3 camera + overlay (mock, then B's real server); C4 scoring engine starts |
| **8:15–9:00** M2: names and colors   | Review A3 data (every quote); merge A4; A5 teach + webhook                      | B3 catalog capture + index; B4 identification                | C4 done (golden vectors); C5 detail sheet + states; C6 barcode lock        |
| **9:00–9:35** M3: features + Bots    | A6 Coverage Clerk; A7 Label Watch; A8 skill                                     | B5 eval + tuning + families; B6 crops + health               | C7 arrow / crown / filter; C8 cabinet / compare; C9 Bot UIs                |
| **9:35** freeze                      | Full demo ×3; A records the backup video (iPhone screen recording + Bot screen) | Production build served from B; Funnel on; B8 concept reel   | C10 accessibility / HUD / questions (polish only after freeze)             |
| **9:35–10:20**                       | A9 README receipts, Devpost. **Submit by 10:20**                                | Latency/accuracy numbers to A                                | UI polish, bug fixes from demo runs                                        |

**Hand-offs (the critical path):**

- A1 repo → everyone (7:05).
- A2 `products.json` (NDC11s) → B3 catalog folders and C4/C5 (7:45).
- B2 recorded session `tools/sessions/*.jsonl` → C3 replays real tracks (7:45).
- A3 `term_tables.json` + `golden.json` → C4 (8:30; C uses Nomi's sample table until then).
- A4 Bot API → C9 (8:15).
- B4 named tracks → C sees real colors (8:45).

---

## 7. Task specs: System A (Crew: Grok + Cursor)

### A1. Repo scaffold, vendoring, contract (Cursor agent, 6:45–7:05)

```
Create the nomifier repo (layout in section 4 of the plan; paste the layout and section 5 contract).
- Python: uv project, Python 3.12, deps fastapi, uvicorn[standard], httpx, pydantic, jsonschema, pytest,
  plus nomi-schema from git: "nomi-schema @ git+https://github.com/gt-big-data/nomi#subdirectory=packages/schema".
- server/main.py: FastAPI app. GET /api/health -> {"ok": true}. Static mounts: web/dist at / (html=True, so the PWA
  is served at the root), data/ at /data, media/ at /media (create dir). CORS middleware allowing origins from env
  CORS_ORIGINS (comma-separated; C's dev server URL). Placeholders: include_router(bots.router) and a comment where
  vision mounts /ws/scan.
- vendor/nomi/: copy from gt-big-data/nomi@aa8d723: packages/schema/schemas/*.json -> schemas/,
  packages/schema/generated/ts/*.ts -> ts/, packages/schema/fixtures/schema-samples/valid/*.json -> samples/,
  apps/mobile/src/lib/barcode.ts, pipeline/src/nomi_pipeline/identity/barcode.py, packages/schema/fixtures/barcodes.json.
  Write vendor/nomi/CREDITS.md naming the Nomi team (BDBI) and the source commit; note the repo has no license and we
  copied with the leads' permission.
- contracts/api.md: paste section 5 verbatim.
- .env.example: BOT_TOKEN, AISLE_FINDER_WEBHOOK_URL, AISLE_FINDER_WEBHOOK_KEY, COVERAGE_CLERK_WEBHOOK_URL,
  COVERAGE_CLERK_WEBHOOK_KEY, PUBLIC_BASE_URL, CORS_ORIGINS. .gitignore: .env, data/catalog/**/*.jpg, media/, *.npz.
- README "Run it" stub: uv sync; uv run uvicorn server.main:app --host 127.0.0.1 --port 8000;
  tailscale serve --bg 8000; open https://<machine>.<tailnet>.ts.net on the iPhone.
Done when: `uv run uvicorn server.main:app` starts, `curl localhost:8000/api/health` returns ok, and
`uv run python -c "from nomi_schema.validate import validate"` succeeds.
```

### A2. Product resolver `scripts/add_product.py` (Cursor agent 7:05–7:40, then A runs it)

```
Write scripts/add_product.py. Use vendor/nomi/barcode.py (Nomi's parser; candidates per its fixtures) and
`from nomi_schema.validate import validate`.
Input modes: positional UPC-A; --ndc <ndc with or without hyphens>; --brand "<name>" (list openFDA matches, I pick).
Resolution:
1. UPC -> 3 NDC11 candidates. For each candidate, rebuild the hyphenated package NDC for its split
   (4-4-2 / 5-3-2 / 5-4-1) and query https://api.fda.gov/drug/ndc.json?search=packaging.package_ndc:"<hyphenated>".
   The candidate that returns a result wins. If none: print "not an NDC barcode" and exit 2.
2. From openFDA: brand_name, generic_name, labeler_name, dosage_form, marketing_category (map to Nomi's enum in
   vendor/nomi/schemas/product.schema.json; unknown -> "other"), openfda.spl_set_id[0].
3. From DailyMed: spl_version from https://dailymed.nlm.nih.gov/dailymed/services/v2/spls/<setid>/history.json
   (latest), and the SPL XML (/services/v2/spls/<setid>.xml) for each ACTIVE ingredient: label name, strength
   numerator value + unit (and denominator as per_amount/per_unit for liquids), and the ACTIVE MOIETY UNII
   (codeSystem 2.16.840.1.113883.4.9 under activeMoiety). Inspect one real SPL first to confirm the XML paths.
4. Suggest uses (lowercase snake_case, e.g. pain, fever, allergy, sleep, cough, congestion, heartburn) and
   otc_category from the label's Purpose/Uses sections; ask me to confirm or edit. scope "in_scope",
   review_status "unreviewed".
5. validate("product", p). Upsert into data/products.json by ndc11 (sorted, pretty-printed). mkdir
   data/catalog/<ndc11>/. Print brand, ndc11, each ingredient + UNII, and whether each UNII is in
   data/rated_ingredients.json (if that file exists).
Network calls: 10 s timeout, one retry, clear error messages. Cache raw responses under .cache/ (gitignored).
Add scripts/test_add_product.py: offline test using one saved openFDA response + one saved SPL XML fixture.
Done when: 3 real boxes resolve from their barcodes, validate, and the offline test passes.
```

**Then A runs it on every product (assortment triage, ~15 min).** Check the beats in the final plan §5 (red, green with the same use, orange, look-alike pair, duplicate ingredient, a bottle, one unknown kept out). Post the list of NDC11s + ingredients in the team chat; hand the products to B for B3. Anything missing: note it and buy it if someone can run out, otherwise adjust the demo script.

### A3. Demo knowledge data (Cursor agent drafts 7:20–8:20, A reviews 8:20–8:50)

```
Create Nomifier's knowledge files. DO NOT invent facts: every value needs a citation you can show me; if you can't
cite it, leave it out and list it under "missing" in docs/rubric-demo.md.
Ingredients: <paste the triage list of ingredient names + active-moiety UNIIs from A2>.
1) data/term_tables.json in Nomi's term-tables schema (vendor/nomi/schemas/term-tables.schema.json; sample in
   vendor/nomi/samples/term-tables.json). model_version "nomifier-demo-0", rubric_version "demo-0", base_score 100,
   tier_bands {green_min:75, yellow_min:50}, combine {method:"max_plus_stacking", stacking_points:5}.
   Personas adult_18_64 and adult_65_plus; modifier rows for hypertension, kidney_disease, glaucoma,
   enlarged_prostate, anticoagulants. Severity -> points: 1 -> 8, 2 -> 20, 3 -> 40 (Nomi docs/scoring/dimensions.md
   bands). Citations: fda_label with the DailyMed set id of a product containing that ingredient, the section name,
   and a SHORT EXACT quote; or acb / stopp_start with the criterion. Hard stops only where a label says "do not use"
   for that persona/condition, or STOPP says avoid (e.g. first-generation sedating antihistamines in 65+).
2) data/rated_ingredients.json: [{unii, name}] for EVERY ingredient you reviewed, including ones with no rows.
3) data/templates.json: "<dimension>_<low|moderate|high>" -> one plain sentence with {ingredient}, for each dimension
   used. data/questions.json: "<dimension>" -> 1-2 "ask your pharmacist" questions with {ingredient}.
4) scripts/score.py: a Python twin of Nomi's scoring function (docs/system-design.md section 6.2): per dimension,
   collect each ingredient's persona row plus matching condition/medication_type rows, combine per the file,
   score = clamp(base - points), tier from bands, hard stops force red, any active ingredient not in
   rated_ingredients -> {"status":"unrated"}. Lookups and arithmetic only.
5) data/golden.json: 12 vectors {ndc11, profile, expected:{score, tier} | {status:"unrated"}} covering every tier,
   a hard stop, a stacking case, a condition modifier, a medication modifier and an unrated product, using real
   products from data/products.json. Also include Nomi's own sample (vendor/nomi/samples/) as a vector.
6) scripts/validate_data.py: validates term_tables against Nomi's schema, products against product schema, checks
   every citation_id exists, every UNII in term rows is in rated_ingredients, and runs score.py over golden.json.
7) docs/rubric-demo.md: the constants above, how points were chosen, and the "missing" list.
Print a review table: ingredient x profile -> points by dimension, with the quote behind each row.
Done when: validate_data.py passes and the review table is printed.
```

**A's review (not optional):** open each cited DailyMed label and confirm every quote. Fix or delete anything that doesn't match. This is the step that makes "every number is cited" true.

### A4. Bot API + privacy test (Cursor agent 7:20–8:10)

```
Implement server/bots.py (APIRouter) and server/db.py (sqlite3, file data/nomifier.db) per contracts/api.md.
- POST /api/find {ndc11, zip}: validate ndc11 (^[0-9]{11}$) and zip (^[0-9]{5}$); look up the product in
  data/products.json (404 if missing); create a find record; POST to AISLE_FINDER_WEBHOOK_URL with header
  Authorization: Bearer AISLE_FINDER_WEBHOOK_KEY and body {find_id, ndc11, brand_name, ingredients:[{name,strength,unit}],
  zip, callback_url: PUBLIC_BASE_URL + "/api/finds/" + id}. Return {find_id}.
- POST /api/unknown {crop_url}: crop_url must start with /media/ and the file must exist; create a job; POST to
  COVERAGE_CLERK_WEBHOOK_URL with {job_id, crop_url: PUBLIC_BASE_URL + crop_url, repo: "<owner>/nomifier",
  callback_url}. Return {job_id}.
- Callback endpoints require Authorization: Bearer BOT_TOKEN (constant-time compare, 401 otherwise); store the body.
- GET endpoints return {id, status: "waiting|done|failed", result, created_at, updated_at}.
- POST /api/approvals/{id} {decision}: record it, and forward {find_id, decision} to the Aisle Finder webhook.
- Webhook forwarding: httpx with 10 s timeout; on failure mark the record failed with the error (no crash).
- Request bodies are pydantic models with extra="forbid".
- server/tests/test_bots.py: happy paths with the webhook mocked, 401 on bad token, 422 on bad ndc11/zip.
- server/tests/test_privacy.py: load the persona, condition and medication_type enums from
  vendor/nomi/schemas/common.schema.json. Fail if (a) any pydantic request model or webhook payload builder in server/
  has a field named persona/profile/condition(s)/medication(s), (b) any enum value appears as a string literal in
  server/bots.py, or (c) web/src/api.ts (C's single network module) contains any of those keys or values.
Done when: pytest passes, and a curl round trip (find -> fake Bot callback with token -> GET shows done) works.
```

### A5. Aisle Finder Bot (A, in Grok Bot, 7:45–8:50)

- **Create the Bot** with this instruction:
  > You are Aisle Finder for Nomifier. You only receive a product NDC11, its active ingredients and strengths, and a ZIP. You never receive or ask about anyone's health. Cite every price and stock claim with the page URL and the time you saw it. Never guess; if a site blocks you, say so. **Never place an order:** stop at the cart and ask for approval. Task: find the requested product **and any store brand with identical active ingredients and strengths** at pharmacies near the ZIP. Report the best 1–2 as JSON `{store, product, ndc11_if_shown, price, in_stock, link}`, add the best one to a pickup cart, then POST `{options, cart:"pending", evidence_url}` to `{callback_url}` with `Authorization: Bearer {BOT_TOKEN}` using curl. On a follow-up `{decision}`: on approve, tell me to finish checkout myself and confirm the cart is ready; on reject, empty the cart.
- **Teach a task:** demonstrate the search-to-cart flow once on a pharmacy site that works from the venue network. Save it as the skill "Aisle Finder lookup".
- **Webhook routine** that runs the skill with the request body; set the **"Ask first"** rule on any checkout or payment action.
- **Test:** `curl` the webhook with a real NDC11 from `products.json` and ZIP 30332; confirm the callback reaches B (§9 explains tailnet vs Funnel).
- **Done when:** a POST to `/api/find` on B ends with the record `done` and a cart waiting, with screenshots saved to `bots/screenshots/`.

### A6. Coverage Clerk Bot (A, in Grok Bot, 8:50–9:30)

- Instruction:
  > You are Coverage Clerk for Nomifier. When triggered with `{job_id, crop_url, repo, callback_url}`: download the crop, read the brand, product name and active ingredients, find the exact product on dailymed.nlm.nih.gov, and draft its `product.json` in Nomi's schema (clone `{repo}`; schema at `vendor/nomi/schemas/product.schema.json`) with the DailyMed set id and `review_status: "unreviewed"`. Run `uv run python scripts/validate_data.py` until it passes. Open a pull request on `{repo}` titled "Add <brand> (from live scan)" with the DailyMed link in the body. **Never merge. Never edit term tables or scores.** POST `{pr_url, product, validated, dailymed_setid}` to `callback_url` with the bearer token. If you can't identify the product with certainty, POST `{status:"not_identified", reason}` and stop.
- Webhook routine + GitHub access to `nomifier` only + approval before pushing.
- **Done when:** a crop of the bagged unknown product, sent through `/api/unknown`, produces a real PR whose CI/validator passes, and the record shows `pr_url`.

### A7. Label Watch Bot (A, in Grok Bot, 9:15–9:40)

- Instruction:
  > Every Monday 9:00 AM ET: for each product in `{repo}/data/products.json`, compare its `spl_version` with the latest on DailyMed and check FDA recall/enforcement notices. Build a **Page** "Nomifier label watch" listing product, current vs latest version, any recall, with links. Open a PR that updates `data/label_status.json` (`ok | label_updated | recall`, `url`, `checked_at`) and sets `review_status` back to `"unreviewed"` for changed products. Never edit scores. If nothing changed, say so on the Page.
- Schedule routine; run once now with **Test**.
- **Done when:** the Page exists and a PR with `label_status.json` is merged (C9 reads it). For the demo, if nothing has really changed, the Page says so. **Do not fake a recall.** F12 can be shown with a clearly labeled `?demo_label=1` toggle in the app instead.

### A8. Shared skill (A, 15 min, alongside A5)

`bots/skills/cite-never-score.md`: "Cite every fact with a URL and time. Report missing data as missing. Never produce or edit a score. Never send, buy, merge or push without approval. Never ask for or store health information." Attach it to all three Bots. Write `bots/routines.md` documenting each routine's trigger, payload and callback.

### A9. README receipts + Devpost (A, 9:35–10:20)

```
Write README.md and docs/demo.md for Nomifier.
README: what it is (built on BDBI's Nomi, credit the Nomi team), a GIF placeholder, how it works (YOLOE -> BoT-SORT
-> DINOv2 on new tracks -> on-phone scoring in Nomi's formats), the iPhone PWA + Tailscale setup, privacy guarantees
and the privacy test, the outline legend, accuracy and latency numbers from vision/README.md, "What we built that
Nomi can use" (scoring engine, product resolver, term-table seed), and "How we used Cursor + Grok Bot" with receipts:
- Cursor: merged PRs (gh pr list --state merged --json number,title,author), which cloud agent built which task.
- Grok Bot: screenshots from bots/screenshots/ (webhook routines, the taught task, an Aisle Finder run with the
  approval, the Coverage Clerk PR, the Label Watch Page).
docs/demo.md: the 3-minute script from the final writeup with who does what and the fallbacks.
Then produce the Devpost text from the writeup's blurb plus built-with tags.
```

---

## 8. Task specs: System B (Compute: GPU)

### B1. Detector bake-off (6:45–7:15)

```
Write vision/bench.py. Open the laptop webcam (or an mp4), run each candidate detector at imgsz 640 for 300 frames,
and print p50/p95 ms, fps, mean detections per frame, and save 5 annotated sample frames per candidate to bench_out/.
Candidates:
  a) YOLOE (latest Ultralytics YOLOE checkpoint, e.g. yoloe-26s-seg.pt; use boxes only) with
     set_classes(["medicine box", "pill bottle", "bottle", "box"])
  b) same with set_classes(["box", "bottle"])
  c) COCO detector (latest yolo26s.pt), classes bottle + book + cell phone, as a fallback baseline
Pick device automatically: cuda, else mps, else cpu.
Done when: a table of all candidates is printed, and I've looked at the samples with our real products (held in hand,
on the riser, bottles turned sideways).
```

**Decision at 7:15:** pick the candidate that boxes every product on the riser and in a hand with the fewest false boxes. Record it in `vision/README.md`.

### B2. Live recognition server `/ws/scan` (7:15–8:00)

```
Write vision/realtime.py and mount it in server/main.py as WebSocket /ws/scan, exactly per contracts/api.md.
- Load the detector chosen in B1 once at startup (env DETECTOR, PROMPTS, IMG_SIZE=640, CONF=0.25).
- Per connection: reset tracker state (one active phone at a time; a new connection resets tracks.
  Add a "# ponytail: single tracker per process, per-connection model if several phones" comment).
- Loop: receive the JSON header, then the binary JPEG; decode with cv2.imdecode; run
  model.track(frame, persist=True, tracker="botsort.yaml", imgsz=IMG_SIZE, conf=CONF, verbose=False).
  Use a botsort config with gmc_method sparseOptFlow and track_buffer 30 (copy Ultralytics' default yaml into
  vision/botsort.yaml).
- Reply with "tracks" for that frame_id: id, box (ints, frame pixels), status "pending" (B4 fills in identity),
  age (frames seen), plus proc_ms, rolling fps over the last 30 replies, and dropped.
- One frame in flight: if a frame arrives while one is processing, drop it and increment dropped. Never queue.
- RECORD=path env: append every reply as JSONL to tools/sessions/<timestamp>.jsonl (C replays these).
- Run with: uv run uvicorn server.main:app --host 127.0.0.1 --port 8000, then tailscale serve --bg 8000.
Also write tools/ws_client.py: sends an mp4 or webcam through /ws/scan and prints replies (for testing without C).
Done when: ws_client.py against https://<B>.<tailnet>.ts.net/ws/scan gets well-formed tracks at >= 8 fps on GPU
(>= 3 on CPU), track ids stay stable while a product moves in hand, and one recorded session is pushed for C.
```

### B3. Catalog capture + index (7:50–8:30)

```
Write vision/catalog.py with subcommands:
- capture --ndc <ndc11>: open the webcam, run the B1 detector each frame, draw the largest box. SPACE saves that
  crop (padded 10%) to data/catalog/<ndc11>/<n>.jpg; show the count; Q quits. Refuse unknown ndc11 (must be in
  data/products.json).
- from-video --video <mp4> --ndc <ndc11>: step through frames, draw boxes with cv2.selectROI, save crops (for the
  concept reel's Publix products).
- build: embed every catalog image with DINOv2 (HF facebook/dinov2-small, CLS token, L2-normalized; env
  EMBEDDER=small|base) in batches; save data/catalog/index.npz with embeddings, ndc11 labels and image paths.
  Print images per product and warn under 6.
Done when: every catalogued product has 8-12 crops (front, both sides, tilted, in hand, under the demo lamp;
bottles rotated in ~45 degree steps so every part of the label is covered) and index.npz builds.
```

**Capture rules:** don't catalog the bagged unknown product. Leave 2 crops per product out for B5 eval (`data/eval/<ndc11>/`).

### B4. Identification (8:00–8:50)

```
Write vision/identify.py and wire it into vision/realtime.py.
- Load data/catalog/index.npz and data/catalog/families.json at startup (reload on SIGHUP or a
  /api/vision/reload POST so B5 can retune without restarting).
- Per track keep: last K=5 embeddings, evaluation count, status, product_id, family, similarity, pinned flag,
  last_eval_frame.
- Each frame, choose tracks to embed: new tracks, tracks still pending/family/unknown, and named tracks every 30
  frames (re-check). Cap at 8 crops per frame (oldest-first). Batch them through DINOv2 in one forward pass.
- Similarity per product = max cosine between the track's mean embedding and that product's catalog embeddings.
  best, second = top two products.
  named   : best >= THRESH and best - second >= MARGIN on 2 consecutive evaluations
  family  : top-2 products are in the same family and the margin rule fails
  unknown : best < UNKNOWN_THRESH after 3 evaluations
  else    : pending
  Defaults THRESH 0.75, MARGIN 0.04, UNKNOWN_THRESH 0.55 (env vars; B5 tunes them).
- Pinned tracks ({"type":"pin"} from the phone): status named, source "barcode", similarity 1.0, never re-evaluated.
  Validate product_id exists in products.json; ignore otherwise.
- Keep proc_ms low: embedding runs in the same request but only on the chosen tracks.
Done when: on the riser, every catalogued product is named within ~1 s of appearing, look-alikes show family when
ambiguous, the bagged product ends up unknown, and fps stays >= 8 on GPU.
```

### B5. Eval, tuning, families (8:50–9:15)

```
Write vision/eval.py. For each image in data/eval/<ndc11>/ (held-out crops) plus any labeled full frames in
data/eval/frames/labels.json ([{image, ndc11, box}]), run identification without tracking (single evaluation).
Report per product: named-correct / family / unknown / wrong. Sweep THRESH 0.60-0.90 step 0.02 and MARGIN 0.00-0.08
step 0.01; print the setting with the most correct names and ZERO wrong confident names (a wrong name is worse than
family or unknown). Print the 10 most-confused product pairs with mean similarity; offer to add same-brand-line pairs
to data/catalog/families.json (I approve each), then rerun. Write the final table + chosen values to vision/README.md
and the env values to .env.example.
Done when: >= 90% of held-out crops named correctly, 0 wrong, families.json committed, values in vision/README.md.
```

### B6. Crops, health, robustness (9:00–9:35)

```
Harden the recognition server.
1) Best crop per track: keep the crop maximizing area x sharpness (variance of the Laplacian), padded 10%, upscaled so
   the short side is >= 512 px. On {"type":"crop_request"} save to media/c_<track>_<ts>.jpg and reply {"type":"crop"}.
2) GET /api/vision/health: device, detector + prompts, embedder, catalog size, current fps, dropped count, thresholds.
3) Robustness: malformed header or undecodable JPEG -> reply {"type":"error","frame_id",...} and keep the socket
   open; client disconnect resets tracks; frames larger than 2 MB rejected.
4) Log one line per second: fps, p95 proc_ms, tracks, dropped. No frame images written except requested crops.
Done when: the unknown product's crop is readable when opened from /media, killing and reopening the PWA recovers
within 2 s, and a garbage frame doesn't crash the socket.
```

### B7. Host the app + Tailscale (ongoing; final setup by 9:35)

- **Dev phase:** B runs `uvicorn` on `127.0.0.1:8000` and `tailscale serve --bg 8000`. The URL `https://<B>.<tailnet>.ts.net` is what C's dev build and the team iPhones use. Put C's dev origin in `CORS_ORIGINS`.
- **Production (9:35):** `git pull`, C's `pnpm --dir web build` output lands in `web/dist`; B serves it at `/`. One origin for app, API, WebSocket and data, so no CORS needed.
- **Funnel:** `tailscale funnel --bg 8000` when (a) judges use their own phones, or (b) A's preflight shows the Grok Bot callbacks come from xAI's cloud and can't reach the tailnet. Set `PUBLIC_BASE_URL` to the `.ts.net` URL either way. **Turn Funnel off after judging** (`tailscale funnel --https=443 off`).
- **Done when:** a team iPhone with Tailscale and a phone without it (Funnel on) both install the PWA from B and get live outlines.

### B8. Concept reel (pitch only, 9:35–10:00, cut first)

```
Write vision/render_reel.py: run the same detector + tracker + identify code over the Publix mp4 (offline, every
frame), score each named track for ONE profile using scripts/score.py (A3's Python twin), and render an mp4 with the
same colors, badges and gray states as the app, plus a corner caption "Recorded at Publix. Same recognition pipeline,
offline." Never hand-edit tracks; if results are poor, improve the catalog (catalog.py from-video) or thresholds.
Done when: a 20-40 s reel exists in media/reel.mp4 and A has it for the pitch.
```

---

## 9. Task specs: System C (General: the iPhone PWA)

All C work lives in `web/`. Use Nomi's generated types from `vendor/nomi/ts/`. **One network module:** every `fetch` and WebSocket send goes through `web/src/api.ts`, which A4's privacy test scans.

### C1. PWA shell that feels like an iPhone app (6:45–7:30)

```
Scaffold web/ with Vite + React + TypeScript and vite-plugin-pwa.
- Manifest: name "Nomifier", short_name "Nomifier", display "standalone", orientation "portrait",
  start_url "/", scope "/", theme_color and background_color matching the app, icons 192/512 + maskable.
  index.html: <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">,
  <link rel="apple-touch-icon" href="/icons/apple-touch-icon-180.png">, apple-mobile-web-app-title,
  apple-mobile-web-app-status-bar-style "black-translucent", theme-color for light and dark.
- Service worker (generateSW): precache the app shell and /data/*.json; runtime NetworkFirst for /data/*.json so
  merged data updates show up; never cache /api/* or /ws/*. Show an "Update available" banner on a new SW.
- iOS look: font-family -apple-system, system-ui; bottom tab bar (Scan, Cabinet, Profiles, History) with
  SF-Symbol-like inline SVG icons; large-title headers on non-camera tabs; bottom sheets with a grabber that can be
  dragged between half and full height; padding with env(safe-area-inset-*); light/dark via prefers-color-scheme;
  respect prefers-reduced-motion. Touch targets >= 44 px.
- "Add to Home Screen" hint: in Safari but not standalone (navigator.standalone false), show a one-time card with
  the Share -> Add to Home Screen steps; dismissal remembered in localStorage.
- Desktop frame mode: ?frame=iphone renders the app inside a 390x844 iPhone-shaped frame centered on the page, for
  the projector and the laptop-webcam fallback.
- Config: VITE_SERVER_URL (default same origin). vite.config: server.host true, server.allowedHosts [".ts.net"].
- Dev on the iPhone: on this laptop run `pnpm dev` and `tailscale serve --bg 5173`, open
  https://<C>.<tailnet>.ts.net on the iPhone; set VITE_SERVER_URL to B's .ts.net URL.
Done when: Lighthouse reports the app installable, it installs to an iPhone home screen and opens full screen
with correct safe areas, and the shell opens with the network off.
```

### C2. Mock server (6:45–7:00)

```
Write tools/mock_ws.py (FastAPI + uvicorn, port 8001) speaking contracts/api.md:
- /ws/scan: on each frame header + binary, reply tracks. Mode synthetic (default): 5 boxes drifting on sine paths
  with fixed ids and a fixed mix of statuses (2 named with real ndc11s from data/products.json if present, else fake,
  1 family, 1 unknown, 1 pending that turns named after 2 s). Mode replay --session tools/sessions/x.jsonl: replay
  B's recorded replies in order, one per received frame.
- Serve /data from ../data and stub /api/find, /api/unknown (return ids; GET returns "done" after 5 s with fake
  results clearly marked "MOCK").
Done when: the PWA can be developed end to end with only this running.
```

### C3. Camera, streaming, AR overlay (F1) (7:15–8:15)

```
Build web/src/scan/ (Scan tab).
- Start screen "Tap to start camera" (iOS requires a gesture). getUserMedia({video:{facingMode:{ideal:"environment"},
  width:{ideal:1920}, height:{ideal:1080}}, audio:false}); <video playsinline muted autoplay>. On desktop or
  ?local=1 use the default webcam. Handle permission denied with an explanation screen.
- Streaming (api.ts): open WebSocket to VITE_SERVER_URL/ws/scan (wss). Keep exactly one frame in flight: when a
  "tracks" reply arrives (or on start), draw the current video frame to an offscreen canvas 640 px wide, encode
  JPEG q 0.7 (canvas.toBlob), send the JSON header then the binary. Auto-reconnect with backoff; show a
  "Reconnecting" pill.
- Overlay: a full-screen canvas above the video, sized with devicePixelRatio, drawn every requestAnimationFrame.
  Map frame coords to screen respecting object-fit: cover cropping. Keep displayed tracks by id; ease each box 35%
  toward its latest target per frame; fade out tracks missing for > 400 ms. 4 px rounded outlines, colors and states
  per contracts/api.md, score badge (number + tier icon) top-left. Hit-testing for taps on boxes.
- The overlay gets a function trackStyle(track) -> {color, dash, label, badge} so C4/C5 plug in scoring.
Done when: on the iPhone over Tailscale, outlines follow products smoothly while panning (mock first, then B), with
no growing lag over 2 minutes.
```

### C4. Scoring engine, profiles, alternatives (F2) (7:30–8:45)

```
Implement web/src/scoring/ with Nomi's generated types (vendor/nomi/ts/).
- score(product, profile, termTables, ratedUniis): Nomi's function (docs/system-design.md 6.2 in the Nomi repo).
  Per dimension: for each active ingredient take the base row (unii, dimension, persona) plus rows matching each
  condition/medication_type in the profile; combine across ingredients per termTables.combine (max |
  max_plus_stacking | sum); score = clamp(base_score - total, 0, 100); tier from tier_bands; any matching hard stop
  (unii or ndc11; personas omitted means all; condition/medication_type must be in the profile) forces red.
  If any active ingredient's UNII isn't in ratedUniis return {status:"unrated", missing:[...]}.
  Return a ScoreRecord-shaped object: score, tier, contributions [{dimension, points, ingredient_uniis, citations}],
  hard_stops_triggered, explanation [{template_id, text, citations}] where template is
  "<dimension>_<low|moderate|high>" by points (< 15 low, < 35 moderate, else high). Lookups and arithmetic only.
- Memoize scores by (ndc11, profileKey); recompute on profile change.
- Profiles (web/src/profiles/): several named profiles with persona + conditions + medication types (only the
  scope listed in contracts/api.md), stored in localStorage only. Active-profile chip on the Scan tab ("Mom, 65+,
  high BP") that switches with one tap. Profiles tab to add/edit.
- alternatives(product, profile, products, inView): products sharing at least one use, not hard-stopped, scoring
  >= 10 points higher; prefer ones currently in view; return [] (show "Ask your pharmacist") if none.
- Tests (vitest): Nomi's own sample term table + every vector in data/golden.json must match exactly what A3's
  scripts/score.py produces; plus property tests: adding a condition never raises a score; an unrated ingredient
  never yields a tier.
Done when: tests pass and switching profiles recolors the overlay in the same frame with zero network requests
(check the network panel).
```

### C5. Detail sheet, look-alikes, unknown and unrated states (F3–F5) (8:15–8:50)

```
- Tap a box: freeze (pause drawing new frames, keep the frozen image) and open a bottom sheet following Nomi's
  chosen design (docs/design/score-visualization.md): verdict word (Good choice / Use with caution / Avoid) + large
  score + "for <profile description>"; a plain list with one sentence per contribution, a High/Moderate/Low label,
  and the source visible (DailyMed link https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=<set id>, section
  name, short quote); hard stop reason first if any; ingredients with strengths; uses; review_status badge
  "Unreviewed demo data". Footer: "Demo values in Nomi's format, not Nomi's rubric. Not medical advice. Ask your
  pharmacist." Buttons: Add to cabinet, Compare, Find safer nearby, Read aloud, Ask your pharmacist.
- Family: gray dashed, label "<Family name>: turn to show the barcode"; sheet lists the family members and never
  shows a score.
- Unknown: thin gray; sheet says "We don't know this product yet" with "Send to Coverage Clerk" (C9).
- Unrated: thin gray "Not rated yet"; sheet lists ingredients and which aren't rated yet; never a color.
Done when: every state is reachable with the mock server and looks right on the iPhone in light and dark mode.
```

### C6. Barcode lock (F4) (8:30–9:00)

```
Add web/src/barcode/. Every 400 ms, while scanning, grab the FULL-resolution video frame and decode with zxing-wasm
(UPC-A, EAN-13; it works on iOS Safari, which has no BarcodeDetector) in a Web Worker. For each result: run Nomi's
ndcCandidates() (vendor/nomi/barcode.ts), find the candidate present in products.json, map the barcode's position
into frame coordinates, find the track whose box contains it, and send {"type":"pin", track_id, product_id} via
api.ts. Show a brief "Locked by barcode" pulse on that outline. If no product matches: toast "Not in our catalog yet".
The same decoder powers a manual "Scan a barcode" mode in the Scan tab that opens the sheet directly, which works
with no server (offline fallback).
Tests: vendor/nomi/barcodes.json fixtures pass through the ndc mapping.
Done when: turning a look-alike box to show its barcode locks it within ~1 s on the iPhone.
```

### C7. Safer-pick arrow, best-pick star, "I need…" filter (F6, F11) (8:45–9:15)

```
- Arrow: for each red (or tapped) named product, take alternatives(...) restricted to products in view; draw an
  animated curved arrow from its box to the best one, updated every frame with the eased boxes. Max 2 arrows on
  screen. Hide when the target leaves view.
- Star: when a use filter is active, put a star badge on the highest-scoring in-view product with that use.
- Filter: chips above the tab bar (Pain, Allergy, Sleep, Cough & cold, Stomach); when one is active, products
  without that use dim to 30% opacity and lose their badges.
Done when: removing the green product from the riser removes its arrow within half a second.
```

### C8. Medicine Cabinet, Compare, History (F9, F10, F16) (9:00–9:30)

```
- Cabinet tab: list of products added from sheets (ndc11 + date), stored in localStorage only; swipe to delete.
  Duplicate check: when a named product in view shares an active-ingredient UNII with any cabinet product, add an
  amber "Also <ingredient>" chip to its outline and a top line in its sheet: "Also <ingredient>: you already take
  <cabinet product>. Taking both can exceed the label's maximum dose." Cite the ingredient's label section if a
  liver/duplicate_dosing citation exists in term_tables.
- Compare: "Compare" on a sheet, then tap a second product; side-by-side cards with score, tier and a per-dimension
  table of points, differences highlighted.
- History tab: last 50 viewed products (ndc11, time, tier for the profile at the time), localStorage, "Clear" button.
Done when: adding Tylenol to the cabinet makes NyQuil show the duplicate chip, and all three survive an app restart.
```

### C9. Bot features in the app (F7, F8, F12) (9:00–9:35)

```
All calls through api.ts; payloads contain only ndc11, zip, crop_url, decision.
- Find safer nearby (sheet button, or when alternatives() is empty in view): ZIP field (default 30332, remembered),
  POST /api/find {ndc11 of the best alternative, else the product itself, zip}; poll GET every 2 s; show a sheet
  "Aisle Finder is checking stores near 30332..." then the options (store, product, price, in stock, link, evidence
  link) and Approve / Reject -> POST /api/approvals/{id}. Timeouts after 3 min with a friendly message.
- Send to Coverage Clerk (unknown sheet): {"type":"crop_request"} over the WS, then POST /api/unknown {crop_url};
  poll; show the crop, then "Coverage Clerk is reading this box...", then the PR link (opens GitHub) or the
  not-identified reason.
- Label Watch: load label_status.json; a warning badge on outlines and a banner in sheets for label_updated / recall,
  linking the source. ?demo_label=<ndc11> marks one product as "label updated (demo)" with that wording visible.
Done when: both Bot flows complete end to end against B with A's live Bots, and against the mock offline.
```

### C10. Accessibility, read aloud, pharmacist questions, CV HUD (F13–F15) (9:15–9:45)

```
- Tier icons always on badges; large-text toggle (scales sheet and badge text 1.3x); VoiceOver labels on every
  control, sheets announced with role="dialog".
- Read aloud: speechSynthesis reads verdict, score, profile and the risk sentences; starts from a button tap (iOS
  requirement); stops when the sheet closes.
- Red-in-center alert: when a red product's box covers the screen center, play a short tone (Web Audio, unlocked on
  the first tap) and pulse its outline. iOS has no vibration API; call navigator.vibrate only where it exists.
- Ask your pharmacist: from questions.json for each contributing dimension, fill {ingredient}; "Copy" button.
- CV HUD (toggle in a hidden settings sheet, long-press the profile chip): fps, round-trip ms, proc_ms, tracks,
  dropped, detector/embedder names from /api/vision/health. Long-press a box: similarity, source (vision/barcode),
  track age.
Done when: the full demo flow can be done with VoiceOver on, and the HUD numbers match B's server log.
```

### C11. Stretch (only after freeze, if time)

- **F17 shelf audit:** a "Pharmacist mode" button that counts in-view products by tier for `adult_65_plus` (no user profile involved) and anticholinergic-burden ingredients, and shows the summary. Hand it to A to publish as a Grok Page.
- **F18 snapshot:** compose the frozen frame + overlay into a PNG and offer it through the share sheet (`navigator.share` with files).

---

## 10. Concept-reel shoot at Publix (before kickoff, ~15 min)

Ask the manager first. OTC aisle only, teammates only: no customers, no pharmacy counter, no prescription bags. Put everything back.

- **Phone settings:** 1080p60, locked exposure and focus, no flash, stabilization on.
- **Video:** slow horizontal pans at chest height, 1–1.5 m from the shelf, ~10 s per 2 m: pain, allergy/sleep, cold & flu. Two takes each.
- **Stills:** barcode + front of ~8 products visible in the video, so A2 can resolve them and B3 can catalog them for the reel.

---

## 11. Cut order if behind

1. B8 concept reel (pitch with a still photo instead).
2. C11 stretch.
3. A7 Label Watch (pitch it; keep the C9 badge with the labeled demo toggle).
4. C8 Compare and History (keep Cabinet).
5. C10 HUD extras (keep fps readout and read aloud).
6. A6's validator step (keep the PR).
7. iPhone streaming → desktop iPhone-frame mode with the laptop webcam.

**Never cut:** live AR outlines with tracking, on-device profile recolor, detail sheet with citations, look-alike refusal + barcode lock, unrated-never-colored, safer arrow, Aisle Finder approval, the installable PWA.

---

## 12. Pre-flight checklist (by 7:45)

- [ ] **A:** repo up; A2 resolves 3 real products; triage list posted; both Bot webhooks return 200.
- [ ] **A + B:** a Grok Bot `curl` reaches `https://<B>.<tailnet>.ts.net/api/health`. If it can't (cloud runner), turn on Funnel and recheck.
- [ ] **B:** detector chosen; `/ws/scan` answers over Tailscale; one session recorded for C.
- [ ] **C:** PWA installs on a team iPhone over Tailscale, camera starts, mock outlines move, works with the network off (shell + data).

## 13. Demo-time runbook

| Who   | Where                        | Does                                                                                                                     |
| ----- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **B** | GPU laptop                   | Runs the server + `tailscale serve`/Funnel; watches the per-second log; restarts if needed                               |
| **C** | This laptop on the projector | `?frame=iphone` mirror or AirPlay of the team iPhone; hands the judge the iPhone; narrates the AR                        |
| **A** | Grok + Cursor laptop         | Shows the Grok Bot screens live during Aisle Finder and Coverage Clerk; opens the PR and the Cursor PR log for the close |

Fallbacks, in order: plain Safari instead of the installed PWA → desktop iPhone-frame mode with the laptop webcam on `localhost` → the backup video.
