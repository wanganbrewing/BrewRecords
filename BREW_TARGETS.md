# PC target brew sheet — v81

Entry: 仕込み → 仕込み表で目標を設定（PC向け）. Desktop uses three spreadsheet-style sheets: basic plan, materials/water, and process. The second-brew columns are hidden unless the user explicitly enables a two-brew combined batch. One “仕込み計画を保存” action applies and persists the entire plan. Smaller screens retain a card-oriented layout with horizontally scrollable material tables.

## Data and boundaries

- Existing planned recipe fields remain canonical: batch name, style, planned date/volume, mash temperature/time, boil time, target OG, yeast, mineral targets and material amounts.
- `batch.brewTargets = {version: 1, fields, steps}` stores additional planned equipment, water, yeast and process parameters. Forty-one empty process templates cover the reference sheet; custom steps can be added and reordered (maximum 100).
- Recipe rows retain `targetMeta`: first/second brew quantities, manufacturer, lot, hop alpha/target IBU, adjunct timing note, additive concentration. The quantity sum is written once to the existing recipe amount. Names are required for entered quantities or metadata.
- First/second mash-water quantities sum to the canonical `waterVolume`. Sparge water is separate. Ordinary edits to a canonical total reset its stale split to the first brew without dropping the other metadata.
- Scaling copies adjusts amounts and volume targets, not temperature, pH, concentration, alpha acid, IBU or ABV. Copying does not add actual fermentation observations.
- The sheet is a draft until “仕込み計画を保存”. That action applies the targets to the ordinary form and completes persistence in one flow. Closing a dirty, unsaved sheet asks before discarding. A changed underlying form/cloud snapshot blocks application. All validation precedes form mutations.
- Existing actual OG/FG, process measurements, fermentation, shipments and stock consumption are not changed by applying the sheet. Planned times are not automatically copied to the schedule or calendar notifications.
- This is target entry, not a new chemical or recipe prediction engine. No SG/°P conversion or IBU/ABV/pH predictions are introduced. Chemical concentrations are metadata only; additive quantities remain grams.
- Saved record details offer a read-only target sheet whose three tabs remain navigable. Backup and cloud snapshots retain the entire batch, including the new fields. Brewing CSV includes target-sheet and recipe-metadata JSON columns. All editing devices must use v81 or later.

## Verification

- Automated tests cover blank/zero, numeric bounds, invalid pH/SG, dates/times, schema and duplicates, optional second-brew quantities, custom steps, escaping, stale apply, actual-value preservation, the three-sheet UI and offline assets.
- Isolated browser UAT at desktop 1440×1000 covers the three sheets, material/water sums, alpha and lot, invalid pH rejection, custom step insertion/reorder, one-action save/read-only reopen and ordinary quantity edits preserving metadata.
- Mobile-width 390×844: dialog and content stay within the viewport. This is browser viewport testing, not physical iPhone testing.
- Production user records were not used for write tests. Test entries were confined to local demo origins.
