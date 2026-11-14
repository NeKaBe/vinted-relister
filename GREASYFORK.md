# Greasy Fork: Texte zum Einfügen

Greasy Fork (https://greasyfork.org) ist ein Verzeichnis für Userscripts. Dort veröffentlichst du jedes Skript einzeln. Diese Datei gehört nicht ins öffentliche Repository, wenn du sie nicht dort haben möchtest: einfach löschen oder in `.gitignore` aufnehmen.

## Vor dem Hochladen prüfen

- Greasy Fork hat eigene Regeln, unter anderem zu `@updateURL` / `@downloadURL`, die auf andere Seiten zeigen, und zu Skripten, die Seiten automatisieren. Lies https://greasyfork.org/en/help/rules und passe die Kopie des Skripts an, wenn nötig (ich habe die aktuellen Regeln nicht geprüft).
- Die Skripte brauchen Vinted-Konten. Es gibt keine Möglichkeit, sie ohne Konto zu testen, das ist bei Greasy Fork aber normal.
- Beide Skripte einzeln hochladen. Das Helfer-Skript beschreibt, dass es das Relister-Skript braucht.
- Optional: Greasy Fork kann das Skript direkt aus GitHub synchronisieren (Webhook) oder per URL importieren.

## Relister

**Name:** Vinted - Duplicate / Relist Items

**Beschreibung (kurz):** Relist or duplicate your own Vinted listings as a draft with one click. All photos, description, price, category and more are copied; nothing is published automatically.

**Zusätzliche Info (Markdown):**

Relist or duplicate your own Vinted listings with one click. Photos, description, price, category, brand, size, condition and category-specific fields are copied into a new draft, which is checked against the original. You review and publish the draft yourself.

- Buttons Relist, Duplicate and Test on every listing (needs the helper script for the buttons on your profile)
- Relist deletes the original only after a popup confirmation and a clean check; Duplicate never deletes anything
- Own listings only; unofficial interface, use at your own risk; not affiliated with Vinted

Source, German instructions and issue tracker: https://github.com/NeKaBe/vinted-relister · Support: https://ko-fi.com/nekabe

## Helfer

**Name:** Vinted - Relist Helper

**Beschreibung (kurz):** Adds Relist, Duplicate and Test buttons to every listing on your Vinted profile and a batch mode with random pauses. Requires "Vinted - Duplicate / Relist Items".

**Zusätzliche Info (Markdown):** Companion script for "Vinted - Duplicate / Relist Items" (install both). It adds the buttons to your profile and a batch relist mode with a pending-originals list. Nothing is published or deleted automatically in batch mode.

Source and instructions: https://github.com/NeKaBe/vinted-relister · Support: https://ko-fi.com/nekabe
