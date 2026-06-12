# Karachi Price List — instructions for Claude sessions

Public site (production): **https://ckpricelist.vercel.app** — Vercel auto-deploys from `main`
within ~1 minute of a push. This repo root IS the website (`index.html` at root).
The owner is NOT a programmer — explain in plain language, no jargon, report problems honestly.

## Daily task: "update today's prices"
The owner attaches the day's two official price-list files (PDFs or photos): one FRUITS, one
VEGETABLES, issued by Commissioner Karachi Division. Then:

1. **Read both lists carefully** (scanned government sheets; Urdu + numbers).
2. **Update `prices.json` only:**
   - **Names are a FROZEN CATALOG.** Never rename, re-spell, or re-invent items. Match each
     sheet row to an existing item `id` and update only `auction` / `wholesale` / `retail`
     (use `null` when the sheet has no price = "not available today").
   - **Validate every row:** wholesale ≈ auction + 6%, retail ≈ wholesale + 15% (rounded to
     whole rupees). A number that breaks this chain is probably misread — re-read the cell.
   - **Compare with the previous values:** any price changing more than ~3× overnight is
     suspect — re-read before accepting, and mention it in the report.
   - Update the date fields: `date`, `day_en`, `day_ur`, `date_ur`.
   - A genuinely NEW item on the sheet: add it with a new id (`f##`/`v##`), matching the
     existing naming style, and tell the owner explicitly. An item missing from the sheet:
     set its prices to `null` (do NOT delete it).
3. **Save the two uploaded files as `docs/fruits.pdf` and `docs/vegetables.pdf`** (overwrite —
   the site links to these exact stable names; citizens download them).
   If the owner sent PHOTOS (jpg/png) instead of PDFs, convert them — one PDF per category,
   pages in order (e.g. Python: `img2pdf` or Pillow `save(..., format="PDF", append_images=...)`).
   Keep the output small (re-encode huge photos to ≲1MB/page); citizens download these on mobile data.
4. **Commit and push to `main` only.** Then give the owner a short plain-language summary:
   how many prices changed, anything new/missing, and anything you flagged.

## Do not touch (unless explicitly asked)
- `lib/` and `models/` — the camera AI. It is a self-hosted fp16 MobileCLIP; 8-bit/quantized
  versions of this model are BROKEN (verified) — never "optimize" or replace these files.
  Prompt embeddings are pre-computed on the owner's PC (`model-build/` there).
- `logo.png`, favicons, `manifest.json`, `banner.html`.
- The `gh-pages` branch is a retired mirror — ignore it.
- Never commit any secret, token, or key to this public repo.

## Good to know
- `index.html` contains an embedded fallback copy of the data (`window.EMBEDDED_DATA`).
  The live site fetches `prices.json` first, so daily updates do NOT need to touch
  `index.html`. Only if item NAMES ever change (owner's instruction) must the embedded
  copy be updated to match.
- Complaint WhatsApp number lives in `prices.json` (`whatsapp` field).
- The owner's PC has the full project (camera build tools, setup guide) at
  `C:\Users\uchih\Claude\Projects\Price control List` — laptop sessions should `git pull`
  before editing, since phone/cloud sessions also push to this repo.
