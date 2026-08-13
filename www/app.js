// Maritimo — pomorska vremenska prognoza za voditelje brodica (Jadran)
// Tab "Vrijeme": Open-Meteo meteogrami (3 dana) + dnevne oznake + izvedena upozorenja.

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const ARROWS = { N: "↓", NE: "↙", E: "←", SE: "↖", S: "↑", SW: "↗", W: "→", NW: "↘" };
const DANI = ["Nedjelja", "Ponedjeljak", "Utorak", "Srijeda", "Četvrtak", "Petak", "Subota"];

function dirTo8(deg) { return COMPASS[Math.round(deg / 45) % 8]; }
const WIND_NAMES = { NE: "bura (NE)", N: "bura (N)", SE: "jugo (SE)", S: "jugo (S)",
  NW: "maestral (NW)", W: "zapadnjak (W)", SW: "lebić (SW)", E: "levant (E)" };
function windName(deg, speedKn) {
  if (speedKn < 3) return "promjenjiv";
  const d = dirTo8(deg);
  return WIND_NAMES[d] || d;
}
// Semaforska procjena za male brodice
function assess(windKn, gustKn, waveM) {
  let level = "g", title = "Povoljno", sub = "Mirno more, pogodno i za manje plovilo.";
  if (windKn >= 11 || gustKn >= 18 || waveM >= 0.6) {
    level = "a"; title = "Oprez"; sub = "Umjeren vjetar/valovi — manje i otvorene brodice oprezno.";
  }
  if (windKn >= 17 || gustKn >= 25 || waveM >= 1.25) {
    level = "r"; title = "Nepovoljno"; sub = "Jak vjetar ili valovi — odgoditi izlazak.";
  }
  return { level, title, sub };
}

const BEAUFORT = [
  [1,   "tišina"],
  [4,   "lahor"],
  [7,   "povjetarac"],
  [11,  "slab vjetar"],
  [17,  "umjeren vjetar"],
  [22,  "umjereno jak"],
  [28,  "jak vjetar"],
  [34,  "žestok vjetar"],
  [41,  "olujni vjetar"],
  [48,  "jaka oluja"],
  [56,  "vrlo jaka oluja"],
  [64,  "orkanska oluja"],
  [Infinity, "orkan"]
];
function beaufort(kn) {
  for (let i = 0; i < BEAUFORT.length; i++)
    if (kn < BEAUFORT[i][0]) return { n: i, label: BEAUFORT[i][1] };
  return { n: 12, label: BEAUFORT[12][1] };
}

const SEA_STATE = [
  [0.01, "mirno"],
  [0.1,  "gotovo mirno"],
  [0.5,  "malo valovito"],
  [1.25, "umjereno valovito"],
  [2.5,  "valovito"],
  [4,    "jako valovito"],
  [6,    "uzburkano"],
  [9,    "vrlo uzburkano"],
  [14,   "visoko"],
  [Infinity, "iznimno"]
];
function seaState(waveM) {
  if (waveM == null) return null;
  for (let i = 0; i < SEA_STATE.length; i++)
    if (waveM < SEA_STATE[i][0]) return { n: i, label: SEA_STATE[i][1] };
  return { n: 9, label: SEA_STATE[9][1] };
}

const state = { spots: [], center: { lat: 44.72, lon: 14.55 }, active: null,
  wx: null, dhmz: undefined, mgDays: [], mgHours: [],
  capitanies: [], regions: [], regionId: null, regionRe: /$^/, mgDefaultIdx: 0,
  fuelStations: [], vodicFilter: "all",
  model: (typeof localStorage !== "undefined" && localStorage.getItem("mgModel")) || "best_match",
  wrIdx: 0 };

// ================= WEATHER =================
async function fetchWeather(lat, lon) {
  const modelParam = state.model && state.model !== "best_match" ? `&models=${state.model}` : "";
  const fUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=wind_speed_10m,wind_gusts_10m,wind_direction_10m,temperature_2m,precipitation,cloud_cover` +
    `&hourly=wind_speed_10m,wind_gusts_10m,wind_direction_10m,precipitation,cloud_cover,pressure_msl,temperature_2m` +
    `&wind_speed_unit=kn&timezone=Europe%2FZagreb&forecast_days=3` + modelParam;
  const mUrl = `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}` +
    `&current=wave_height,sea_surface_temperature&hourly=wave_height,sea_surface_temperature&timezone=Europe%2FZagreb&forecast_days=3`;
  const [f, m] = await Promise.allSettled([
    fetch(fUrl).then(r => r.json()), fetch(mUrl).then(r => r.json())
  ]);
  return {
    fc: f.status === "fulfilled" ? f.value : null,
    mar: m.status === "fulfilled" ? m.value : null
  };
}

// Grupiraj satne podatke po danu → niz od (najviše 3) dana
function groupDays(wx) {
  if (!wx.fc || !wx.fc.hourly) return [];
  const h = wx.fc.hourly;
  const waveByTime = {}, seaByTime = {};
  if (wx.mar && wx.mar.hourly) {
    const mh = wx.mar.hourly;
    mh.time.forEach((t, i) => {
      waveByTime[t] = mh.wave_height ? mh.wave_height[i] : null;
      seaByTime[t] = mh.sea_surface_temperature ? mh.sea_surface_temperature[i] : null;
    });
  }
  const byDate = {};
  h.time.forEach((t, i) => {
    const date = t.slice(0, 10);
    const dt = new Date(t);
    (byDate[date] = byDate[date] || []).push({
      t: dt, hour: dt.getHours(),
      wind: h.wind_speed_10m[i], gust: h.wind_gusts_10m[i], dir: h.wind_direction_10m[i],
      precip: h.precipitation[i], cloud: h.cloud_cover[i],
      pres: h.pressure_msl ? h.pressure_msl[i] : null,
      temp: h.temperature_2m ? h.temperature_2m[i] : null,
      wave: waveByTime[t] != null ? waveByTime[t] : null,
      sea: seaByTime[t] != null ? seaByTime[t] : null
    });
  });
  return Object.keys(byDate).sort().slice(0, 3).map(date => ({ date, hours: byDate[date] }));
}

function dayName(dateStr, idx) {
  if (idx === 0) return "Danas";
  if (idx === 1) return "Sutra";
  return DANI[new Date(dateStr).getDay()];
}
function dayLabelDate(dateStr) {
  const d = new Date(dateStr);
  return `${d.getDate()}. ${d.getMonth() + 1}.`;
}

function dayVerdict(hours) {
  const maxWind = Math.max(...hours.map(x => x.wind));
  const maxGust = Math.max(...hours.map(x => x.gust));
  const waves = hours.map(x => x.wave).filter(v => v != null);
  const maxWave = waves.length ? Math.max(...waves) : 0;
  return { ...assess(maxWind, maxGust, maxWave), maxWind, maxGust, maxWave,
    totPrecip: hours.reduce((s, x) => s + (x.precip || 0), 0) };
}

// ---- Meteogram (SVG) ----
// Zajednička geometrija (koristi je i crtanje i hover)
// Redoslijed panela: vjetar → valovi → kiša → oblaci → temperatura → tlak
// AR_Y = traka za strelice smjera (iznad panela vjetra)
const MG = { AX_W: 44, DAY_Y: 8, HR_Y: 22, AR_Y: 40,
  WN_Y: 54, WN_H: 76,    // vjetar — najvažniji, najviši
  WV_Y: 156, WV_H: 50,   // valovi — drugi po važnosti
  RN_Y: 226, RN_H: 20,
  CL_Y: 266, CL_H: 18,
  TP_Y: 306, TP_H: 44,
  PR_Y: 370, PR_H: 34 };
MG.WN_B = MG.WN_Y + MG.WN_H; MG.WV_B = MG.WV_Y + MG.WV_H; MG.RN_B = MG.RN_Y + MG.RN_H;
MG.CL_B = MG.CL_Y + MG.CL_H; MG.TP_B = MG.TP_Y + MG.TP_H; MG.PR_B = MG.PR_Y + MG.PR_H;
MG.H = 416;
const fmtTick = v => `${+v.toFixed(2)}`;

const MG_ICONS = [
  { key: "vjetar", color: "#2a78d6", svg: `<path d="M1,5 H8 C10,5 10,2 8,2 H7 M1,8 H10 C12,8 12,11 10,11 H9 M1,11 H6 C7.5,11 7.5,13.5 6,13.5 H5" stroke-width="1.4" stroke="currentColor" fill="none" stroke-linecap="round"/>` },
  { key: "valovi", color: "#1baf7a", svg: `<path d="M0,8 Q2,4 4,8 Q6,12 8,8 Q10,4 12,8 M0,12 Q2,8 4,12 Q6,16 8,12" stroke-width="1.4" stroke="currentColor" fill="none" stroke-linecap="round"/>` },
  { key: "kisa",   color: "#5598e7", svg: `<path d="M3,0 Q3,3 1,5 M7,0 Q7,3 5,5 M11,0 Q11,3 9,5 M5,5 Q5,8 3,10 M9,5 Q9,8 7,10" stroke-width="1.3" stroke="currentColor" fill="none" stroke-linecap="round"/>` },
  { key: "oblaci", color: "#a7b0b8", svg: `<path d="M3,10 H11 A3,3 0 0 0 11,4 A4,4 0 0 0 3.5,5 A2.5,2.5 0 0 0 3,10 Z" stroke-width="1.3" stroke="currentColor" fill="none"/>` },
  { key: "temp",   color: "#eb6834", svg: `<path d="M6,1 V8 M4,10 A3,3 0 1 0 8,10" stroke-width="1.4" stroke="currentColor" fill="none" stroke-linecap="round"/><circle cx="6" cy="11" r="1.2" fill="currentColor"/>` },
  { key: "tlak",   color: "#4a3aa7", svg: `<path d="M1,12 L4,4 L7,9 L10,2 L13,7" stroke-width="1.4" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` }
];

// Kontinuirani meteogram: fiksna y-os (lijevo) + skrolabilni graf (širina = plotW).
// Jedan dan ≈ širina okvira; ostali dani se skrolaju horizontalno.
function buildMeteogram(hours, plotW) {
  const n = hours.length;
  const { AX_W, DAY_Y, HR_Y, AR_Y, WN_Y, WN_H, WN_B, WV_Y, WV_H, WV_B, RN_Y, RN_H, RN_B,
    CL_Y, CL_H, CL_B, TP_Y, TP_H, TP_B, PR_Y, PR_H, PR_B, H } = MG;
  const W = plotW;
  const xi = i => (i / Math.max(1, n - 1)) * W;

  const gusts = hours.map(x => x.gust);
  const winds = hours.map(x => x.wind);
  const waves = hours.map(x => x.wave == null ? 0 : x.wave);
  const wmax = Math.max(20, Math.ceil(Math.max(...gusts) / 5) * 5);
  const vmax = Math.max(0.75, Math.ceil(Math.max(...waves) * 4) / 4);
  const pmax = Math.max(2, Math.ceil(Math.max(...hours.map(x => x.precip || 0))));
  const pv = hours.map(x => x.pres).filter(v => v != null);
  const pMin = pv.length ? Math.min(...pv) : 1013, pMax = pv.length ? Math.max(...pv) : 1013;
  let pLo = Math.floor(pMin - 1), pHi = Math.ceil(pMax + 1);
  if (pHi - pLo < 4) { pLo -= 2; pHi += 2; }
  const tv = hours.flatMap(x => [x.temp, x.sea]).filter(v => v != null);
  const tMin = tv.length ? Math.min(...tv) : 15, tMax = tv.length ? Math.max(...tv) : 25;
  let tLo = Math.floor(tMin - 1), tHi = Math.ceil(tMax + 1);
  if (tHi - tLo < 4) { tLo -= 2; tHi += 2; }
  const yWind = v => WN_B - (v / wmax) * WN_H;
  const yWave = v => WV_B - (v / vmax) * WV_H;
  const yPres = v => PR_B - ((v - pLo) / (pHi - pLo)) * PR_H;
  const yTemp = v => TP_B - ((v - tLo) / (tHi - tLo)) * TP_H;
  const bw = Math.max(1.6, (W / Math.max(1, n)) * 0.7);
  const poly = (arr, yf) => arr.map((v, i) => `${xi(i).toFixed(1)},${yf(v).toFixed(1)}`).join(" ");
  const polyN = (arr, yf) => arr.map((v, i) => v == null ? null : `${xi(i).toFixed(1)},${yf(v).toFixed(1)}`).filter(Boolean).join(" ");

  const TOP = AR_Y - 11;      // vrh grafa (iznad trake strelica)
  const wstep = wmax <= 20 ? 5 : 10;
  const vstep = vmax <= 1 ? 0.25 : (vmax <= 2 ? 0.5 : 1);
  // Pozadinske trake po uvjetu (jasno razdvajanje) — [vrh, dno]
  const bands = [
    [AR_Y - 11, WN_B + 3], [WV_Y - 9, WV_B + 3], [RN_Y - 9, RN_B + 3],
    [CL_Y - 9, CL_B + 3], [TP_Y - 10, TP_B + 3], [PR_Y - 11, PR_B + 3]
  ];

  // ===== FIKSNA OS (lijevo) =====
  const atk = (y, t) => `<text x="${AX_W - 4}" y="${y + 3}" class="mg-ax" text-anchor="end">${t}</text>`;
  let a = `<svg class="mg-axis" width="${AX_W}" height="${H}" viewBox="0 0 ${AX_W} ${H}" xmlns="http://www.w3.org/2000/svg">`;
  bands.forEach(([t, b], k) => {
    a += `<rect x="1" y="${t}" width="${AX_W - 1}" height="${b - t}" rx="3" class="mg-band"/>`;
    const ic = MG_ICONS[k];
    a += `<g transform="translate(4,${t + 1})" color="${ic.color}">${ic.svg}</g>`;
  });
  for (let v = 0; v <= wmax + 1e-6; v += wstep) a += atk(yWind(v), v);
  for (let v = 0; v <= vmax + 1e-6; v += vstep) a += atk(yWave(v), fmtTick(v));
  a += atk(RN_Y + 4, pmax) + atk(RN_B - 1, "0");
  a += atk(CL_Y + 4, "100") + atk(CL_B - 1, "0");
  [tHi, Math.round((tLo + tHi) / 2), tLo].forEach(v => a += atk(yTemp(v), v));
  [pHi, Math.round((pLo + pHi) / 2), pLo].forEach(v => a += atk(yPres(v), v));
  a += `</svg>`;

  // ===== SKROLABILNI GRAF =====
  let s = `<svg class="mg-plot" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" data-n="${n}" data-w="${W}" data-wmax="${wmax}" data-vmax="${vmax}" data-plo="${pLo}" data-phi="${pHi}" data-tlo="${tLo}" data-thi="${tHi}" xmlns="http://www.w3.org/2000/svg">`;
  bands.forEach(([t, b]) => s += `<rect x="0" y="${t}" width="${W}" height="${b - t}" rx="4" class="mg-band"/>`);

  // fini satni raster + 6h + oznake sati
  hours.forEach((x, i) => { s += `<line x1="${xi(i)}" y1="${TOP}" x2="${xi(i)}" y2="${PR_B}" class="mg-hline"/>`; });

  // dnevni separatori + oznake dana
  const bounds = [];
  hours.forEach((x, i) => { if (i === 0 || x.hour === 0) bounds.push(i); });
  bounds.push(n);
  for (let b = 1; b < bounds.length - 1; b++)
    s += `<line x1="${xi(bounds[b])}" y1="${TOP}" x2="${xi(bounds[b])}" y2="${PR_B}" class="mg-daysep"/>`;
  for (let b = 0; b < bounds.length - 1; b++) {
    const i0 = bounds[b], i1 = bounds[b + 1] - 1;
    const name = b === 0 ? "Danas" : b === 1 ? "Sutra" : DANI[hours[i0].t.getDay()];
    s += `<text x="${(xi(i0) + xi(i1)) / 2}" y="${DAY_Y}" class="mg-day">${name} ${hours[i0].t.getDate()}.${hours[i0].t.getMonth() + 1}.</text>`;
  }

  hours.forEach((x, i) => {
    if (x.hour % 6 !== 0) return;
    s += `<line x1="${xi(i)}" y1="${TOP}" x2="${xi(i)}" y2="${PR_B}" class="mg-vgrid"/>`;
    s += `<text x="${xi(i)}" y="${HR_Y}" class="mg-ax" text-anchor="middle">${String(x.hour).padStart(2, "0")}</text>`;
    s += `<text x="${xi(i)}" y="${H - 5}" class="mg-ax" text-anchor="middle">${String(x.hour).padStart(2, "0")}</text>`;
  });

  const grid = y => `<line x1="0" y1="${y}" x2="${W}" y2="${y}" class="mg-grid"/>`;

  // 1) VJETAR — granice opasnosti
  if (wmax > 11) s += `<line x1="0" y1="${yWind(11)}" x2="${W}" y2="${yWind(11)}" class="mg-limit-a"/>`;
  if (wmax > 17) s += `<line x1="0" y1="${yWind(17)}" x2="${W}" y2="${yWind(17)}" class="mg-limit-r"/>`;
  for (let v = 0; v <= wmax + 1e-6; v += wstep) s += grid(yWind(v));
  s += `<polyline points="${poly(gusts, yWind)}" class="mg-gust"/>`;
  s += `<polyline points="${poly(winds, yWind)}" class="mg-wind"/>`;
  // strelice smjera vjetra (crtane) — pokazuju kamo vjetar puše
  hours.forEach((x, i) => {
    const ang = Math.round((x.dir + 180) % 360);
    s += `<g class="mg-warrow" transform="translate(${xi(i).toFixed(1)},${AR_Y}) rotate(${ang})"><line x1="0" y1="6.5" x2="0" y2="-3"/><path d="M0,-7.5 L-3.2,-2 L3.2,-2 Z"/></g>`;
  });
  // 2) VALOVI — granice opasnosti
  if (vmax > 0.6) s += `<line x1="0" y1="${yWave(0.6)}" x2="${W}" y2="${yWave(0.6)}" class="mg-limit-a"/>`;
  if (vmax > 1.25) s += `<line x1="0" y1="${yWave(1.25)}" x2="${W}" y2="${yWave(1.25)}" class="mg-limit-r"/>`;
  for (let v = 0; v <= vmax + 1e-6; v += vstep) s += grid(yWave(v));
  const wavePts = hours.map((x, i) => `${xi(i).toFixed(1)},${yWave(waves[i]).toFixed(1)}`).join(" L ");
  s += `<path d="M 0,${WV_B} L ${wavePts} L ${W},${WV_B} Z" class="mg-wave-fill"/>`;
  s += `<polyline points="${poly(waves, yWave)}" class="mg-wave"/>`;
  // 3) KIŠA
  s += grid(RN_B);
  hours.forEach((x, i) => { if (!x.precip) return; const hh = Math.min(1, x.precip / pmax) * RN_H; s += `<rect x="${xi(i) - bw / 2}" y="${RN_B - hh}" width="${bw}" height="${hh}" rx="1" class="mg-rain"/>`; });
  // 4) OBLACI
  hours.forEach((x, i) => { const hh = (x.cloud / 100) * CL_H; s += `<rect x="${xi(i) - bw / 2}" y="${CL_Y + (CL_H - hh)}" width="${bw}" height="${hh}" rx="1" class="mg-cloud"/>`; });
  // 5) TEMPERATURA
  [tHi, Math.round((tLo + tHi) / 2), tLo].forEach(v => s += grid(yTemp(v)));
  s += `<polyline points="${polyN(hours.map(x => x.sea), yTemp)}" class="mg-sea"/>`;
  s += `<polyline points="${polyN(hours.map(x => x.temp), yTemp)}" class="mg-air"/>`;
  // 6) TLAK
  [pHi, Math.round((pLo + pHi) / 2), pLo].forEach(v => s += grid(yPres(v)));
  s += `<polyline points="${polyN(hours.map(x => x.pres), yPres)}" class="mg-pres"/>`;

  // hover markeri
  s += `<line class="mg-cross" x1="0" x2="0" y1="${TOP}" y2="${PR_B}" style="visibility:hidden"/>`;
  ["dgust", "dwind", "dwave", "dpres", "dair", "dsea"].forEach(c => s += `<circle class="mg-dot ${c}" r="4" style="visibility:hidden"/>`);
  s += `</svg>`;

  return { axis: a, plot: s };
}

// Fiksni okvir s detaljima iznad meteograma — svaki uvjet u svom retku
const KRAT_DAN = ["ned", "pon", "uto", "sri", "čet", "pet", "sub"];
function renderReadout(h) {
  const el = document.getElementById("mgReadout");
  if (!el || !h) return;
  const row = (sw, k, v) => `<div class="ro-row"><i class="ro-sw" style="${sw}"></i><span class="ro-k">${k}</span><span class="ro-v">${v}</span></div>`;
  el.innerHTML =
    `<div class="ro-head">${KRAT_DAN[h.t.getDay()]} ${String(h.hour).padStart(2, "0")}:00 · ${ARROWS[dirTo8(h.dir)]} ${windName(h.dir, h.wind)}</div>` +
    `<div class="ro-rows">` +
    row("background:#2a78d6", "Vjetar", (() => { const bf = beaufort(h.wind); return `${Math.round(h.wind)} / udari ${Math.round(h.gust)} čv · Bf ${bf.n} (${bf.label})`; })()) +
    row("background:#1baf7a", "Valovi", h.wave == null ? "—" : (() => { const ss = seaState(h.wave); return `${h.wave.toFixed(2)} m · stanje mora ${ss.n} (${ss.label})`; })()) +
    row("background:#5598e7", "Kiša", `${(h.precip || 0).toFixed(1)} mm`) +
    row("background:#a7b0b8", "Oblaci", `${Math.round(h.cloud)} %`) +
    row("background:linear-gradient(90deg,#eb6834 50%,#1baf7a 50%)", "Temperatura",
      `zrak ${h.temp == null ? "—" : Math.round(h.temp) + "°"} · more ${h.sea == null ? "—" : Math.round(h.sea) + "°"}`) +
    row("background:#4a3aa7", "Tlak", h.pres == null ? "—" : `${Math.round(h.pres)} hPa`) +
    `</div>`;
}

function wireMeteogramHover() {
  const scroll = document.querySelector(".mg-scroll");
  if (!scroll) return;
  const svg = scroll.querySelector("svg.mg-plot");
  if (!svg) return;
  const cross = svg.querySelector(".mg-cross");
  const dW = svg.querySelector(".dwind"), dG = svg.querySelector(".dgust"), dV = svg.querySelector(".dwave"),
    dP = svg.querySelector(".dpres"), dA = svg.querySelector(".dair"), dS = svg.querySelector(".dsea");
  const W = +svg.dataset.w, n = +svg.dataset.n,
    wmax = +svg.dataset.wmax, vmax = +svg.dataset.vmax,
    pLo = +svg.dataset.plo, pHi = +svg.dataset.phi, tLo = +svg.dataset.tlo, tHi = +svg.dataset.thi;
  const hours = state.mgHours || [];
  const xi = i => (i / Math.max(1, n - 1)) * W;
  const yWind = v => MG.WN_B - (v / wmax) * MG.WN_H;
  const yWave = v => MG.WV_B - (v / vmax) * MG.WV_H;
  const yPres = v => MG.PR_B - ((v - pLo) / (pHi - pLo)) * MG.PR_H;
  const yTemp = v => MG.TP_B - ((v - tLo) / (tHi - tLo)) * MG.TP_H;
  const setDot = (d, cond, x, y) => {
    if (cond) { d.setAttribute("cx", x); d.setAttribute("cy", y); d.style.visibility = "visible"; }
    else d.style.visibility = "hidden";
  };

  const move = clientX => {
    const rect = svg.getBoundingClientRect();
    let f = (clientX - rect.left) / rect.width; f = Math.max(0, Math.min(1, f));
    const i = Math.round(f * (n - 1));
    const h = hours[i]; if (!h) return;
    const x = xi(i);
    cross.setAttribute("x1", x); cross.setAttribute("x2", x); cross.style.visibility = "visible";
    setDot(dW, true, x, yWind(h.wind));
    setDot(dG, true, x, yWind(h.gust));
    setDot(dV, h.wave != null, x, h.wave != null ? yWave(h.wave) : 0);
    setDot(dP, h.pres != null, x, h.pres != null ? yPres(h.pres) : 0);
    setDot(dA, h.temp != null, x, h.temp != null ? yTemp(h.temp) : 0);
    setDot(dS, h.sea != null, x, h.sea != null ? yTemp(h.sea) : 0);
    renderReadout(h);
  };
  const rest = () => {
    cross.style.visibility = "hidden";
    [dW, dG, dV, dP, dA, dS].forEach(d => d.style.visibility = "hidden");
    renderReadout(hours[state.mgDefaultIdx] || hours[0]);   // vrati na zadani sat
  };
  svg.addEventListener("mousemove", e => move(e.clientX));
  svg.addEventListener("mouseleave", rest);
  svg.addEventListener("touchmove", e => { if (e.touches[0]) move(e.touches[0].clientX); }, { passive: true });
}

// DHMZ upozorenja za vjetar koja se preklapaju s danim danom (i s regijom Kvarner)
function severityRank(color) { return color === "red" ? 3 : color === "orange" ? 2 : color === "yellow" ? 1 : 0; }
function dhmzWindForDay(dateStr) {
  const all = state.dhmz;
  if (!all || !all.length) return [];
  const ds = new Date(dateStr + "T00:00:00"), de = new Date(dateStr + "T23:59:59");
  return all.filter(w => {
    if (!(w.areas || []).some(a => state.regionRe.test(a))) return false;
    if (!/vjetar|bura|olujno|jugo/i.test(w.event || "")) return false;
    const o = new Date(w.onset), e = new Date(w.expires);
    return o <= de && e >= ds;
  });
}

function dayWarnMarkup(dateStr) {
  const ww = dhmzWindForDay(dateStr);
  if (!ww.length) return { chip: "", block: "" };
  const worst = ww.reduce((a, w) => severityRank(w.color) > severityRank(a.color) ? w : a, ww[0]);
  const cls = COLOR_TO_LEVEL[worst.color] || "a";
  const chip = `<span class="warn-chip ${cls}" title="Aktivno DHMZ upozorenje za vjetar">⚠️ DHMZ vjetar</span>`;
  const rows = ww.map(w => {
    const area = (w.areas || []).filter(a => state.regionRe.test(a))[0] || (w.areas || [])[0] || "";
    return `<div class="wx-warn-row"><b>${w.event}</b> · ${area} · ${fmtRange(w.onset, w.expires)}
      <div class="wx-warn-detail">${w.description || ""}</div></div>`;
  }).join("");
  const block = `<div class="wx-day-warn ${cls}">${rows}
    <a class="wx-warn-link" href="https://meteo.hr/naslovnica-upozorenja.php" target="_blank" rel="noopener">detalji na DHMZ →</a></div>`;
  return { chip, block };
}

function renderMeteograms(wx) {
  const el = document.getElementById("meteograms");
  const days = groupDays(wx);
  state.mgDays = days;
  if (!days.length) {
    el.innerHTML = `<div class="card"><div class="detail-empty">Prognoza nedostupna.</div></div>`;
    state.mgHours = []; return;
  }
  const all = days.flatMap(d => d.hours);
  state.mgHours = all;

  // Zaglavlje: 3 dnevne oznake (po meteogramu) + DHMZ chip/detalji
  const head = `<div class="wx-days-head">` + days.map((d, i) => {
    const v = dayVerdict(d.hours);
    const w = dayWarnMarkup(d.date);
    return `<div class="wx-day-seg">
      <div class="wx-seg-row">
        <span class="wx-day-name">${dayName(d.date, i)} <span class="wx-day-date">${dayLabelDate(d.date)}</span></span>
        <span class="wx-seg-badges"><span class="badge ${v.level}" title="Oznaka po meteogramu">${v.title}</span>${w.chip}</span>
      </div>${w.block}</div>`;
  }).join("") + `</div>`;

  // Jedan dan ≈ širina okvira; ukupni graf = broj dana × širina dana → skrola horizontalno.
  const frameW = el.clientWidth || 360;
  const dayW = Math.max(260, frameW - MG.AX_W - 26);
  const plotW = Math.round(days.length * dayW);
  const { axis, plot } = buildMeteogram(all, plotW);

  el.innerHTML = `${head}
  <div class="mg-readout" id="mgReadout"></div>
  <div class="card wx-cont">
    <div class="mg-frame">
      ${axis}
      <div class="mg-scroll">${plot}</div>
    </div>
    <div class="mg-hint">← povuci za sutra i prekosutra · prijeđi mišem za detalje →</div>
    <div class="mg-model">📡 Model: <b>${modelLabel()}</b> · valovi: pomorski model · izvor: Open-Meteo</div>
  </div>`;
  // zadani sat okvira = najbliži sadašnjem trenutku
  const now = new Date();
  let di = all.findIndex(h => h.t >= now);
  state.mgDefaultIdx = di < 0 ? 0 : di;
  renderReadout(all[state.mgDefaultIdx]);
  wireMeteogramHover();
}

// ---- Izvedena upozorenja (iz prognoze) ----
function deriveWarnings(wx) {
  const all = state.mgHours.length ? state.mgHours : groupDays(wx).flatMap(d => d.hours);
  const warns = [];

  const peakWind = all.reduce((a, x) => x.wind > a.wind ? x : a, all[0] || { wind: 0 });
  const peakGust = all.reduce((a, x) => x.gust > a.gust ? x : a, all[0] || { gust: 0 });
  if (peakGust.gust >= 25 || peakWind.wind >= 17) {
    const pk = peakGust.gust >= 25 ? peakGust : peakWind;
    warns.push({ level: "r", title: "Jak vjetar",
      detail: `${windName(pk.dir, pk.wind)} — vjetar do ${Math.round(pk.wind)} čv, udari do ${Math.round(pk.gust)} čv`, when: pk.t });
  } else if (peakGust.gust >= 18 || peakWind.wind >= 11) {
    const pk = peakGust.gust >= 18 ? peakGust : peakWind;
    warns.push({ level: "a", title: "Umjeren vjetar",
      detail: `${windName(pk.dir, pk.wind)} — vjetar do ${Math.round(pk.wind)} čv, udari do ${Math.round(pk.gust)} čv`, when: pk.t });
  }

  const waveVals = all.filter(x => x.wave != null);
  const peakWave = waveVals.reduce((a, x) => x.wave > (a.wave || 0) ? x : a, waveVals[0] || { wave: 0 });
  if (peakWave.wave >= 1.25) warns.push({ level: "r", title: "Valovito more",
    detail: `valovi do ${peakWave.wave.toFixed(1)} m`, when: peakWave.t });
  else if (peakWave.wave >= 0.6) warns.push({ level: "a", title: "Umjereni valovi",
    detail: `valovi do ${peakWave.wave.toFixed(1)} m`, when: peakWave.t });

  const peakRain = all.reduce((a, x) => (x.precip || 0) > (a.precip || 0) ? x : a, all[0] || { precip: 0 });
  if (peakRain.precip >= 10) warns.push({ level: "a", title: "Obilna oborina",
    detail: `do ${peakRain.precip.toFixed(0)} mm/h — moguća grmljavina i naglo pogoršanje`, when: peakRain.t });

  return warns;
}

function whenLabel(d) {
  if (!d) return "";
  const days = ["danas", "sutra"];
  const now = new Date(); const dd = Math.floor((d - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
  const day = dd <= 1 ? days[dd] || "" : DANI[d.getDay()].toLowerCase();
  return `${day} oko ${String(d.getHours()).padStart(2, "0")}h`;
}

// DHMZ regex se postavlja po odabranom području (state.regionRe)
const COLOR_TO_LEVEL = { yellow: "a", orange: "a", red: "r" };
function regionName() { return (state.regions.find(r => r.id === state.regionId) || {}).name || "područje"; }

const MODEL_LABELS = {
  best_match: "Automatski",
  italia_meteo_arpae_icon_2i: "ARPAE ICON-2I",
  icon_seamless: "DWD ICON",
  ecmwf_ifs025: "ECMWF IFS",
  meteofrance_seamless: "Météo-France",
  gfs_seamless: "NOAA GFS"
};
function modelLabel() { return MODEL_LABELS[state.model] || state.model || "Automatski"; }

function fmtRange(onset, expires) {
  try {
    const o = new Date(onset), e = new Date(expires);
    const d = x => `${x.getDate()}.${x.getMonth() + 1}.`;
    const sameDay = o.toDateString() === e.toDateString();
    return sameDay ? `${d(o)} ${String(o.getHours()).padStart(2, "0")}–${String(e.getHours()).padStart(2, "0")}h`
                   : `${d(o)}–${d(e)}`;
  } catch (e) { return ""; }
}

const IS_NATIVE = typeof window !== "undefined" && window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
const DHMZ_CAP_URL = "https://meteo.hr/upozorenja/cap_hr_today.xml";

function parseDhmzCap(xmlText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "application/xml");
  const ns = "urn:oasis:names:tc:emergency:cap:1.2";
  const infos = doc.getElementsByTagNameNS(ns, "info");
  const out = [];
  for (const info of infos) {
    const lang = info.getElementsByTagNameNS(ns, "language")[0];
    if (lang && !lang.textContent.toLowerCase().startsWith("hr")) continue;
    let level = null, color = null;
    for (const p of info.getElementsByTagNameNS(ns, "parameter")) {
      const vn = p.getElementsByTagNameNS(ns, "valueName")[0];
      if (vn && vn.textContent === "awareness_level") {
        const parts = (p.getElementsByTagNameNS(ns, "value")[0]?.textContent || "").split(";").map(s => s.trim());
        if (parts.length >= 2) { level = parseInt(parts[0]) || null; color = parts[1].toLowerCase(); }
      }
    }
    const areas = [];
    for (const a of info.getElementsByTagNameNS(ns, "area")) {
      const desc = a.getElementsByTagNameNS(ns, "areaDesc")[0];
      if (desc && desc.textContent) areas.push(desc.textContent);
    }
    out.push({
      event: info.getElementsByTagNameNS(ns, "event")[0]?.textContent || "",
      severity: info.getElementsByTagNameNS(ns, "severity")[0]?.textContent || "",
      level, color,
      onset: info.getElementsByTagNameNS(ns, "onset")[0]?.textContent || "",
      expires: info.getElementsByTagNameNS(ns, "expires")[0]?.textContent || "",
      areas,
      description: (info.getElementsByTagNameNS(ns, "description")[0]?.textContent || "").trim(),
      instruction: (info.getElementsByTagNameNS(ns, "instruction")[0]?.textContent || "").trim(),
    });
  }
  return out;
}

async function fetchDhmz() {
  try {
    if (IS_NATIVE) {
      const r = await fetch(DHMZ_CAP_URL);
      const xml = await r.text();
      return parseDhmzCap(xml);
    }
    const r = await fetch("/api/warnings");
    const j = await r.json();
    return j.warnings || [];
  } catch (e) { return null; }
}

function dhmzRows(all) {
  if (all === null) return `<div class="warn-note">DHMZ upozorenja trenutno nedostupna.</div>`;
  const mine = all.filter(w => (w.areas || []).some(a => state.regionRe.test(a)));
  if (!mine.length) {
    const other = all.length ? ` (${all.length} za druge regije)` : "";
    return `<div class="warn-row g"><span class="warn-dot"></span>
      <div><b>Nema službenih upozorenja za ovo područje</b><br>
      <span class="warn-detail">danas prema DHMZ-u${other}</span></div></div>`;
  }
  return mine.map(w => {
    const lvl = COLOR_TO_LEVEL[w.color] || "a";
    const area = (w.areas || []).filter(a => state.regionRe.test(a))[0] || (w.areas || [])[0] || "";
    return `<div class="warn-row ${lvl}"><span class="warn-dot"></span>
      <div><b>${w.event}</b> <span class="warn-when">${fmtRange(w.onset, w.expires)}</span><br>
      <span class="warn-detail">${area}${w.description ? " · " + w.description : ""}</span></div></div>`;
  }).join("");
}

function renderWarnings(wx, dhmz) {
  const el = document.getElementById("warnings");
  const marine = deriveWarnings(wx);
  const marineRows = marine.length
    ? marine.map(w => `<div class="warn-row ${w.level}"><span class="warn-dot"></span>
        <div><b>${w.title}</b> <span class="warn-when">${whenLabel(w.when)}</span><br>
        <span class="warn-detail">${w.detail}</span></div></div>`).join("")
    : `<div class="warn-row g"><span class="warn-dot"></span><div><b>More mirno</b><br>
       <span class="warn-detail">nema jakog vjetra/valova u 3 dana</span></div></div>`;
  document.getElementById("warnMarine").innerHTML =
    `<div class="warn-head">🌊 More i vjetar <span class="warn-src">automatski iz prognoze</span></div>` + marineRows +
    `<div class="warn-jump" role="button" tabindex="0"
       onclick="document.getElementById('warnings').scrollIntoView({behavior:'smooth',block:'start'})">
       ⚠️ Ovo je automatski izračun. <b>Obavezno provjerite i službena upozorenja DHMZ-a</b> pri dnu stranice ↓
     </div>`;

  const dhmzHtml = dhmz === undefined
    ? `<div class="warn-note">učitavam DHMZ…</div>` : dhmzRows(dhmz);

  el.innerHTML = `
    <div class="warn-head">⚠️ Službena upozorenja <span class="warn-src">DHMZ · ${regionName()}</span></div>
    ${dhmzHtml}
    <a class="warn-official" href="https://meteo.hr/naslovnica-upozorenja.php" target="_blank" rel="noopener">
      Sve regije na DHMZ-u →</a>`;
}

// Učitaj vrijeme za lokaciju i osvježi tab Vrijeme
async function loadWeather(lat, lon, name) {
  state.wx = { name, lat, lon, fc: null, mar: null, loading: true };
  const w = await fetchWeather(lat, lon);
  state.wx = { ...w, name, lat, lon };
  renderWarnings(state.wx, state.dhmz);   // state.dhmz: undefined dok se ne učita
  renderMeteograms(state.wx);
  refreshWindRose();
  return state.wx;
}

// Prebaci cijelo područje (Kvarner / Dubrovnik / …)
async function setRegion(id, opts = {}) {
  const r = state.regions.find(x => x.id === id) || state.regions[0];
  if (!r) return;
  state.regionId = r.id;
  state.spots = r.spots;
  state.center = r.center;
  state.capitanies = r.capitanies || [];
  state.fuelStations = r.fuelStations || [];
  state.regionRe = new RegExp(r.dhmz, "i");
  state.active = null;
  const rsel = document.getElementById("regionSelect");
  if (rsel) rsel.value = r.id;
  fillSelectors();
  wireSos();
  renderVodic();
  if (opts.skipWeather) return;
  const lat = opts.lat != null ? opts.lat : r.center.lat;
  const lon = opts.lon != null ? opts.lon : r.center.lon;
  const name = opts.name || (r.name + " (centar)");
  await loadWeather(lat, lon, name);
}

// ================= SELECTION =================
async function selectSpot(id) {
  const spot = state.spots.find(s => s.id === id) || null;
  state.active = spot;
  document.getElementById("wxSelect").value = id || "";
  if (spot) await loadWeather(spot.lat, spot.lon, spot.name);
}

// ================= Radar =================
function wireRadar() {
  const btn = document.getElementById("btn-radar-refresh");
  if (!btn) return;
  btn.addEventListener("click", () => {
    const img = document.getElementById("dhmz-radar-img");
    if (img) img.src = "https://vrijeme.hr/kompozit-stat.png?" + Date.now();
  });
}

// ================= UI wiring =================
function wireTabs() {
  const tabs = document.querySelectorAll(".tab");

  function activateTab(name, pushHistory) {
    const btn = document.querySelector(`.tab[data-tab="${name}"]`);
    const pane = document.getElementById("tab-" + name);
    if (!btn || !pane) return;
    tabs.forEach(x => x.classList.remove("active"));
    btn.classList.add("active");
    document.querySelectorAll(".tabpane").forEach(p => p.classList.remove("active"));
    pane.classList.add("active");
    if (pushHistory && location.hash.slice(1) !== name) {
      history.pushState({ tab: name }, "", "#" + name);
    }
    if (name === "ruza" && (state.mgHours || []).length) {
      setTimeout(() => drawWindRose((state.mgHours || [])[state.wrIdx || 0]), 50);
    }
  }

  tabs.forEach(t => t.addEventListener("click", () => activateTab(t.dataset.tab, true)));

  window.addEventListener("popstate", () => {
    activateTab(location.hash.slice(1) || "vrijeme", false);
  });

  const initial = location.hash.slice(1);
  if (initial) activateTab(initial, false);
}

let _sosWired = false;
function wireSos() {
  const modal = document.getElementById("sosModal");
  if (!_sosWired) {
    document.getElementById("sosBtn").onclick = () => { modal.hidden = false; };
    document.getElementById("sosClose").onclick = () => { modal.hidden = true; };
    modal.addEventListener("click", e => { if (e.target === modal) modal.hidden = true; });
    _sosWired = true;
  }
  const c = state.capitanies[0];
  document.getElementById("nearestCapt").innerHTML = c
    ? `<span class="sos-num">LK</span><span>${c.name} — <a href="tel:${c.phone.replace(/\s/g, "")}">${c.phone}</a> · VHF ${c.vhf}</span>`
    : "";
}

function fillSelectors() {
  const regionName = (state.regions.find(r => r.id === state.regionId) || {}).name || "područje";
  const centerLabel = `— cijelo ${regionName} (centar) —`;
  const opts = `<option value="">${centerLabel}</option>` +
    state.spots.map(s => `<option value="${s.id}">${s.name}</option>`).join("");
  const wx = document.getElementById("wxSelect");
  wx.innerHTML = opts;
  wx.onchange = () => {
    const id = wx.value;
    if (!id) { loadWeather(state.center.lat, state.center.lon, regionName + " (centar)"); return; }
    selectSpot(id);
  };
}

// Odabir područja + GPS
function wireRegion() {
  const sel = document.getElementById("regionSelect");
  sel.innerHTML = state.regions.map(r => `<option value="${r.id}">${r.name}</option>`).join("");
  sel.onchange = () => setRegion(sel.value);

  const gps = document.getElementById("gpsBtn");
  gps.onclick = () => locateUser({ silent: false });
}

function locateUser({ silent = false } = {}) {
  if (!navigator.geolocation) { if (!silent) alert("GPS nije dostupan u ovom pregledniku."); return Promise.resolve(false); }
  const gps = document.getElementById("gpsBtn");
  gps.disabled = true; gps.textContent = "📍 Tražim…";
  return new Promise(resolve => {
    navigator.geolocation.getCurrentPosition(async pos => {
      const la = pos.coords.latitude, lo = pos.coords.longitude;
      const nearest = state.regions.reduce((a, r) => {
        const d = (r.center.lat - la) ** 2 + (r.center.lon - lo) ** 2;
        return d < a.d ? { r, d } : a;
      }, { r: state.regions[0], d: Infinity }).r;
      gps.disabled = false; gps.textContent = "📍 Moja lokacija";
      await setRegion(nearest.id, { skipWeather: true });
      const spot = nearest.spots.reduce((a, s) => {
        const d = (s.lat - la) ** 2 + (s.lon - lo) ** 2;
        return d < a.d ? { s, d } : a;
      }, { s: null, d: Infinity }).s;
      if (spot) await selectSpot(spot.id);
      else await loadWeather(la, lo, "📍 Moja lokacija");
      resolve(true);
    }, err => {
      gps.disabled = false; gps.textContent = "📍 Moja lokacija";
      if (!silent) alert("Ne mogu dohvatiti GPS lokaciju: " + err.message);
      resolve(false);
    }, { enableHighAccuracy: true, timeout: 10000 });
  });
}

// Izbor modela prognoze (Open-Meteo) — pamti se i osvježava meteogram
function wireModel() {
  const sel = document.getElementById("modelSelect");
  if (!sel) return;
  sel.value = state.model;
  sel.onchange = async () => {
    state.model = sel.value;
    try { localStorage.setItem("mgModel", state.model); } catch (e) {}
    if (state.wx) await loadWeather(state.wx.lat, state.wx.lon, state.wx.name);
  };
}

// ================= VODIČ =================
const OBJ_ICONS = { port: "⚓", marina: "🛥️", anchorage: "🏖️", fuel: "⛽" };
const OBJ_LABELS = { port: "Luka", marina: "Marina", anchorage: "Sidrište", fuel: "Pumpa" };
const OBJ_CLS = { anchorage: "obj-anch", marina: "obj-mar", port: "obj-port", fuel: "obj-fuel" };

function renderObjCard(obj) {
  const icon = OBJ_ICONS[obj.type] || "📍";
  const label = OBJ_LABELS[obj.type] || obj.type;
  const cls = OBJ_CLS[obj.type] || "obj-fuel";
  let details = "";
  if (obj.depth) details += `<div class="obj-row"><b>Dubina:</b> ${obj.depth}</div>`;
  if (obj.phone) details += `<div class="obj-row"><b>Tel:</b> <a href="tel:${obj.phone.replace(/\s/g, "")}">${obj.phone}</a></div>`;
  if (obj.operator) details += `<div class="obj-row"><b>Operater:</b> ${obj.operator}</div>`;
  if (obj.hours) details += `<div class="obj-row"><b>Radno vrijeme:</b> ${obj.hours}</div>`;
  if (obj.shelter) details += `<div class="obj-row"><b>Zaštita:</b> ${obj.shelter}</div>`;
  if (obj.seabed) details += `<div class="obj-row"><b>Dno:</b> ${obj.seabed}</div>`;
  if (obj.buoys != null) details += `<div class="obj-row"><b>Plutače:</b> ${obj.buoys === true ? "da" : obj.buoys === false ? "ne" : obj.buoys}</div>`;
  if (obj.notes) details += `<div class="obj-note">${obj.notes}</div>`;
  return `<div class="obj-card card">
    <div class="obj-head"><span class="obj-name">${icon} ${obj.name}</span><span class="obj-badge ${cls}">${label}</span></div>
    <div class="obj-loc">${obj.lat.toFixed(4)}° N, ${obj.lon.toFixed(4)}° E</div>
    ${details ? `<div class="obj-details">${details}</div>` : ""}
  </div>`;
}

function hrPlural(n, one, few, many) {
  const m = n % 10, c = n % 100;
  if (m === 1 && c !== 11) return `${n} ${one}`;
  if (m >= 2 && m <= 4 && (c < 12 || c > 14)) return `${n} ${few}`;
  return `${n} ${many}`;
}

function renderVodic() {
  const el = document.getElementById("vodicList");
  const countEl = document.getElementById("vodicCount");
  if (!el) return;
  const f = state.vodicFilter;
  const all = [...state.spots, ...state.fuelStations.map(s => ({ ...s, type: "fuel" }))];
  const items = f === "all" ? all : all.filter(s => s.type === f);
  if (countEl) countEl.textContent = hrPlural(items.length, "objekt", "objekta", "objekata");
  el.innerHTML = items.length ? items.map(renderObjCard).join("") : `<div class="card"><div class="detail-empty">Nema objekata za ovaj filter.</div></div>`;
}

function wireVodicTab() {
  const box = document.getElementById("vodicFilters");
  if (!box) return;
  box.addEventListener("click", e => {
    const btn = e.target.closest(".obj-filter");
    if (!btn) return;
    box.querySelectorAll(".obj-filter").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    state.vodicFilter = btn.dataset.f;
    renderVodic();
  });
}

// ================= PULL-TO-REFRESH =================
function wirePullToRefresh() {
  const pane = document.getElementById("tab-vrijeme");
  if (!pane) return;
  const indicator = document.getElementById("ptrIndicator");
  let startY = 0, pulling = false, triggered = false;

  pane.addEventListener("touchstart", e => {
    if (pane.scrollTop > 5) return;
    startY = e.touches[0].clientY;
    pulling = true;
    triggered = false;
  }, { passive: true });

  pane.addEventListener("touchmove", e => {
    if (!pulling) return;
    const dy = e.touches[0].clientY - startY;
    if (dy < 0) { indicator.classList.remove("pulling"); return; }
    if (pane.scrollTop > 0) return;
    const progress = Math.min(dy / 80, 1);
    if (progress >= 1) {
      indicator.textContent = "↑ Pusti za osvježavanje";
      triggered = true;
    } else {
      indicator.textContent = "↓ Povuci za osvježavanje";
      triggered = false;
    }
    indicator.classList.add("pulling");
  }, { passive: true });

  pane.addEventListener("touchend", async () => {
    if (!pulling) return;
    pulling = false;
    if (triggered && state.wx) {
      indicator.textContent = "⏳ Osvježavam…";
      indicator.classList.remove("pulling");
      indicator.classList.add("refreshing");
      await loadWeather(state.wx.lat, state.wx.lon, state.wx.name);
      state.dhmz = await fetchDhmz();
      if (state.wx) renderWarnings(state.wx, state.dhmz);
      indicator.textContent = "✓ Ažurirano";
      setTimeout(() => { indicator.classList.remove("refreshing"); }, 800);
    } else {
      indicator.classList.remove("pulling");
    }
  });
}

// ================= BOOT =================
async function boot() {
  wireTabs();
  try {
    const data = await (await fetch("data/spots.json")).json();
    state.regions = data.regions || [];
  } catch (e) {
    document.getElementById("meteograms").innerHTML = `<div class="card"><div class="detail-empty">Ne mogu učitati podatke.</div></div>`;
    return;
  }
  if (!state.regions.length) return;
  wireRegion();
  wireModel();
  wireVodicTab();
  wireRadar();
  wireWindRose();
  wirePullToRefresh();
  await setRegion(state.regions[0].id);
  locateUser({ silent: true });
  state.dhmz = await fetchDhmz();
  if (state.wx) renderWarnings(state.wx, state.dhmz);
}

// ================= RUŽA VJETROVA (Wind Rose) =================
const WR_WINDS = [
  { dir: "N",  deg: 0,   name: "Tramuntana" },
  { dir: "NE", deg: 45,  name: "Bura" },
  { dir: "E",  deg: 90,  name: "Levanat" },
  { dir: "SE", deg: 135, name: "Jugo" },
  { dir: "S",  deg: 180, name: "Oštro" },
  { dir: "SW", deg: 225, name: "Lebić" },
  { dir: "W",  deg: 270, name: "Pulenat" },
  { dir: "NW", deg: 315, name: "Maestral" }
];

function buildCurrentHour(wx) {
  if (!wx || !wx.fc || !wx.fc.current) return null;
  const fc = wx.fc.current;
  const mar = (wx.mar && wx.mar.current) || {};
  const t = new Date(fc.time);
  return {
    t,
    hour: t.getHours(),
    wind: fc.wind_speed_10m,
    gust: fc.wind_gusts_10m,
    dir: fc.wind_direction_10m,
    temp: fc.temperature_2m != null ? fc.temperature_2m : null,
    precip: fc.precipitation != null ? fc.precipitation : 0,
    cloud: fc.cloud_cover != null ? fc.cloud_cover : null,
    pres: null,
    wave: mar.wave_height != null ? mar.wave_height : null,
    sea: mar.sea_surface_temperature != null ? mar.sea_surface_temperature : null,
    isCurrent: true
  };
}

function wrColor(windKn, gustKn) {
  if (windKn >= 17 || gustKn >= 25) {
    const t = Math.min(1, Math.max(0, (windKn - 19) / 16));
    const r = Math.round(212 - t * 80);
    const g = Math.round(122 - t * 72);
    const b = Math.round(111 + t * 89);
    const sr = Math.round(181 - t * 60);
    const sg = Math.round(64 - t * 24);
    const sb = Math.round(64 + t * 136);
    return { fill: `rgba(${r},${g},${b},0.85)`, stroke: `rgb(${sr},${sg},${sb})`, level: "r" };
  }
  if (windKn >= 11 || gustKn >= 18) return { fill: "rgba(212,160,58,0.85)", stroke: "#96721a", level: "a" };
  return { fill: "rgba(74,171,130,0.85)", stroke: "#1d8a4e", level: "g" };
}

function wrIntensity(windKn) {
  return Math.min(1, windKn / 20);
}

function drawWindRose(hour) {
  const canvas = document.getElementById("wrCanvas");
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const size = Math.round(rect.width);
  if (size < 10) return;
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);

  const cx = size / 2, cy = size / 2;
  const outerPad = size * 0.09;
  const R = size * 0.5 - outerPad;
  const innerR = size * 0.18;

  ctx.clearRect(0, 0, size, size);

  // outer circle
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.strokeStyle = "#c0ced8";
  ctx.lineWidth = 2;
  ctx.stroke();

  // ring guides
  [5, 10, 15, 20].forEach(kn => {
    ctx.beginPath();
    ctx.arc(cx, cy, innerR + (R - innerR) * (kn / 20), 0, Math.PI * 2);
    ctx.strokeStyle = "#e0e8f0";
    ctx.lineWidth = 0.6;
    ctx.stroke();
  });

  // direction lines
  for (let i = 0; i < 8; i++) {
    const ang = (i * 45 - 90) * Math.PI / 180;
    ctx.beginPath();
    ctx.moveTo(cx + innerR * 0.6 * Math.cos(ang), cy + innerR * 0.6 * Math.sin(ang));
    ctx.lineTo(cx + R * Math.cos(ang), cy + R * Math.sin(ang));
    ctx.strokeStyle = "#e2e8ee";
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }

  // scale labels (5kt intervals) centered on guide rings, N axis only
  ctx.font = "600 8px Inter, system-ui, sans-serif";
  ctx.fillStyle = "#a0b0c0";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  [5, 10, 15, 20].forEach(kn => {
    const frac = kn / 20;
    const prevFrac = (kn - 5) / 20;
    const midR = innerR + (R - innerR) * (frac + prevFrac) / 2;
    // N axis (up) — centered between rings
    ctx.fillText(kn, cx, cy - midR);
  });

  // compass rose star background
  const starOuter = R * 0.97;
  const starInner = R * 0.38;
  const starMid = innerR + (R - innerR) * 0.5;
  // 8-point star: main 4 points (N,E,S,W) longer, intercardinal shorter
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const ang = (i * 45 - 90) * Math.PI / 180;
    const tipR = (i % 2 === 0) ? starOuter : starMid;
    const notchR = starInner;
    const notchAng = ((i * 45 - 90) - 22.5) * Math.PI / 180;
    if (i === 0) {
      ctx.moveTo(cx + notchR * Math.cos(notchAng), cy + notchR * Math.sin(notchAng));
    }
    ctx.lineTo(cx + tipR * Math.cos(ang), cy + tipR * Math.sin(ang));
    const nextNotchAng = ((i * 45 - 90) + 22.5) * Math.PI / 180;
    ctx.lineTo(cx + notchR * Math.cos(nextNotchAng), cy + notchR * Math.sin(nextNotchAng));
  }
  ctx.closePath();
  ctx.fillStyle = "rgba(44,79,110,0.04)";
  ctx.fill();
  ctx.strokeStyle = "rgba(44,79,110,0.12)";
  ctx.lineWidth = 1;
  ctx.stroke();

  const dirIdx = hour ? COMPASS.indexOf(dirTo8(hour.dir)) : -1;
  const col = hour ? wrColor(hour.wind, hour.gust) : null;
  const bf = hour ? beaufort(hour.wind) : null;

  if (hour) {
    // wind direction wedge
    const centerAng = (dirIdx * 45 - 90) * Math.PI / 180;
    const halfWedge = 22.5 * Math.PI / 180;
    const intensity = wrIntensity(hour.wind);
    const wedgeR = innerR + (R - innerR) * Math.max(0.08, intensity);

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, wedgeR, centerAng - halfWedge, centerAng + halfWedge);
    ctx.closePath();
    ctx.fillStyle = col.fill;
    ctx.fill();
    ctx.strokeStyle = col.stroke;
    ctx.lineWidth = 2;
    ctx.stroke();

    // gust ring
    if (hour.gust > hour.wind) {
      const gustR = innerR + (R - innerR) * Math.max(0.08, wrIntensity(hour.gust));
      ctx.beginPath();
      ctx.arc(cx, cy, gustR, centerAng - halfWedge, centerAng + halfWedge);
      ctx.strokeStyle = col.stroke;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // arrow in wedge
    const arrowR = wedgeR * 0.7;
    const tipR = wedgeR - 6;
    const perpAng = centerAng + Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(cx + tipR * Math.cos(centerAng), cy + tipR * Math.sin(centerAng));
    ctx.lineTo(cx + arrowR * Math.cos(centerAng) + 5 * Math.cos(perpAng),
               cy + arrowR * Math.sin(centerAng) + 5 * Math.sin(perpAng));
    ctx.lineTo(cx + arrowR * Math.cos(centerAng) - 5 * Math.cos(perpAng),
               cy + arrowR * Math.sin(centerAng) - 5 * Math.sin(perpAng));
    ctx.closePath();
    ctx.fillStyle = "#fff";
    ctx.fill();

    // Beaufort label inside wedge (on top of arrow)
    const bfR = innerR + 18;
    ctx.save();
    ctx.translate(cx + bfR * Math.cos(centerAng), cy + bfR * Math.sin(centerAng));
    ctx.rotate(centerAng + Math.PI / 2);
    ctx.font = "800 11px Inter, system-ui, sans-serif";
    ctx.fillStyle = "#000";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Bf " + bf.n, 0, 0);
    ctx.restore();
  }

  // direction labels (N, NE...) and wind names (Bura, Jugo...) outside circle
  const dirR = R + outerPad * 0.25;
  const labelR = R + outerPad * 0.5 + 6;
  WR_WINDS.forEach((w, i) => {
    const ang = (w.deg - 90) * Math.PI / 180;
    const isActive = i === dirIdx;
    let rot = w.deg;
    if (rot > 90 && rot < 270) rot += 180;
    const rotRad = rot * Math.PI / 180;

    ctx.save();
    ctx.translate(cx + dirR * Math.cos(ang), cy + dirR * Math.sin(ang));
    ctx.rotate(rotRad);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = isActive ? "800 13px Inter, system-ui, sans-serif" : "700 12px Inter, system-ui, sans-serif";
    ctx.fillStyle = isActive ? "#2c4f6e" : "#6b8da8";
    ctx.fillText(w.dir, 0, 0);
    ctx.restore();

    ctx.save();
    ctx.translate(cx + labelR * Math.cos(ang), cy + labelR * Math.sin(ang));
    ctx.rotate(rotRad);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = isActive ? "800 11px Inter, system-ui, sans-serif" : "600 10px Inter, system-ui, sans-serif";
    ctx.fillStyle = isActive ? "#2c4f6e" : "#8a9fb5";
    ctx.fillText(w.name, 0, 0);
    ctx.restore();
  });

  // center info circle
  ctx.beginPath();
  ctx.arc(cx, cy, innerR - 2, 0, Math.PI * 2);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.strokeStyle = "#d0dde8";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  if (!hour) {
    ctx.fillStyle = "#8a9fb5";
    ctx.font = "500 13px Inter, system-ui, sans-serif";
    ctx.fillText("Učitaj prognozu", cx, cy);
    return;
  }

  // wind name
  ctx.fillStyle = "#2c4f6e";
  ctx.font = "800 14px Inter, system-ui, sans-serif";
  ctx.fillText(ARROWS[dirTo8(hour.dir)] + " " + windName(hour.dir, hour.wind), cx, cy - 36);

  // wind speed
  ctx.fillStyle = col.stroke;
  ctx.font = "700 13px Inter, system-ui, sans-serif";
  ctx.fillText(Math.round(hour.wind) + " (udari " + Math.round(hour.gust) + ") čv", cx, cy - 20);

  // wind state (Beaufort description)
  ctx.fillStyle = col.stroke;
  ctx.font = "600 11px Inter, system-ui, sans-serif";
  ctx.fillText(bf.label + " (" + bf.n + ")", cx, cy - 6);

  // wave
  ctx.fillStyle = "#1baf7a";
  ctx.font = "800 14px Inter, system-ui, sans-serif";
  ctx.fillText("🌊 " + (hour.wave != null ? hour.wave.toFixed(1) + " m" : "—"), cx, cy + 12);

  // sea state
  const ss = hour.wave != null ? seaState(hour.wave) : null;
  if (ss) {
    ctx.fillStyle = "#1baf7a";
    ctx.font = "600 11px Inter, system-ui, sans-serif";
    ctx.fillText(ss.label + " (" + ss.n + ")", cx, cy + 27);
  }
}

function updateWindRoseInfo(hour) {
  if (!hour) return;
  const bf = beaufort(hour.wind);
  const col = wrColor(hour.wind, hour.gust);

  const srcLabel = hour.isCurrent
    ? `<span class="wr-src wr-src-live">⚡ model · sada</span>`
    : `<span class="wr-src">📊 prognoza</span>`;

  document.getElementById("wrWindInfo").innerHTML =
    `<span class="wr-dot" style="background:${col.stroke}"></span>` +
    `<span class="wr-ik">Vjetar</span>` +
    `<span class="wr-iv">${ARROWS[dirTo8(hour.dir)]} ${windName(hour.dir, hour.wind)} · ${Math.round(hour.wind)} čv (udari ${Math.round(hour.gust)}) · Bf ${bf.n} ${srcLabel}</span>`;

  const ss = hour.wave != null ? seaState(hour.wave) : null;
  document.getElementById("wrWaveInfo").innerHTML =
    `<span class="wr-dot" style="background:#1baf7a"></span>` +
    `<span class="wr-ik">Valovi</span>` +
    `<span class="wr-iv">${hour.wave != null ? hour.wave.toFixed(2) + " m" : "—"}${ss ? " · " + ss.label : ""}</span>`;

  document.getElementById("wrTempInfo").innerHTML =
    `<span class="wr-dot" style="background:#eb6834"></span>` +
    `<span class="wr-ik">Temperatura</span>` +
    `<span class="wr-iv">zrak ${hour.temp != null ? Math.round(hour.temp) + "°" : "—"} · more ${hour.sea != null ? Math.round(hour.sea) + "°" : "—"}</span>`;

  document.getElementById("wrRainInfo").innerHTML =
    `<span class="wr-dot" style="background:#5598e7"></span>` +
    `<span class="wr-ik">Oborina</span>` +
    `<span class="wr-iv">${(hour.precip || 0).toFixed(1)} mm · oblaci ${Math.round(hour.cloud)}%</span>`;
}

function updateWindRoseTime(idx) {
  const hours = state.mgHours || [];
  if (!hours.length) return;
  idx = Math.max(0, Math.min(idx, hours.length - 1));
  state.wrIdx = idx;
  const h = hours[idx];
  const timeEl = document.getElementById("wrTime");
  if (timeEl && h) {
    const dn = KRAT_DAN[h.t.getDay()];
    timeEl.textContent = `${dn} ${h.t.getDate()}.${h.t.getMonth() + 1}. · ${String(h.hour).padStart(2, "0")}:00`;
  }
  const slider = document.getElementById("wrSlider");
  if (slider) { slider.max = hours.length - 1; slider.value = idx; }
  drawWindRose(h);
  updateWindRoseInfo(h);
}

function showWindRoseCurrent() {
  const cur = buildCurrentHour(state.wx);
  if (!cur) return;
  const hours = state.mgHours || [];
  const now = new Date();
  let di = hours.findIndex(h => h.t >= now);
  if (di < 0) di = 0;
  state.wrIdx = di;
  const slider = document.getElementById("wrSlider");
  if (slider) { slider.max = hours.length - 1; slider.value = di; }
  const timeEl = document.getElementById("wrTime");
  const ct = cur.t;
  if (timeEl) timeEl.textContent = `⚡ Sada · ${String(ct.getHours()).padStart(2, "0")}:${String(ct.getMinutes()).padStart(2, "0")}`;
  drawWindRose(cur);
  updateWindRoseInfo(cur);
}

async function wrResetToNow() {
  if (!state.wx) return;
  const btn = document.getElementById("wrTime");
  if (btn) btn.textContent = "⏳ Osvježavam…";
  await loadWeather(state.wx.lat, state.wx.lon, state.wx.name);
}

function wireWindRose() {
  const slider = document.getElementById("wrSlider");
  if (!slider) return;
  slider.addEventListener("input", () => updateWindRoseTime(+slider.value));
  document.getElementById("wrPrev").addEventListener("click", () => {
    updateWindRoseTime((state.wrIdx || 0) - 1);
  });
  document.getElementById("wrNext").addEventListener("click", () => {
    updateWindRoseTime((state.wrIdx || 0) + 1);
  });
  const canvas = document.getElementById("wrCanvas");
  canvas.addEventListener("click", e => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    const dist = Math.sqrt(x * x + y * y);
    if (dist < rect.width * 0.18) wrResetToNow();
  });
  window.addEventListener("resize", () => {
    if (document.getElementById("tab-ruza").classList.contains("active"))
      drawWindRose((state.mgHours || [])[state.wrIdx || 0]);
  });
}

function refreshWindRose() {
  const hours = state.mgHours || [];
  if (!hours.length) return;
  showWindRoseCurrent();
}

boot();

