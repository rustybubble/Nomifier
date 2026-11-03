# Credits: Nomi

Everything in `vendor/nomi/` is copied from **[Nomi](https://github.com/gt-big-data/nomi)**, the OTC medicine
safety scanner built by the **Nomi team at Big Data Big Impact (BDBI), Georgia Tech** (leads Shreyas Shrestha and
Utkarsh Bagaria).

Source commit: [`gt-big-data/nomi@aa8d723`](https://github.com/gt-big-data/nomi/tree/aa8d723e99fb22853023d8f66e54e3dbe04f52a1)

| Here | From Nomi |
| --- | --- |
| `schemas/*.json` | `packages/schema/schemas/` |
| `ts/*.ts` | `packages/schema/generated/ts/` |
| `samples/*.json` | `packages/schema/fixtures/schema-samples/valid/` |
| `barcode.ts` | `apps/mobile/src/lib/barcode.ts` |
| `barcode.py` | `pipeline/src/nomi_pipeline/identity/barcode.py` |
| `barcodes.json` | `packages/schema/fixtures/barcodes.json` |

The `nomi-schema` Python package (`validate`) is installed from the same commit as a dependency
(see `pyproject.toml`), not copied.

The Nomi repository has no license. We copied these files with the Nomi leads' permission, unchanged, and we
do not open issues or pull requests on `gt-big-data/nomi`.
