# Grok Bot routines

All three Bots carry the shared skill [`skills/cite-never-score.md`](skills/cite-never-score.md).
The server side of every exchange is `server/bots.py`; the shapes match `contracts/api.md`.

**Callback auth:** every Bot callback sends `Authorization: Bearer <BOT_TOKEN>`. Store `BOT_TOKEN` as a secret in
the Bot (the same value as in `.env` on System B). A missing or wrong token gets `401`.

**Reaching System B:** callbacks go to `PUBLIC_BASE_URL` (B's `https://<B>.<tailnet>.ts.net`). If the Bot runs in
xAI's cloud it can't reach the tailnet: turn on `tailscale funnel --bg 8000` on B (plan §8, B7) and recheck with
`curl <PUBLIC_BASE_URL>/api/health` from the Bot.

## Aisle Finder (A5)

| | |
| --- | --- |
| Trigger | Webhook routine. B's server POSTs to `AISLE_FINDER_WEBHOOK_URL` with `Authorization: Bearer AISLE_FINDER_WEBHOOK_KEY` |
| Skill | "Aisle Finder lookup" (taught task: pharmacy search → pickup cart) |
| Rule | "Ask first" on any checkout or payment action |

Request (a new find, from `POST /api/find` on the phone):

```json
{
  "find_id": "f_1",
  "ndc11": "50580044902",
  "brand_name": "Tylenol Extra Strength",
  "ingredients": [{ "name": "acetaminophen", "strength": 500, "unit": "mg" }],
  "zip": "30332",
  "callback_url": "https://<B>.<tailnet>.ts.net/api/finds/f_1"
}
```

Callback, `POST {callback_url}`:

```json
{
  "options": [
    { "store": "CVS, 10th St NW", "product": "CVS Health Extra Strength Acetaminophen 500 mg",
      "ndc11": "59779000000", "price": 6.49, "in_stock": true, "link": "https://…" }
  ],
  "cart": "pending",
  "evidence_url": "https://…"
}
```

`ndc11` (or `ndc11_if_shown`) is optional; `price` may be a number or a string such as `"$6.49"`.

Follow-up on the same webhook (from `POST /api/approvals/{id}` on the phone, only after the callback arrived):

```json
{ "find_id": "f_1", "decision": "approve" }
```

On `approve`, the Bot confirms the cart is ready and tells the user to finish checkout themselves. On `reject`, it
empties the cart. It never places the order.

## Coverage Clerk (A6)

| | |
| --- | --- |
| Trigger | Webhook routine. B POSTs to `COVERAGE_CLERK_WEBHOOK_URL` with `Authorization: Bearer COVERAGE_CLERK_WEBHOOK_KEY` |
| Access | GitHub, `nomifier` repo only; approval before pushing |

Request (from `POST /api/unknown` on the phone):

```json
{
  "job_id": "u_1",
  "crop_url": "https://<B>.<tailnet>.ts.net/media/c_12_1730594400.jpg",
  "repo": "rustybubble/nomifier",
  "callback_url": "https://<B>.<tailnet>.ts.net/api/unknowns/u_1"
}
```

Callback when identified (opens a PR titled "Add <brand> (from live scan)", never merges):

```json
{
  "pr_url": "https://github.com/rustybubble/nomifier/pull/12",
  "product": { "…": "the drafted Nomi product.json" },
  "validated": true,
  "dailymed_setid": "…"
}
```

Callback when it can't be sure:

```json
{ "status": "not_identified", "reason": "the strength isn't readable on this side of the box" }
```

## Label Watch (A7)

| | |
| --- | --- |
| Trigger | Schedule routine, every Monday 9:00 AM ET (plus one manual **Test** run) |
| Output | A Page "Nomifier label watch", and a PR updating `data/label_status.json` |
| Never | Edits a score; fakes a recall |

No webhook and no callback: the phone reads the merged `data/label_status.json`:

```json
{ "50580044902": { "status": "ok", "url": "https://dailymed.nlm.nih.gov/…", "checked_at": "2026-11-02T21:00:00Z" } }
```

`status` is `ok`, `label_updated` or `recall`. Changed products also get `review_status` set back to
`"unreviewed"` in `data/products.json`.
