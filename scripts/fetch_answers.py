#!/usr/bin/env python3
"""Lädt die richtigen Antworten aus dem offiziellen BAMF-Übungsportal.

Das Portal (oet.bamf.de) zeigt den Fragetext nur als Bild, die Antworten aber
als Text; die richtige Antwort ist im HTML markiert (id="FARBE").

Aufruf:  python3 scripts/fetch_answers.py [BUNDESLAND_ID] > data/raw/antworten.json
         (2 = Baden-Württemberg)
"""
import html as H
import http.cookiejar
import json
import re
import sys
import time
import urllib.parse
import urllib.request

BASE = "https://oet.bamf.de/ords/oetut/"
UA = "Mozilla/5.0 (barrierefreier Lerntrainer, privat)"

jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
opener.addheaders = [("User-Agent", UA)]


def get(url, data=None):
    body = urllib.parse.urlencode(data).encode() if data else None
    with opener.open(BASE + url, body, timeout=60) as r:
        return r.read().decode("utf-8")


def hidden(page, name):
    return re.search(r'<input[^>]*name="%s"[^>]*value="([^"]*)"' % name, page).group(1)


def submit(page, items, request):
    prot = H.unescape(re.search(r'id="pPageItemsProtected" value="([^"]*)"', page).group(1))
    salt = re.search(r'value="([^"]*)" id="pSalt"', page).group(1)
    pj = {
        "pageItems": {
            "itemsToSubmit": [{"n": k, "v": v} for k, v in items.items()],
            "protected": prot,
            "rowVersion": "",
            "formRegionChecksums": [],
        },
        "salt": salt,
    }
    data = {
        "p_flow_id": hidden(page, "p_flow_id"),
        "p_flow_step_id": hidden(page, "p_flow_step_id"),
        "p_instance": hidden(page, "p_instance"),
        "p_debug": "",
        "p_request": request,
        "p_reload_on_submit": "A",
        "p_page_submission_id": hidden(page, "p_page_submission_id"),
        "p_json": json.dumps(pj),
    }
    action = H.unescape(re.search(r'<form action="([^"]*)"', page).group(1))
    return get(action, data)


def clean(s):
    s = re.sub(r"<[^>]+>", " ", s)
    return re.sub(r"\s+", " ", H.unescape(s)).strip()


def parse(page):
    nr = int(re.search(r"Aufgabe (\d+) von (\d+)", page).group(1))
    answers, correct = [], None
    for row in re.finditer(r'<tr[^>]*>\s*<td headers="RICHTIGE_ANTWORT".*?</tr>', page, re.S):
        r = row.group(0)
        text = clean(re.search(r'<td headers="ANTWORT"[^>]*>(.*?)</td>', r, re.S).group(1))
        if 'id="FARBE"' in r:
            correct = len(answers)
        answers.append(text)
    kennung = re.search(r'id="P30_BESCHREIBUNG"[^>]*>([^<]*)<', page)
    return {
        "nr": nr,
        "kennung": kennung.group(1).strip() if kennung else None,
        "antworten": answers,
        "richtig": correct,
    }


def start(land):
    jar.clear()
    return submit(get("f?p=514:1:0"), {"P1_BUL_ID": land}, "SUBMIT")


def main():
    land = sys.argv[1] if len(sys.argv) > 1 else "2"
    page = start(land)
    options = re.findall(r'<option value="(\d+)">(\d+)</option>', page)
    result = [parse(page)]
    for value, nr in options[1:]:
        for attempt in range(5):
            try:
                time.sleep(0.3 + attempt * 5)
                if attempt:
                    page = start(land)  # neue Sitzung nach Fehler
                page = submit(page, {"P30_ROWNUM": value}, "P30_ROWNUM")
                break
            except Exception as e:  # Serverfehler: erneut versuchen
                print(f"\nFehler bei {nr}: {e}", file=sys.stderr)
        else:
            sys.exit(f"Aufgabe {nr} nicht abrufbar")
        q = parse(page)
        if q["nr"] != int(nr) or q["richtig"] is None or len(q["antworten"]) != 4:
            sys.exit(f"Unerwartete Seite bei Aufgabe {nr}: {q}")
        result.append(q)
        print(f"{nr}/{len(options)} ", file=sys.stderr, end="\r")
    json.dump(result, sys.stdout, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
