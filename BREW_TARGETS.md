# Unified brew plan — v84

Entry: 仕込み → バッチ名 → 仕込み計画を入力. Desktop uses two spreadsheet-style views: a merged plan (identity, targets, yeast, materials and water volume) and process targets. Smaller screens expose the same plan fields as cards. Each saved process card offers a direct action to add actual gravity, pH, temperature and volume. The former 仕込み時間割 navigation is removed. The toolbar still exports and imports an editable four-sheet Excel workbook (basic plan, materials/water, process, management metadata).

## Data and boundaries

- Existing planned recipe fields remain canonical: batch name, style, planned date/volume, mash temperature/time, boil time, target OG, yeast, mineral targets and material amounts.
- `batch.brewTargets = {version: 1, fields, steps}` stores additional planned equipment, water, yeast and process parameters. Forty-one empty process templates cover the reference sheet; custom steps can be added and reordered (maximum 100).
- Recipe rows retain `targetMeta`: first/second brew quantities, manufacturer, lot, hop alpha/target IBU, adjunct timing note, additive concentration. The quantity sum is written once to the existing recipe amount. Names are required for entered quantities or metadata.
- First/second mash-water quantities sum to the canonical `waterVolume`. Sparge water is separate. Ordinary edits to a canonical total reset its stale split to the first brew without dropping the other metadata.
- Scaling copies adjusts amounts and volume targets, not temperature, pH, concentration, alpha acid, IBU or ABV. Copying does not add actual fermentation observations.
- The sheet is a draft until “仕込み計画を保存”. That action applies the targets to the ordinary form and completes persistence in one flow. Closing a dirty, unsaved sheet asks before discarding. A changed underlying form/cloud snapshot blocks application. All validation precedes form mutations.
- Actual OG is clearly separated as post-brew data and excluded from Excel export/import. Process actuals are stored in the existing measurement audit log. Fermentation, shipments and stock consumption are not changed by applying an imported plan.
- Style is selectable or free-entry. A bundled copy of the Japan Craft Beer Association April 2024 guide shows reference OG, FG, ABV, IBU and SRM without overwriting the user's targets. Target SRM is a first-class plan field.
- Yeast and yeast source are selectable or free-entry. Yeast quantity is fixed to grams in this surface. Batch icon, target cost/loss, pitch-rate controls, yeast generation, source-water/pH calculation and planned mineral-additive rows are not shown.
- Saved record details offer a read-only plan whose two tabs remain navigable. Backup and cloud snapshots retain the current batch. Brewing CSV includes target-sheet and process-measurement JSON columns. All editing devices must use v84 or later.
- Excel import is preview-first and creates a new unsaved draft. It never imports actual measurements, fermentation logs, packages, expenses, inventory-consumption state or the source record ID. Inventory IDs in the workbook are informational; current inventory is linked only after an exact category/name/manufacturer/lot match (and unit match where required). Unmatched items remain unlinked and appear in the preview warning.

## Verification

- Automated tests cover blank/zero, numeric bounds, invalid pH/SG, dates/times, schema and duplicates, optional second-brew quantities, custom steps, escaping, stale apply, actual-value preservation, the two-sheet UI, four-sheet XLSX round trips, safe new-draft imports, inventory reconciliation, the 181-style guide and offline assets.
- Isolated browser UAT at desktop width covers the two sheets, official style references, target SRM, yeast selection/free entry, material rows, the 41 process targets and one-action save/read-only reopen.
- Mobile-width 390×844 confirms that the same fields are presented as cards. Every saved process target provides a direct action that opens the actual SG, pH, temperature and volume editor with the process name prefilled. This is browser viewport testing, not physical iPhone testing.
- Production user records were not used for write tests. Test entries were confined to local demo origins.
