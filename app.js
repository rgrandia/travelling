(() => {
  "use strict";

  const GOAL = 30;
  const GOAL_AGE = 30;
  const PACE_GOOD = 2; // països/any
  const PACE_WARN = 5;
  const MAP_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json";

  // ---------- Països ----------
  const displayNames = new Intl.DisplayNames(["ca"], { type: "region" });
  const COUNTRY = new Map(); // alpha2 -> {code, num, region, un, flag, name}
  const BY_NUM = new Map();  // numèric -> alpha2
  const BY_NAME = new Map(); // nom normalitzat -> alpha2
  const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

  for (const [code, num, region, un, flag] of window.COUNTRIES) {
    let name;
    try { name = displayNames.of(code); } catch { name = code; }
    if (!name || name === code) name = code;
    COUNTRY.set(code, { code, num, region, un: !!un, flag, name });
    if (num) BY_NUM.set(num, code);
    BY_NAME.set(norm(name), code);
    BY_NAME.set(norm(code), code);
  }
  const SORTED_COUNTRIES = [...COUNTRY.values()].sort((a, b) => a.name.localeCompare(b.name, "ca"));
  const countryName = (c) => COUNTRY.get(c)?.name ?? c;
  const countryFlag = (c) => COUNTRY.get(c)?.flag ?? "🏳️";

  // ---------- Dates ----------
  const pad = (n) => String(n).padStart(2, "0");
  const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  function addYears(dateStr, n) {
    const [y, m, d] = dateStr.split("-").map(Number);
    const ny = y + n;
    if (m === 2 && d === 29 && !isLeap(ny)) return `${ny}-03-01`;
    return `${ny}-${pad(m)}-${pad(d)}`;
  }
  const toUTC = (s) => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); };
  const daysBetween = (a, b) => Math.round((toUTC(b) - toUTC(a)) / 86400000);
  function ageOn(birth, on) {
    const [by, bm, bd] = birth.split("-").map(Number);
    const [oy, om, od] = on.split("-").map(Number);
    let age = oy - by;
    if (om < bm || (om === bm && od < bd)) age--;
    return age;
  }
  function ageExact(birth, on) { // anys i dies
    const years = ageOn(birth, on);
    const lastBday = addYears(birth, years);
    return { years, days: daysBetween(lastBday, on) };
  }
  const fmtDate = (s) => s ? new Date(toUTC(s)).toLocaleDateString("ca", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "";
  const fmtNum = (n, d = 1) => n.toLocaleString("ca", { maximumFractionDigits: d, minimumFractionDigits: 0 });

  // ---------- Càlculs ----------
  function computePerson(p, visits) {
    const today = todayStr();
    const deadline = addYears(p.birthdate, GOAL_AGE);
    const mine = visits.filter((v) => v.person_id === p.id);
    const valid = mine.filter((v) => !v.visited_on || v.visited_on < deadline);
    const late = mine.filter((v) => v.visited_on && v.visited_on >= deadline);
    const undated = valid.filter((v) => !v.visited_on).length;
    const count = valid.length;
    const remaining = Math.max(0, GOAL - count);
    const daysLeft = daysBetween(today, deadline);
    const yearsLeft = daysLeft / 365.25;
    const achieved = count >= GOAL;

    // Data en què es va assolir (només si les 30 primeres tenen data)
    let achievedOn = null;
    if (achieved) {
      const dated = valid.filter((v) => v.visited_on).map((v) => v.visited_on).sort();
      if (undated === 0 && dated.length >= GOAL) achievedOn = dated[GOAL - 1];
    }

    let status, pace = null;
    if (achieved) status = "ok";
    else if (daysLeft <= 0) status = "out";
    else {
      pace = remaining / yearsLeft;
      status = pace <= PACE_GOOD ? "good" : pace <= PACE_WARN ? "warn" : "bad";
    }
    return { ...p, deadline, mine, valid, late, undated, count, remaining, daysLeft, yearsLeft, achieved, achievedOn, status, pace, age: ageOn(p.birthdate, today) };
  }

  const STATUS_LABEL = { ok: "Aconseguit", good: "Bon ritme", warn: "Cal accelerar", bad: "En risc", out: "Fora de termini" };
  const STATUS_ORDER = { ok: 0, good: 1, warn: 1, bad: 1, out: 2 };

  function rankPeople(list) {
    return [...list].sort((a, b) => {
      if (STATUS_ORDER[a.status] !== STATUS_ORDER[b.status]) return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
      if (a.status === "ok") {
        // Assolit més jove primer; si no hi ha data, per nombre de països
        const aa = a.achievedOn ? daysBetween(a.birthdate, a.achievedOn) : Infinity;
        const bb = b.achievedOn ? daysBetween(b.birthdate, b.achievedOn) : Infinity;
        return aa - bb || b.count - a.count;
      }
      if (a.status === "out") return b.count - a.count;
      return a.pace - b.pace || b.count - a.count;
    });
  }

  // ---------- Emmagatzematge ----------
  const cfg = window.APP_CONFIG || {};
  const useSupabase = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase);
  const store = useSupabase ? supabaseStore() : localStore();

  function supabaseStore() {
    const db = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
    const check = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
    return {
      async load() {
        const [people, visits] = await Promise.all([
          db.from("people").select("*").order("created_at").then(check),
          db.from("visits").select("*").then(check),
        ]);
        return { people, visits };
      },
      addPerson: (p) => db.from("people").insert(p).select().single().then(check),
      updatePerson: (id, p) => db.from("people").update(p).eq("id", id).then(check),
      deletePerson: (id) => db.from("people").delete().eq("id", id).then(check),
      addVisit: (v) => db.from("visits").insert(v).select().single().then(check),
      updateVisit: (id, v) => db.from("visits").update(v).eq("id", id).then(check),
      deleteVisit: (id) => db.from("visits").delete().eq("id", id).then(check),
    };
  }

  function localStore() {
    const KEY = "30abans30-demo";
    const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || { people: [], visits: [] }; } catch { return { people: [], visits: [] }; } };
    let mem = read();
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch { /* sense emmagatzematge */ } };
    const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));
    return {
      async load() { mem = read(); return structuredClone(mem); },
      async addPerson(p) { const row = { id: uid(), created_at: new Date().toISOString(), ...p }; mem.people.push(row); save(); return row; },
      async updatePerson(id, p) { Object.assign(mem.people.find((x) => x.id === id), p); save(); },
      async deletePerson(id) { mem.people = mem.people.filter((x) => x.id !== id); mem.visits = mem.visits.filter((v) => v.person_id !== id); save(); },
      async addVisit(v) {
        if (mem.visits.some((x) => x.person_id === v.person_id && x.country === v.country)) throw new Error("duplicate key");
        const row = { id: uid(), ...v }; mem.visits.push(row); save(); return row;
      },
      async updateVisit(id, v) { Object.assign(mem.visits.find((x) => x.id === id), v); save(); },
      async deleteVisit(id) { mem.visits = mem.visits.filter((x) => x.id !== id); save(); },
    };
  }

  // ---------- Utilitats UI ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const app = $("#app");
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  let toastTimer;
  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), 3200);
  }
  function fail(err) {
    console.error(err);
    const m = String(err?.message || err);
    toast(/duplicate|unique/i.test(m) ? "Aquest país ja hi és." : "Error: " + m);
  }
  const tip = $("#tooltip");
  function showTip(e, html) { tip.innerHTML = html; tip.hidden = false; moveTip(e); }
  function moveTip(e) { tip.style.left = Math.min(e.clientX + 12, innerWidth - tip.offsetWidth - 8) + "px"; tip.style.top = e.clientY + 14 + "px"; }
  const hideTip = () => (tip.hidden = true);
  const mount = (id) => { app.replaceChildren($(id).content.cloneNode(true)); };
  const stat = (value, label) => `<div class="stat"><b>${value}</b><span>${label}</span></div>`;

  // ---------- Mapa ----------
  let worldPromise;
  const loadWorld = () => (worldPromise ??= d3.json(MAP_URL).then((topo) => {
    const fc = topojson.feature(topo, topo.objects.countries);
    for (const f of fc.features) {
      f.properties.code = f.id ? BY_NUM.get(f.id) : f.properties.name === "Kosovo" ? "XK" : null;
    }
    return fc;
  }));

  async function drawMap(el, { fill, onClick, title }) {
    let world;
    try { world = await loadWorld(); } catch (e) { el.innerHTML = '<p class="muted">No s\'ha pogut carregar el mapa.</p>'; return; }
    const w = 960, h = 480;
    const proj = d3.geoNaturalEarth1().fitExtent([[4, 4], [w - 4, h - 4]], { type: "Sphere" });
    const path = d3.geoPath(proj);
    el.innerHTML = "";
    el.classList.toggle("readonly", !onClick);
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`).attr("role", "img").attr("aria-label", "Mapa del món");
    svg.append("g").selectAll("path").data(world.features).join("path")
      .attr("class", "country").attr("d", path)
      .each(function (f) { fill(d3.select(this), f.properties.code); })
      .on("mousemove", (e, f) => showTip(e, title(f.properties.code, f.properties.name)))
      .on("mouseleave", hideTip)
      .on("click", (e, f) => { if (onClick && f.properties.code) { hideTip(); onClick(f.properties.code); } });
  }

  // ---------- Vistes ----------
  let state = { people: [], visits: [] };
  async function refresh() { state = await store.load(); }

  function setNav(which) {
    document.querySelectorAll("[data-nav]").forEach((a) => a.classList.toggle("active", a.dataset.nav === which));
  }

  function renderHome() {
    setNav("home");
    mount("#tpl-home");
    const people = rankPeople(state.people.map((p) => computePerson(p, state.visits)));

    const uniq = new Set(state.visits.map((v) => v.country)).size;
    const done = people.filter((p) => p.achieved).length;
    $("#group-stats").innerHTML =
      stat(people.length, "participants") +
      stat(done, "ja ho han aconseguit") +
      stat(uniq, "països diferents entre tots") +
      stat(state.visits.length, "visites apuntades");

    const ol = $("#ranking");
    if (!people.length) ol.innerHTML = '<li class="muted">Encara no hi ha ningú. Apunta\'t a sota!</li>';
    people.forEach((p, i) => {
      let meta;
      if (p.status === "ok") {
        meta = p.achievedOn ? `Aconseguit als ${ageOn(p.birthdate, p.achievedOn)} anys` : "Aconseguit";
      } else if (p.status === "out") {
        meta = `Va fer ${GOAL_AGE} anys el ${fmtDate(p.deadline)}`;
      } else {
        meta = `Li falten ${p.remaining} en ${fmtNum(p.yearsLeft)} anys · necessita ${fmtNum(p.pace)} països/any`;
      }
      const li = document.createElement("li");
      li.className = "rank-item";
      li.innerHTML = `<a href="#p/${encodeURIComponent(p.id)}">
          <span class="rank-pos">${i + 1}</span>
          <span>
            <span class="rank-name">${esc(p.name)}</span> <span class="pill ${p.status}">${STATUS_LABEL[p.status]}</span>
            <div class="rank-meta">${p.age} anys · ${meta}</div>
            <div class="rank-bar"><div style="width:${Math.min(100, (p.count / GOAL) * 100)}%"></div></div>
          </span>
          <span class="rank-right"><span class="rank-count">${p.count}<small>/${GOAL}</small></span></span>
        </a>`;
      ol.append(li);
    });

    $("#form-person").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const name = f.get("name").trim();
      const birthdate = f.get("birthdate");
      if (!name || !birthdate) return;
      if (birthdate > todayStr()) return toast("La data de naixement no pot ser futura.");
      if (state.people.some((p) => norm(p.name) === norm(name)) && !confirm(`Ja hi ha algú que es diu «${name}». L'afegeixo igualment?`)) return;
      e.target.querySelector("button").disabled = true;
      try {
        const row = await store.addPerson({ name, birthdate });
        location.hash = `#p/${row.id}`;
      } catch (err) { fail(err); e.target.querySelector("button").disabled = false; }
    });
  }

  function renderPerson(id) {
    setNav(null);
    const raw = state.people.find((p) => p.id === id);
    if (!raw) { app.innerHTML = '<p>No s\'ha trobat aquesta persona. <a href="#">Tornar</a></p>'; return; }
    mount("#tpl-person");
    const p = computePerson(raw, state.visits);
    const visitedBy = new Map(p.mine.map((v) => [v.country, v]));

    $("#p-name").textContent = p.name;
    $("#p-sub").innerHTML = `${p.age} anys · fa ${GOAL_AGE} anys el ${fmtDate(p.deadline)} · <span class="pill ${p.status}">${STATUS_LABEL[p.status]}</span>`;
    $("#p-count").textContent = p.count;
    $("#p-bar").style.width = Math.min(100, (p.count / GOAL) * 100) + "%";

    let s = "";
    if (p.status === "ok") {
      s += stat(p.achievedOn ? fmtDate(p.achievedOn) : "—", p.achievedOn ? "data en què va arribar a 30" : "data no calculable (hi ha viatges sense data)");
      if (p.achievedOn) { const a = ageExact(p.birthdate, p.achievedOn); s += stat(`${a.years} anys`, `i ${a.days} dies quan ho va aconseguir`); }
    } else if (p.status === "out") {
      s += stat(p.remaining, "li faltaven per arribar a 30");
    } else {
      s += stat(p.remaining, "països que falten");
      s += stat(p.daysLeft.toLocaleString("ca"), "dies que queden");
      s += stat(fmtNum(p.pace), "països/any necessaris");
      s += stat(p.daysLeft / p.remaining >= 1 ? fmtNum(p.daysLeft / p.remaining / 30.44) : "<1", "mesos per país, de mitjana");
    }
    const continents = new Set(p.valid.map((v) => COUNTRY.get(v.country)?.region).filter(Boolean)).size;
    s += stat(continents, "continents");
    if (p.undated) s += stat(p.undated, "països sense data");
    if (p.late.length) s += stat(p.late.length, `visitats després dels ${GOAL_AGE} (no compten)`);
    $("#p-stats").innerHTML = s;

    // Datalist
    $("#country-list").innerHTML = SORTED_COUNTRIES.filter((c) => !visitedBy.has(c.code))
      .map((c) => `<option value="${esc(c.name)}">${c.flag} ${c.code}</option>`).join("");

    const addVisit = async (code, visited_on = null) => {
      if (visited_on && visited_on < p.birthdate) return toast("La data és anterior al naixement.");
      if (visited_on && visited_on > todayStr()) return toast("La data no pot ser futura.");
      try {
        await store.addVisit({ person_id: p.id, country: code, visited_on });
        await refresh(); renderPerson(id);
        toast(`${countryFlag(code)} ${countryName(code)} afegit`);
      } catch (err) { fail(err); }
    };
    const removeVisit = async (v) => {
      if (!confirm(`Treure ${countryName(v.country)}?`)) return;
      try { await store.deleteVisit(v.id); await refresh(); renderPerson(id); } catch (err) { fail(err); }
    };

    $("#form-visit").addEventListener("submit", (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const code = BY_NAME.get(norm(f.get("country")));
      if (!code) return toast("No reconec aquest país. Tria'l de la llista.");
      if (visitedBy.has(code)) return toast("Aquest país ja hi és.");
      addVisit(code, f.get("visited_on") || null);
    });

    // Mapa
    drawMap($("#p-map"), {
      fill: (sel, code) => {
        const v = visitedBy.get(code);
        sel.classed("on", !!v && !(v.visited_on && v.visited_on >= p.deadline));
        sel.classed("late", !!v && !!v.visited_on && v.visited_on >= p.deadline);
      },
      title: (code, fallback) => {
        if (!code) return esc(fallback);
        const v = visitedBy.get(code);
        return `${countryFlag(code)} ${esc(countryName(code))}${v ? ` — visitat${v.visited_on ? " el " + fmtDate(v.visited_on) : ""}` : " — clica per afegir"}`;
      },
      onClick: (code) => { const v = visitedBy.get(code); v ? removeVisit(v) : addVisit(code); },
    });

    // Llista
    const ul = $("#p-visits");
    const ordered = [...p.mine].sort((a, b) => (a.visited_on || "9999").localeCompare(b.visited_on || "9999") || countryName(a.country).localeCompare(countryName(b.country), "ca"));
    if (!ordered.length) ul.innerHTML = '<li class="muted">Encara cap país.</li>';
    for (const v of ordered) {
      const isLate = v.visited_on && v.visited_on >= p.deadline;
      const li = document.createElement("li");
      li.innerHTML = `<span class="flag">${countryFlag(v.country)}</span>
        <span><span class="${isLate ? "late" : ""}">${esc(countryName(v.country))}</span>
          ${isLate ? `<span class="tag">· després dels ${GOAL_AGE}</span>` : ""}
          ${COUNTRY.get(v.country)?.un ? "" : '<span class="tag">· territori / no membre ONU</span>'}</span>
        <span class="date-cell"><input type="date" value="${v.visited_on || ""}" aria-label="Data de visita"></span>
        <button class="link-btn" title="Treure" aria-label="Treure ${esc(countryName(v.country))}">✕</button>`;
      li.querySelector("input").addEventListener("change", async (e) => {
        const val = e.target.value || null;
        if (val && (val < p.birthdate || val > todayStr())) { e.target.value = v.visited_on || ""; return toast("Data fora de rang."); }
        try { await store.updateVisit(v.id, { visited_on: val }); await refresh(); renderPerson(id); } catch (err) { fail(err); }
      });
      li.querySelector("button").addEventListener("click", () => removeVisit(v));
      ul.append(li);
    }

    // Editar / eliminar
    const fe = $("#form-edit");
    fe.name.value = p.name; fe.birthdate.value = p.birthdate;
    fe.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = fe.name.value.trim(), birthdate = fe.birthdate.value;
      if (birthdate > todayStr()) return toast("La data de naixement no pot ser futura.");
      try { await store.updatePerson(p.id, { name, birthdate }); await refresh(); renderPerson(id); toast("Desat"); } catch (err) { fail(err); }
    });
    $("#btn-delete").addEventListener("click", async () => {
      if (!confirm(`Segur que vols eliminar ${p.name} i els seus ${p.mine.length} països? No es pot desfer.`)) return;
      try { await store.deletePerson(p.id); await refresh(); location.hash = "#"; } catch (err) { fail(err); }
    });
  }

  function renderGroupMap() {
    setNav("map");
    mount("#tpl-map");
    const names = new Map(state.people.map((p) => [p.id, p.name]));
    const who = new Map(); // country -> [names]
    for (const v of state.visits) {
      if (!names.has(v.person_id)) continue;
      if (!who.has(v.country)) who.set(v.country, []);
      who.get(v.country).push(names.get(v.person_id));
    }
    const max = Math.max(1, ...[...who.values()].map((a) => a.length));
    $("#g-sub").textContent = `${who.size} països i territoris visitats per almenys una persona del grup (de ${COUNTRY.size}).`;

    drawMap($("#g-map"), {
      fill: (sel, code) => {
        const n = who.get(code)?.length || 0;
        if (n) sel.style("fill", "var(--map-on)").style("fill-opacity", 0.25 + 0.75 * (n / max));
      },
      title: (code, fallback) => {
        if (!code) return esc(fallback);
        const list = who.get(code) || [];
        return `${countryFlag(code)} <b>${esc(countryName(code))}</b><br>${list.length ? list.length + ": " + list.map(esc).join(", ") : "ningú encara"}`;
      },
    });
    $("#g-legend").innerHTML = `<span><span class="swatch" style="background:var(--map-on);opacity:.25"></span>1 persona</span>
      <span><span class="swatch" style="background:var(--map-on)"></span>${max} ${max === 1 ? "persona" : "persones"}</span>`;

    const top = [...who.entries()].sort((a, b) => b[1].length - a[1].length || countryName(a[0]).localeCompare(countryName(b[0]), "ca")).slice(0, 20);
    $("#g-top").innerHTML = top.length
      ? top.map(([c, l]) => `<li>${countryFlag(c)} ${esc(countryName(c))} <b>${l.length}</b> <span class="who">${l.map(esc).join(", ")}</span></li>`).join("")
      : '<li class="muted">Encara no hi ha visites.</li>';
  }

  // ---------- Router ----------
  async function route() {
    hideTip();
    const h = decodeURIComponent(location.hash.slice(1));
    try { await refresh(); } catch (err) { app.innerHTML = `<p>No s'han pogut carregar les dades: ${esc(err.message)}</p>`; return; }
    if (h.startsWith("p/")) renderPerson(h.slice(2));
    else if (h === "mapa") renderGroupMap();
    else renderHome();
    window.scrollTo(0, 0);
  }

  if (!useSupabase) $("#demo-banner").hidden = false;
  addEventListener("hashchange", route);
  route();

  // Exposat per a proves
  window.__app = { computePerson, rankPeople, addYears, ageOn };
})();
