# Vinted Relister (Deutsch)

Eigene Vinted-Anzeigen mit einem Klick neu einstellen oder duplizieren: Fotos, Beschreibung, Preis, Kategorie, Marke, Größe, Zustand und mehr werden in einen neuen **Entwurf** kopiert. Kein Abtippen, keine Fotos neu hochladen.

🇬🇧 [English README](README.md) · ☕ [Unterstützen auf Ko-fi](https://ko-fi.com/nekabe)

## Was es kann

- **Knöpfe an jedem Artikel** in deinem Profil: **Relist**, **Duplicate**, **Test**.
- **Ein Klick, keine Zwischenschritte:** Ein Fortschrittsbanner zeigt, was passiert, danach öffnet sich der neue Entwurf.
- **Relist** fragt einmal in einem Popup nach, legt den Entwurf an, vergleicht ihn mit dem Original und löscht erst dann das Original. Gibt es einen Unterschied, bleibt das Original erhalten.
- **Duplicate** löscht nie etwas. Nimm es, wenn du die Favoriten der alten Anzeige behalten willst.
- **Test** liest nur und zeigt, ob alle Daten eines Artikels verfügbar sind.
- **Batch relist** (Knopf unten links im Profil): mehrere Artikel auswählen und nacheinander mit zufälliger Pause bearbeiten.
- Arbeitet mit Daten und nicht mit Bildschirmtext, ist also unabhängig von der Sprache der Vinted-Seite und kopiert auch kategoriespezifische Felder.
- Bei Entwürfen, Artikeln in Prüfung und auf Bearbeiten-Seiten erscheinen keine Knöpfe.

## Installation

1. Installiere einen Userscript-Manager für deinen Browser, z. B. [Tampermonkey](https://www.tampermonkey.net/) (Chrome, Edge, Firefox, Safari).
2. Klicke auf beide Links. Der Manager bietet die Installation an:
   - **[Relister-Skript installieren](https://raw.githubusercontent.com/NeKaBe/vinted-relister/main/vinted-relist.user.js)** (Knöpfe auf Artikelseiten, erledigt die eigentliche Arbeit)
   - **[Helfer-Skript installieren](https://raw.githubusercontent.com/NeKaBe/vinted-relister/main/vinted-helper.user.js)** (Knöpfe im Profil und Batch relist)
3. Nur Chrome und andere Chromium-Browser: Falls nichts passiert, aktiviere unter `chrome://extensions` bei Tampermonkey "Benutzerskripte zulassen" (oder den Entwicklermodus).
4. Beim ersten Kopieren von Fotos fragt Tampermonkey nach der Erlaubnis für `vinted.net` (Vinteds Bildserver). Erlaube sie.
5. Bei Vinted anmelden und dein Profil öffnen.

Für die Knöpfe im Profil brauchst du beide Skripte. Der Relister allein zeigt die Knöpfe auf einer einzelnen Artikelseite.

Updates kommen automatisch über deinen Userscript-Manager.

## Benutzung

**Im Profil:** Jeder aktive Artikel hat über dem Foto die Knöpfe *Relist*, *Duplicate* und *Test*. Klick auf einen: Ein neuer Tab zeigt den Fortschritt, danach landest du im neuen Entwurf. Prüfe ihn und veröffentliche ihn selbst.

**Auf einer Artikelseite:** Die drei Knöpfe erscheinen unten rechts.

**Mehrere Artikel:** Im Profil *Batch relist* (unten links) anklicken, Artikel und Modus wählen, Pause einstellen, Start drücken.

Erscheinen die Knöpfe nicht, lade zuerst die Seite neu (die Skripte starten nur bei einem vollständigen Seitenaufruf). Falls sie dann noch fehlen, nutze den Menüeintrag des Skripts im Userscript-Manager.

## Sicherheit

- **Es wird nichts automatisch veröffentlicht.** Das Skript legt nur einen Entwurf an. Du prüfst und veröffentlichst selbst.
- **Nur eigene Artikel.** Fremde Artikel werden abgelehnt.
- **Das Original wird nur gelöscht, wenn du es willst:** *Relist* löscht nach deiner Bestätigung und nur, wenn der Entwurf mit dem Original übereinstimmt. *Duplicate* und *Test* löschen nie. Im Batch-Modus wird nichts automatisch gelöscht; du löschst Originale aus der Liste "Pending originals".
- **Bei einem Fehler bleibt das Original unverändert.**
- **Löschen ist endgültig**, Aufrufe und Favoriten der gelöschten Anzeige gehen verloren. Probiere *Relist* zuerst an einem unwichtigen Artikel aus.

## Gut zu wissen

- **Inoffizielle Schnittstelle.** Vinted bietet keine öffentliche API zum Anlegen von Anzeigen. Die Skripte nutzen dieselben Schnittstellen wie die Vinted-Webseite. Ändert Vinted etwas, können die Skripte aufhören zu funktionieren. Der *Test*-Knopf und die Browser-Konsole (F12, Filter `KV-`) helfen bei der Fehlersuche.
- **Bisher getestet** vom Autor bei Schuhen, Taschen und Kleidung. Andere Kategorien (Bücher, Elektronik, Spielzeug ...) sollten funktionieren, weil alles aus den Originaldaten kopiert und danach geprüft wird, sind aber noch nicht breit getestet. Bitte melde, was dir auffällt.
- **Nutzungsbedingungen.** Automatisierung kann gegen Vinteds Bedingungen verstoßen und im schlimmsten Fall zu Einschränkungen deines Kontos führen. Nutzung auf eigenes Risiko. Halte die Pausen moderat und stelle nicht massenhaft neu ein.
- **Nicht mit Vinted verbunden.** "Vinted" ist eine Marke ihres Inhabers. Dies ist ein unabhängiges Hobbyprojekt.
- Keine Gewährleistung, keine Haftung (siehe Lizenz).

## Nur für den privaten Gebrauch

Die Skripte sind für **den privaten Gebrauch mit deinem eigenen Konto und deinen eigenen Artikeln** gedacht: weniger Abtippen und weniger Fotos neu hochladen, wenn du eine Anzeige auffrischen willst. Nicht gedacht sind sie für Massen- oder gewerbliche Automatisierung, zum Kopieren fremder Anzeigen oder um Vinted-Regeln zu umgehen.

## Probleme und Ideen

Bitte eröffne ein [Issue](https://github.com/NeKaBe/vinted-relister/issues). Die Vorlage fragt nach dem Ergebnis des *Test*-Knopfs. Entferne vor dem Posten von Screenshots alles Private.

## Unterstützen

Wenn dir das Skript Zeit spart, kannst du das Projekt unterstützen: **[☕ ko-fi.com/nekabe](https://ko-fi.com/nekabe)**. Völlig freiwillig, die Skripte bleiben kostenlos.

## Danksagung

Danke an **[OldRon1977](https://github.com/OldRon1977)** für [Kleinanzeigen-Anzeigen-duplizieren](https://github.com/OldRon1977/Kleinanzeigen-Anzeigen-duplizieren). Das Projekt war die Inspiration: die Idee aus Helfer- und Arbeitsskript, die Auswahl und die zufällige Pause. Der Code hier ist komplett neu für Vinted geschrieben, aber der Ansatz wäre ohne das Original nicht entstanden.

## Über dieses Projekt

Ein Hobbyprojekt einer begeisterten Amateurin bzw. eines begeisterten Amateurs, keine professionelle Entwicklung. Der Code entstand mit Hilfe von [Claude](https://claude.ai) (KI-Assistent von Anthropic). Es kann Ecken und Kanten geben; bitte melde dich per Issue, wenn etwas kaputtgeht.

## Lizenz

MIT, siehe [LICENSE](LICENSE).
