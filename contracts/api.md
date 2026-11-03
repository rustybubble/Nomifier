# Frozen contract (`contracts/api.md`, agreed by 7:10)

_Source: section 5 of `Nomifier - 3-person implementation plan.md`. Changing this file needs all three of A, B and C to agree._

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
