#!/usr/bin/env python3
"""Erzeugt docs/fragen.js aus dem BAMF-Gesamtfragenkatalog (PDF) und den
richtigen Antworten aus dem BAMF-Übungsportal (data/raw/antworten.json).

Benötigt: poppler-utils (pdftotext), Python-Paket pypdf.

Aufruf:  python3 scripts/build_data.py
"""
import difflib
import json
import re
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

import pypdf

ROOT = Path(__file__).resolve().parent.parent
PDF = ROOT / "data/raw/fragenkatalog.pdf"
ANSWERS = ROOT / "data/raw/antworten.json"
OUT = ROOT / "docs/fragen.js"
LAND = "Baden-Württemberg"
MARKS = ("\uf0a3", "\u25a1")  # Ankreuzkästchen im PDF (zwei Varianten)


def decode_alt(obj):
    """Alt-Texte im PDF sind uneinheitlich kodiert (UTF-16 ohne BOM, Latin-1 …)."""
    raw = obj.original_bytes if hasattr(obj, "original_bytes") else bytes(obj)
    if raw[:2] == b"\xfe\xff":
        s = raw[2:].decode("utf-16-be")
    elif raw[:2] == b"\xff\xfe":
        s = raw[2:].decode("utf-16-le")
    elif len(raw) > 3 and raw[1::2].count(0) > len(raw) // 4:
        s = raw.decode("utf-16-le", errors="replace")
    else:
        try:
            s = raw.decode("utf-8")
        except UnicodeDecodeError:
            s = raw.decode("cp1252")
    return s.replace("\x00", "").strip()


def figures_by_page(reader):
    pages = {p.indirect_reference.idnum: i + 1 for i, p in enumerate(reader.pages)}
    figs = defaultdict(list)

    def walk(n, pg=None):
        n = n.get_object()
        if isinstance(n, pypdf.generic.ArrayObject):
            for c in n:
                walk(c, pg)
            return
        if not isinstance(n, pypdf.generic.DictionaryObject):
            return
        if "/Pg" in n:
            pg = pages.get(n.raw_get("/Pg").idnum, pg)
        if n.get("/S") == "/Figure" and "/Alt" in n:
            figs[pg].append(decode_alt(n["/Alt"]))
        if "/K" in n:
            walk(n["/K"], pg)

    walk(reader.trailer["/Root"]["/StructTreeRoot"]["/K"])
    return figs


def page_text(pg):
    return subprocess.run(
        ["pdftotext", "-layout", "-f", str(pg), "-l", str(pg), str(PDF), "-"],
        capture_output=True, text=True, check=True,
    ).stdout


def join_lines(lines):
    s = " ".join(l.strip() for l in lines if l.strip())
    s = re.sub(r"\s+", " ", s)
    # Silbentrennung am Zeilenende ("Bundes- tag") nicht anfassen: im Katalog
    # stehen Bindestriche fast immer absichtlich (z. B. "Baden- und").
    return s.strip()


def parse_questions(reader):
    """Liefert Liste von Fragen mit Abschnitt (None = allgemein, sonst Bundesland)."""
    figs = figures_by_page(reader)
    questions = []
    section = None
    current = None
    for pg in range(2, len(reader.pages) + 1):
        text = page_text(pg)
        m = re.search(r"Fragen für das Bundesland (.+)", text)
        if m:
            section = m.group(1).strip()
        on_page = []
        for line in text.splitlines():
            line = line.strip()
            if re.fullmatch(r"Seite \d+ von \d+", line) or line in (
                "Teil I", "Teil II", "Allgemeine Fragen",
            ) or line.startswith("Fragen für das Bundesland"):
                continue
            m = re.fullmatch(r"Aufgabe (\d+)", line)
            if m:
                current = {"nr": int(m.group(1)), "land": section, "page": pg,
                           "frage": [], "optionen": [], "credit": []}
                questions.append(current)
                on_page.append(current)
                continue
            if current is None:
                continue
            if line.startswith("©"):
                current["credit"].append(line)
            elif line.startswith(MARKS):
                current["optionen"].append([line[1:]])
            elif current["optionen"]:
                current["optionen"][-1].append(line)
            else:
                current["frage"].append(line)
        # Bilder dieser Seite der passenden Aufgabe zuordnen
        if pg in figs:
            assign_figures(on_page, figs[pg], pg)
    for q in questions:
        # Bildunterschriften "Bild 1" … "Bild 4" aus Frage- und Antworttexten entfernen
        frage = re.sub(r"(\s*\bBild \d)+$", "", join_lines(q["frage"]))
        q["frage"] = re.sub(r"^\d+\.\s+", "", frage)  # z. B. "206. Woran …"
        q["optionen"] = [re.sub(r"^(Bild \d)( Bild \d)+$", r"\1", join_lines(o))
                         for o in q["optionen"]]
        q["credit"] = " ".join(q["credit"])
    return questions


def assign_figures(on_page, alts, pg):
    def is_bild_options(q):
        return q["optionen"] and all(
            re.fullmatch(r"(Bild \d\s*)+", " ".join(o).strip()) for o in q["optionen"])

    if len(alts) == 4:
        cands = [q for q in on_page if is_bild_options(q)]
    else:
        # Einzelbild: Aufgabe mit Bildnachweis, sonst mit Bildbezug im Text,
        # sonst die erste Aufgabe der Seite (Bild steht direkt unter der Frage).
        cands = ([q for q in on_page if q["credit"]]
                 or [q for q in on_page if re.search(r"Bild|Foto|Karte|abgebildet", " ".join(q["frage"]))]
                 or on_page[:1])
    if len(cands) != 1:
        sys.exit(f"Seite {pg}: Bilder nicht eindeutig zuordenbar ({[q['nr'] for q in on_page]})")
    cands[0]["bilder"] = alts


def main():
    reader = pypdf.PdfReader(str(PDF))
    questions = parse_questions(reader)
    general = [q for q in questions if q["land"] is None]
    land = [q for q in questions if q["land"] == LAND]
    if len(general) != 300 or len(land) != 10:
        sys.exit(f"Erwartet 300 + 10 Fragen, gefunden {len(general)} + {len(land)}")

    answers = json.load(open(ANSWERS, encoding="utf-8"))
    if len(answers) != 310:
        sys.exit("antworten.json muss 310 Einträge haben")

    out = []
    problems = 0
    for i, q in enumerate(general + land):
        a = answers[i]
        if len(q["optionen"]) != 4:
            sys.exit(f"Frage {q['land'] or ''} {q['nr']}: {len(q['optionen'])} Antworten")
        # Richtige Antwort über den Text zuordnen (Portal-Formulierungen sind teils
        # älter, z. B. "Bürger und Bürgerinnen"), nicht blind über die Position.
        # Stufenweise vergleichen: 1. exakter Text, 2. gleiche Wörter in beliebiger
        # Reihenfolge ("die Präsidentin/der Präsident" == "der Präsident / die Präsidentin"),
        # 3. unscharfer Vergleich (z. B. "Selbständige" / "Selbstständige").
        words = lambda s: re.findall(r"[a-z0-9äöüß]+", s.lower())
        norms = [lambda s: " ".join(words(s)), lambda s: " ".join(sorted(words(s)))]
        target_text = a["antworten"][a["richtig"]]
        best, scores, second = None, [0.0] * 4, 0.0
        for norm in norms:
            hits = [k for k, o in enumerate(q["optionen"]) if norm(o) == norm(target_text)]
            if len(hits) == 1:
                best, scores[hits[0]] = hits[0], 1.0
                break
        if best is None:
            norm = norms[0]
            scores = [difflib.SequenceMatcher(None, norm(o), norm(target_text)).ratio()
                      for o in q["optionen"]]
            best = max(range(4), key=scores.__getitem__)
            second = sorted(scores)[-2]
        if q.get("bilder") and len(q["bilder"]) == 4:
            best = a["richtig"]  # Antworten sind nur "Bild 1" … "Bild 4"
        elif best != a["richtig"] or scores[best] < 0.75 or scores[best] - second < 0.1:
            problems += 1
            print(f"Prüfen {i+1} (Aufgabe {q['nr']}): PDF-Antwort {best+1} {scores[best]:.2f}"
                  f" / Portal-Antwort {a['richtig']+1}\n  PDF:    {q['optionen']}\n"
                  f"  Portal: {a['antworten']}", file=sys.stderr)
        a = dict(a, richtig=best)
        item = {
            "id": i + 1,
            "nr": q["nr"],
            "land": q["land"],
            "frage": q["frage"],
            "antworten": q["optionen"],
            "richtig": a["richtig"],
        }
        bilder = q.get("bilder")
        if bilder:
            if len(bilder) == 4:
                item["antwortBilder"] = bilder
            else:
                item["bild"] = bilder[0]
        out.append(item)

    OUT.parent.mkdir(exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("// Automatisch erzeugt von scripts/build_data.py – nicht von Hand bearbeiten.\n")
        f.write("// Quelle: BAMF, Gesamtfragenkatalog „Leben in Deutschland“, Stand 07.05.2025.\n")
        f.write("window.FRAGEN = ")
        json.dump(out, f, ensure_ascii=False, indent=1)
        f.write(";\n")
    print(f"{len(out)} Fragen geschrieben, {problems} Abweichungen", file=sys.stderr)


if __name__ == "__main__":
    main()
