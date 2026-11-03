# Devpost submission (paste-ready)

Due 10:20 pm. From the final writeup §9, with one fix: the Coverage Clerk also sees a photo crop of the product, so
the privacy line now says "a product ID, a product photo and a ZIP" (writeup §3 is the source of truth).

## Tagline

Point your phone at a shelf of medicine and every box lights up green, orange or red for the person who'll take it.

## Description

**Nomifier** builds on BDBI's Nomi, which turns one medicine barcode into a personalized, cited 0–100 safety score.
Real choices happen in front of a whole shelf, a cabinet, or a bag of pill bottles. Nomifier **nomifies everything in
view, live**. Point your phone, and every box and bottle gets a **green, orange or red AR outline** scored for the
person who'll take it, tracked in real time as you move. Tap for the cited reasons, follow the arrow to the safer
pick, and get warned when a product duplicates an ingredient already in your cabinet. It refuses to guess between
look-alikes like Tylenol and Tylenol PM until the barcode confirms it.

Under the hood: YOLOE detects products from text prompts, BoT-SORT tracks them, and DINOv2 identifies each new
product once from a few catalog photos, with no training. Scoring runs on the phone with Nomi's own data formats. A
crew of **Grok Bots** handles what no API can:

- **Aisle Finder** finds the safer product, or a cheaper store brand with identical active ingredients, in stock
  nearby, and holds a pickup order for your approval.
- **Coverage Clerk** turns any unknown product into a schema-valid, DailyMed-cited pull request.
- **Label Watch** tracks label changes and recalls weekly and flags them in the app.

Health data never leaves your phone; the Bots only see a product ID, a product photo and a ZIP. Built in one night
with Cursor cloud agents.

_Credit: Nomi by the BDBI Nomi team._

<!-- TODO(A9): confirm "Built in one night with Cursor cloud agents" matches the receipts in the README's
"How we built it" section before pasting. -->

## Built with

grok, cursor, python, fastapi, sqlite, uvicorn, react, typescript, vite, pwa, workbox, zxing-wasm, tailscale,
ultralytics, yoloe, bot-sort, dinov2, pytorch, openfda, dailymed, json-schema

<!-- TODO(A9): drop any vision tag B didn't end up using (check vision/README.md). -->

## Links

- Repo: https://github.com/rustybubble/nomifier
- Demo video: TODO
- Built on: https://github.com/gt-big-data/nomi
