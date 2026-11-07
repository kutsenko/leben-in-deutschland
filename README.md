# Leben in Deutschland – barrierefreier Übungstrainer (Baden-Württemberg)

Ein Übungstrainer für den Test „Leben in Deutschland“ / Einbürgerungstest, gebaut für
blinde und sehbehinderte Menschen. Er funktioniert mit **VoiceOver auf dem iPhone** und mit
**NVDA, JAWS oder der Windows-Sprachausgabe am PC**.

## Warum eine eigene Lösung?
Im offiziellen BAMF-Übungsportal ist der Fragetext ein **Bild** und für Screenreader nicht lesbar.
Viele Apps haben ähnliche Probleme. Dieser Trainer zeigt alles als Text an. Bei Bildfragen
(Wappen, Flaggen, Karten, Stimmzettel) liest er die Bildbeschreibungen vor, die das BAMF
selbst im Fragenkatalog mitliefert.

## Funktionen
- Alle 310 Fragen: 300 allgemeine und 10 zu Baden-Württemberg
- Modi: der Reihe nach (merkt sich die Position), zufällig, falsch beantwortete wiederholen,
  noch nicht beantwortete, nur Baden-Württemberg, Frage nach Nummer
- **Prüfungssimulation** wie im echten Test: 33 Fragen (30 allgemeine und 3 zu Baden-Württemberg), 60 Minuten,
  bestanden ab 17 richtigen Antworten, Warnungen 10, 5 und 1 Minute vor Schluss
- **Liste aller Fragen mit Antworten** zum Durchhören (jede Frage ist eine Überschrift, man springt mit
  dem Rotor bzw. mit der Taste H weiter)
- Sofortige Rückmeldung, die vorgelesen wird, optional mit Tönen für richtig und falsch
- Tastenkürzel am PC: 1–4 / A–D wählt eine Antwort, N oder → nächste Frage, ← vorherige, Esc zur Startseite
- Funktioniert offline, auf dem iPhone über Safari mit „Teilen“ und „Zum Home-Bildschirm“ wie eine App
- Fortschritt wird auf dem Gerät gespeichert, ohne Konto und ohne Server

## Benutzen
**👉 Zum Trainer: https://kutsenko.github.io/leben-in-deutschland/**

- **iPhone:** Den Link in Safari öffnen, dann „Teilen“ und „Zum Home-Bildschirm“ wählen.
  Danach startet der Trainer wie eine App und funktioniert auch ohne Internet.
- **PC:** Den Link im Browser öffnen und als Lesezeichen speichern.
- Der Fortschritt wird pro Gerät gespeichert, iPhone und PC zählen also getrennt.

Veröffentlicht wird der Ordner `docs/` über GitHub Pages (Branch `main`, Ordner `/docs`).
Jeder Push auf `main` aktualisiert die Seite automatisch.
- **Lokal am PC:** `docs/index.html` im Browser öffnen. Das funktioniert auch ohne Server,
  nur der Offline-Speicher ist dann nicht aktiv.
- Zum Testen mit Server: `cd docs && python3 -m http.server 8000` und dann http://localhost:8000 öffnen.

## Daten neu erzeugen
Die Fragen stammen aus dem **BAMF-Gesamtfragenkatalog** (PDF, Stand 07.05.2025). Die PDF markiert
die richtigen Antworten nicht. Diese kommen aus dem offiziellen **BAMF-Übungsportal** (oet.bamf.de).
Das Skript ordnet sie über den Antworttext zu und prüft dabei, ob die Zuordnung eindeutig ist.

```bash
mkdir -p data/raw
curl -L -o data/raw/fragenkatalog.pdf \
  "https://www.bamf.de/SharedDocs/Anlagen/DE/Integration/Einbuergerung/gesamtfragenkatalog-lebenindeutschland.pdf?__blob=publicationFile"
python3 scripts/fetch_answers.py 2 > data/raw/antworten.json   # 2 = Baden-Württemberg
python3 scripts/build_data.py                                   # schreibt docs/fragen.js
```
Benötigt `pdftotext` (poppler-utils) und das Python-Paket `pypdf`. Wenn das BAMF den Katalog
aktualisiert, die Schritte wiederholen und in `docs/sw.js` die `VERSION` erhöhen.

## Aufbau
| Pfad | Inhalt |
|---|---|
| `docs/index.html`, `app.js`, `style.css` | die Web-App, ohne Frameworks |
| `docs/fragen.js` | erzeugte Fragendaten |
| `docs/sw.js`, `manifest.webmanifest`, Icons | Offline-Modus und Installation als App |
| `scripts/fetch_answers.py` | lädt die richtigen Antworten aus dem BAMF-Portal |
| `scripts/build_data.py` | liest die PDF aus (Fragen und Bildbeschreibungen) und führt alles zusammen |
| `scripts/make_icons.py` | erzeugt die App-Symbole |

## Quelle und Hinweis
Fragen, Antworten und Bildbeschreibungen: Bundesamt für Migration und Flüchtlinge (BAMF).
Privates Lernprojekt, keine offizielle BAMF-Anwendung, ohne Gewähr.
