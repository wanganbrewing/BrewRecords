# Unified brew plan — v83

Entry: 仕込み → 仕込み計画を入力. The former basic/detail switch and separate identity/process/material/water forms are replaced by this single entry surface. Desktop uses three spreadsheet-style sheets: basic plan, materials/water, and process. Smaller screens expose the same fields in stacked sections with horizontally scrollable material tables. The second-brew columns are hidden unless the user explicitly enables a two-brew combined batch. One “仕込み計画を保存” action applies and persists the entire plan. The toolbar exports and imports an editable four-sheet Excel workbook (basic plan, materials/water, process, management metadata).

## Data and boundaries

- Existing planned recipe fields remain canonical: batch name, style, planned date/volume, mash temperature/time, boil time, target OG, yeast, mineral targets and material amounts.
- `batch.brewTargets = {version: 1, fields, steps}` stores additional planned equipment, water, yeast and process parameters. Forty-one empty process templates cover the reference sheet; custom steps can be added and reordered (maximum 100).
- Recipe rows retain `targetMeta`: first/second brew quantities, manufacturer, lot, hop alpha/target IBU, adjunct timing note, additive concentration. The quantity sum is written once to the existing recipe amount. Names are required for entered quantities or metadata.
- First/second mash-water quantities sum to the canonical `waterVolume`. Sparge water is separate. Ordinary edits to a canonical total reset its stale split to the first brew without dropping the other metadata.
- Scaling copies adjusts amounts and volume targets, not temperature, pH, concentration, alpha acid, IBU or ABV. Copying does not add actual fermentation observations.
- The sheet is a draft until “仕込み計画を保存”. That action applies the targets to the ordinary form and completes persistence in one flow. Closing a dirty, unsaved sheet asks before discarding. A changed underlying form/cloud snapshot blocks application. All validation precedes form mutations.
- Actual OG is the only actual value in the unified surface and is clearly separated as post-brew data. It is excluded from Excel export/import. Existing FG, process measurements, fermentation, shipments and stock consumption are not changed by applying an imported plan. Planned times are not automatically copied to the schedule or calendar notifications.
- Tax category, batch icon, source-water identity/pH/alkalinity/minerals, target-water pH, acid choice, and target minerals live in the unified plan. The water sheet provides an acid-dose estimate and before/after mineral guidance. No SG/°P conversion or IBU/ABV prediction is introduced. Chemical concentrations are metadata only; additive quantities remain grams.
- Saved record details offer a read-only plan whose three tabs remain navigable. Backup and cloud snapshots retain the entire batch, including the new fields. Brewing CSV includes target-sheet and recipe-metadata JSON columns. All editing devices must use v83 or later.
- Excel import is preview-first and creates a new unsaved draft. It never imports actual measurements, fermentation logs, packages, expenses, inventory-consumption state or the source record ID. Inventory IDs in the workbook are informational; current inventory is linked only after an exact category/name/manufacturer/lot match (and unit match where required). Unmatched items remain unlinked and appear in the preview warning.

## Verification

- Automated tests cover blank/zero, numeric bounds, invalid pH/SG, dates/times, schema and duplicates, optional second-brew quantities, custom steps, escaping, stale apply, actual-value preservation, the three-sheet UI, four-sheet XLSX round trips, safe new-draft imports, inventory reconciliation and offline assets.
- Isolated browser UAT at desktop 1440×1000 covers the three sheets, material/water sums, alpha and lot, invalid pH rejection, custom step insertion/reorder, one-action save/read-only reopen and ordinary quantity edits preserving metadata.
- Mobile-width 390×844: dialog and content stay within the viewport. This is browser viewport testing, not physical iPhone testing.
- Production user records were not used for write tests. Test entries were confined to local demo origins.
