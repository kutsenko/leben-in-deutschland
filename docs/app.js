/* Barrierefreier Übungstrainer „Leben in Deutschland“ – Baden-Württemberg
 * Reines JavaScript ohne Abhängigkeiten. Daten: window.FRAGEN (fragen.js).
 * Gestaltungsgrundsätze:
 *  - Jeder Bildschirm hat eine Überschrift (h1), die nach dem Wechsel den Fokus erhält,
 *    damit VoiceOver/NVDA sofort die neue Frage vorlesen.
 *  - Antworten sind normale Schaltflächen (keine Radiobuttons, damit nicht versehentlich
 *    beim Wischen/Pfeiltasten eine Antwort ausgewählt wird).
 *  - Rückmeldungen erhalten den Fokus und werden dadurch zuverlässig vorgelesen.
 */
(function () {
  "use strict";

  const FRAGEN = window.FRAGEN;
  const BY_ID = new Map(FRAGEN.map((q) => [q.id, q]));
  const ALLGEMEIN = FRAGEN.filter((q) => !q.land).map((q) => q.id);
  const LAND = FRAGEN.filter((q) => q.land).map((q) => q.id);
  const LETTERS = ["A", "B", "C", "D"];
  const EXAM_MINUTES = 60;
  const EXAM_PASS = 17;
  const STORE_KEY = "lid-bw-v1";

  const main = document.getElementById("main");
  const live = document.getElementById("live");
  const alertBox = document.getElementById("alert");

  /* ---------- Speicher ---------- */
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(STORE_KEY));
      if (s && s.stats) return s;
    } catch (e) { /* ignorieren */ }
    return { stats: {}, pos: 1, settings: { sound: true }, exam: null };
  }
  let store = load();
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) { /* voll / privat */ }
  }
  function record(id, ok) {
    const s = store.stats[id] || { r: 0, f: 0, last: null };
    if (ok) s.r++; else s.f++;
    s.last = ok;
    store.stats[id] = s;
    save();
  }
  const wrongIds = () => FRAGEN.filter((q) => store.stats[q.id] && store.stats[q.id].last === false).map((q) => q.id);
  const newIds = () => FRAGEN.filter((q) => !store.stats[q.id]).map((q) => q.id);
  const knownCount = () => FRAGEN.filter((q) => store.stats[q.id] && store.stats[q.id].last === true).length;

  /* ---------- Hilfsfunktionen ---------- */
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function shuffle(a) {
    a = a.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function announce(text, urgent) {
    const el = urgent ? alertBox : live;
    el.textContent = "";
    setTimeout(() => { el.textContent = text; }, 50);
  }

  function render(html, title) {
    main.innerHTML = html;
    document.title = (title ? title + " – " : "") + "LiD Trainer Baden-Württemberg";
    const h = main.querySelector("h1");
    if (h) {
      h.setAttribute("tabindex", "-1");
      // kurze Verzögerung, damit VoiceOver den neuen Inhalt sicher erkennt
      setTimeout(() => h.focus(), 60);
    }
    window.scrollTo(0, 0);
  }

  function katalogNr(q) {
    return q.land ? "Baden-Württemberg-Frage " + q.nr : "Katalog-Nr. " + q.nr;
  }

  /** Bildbeschreibung und Antworttexte so aufbereiten, dass alles ohne Bild verständlich ist. */
  function prepare(q) {
    let bild = q.bild || null;
    let labels = q.antworten.slice();
    if (q.antwortBilder) {
      // Antworten heißen nur „Bild 1“ … „Bild 4“ → Beschreibung direkt in die Antwort
      labels = q.antwortBilder.map((b, i) => "Bild " + (i + 1) + ": " + b);
    } else if (bild && labels.every((a) => /^\d$/.test(a.trim()))) {
      // Antworten „1“ … „4“ verweisen auf nummerierte Teile der Bildbeschreibung
      const parts = bild.split(/\n\s*(?=\d\.\s)/);
      const items = {};
      const intro = [];
      parts.forEach((p) => {
        const m = p.match(/^(\d)\.\s+([\s\S]*)$/);
        if (m) items[m[1]] = m[2].trim(); else intro.push(p.trim());
      });
      if (labels.every((a) => items[a.trim()])) {
        labels = labels.map((a) => a.trim() + ": " + items[a.trim()]);
        bild = intro.join("\n").trim() || null;
      }
    }
    return { bild, labels };
  }

  /* ---------- Töne ---------- */
  let audioCtx = null;
  function beep(ok) {
    if (!store.settings.sound) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const notes = ok ? [660, 880] : [220, 180];
      notes.forEach((f, i) => {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.frequency.value = f;
        o.type = ok ? "sine" : "square";
        const t = audioCtx.currentTime + i * 0.12;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(ok ? 0.25 : 0.08, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
        o.connect(g).connect(audioCtx.destination);
        o.start(t);
        o.stop(t + 0.12);
      });
    } catch (e) { /* kein Audio */ }
  }

  /* ---------- Startseite ---------- */
  function showStart() {
    stopTimer();
    const wrong = wrongIds().length;
    const neu = newIds().length;
    const examRunning = store.exam && !examExpired();
    render(`
      <h1>Übungstrainer Leben in Deutschland</h1>
      <p>${knownCount()} von ${FRAGEN.length} Fragen zuletzt richtig beantwortet.
         ${wrong ? wrong + " Fragen zuletzt falsch." : ""}</p>
      <h2>Üben</h2>
      <ul class="menu">
        ${examRunning ? `<li><button class="primary" data-act="exam-resume">Laufende Prüfung fortsetzen</button></li>` : ""}
        <li><button data-act="seq">Alle Fragen der Reihe nach, weiter bei Frage ${store.pos}</button></li>
        <li><button data-act="random">Alle Fragen in zufälliger Reihenfolge</button></li>
        <li><button data-act="wrong" ${wrong ? "" : 'aria-disabled="true"'}>Falsch beantwortete Fragen üben (${wrong})</button></li>
        <li><button data-act="new" ${neu ? "" : 'aria-disabled="true"'}>Noch nicht beantwortete Fragen (${neu})</button></li>
        <li><button data-act="land">Nur die 10 Fragen zu Baden-Württemberg</button></li>
        <li><button data-act="goto">Frage nach Nummer aufrufen</button></li>
      </ul>
      <h2>Prüfung</h2>
      <ul class="menu">
        <li><button data-act="exam">Prüfung simulieren: 33 Fragen, 60 Minuten</button></li>
      </ul>
      <h2>Weiteres</h2>
      <ul class="menu">
        <li><button data-act="list">Alle Fragen mit Antworten zum Durchhören</button></li>
        <li><button data-act="help">Bedienung und Hilfe</button></li>
        <li><button data-act="settings">Einstellungen und Fortschritt</button></li>
      </ul>
    `, "Start");
    on("seq", () => startPractice(FRAGEN.map((q) => q.id), store.pos - 1, "seq"));
    on("random", () => startPractice(shuffle(FRAGEN.map((q) => q.id)), 0, "random"));
    on("wrong", () => wrong ? startPractice(shuffle(wrongIds()), 0, "wrong") : announce("Keine falsch beantworteten Fragen vorhanden."));
    on("new", () => neu ? startPractice(newIds(), 0, "new") : announce("Alle Fragen wurden schon beantwortet."));
    on("land", () => startPractice(LAND, 0, "land"));
    on("goto", showGoto);
    on("exam", startExam);
    on("exam-resume", () => showExamQuestion(store.exam.idx || 0));
    on("list", () => showList("alle"));
    on("help", showHelp);
    on("settings", showSettings);
  }

  function on(act, fn) {
    main.querySelectorAll(`[data-act="${act}"]`).forEach((b) => b.addEventListener("click", fn));
  }

  /* ---------- Üben ---------- */
  let practice = null; // { ids, idx, mode, answered }

  function startPractice(ids, idx, mode) {
    practice = { ids, idx: Math.max(0, Math.min(idx, ids.length - 1)), mode, answered: null };
    showPracticeQuestion();
  }

  const MODE_NAMES = {
    seq: "", random: "Zufall", wrong: "Wiederholung", new: "Neue Fragen", land: "Baden-Württemberg", goto: "",
  };

  function showPracticeQuestion() {
    const id = practice.ids[practice.idx];
    const q = BY_ID.get(id);
    const { bild, labels } = prepare(q);
    practice.answered = null;
    if (practice.mode === "seq") { store.pos = id; save(); }
    const total = practice.ids.length;
    const modeName = MODE_NAMES[practice.mode];
    // Katalognummer nur dort nennen, wo sie sich nicht aus der Position ergibt
    const showNr = !["seq", "land", "goto"].includes(practice.mode) || (practice.mode === "goto" && q.land);
    const head = (modeName ? `${modeName}: ` : "") + `Frage ${practice.idx + 1} von ${total}` +
      (showNr ? ` (${katalogNr(q)})` : "");
    render(`
      <h1 id="q-h"><span class="q-nr">${esc(head)}</span> <span class="q-text">${esc(q.frage)}</span></h1>
      ${bild ? `<p class="bild"><strong>Bildbeschreibung:</strong> ${esc(bild)}</p>` : ""}
      <div class="answers" role="group" aria-label="Antworten">
        ${labels.map((l, i) => `
          <button class="answer" data-i="${i}"><span class="letter">${LETTERS[i]}:</span> ${esc(l)}<span class="mark"></span></button>`).join("")}
      </div>
      <p id="feedback" class="feedback" tabindex="-1"></p>
      <div class="nav">
        <button class="primary wide" data-act="next">${practice.idx + 1 < total ? "Nächste Frage" : "Fertig – zur Startseite"}</button>
        <button data-act="prev" ${practice.idx ? "" : 'aria-disabled="true"'}>Vorherige Frage</button>
        <button data-act="home">Zur Startseite</button>
      </div>
    `, `Frage ${practice.idx + 1} von ${total}`);
    main.querySelectorAll(".answer").forEach((b) =>
      b.addEventListener("click", () => answerPractice(Number(b.dataset.i))));
    on("next", nextPractice);
    on("prev", prevPractice);
    on("home", showStart);
  }

  function answerPractice(i) {
    if (practice.answered !== null) return;
    const q = BY_ID.get(practice.ids[practice.idx]);
    const { labels } = prepare(q);
    const ok = i === q.richtig;
    practice.answered = i;
    record(q.id, ok);
    beep(ok);
    main.querySelectorAll(".answer").forEach((b, k) => {
      b.setAttribute("aria-disabled", "true");
      const mark = b.querySelector(".mark");
      if (k === q.richtig) { b.classList.add("correct"); mark.textContent = " – richtige Antwort"; }
      if (k === i && !ok) { b.classList.add("wrong"); mark.textContent = " – Ihre Antwort, falsch"; }
    });
    const fb = document.getElementById("feedback");
    fb.className = "feedback " + (ok ? "ok" : "bad");
    fb.textContent = ok
      ? (labels[i].length > 80 ? `Richtig! Antwort ${LETTERS[i]}.` : `Richtig! ${LETTERS[i]}: ${labels[i]}`)
      : `Leider falsch. Richtig ist ${LETTERS[q.richtig]}: ${labels[q.richtig]}`;
    fb.focus();
  }

  function nextPractice() {
    if (practice.idx + 1 >= practice.ids.length) {
      if (practice.mode === "seq") { store.pos = 1; save(); }
      announce("Alle Fragen dieser Runde bearbeitet.");
      showStart();
      return;
    }
    practice.idx++;
    showPracticeQuestion();
  }

  function prevPractice() {
    if (practice.idx === 0) { announce("Dies ist die erste Frage."); return; }
    practice.idx--;
    showPracticeQuestion();
  }

  function showGoto() {
    render(`
      <h1>Frage nach Nummer aufrufen</h1>
      <form id="goto-form">
        <div class="field">
          <label for="goto-teil">Teil</label>
          <select id="goto-teil">
            <option value="a">Allgemeine Fragen (1 bis 300)</option>
            <option value="l">Fragen zu Baden-Württemberg (1 bis 10)</option>
          </select>
        </div>
        <div class="field">
          <label for="goto-nr">Nummer</label>
          <input id="goto-nr" type="number" inputmode="numeric" min="1" max="300" required>
        </div>
        <button class="primary" type="submit">Frage anzeigen</button>
      </form>
      <div class="nav"><button class="wide" data-act="home">Zur Startseite</button></div>
    `, "Frage aufrufen");
    on("home", showStart);
    document.getElementById("goto-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const teil = document.getElementById("goto-teil").value;
      const nr = parseInt(document.getElementById("goto-nr").value, 10);
      const list = teil === "l" ? LAND : ALLGEMEIN;
      if (!(nr >= 1 && nr <= list.length)) {
        announce(`Bitte eine Nummer von 1 bis ${list.length} eingeben.`, true);
        return;
      }
      // ab dieser Frage der Reihe nach weiterüben
      startPractice(FRAGEN.map((q) => q.id), list[nr - 1] - 1, "goto");
    });
  }

  /* ---------- Prüfung ---------- */
  let timer = null;
  let warned = {};

  function startExam() {
    if (store.exam && !examExpired() &&
        !confirm("Es läuft bereits eine Prüfung. Neue Prüfung beginnen und die alte verwerfen?")) return;
    store.exam = {
      ids: shuffle(ALLGEMEIN).slice(0, 30).concat(shuffle(LAND).slice(0, 3)),
      answers: {},
      start: Date.now(),
      idx: 0,
    };
    warned = {};
    save();
    showExamQuestion(0);
  }

  const remainingMs = () => store.exam.start + EXAM_MINUTES * 60000 - Date.now();
  const examExpired = () => !store.exam || remainingMs() <= 0;
  const minutesLeft = () => Math.max(0, Math.ceil(remainingMs() / 60000));

  function startTimer() {
    stopTimer();
    timer = setInterval(() => {
      if (!store.exam) return stopTimer();
      const ms = remainingMs();
      const el = document.getElementById("restzeit");
      if (el) el.textContent = `Restzeit: ${minutesLeft()} Minuten`;
      [10, 5, 1].forEach((m) => {
        if (ms <= m * 60000 && !warned[m]) {
          warned[m] = true;
          announce(`Achtung: noch ${m === 1 ? "eine Minute" : m + " Minuten"} Zeit.`, true);
        }
      });
      if (ms <= 0) { announce("Die Zeit ist abgelaufen. Die Prüfung wird ausgewertet.", true); finishExam(); }
    }, 5000);
  }
  function stopTimer() { if (timer) clearInterval(timer); timer = null; }

  function showExamQuestion(idx) {
    if (examExpired()) { finishExam(); return; }
    const ex = store.exam;
    ex.idx = idx;
    save();
    const q = BY_ID.get(ex.ids[idx]);
    const { bild, labels } = prepare(q);
    const chosen = ex.answers[q.id];
    const total = ex.ids.length;
    const answeredCount = Object.keys(ex.answers).length;
    render(`
      <h1 id="q-h"><span class="q-nr">Prüfung: Frage ${idx + 1} von ${total}</span> <span class="q-text">${esc(q.frage)}</span></h1>
      ${bild ? `<p class="bild"><strong>Bildbeschreibung:</strong> ${esc(bild)}</p>` : ""}
      <div class="answers" role="group" aria-label="Antworten">
        ${labels.map((l, i) => `
          <button class="answer" data-i="${i}" aria-pressed="${chosen === i}"><span class="letter">${LETTERS[i]}:</span> ${esc(l)}</button>`).join("")}
      </div>
      <div class="nav">
        <button class="primary wide" data-act="next">${idx + 1 < total ? `Weiter zu Frage ${idx + 2}` : "Zur Übersicht und Abgabe"}</button>
        <button data-act="prev" ${idx ? "" : 'aria-disabled="true"'}>Zurück</button>
        <button data-act="overview">Übersicht</button>
      </div>
      <p id="restzeit" class="muted">Restzeit: ${minutesLeft()} Minuten</p>
      <p class="muted">${answeredCount} von ${total} Fragen beantwortet.</p>
    `, `Prüfung Frage ${idx + 1} von ${total}`);
    main.querySelectorAll(".answer").forEach((b) => b.addEventListener("click", () => {
      const i = Number(b.dataset.i);
      ex.answers[q.id] = i;
      save();
      main.querySelectorAll(".answer").forEach((o, k) => o.setAttribute("aria-pressed", String(k === i)));
      announce(`Antwort ${LETTERS[i]} gewählt.`);
    }));
    on("next", () => (idx + 1 < total ? showExamQuestion(idx + 1) : showExamOverview()));
    on("prev", () => (idx ? showExamQuestion(idx - 1) : announce("Dies ist die erste Frage.")));
    on("overview", showExamOverview);
    startTimer();
  }

  function showExamOverview() {
    if (examExpired()) { finishExam(); return; }
    const ex = store.exam;
    const open = ex.ids.filter((id) => ex.answers[id] === undefined).length;
    render(`
      <h1>Prüfung: Übersicht</h1>
      <p>${ex.ids.length - open} von ${ex.ids.length} Fragen beantwortet${open ? `, ${open} noch offen` : ""}.
         Restzeit: ${minutesLeft()} Minuten.</p>
      <button class="primary" data-act="finish">Prüfung abgeben und auswerten</button>
      <h2>Fragen</h2>
      <ul class="menu">
        ${ex.ids.map((id, i) => {
          const a = ex.answers[id];
          return `<li><button data-go="${i}">Frage ${i + 1}: ${a === undefined ? "noch offen" : "Antwort " + LETTERS[a]}</button></li>`;
        }).join("")}
      </ul>
    `, "Prüfung Übersicht");
    main.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => showExamQuestion(Number(b.dataset.go))));
    on("finish", () => {
      if (!open || confirm(`${open} Fragen sind noch nicht beantwortet. Trotzdem abgeben?`)) finishExam();
    });
    startTimer();
  }

  function finishExam() {
    stopTimer();
    const ex = store.exam;
    if (!ex) return showStart();
    store.exam = null;
    let correct = 0;
    const wrong = [];
    ex.ids.forEach((id) => {
      const q = BY_ID.get(id);
      const a = ex.answers[id];
      const ok = a === q.richtig;
      if (ok) correct++; else wrong.push({ q, a });
      if (a !== undefined) record(id, ok); else save();
    });
    const passed = correct >= EXAM_PASS;
    beep(passed);
    render(`
      <h1>Ergebnis: ${passed ? "Bestanden" : "Nicht bestanden"}</h1>
      <p>Sie haben ${correct} von ${ex.ids.length} Fragen richtig beantwortet.
         Zum Bestehen sind mindestens ${EXAM_PASS} richtige Antworten nötig.</p>
      <div class="menu">
        ${wrong.length ? `<button class="primary" data-act="practice-wrong">Diese ${wrong.length} Fragen jetzt üben</button>` : ""}
        <button data-act="exam">Neue Prüfung</button>
        <button data-act="home">Zur Startseite</button>
      </div>
      ${wrong.length ? `<h2>Falsch oder nicht beantwortet (${wrong.length})</h2>
        ${wrong.map(({ q, a }) => {
          const { bild, labels } = prepare(q);
          return `<div class="result-item">
            <h3>${esc(q.frage)}</h3>
            ${bild ? `<p class="bild"><strong>Bildbeschreibung:</strong> ${esc(bild)}</p>` : ""}
            <p>Ihre Antwort: ${a === undefined ? "keine" : esc(LETTERS[a] + ": " + labels[a])}</p>
            <p><strong>Richtig: ${esc(LETTERS[q.richtig] + ": " + labels[q.richtig])}</strong></p>
          </div>`;
        }).join("")}` : ""}
    `, "Prüfungsergebnis");
    on("practice-wrong", () => startPractice(wrong.map((w) => w.q.id), 0, "wrong"));
    on("exam", startExam);
    on("home", showStart);
  }

  /* ---------- Liste zum Durchhören ---------- */
  function showList(filter, alle) {
    const ids = filter === "land" ? LAND : filter === "falsch" ? wrongIds() : FRAGEN.map((q) => q.id);
    render(`
      <h1>Alle Fragen mit Antworten</h1>
      <p>Jede Frage ist eine Überschrift. Mit VoiceOver können Sie über den Rotor „Überschriften“
         von Frage zu Frage springen, mit NVDA mit der Taste H.</p>
      <div class="field">
        <label for="list-filter">Welche Fragen?</label>
        <select id="list-filter">
          <option value="alle" ${filter === "alle" ? "selected" : ""}>Alle ${FRAGEN.length} Fragen</option>
          <option value="land" ${filter === "land" ? "selected" : ""}>Nur Baden-Württemberg</option>
          <option value="falsch" ${filter === "falsch" ? "selected" : ""}>Zuletzt falsch beantwortete</option>
        </select>
      </div>
      <label class="check"><input type="checkbox" id="list-all" ${alle ? "checked" : ""}> Alle vier Antworten anzeigen</label>
      <button data-act="home">Zur Startseite</button>
      ${ids.length ? "" : "<p>Keine Fragen in dieser Auswahl.</p>"}
      ${ids.map((id) => {
        const q = BY_ID.get(id);
        const { bild, labels } = prepare(q);
        return `<div class="list-item">
          <h2>${q.land ? "Baden-Württemberg " : ""}${q.nr}: ${esc(q.frage)}</h2>
          ${bild ? `<p class="bild"><strong>Bildbeschreibung:</strong> ${esc(bild)}</p>` : ""}
          ${alle
            ? `<ol type="A">${labels.map((l, i) => `<li class="${i === q.richtig ? "richtig" : ""}">${esc(l)}${i === q.richtig ? " – richtig" : ""}</li>`).join("")}</ol>`
            : `<p>Antwort: <strong>${esc(labels[q.richtig])}</strong></p>`}
        </div>`;
      }).join("")}
      <div class="nav"><button class="wide" data-act="home">Zur Startseite</button></div>
    `, "Alle Fragen");
    on("home", showStart);
    const rerender = () => showList(document.getElementById("list-filter").value, document.getElementById("list-all").checked);
    document.getElementById("list-filter").addEventListener("change", rerender);
    document.getElementById("list-all").addEventListener("change", rerender);
  }

  /* ---------- Hilfe ---------- */
  function showHelp() {
    render(`
      <h1>Bedienung und Hilfe</h1>
      <h2>Über den Test</h2>
      <p>Der Test „Leben in Deutschland“ hat 33 Fragen: 30 aus den 300 allgemeinen Fragen
         und 3 aus den 10 Fragen zu Baden-Württemberg. Sie haben 60 Minuten Zeit.
         Bestanden ist der Test ab 17 richtigen Antworten. Für die Einbürgerung braucht man dieselbe Punktzahl.</p>
      <h2>Auf dem iPhone mit VoiceOver</h2>
      <ul>
        <li>Nach jedem Wechsel wird die neue Frage automatisch vorgelesen.</li>
        <li>Mit einem Wisch nach rechts kommen Sie zu den Antworten A bis D, mit Doppeltippen wählen Sie eine Antwort.</li>
        <li>Danach wird sofort gesagt, ob die Antwort richtig war. Ein Wisch nach rechts führt zu „Nächste Frage“.</li>
        <li>Tipp: In Safari über „Teilen“ und „Zum Home-Bildschirm“ wird der Trainer wie eine App gestartet und funktioniert auch ohne Internet.</li>
      </ul>
      <h2>Am PC mit Tastatur und Screenreader</h2>
      <ul>
        <li>Mit der Tabulatortaste zu den Antworten gehen und mit der Eingabetaste auswählen.</li>
        <li>Tastenkürzel: 1 bis 4 oder A bis D wählt eine Antwort, N oder Pfeil rechts geht zur nächsten Frage,
            Pfeil links zur vorherigen, Escape zur Startseite.</li>
        <li>Bei NVDA und JAWS funktionieren die Tastenkürzel nur im Fokusmodus
            (NVDA: NVDA-Taste plus Leertaste umschalten). Tab und Eingabetaste funktionieren immer.</li>
      </ul>
      <h2>Bilder</h2>
      <p>Bei Fragen mit Bildern, zum Beispiel zu Wappen oder Flaggen, werden die Bildbeschreibungen des
         Bundesamts für Migration und Flüchtlinge vorgelesen. Bei Bildantworten steht die Beschreibung direkt in der Antwort.</p>
      <h2>Quelle</h2>
      <p>Fragen, Antworten und Bildbeschreibungen: Bundesamt für Migration und Flüchtlinge (BAMF),
         Gesamtfragenkatalog zum Test „Leben in Deutschland“ und zum „Einbürgerungstest“, Stand 07.05.2025.
         Ohne Gewähr.</p>
      <div class="nav"><button class="wide" data-act="home">Zur Startseite</button></div>
    `, "Hilfe");
    on("home", showStart);
  }

  /* ---------- Einstellungen ---------- */
  function showSettings() {
    render(`
      <h1>Einstellungen und Fortschritt</h1>
      <label class="check"><input type="checkbox" id="set-sound" ${store.settings.sound ? "checked" : ""}> Töne bei richtiger und falscher Antwort</label>
      <h2>Fortschritt</h2>
      <p>${knownCount()} von ${FRAGEN.length} Fragen zuletzt richtig, ${wrongIds().length} zuletzt falsch,
         ${newIds().length} noch nicht beantwortet. Der Fortschritt wird nur auf diesem Gerät gespeichert.</p>
      <button data-act="reset">Fortschritt löschen</button>
      <div class="nav"><button class="wide" data-act="home">Zur Startseite</button></div>
    `, "Einstellungen");
    document.getElementById("set-sound").addEventListener("change", (e) => {
      store.settings.sound = e.target.checked;
      save();
      announce(e.target.checked ? "Töne eingeschaltet." : "Töne ausgeschaltet.");
    });
    on("reset", () => {
      if (!confirm("Wirklich den gesamten Fortschritt löschen?")) return;
      store = { stats: {}, pos: 1, settings: store.settings, exam: null };
      save();
      announce("Fortschritt gelöscht.");
      showSettings();
    });
    on("home", showStart);
  }

  /* ---------- Tastenkürzel ---------- */
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA")) return;
    const k = e.key.toLowerCase();
    const idx = "1234".indexOf(k) >= 0 ? "1234".indexOf(k) : "abcd".indexOf(k);
    const answers = main.querySelectorAll(".answer");
    if (idx >= 0 && answers.length === 4) {
      e.preventDefault();
      answers[idx].click();
    } else if ((k === "n" || k === "arrowright") && main.querySelector('[data-act="next"]')) {
      e.preventDefault();
      main.querySelector('[data-act="next"]').click();
    } else if (k === "arrowleft" && main.querySelector('[data-act="prev"]')) {
      e.preventDefault();
      main.querySelector('[data-act="prev"]').click();
    } else if (k === "escape") {
      e.preventDefault();
      showStart();
    }
  });

  // aria-disabled-Schaltflächen bleiben fokussierbar (für Screenreader), lösen aber nichts aus
  main.addEventListener("click", (e) => {
    const b = e.target.closest('[aria-disabled="true"]');
    if (b && !b.classList.contains("answer")) { e.stopImmediatePropagation(); }
  }, true);

  /* ---------- Offline-Unterstützung ---------- */
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }

  showStart();
})();
