const DHMZ_CAP = "https://meteo.hr/upozorenja/cap_hr_today.xml";

function getTag(xml, tag, ns) {
  const full = ns ? `${ns}:${tag}` : tag;
  const re = new RegExp(`<${full}[^>]*>([\\s\\S]*?)</${full}>`, "g");
  const matches = [];
  let m;
  while ((m = re.exec(xml))) matches.push(m[1].trim());
  return matches;
}

function getTagFirst(xml, tag, ns) {
  const full = ns ? `${ns}:${tag}` : tag;
  const m = xml.match(new RegExp(`<${full}[^>]*>([\\s\\S]*?)</${full}>`));
  return m ? m[1].trim() : "";
}

function parseCap(xml) {
  xml = xml.replace(/<cap:/g, "<c:").replace(/<\/cap:/g, "</c:");

  const infos = getTag(xml, "info", "c");
  const out = [];
  for (const info of infos) {
    const lang = getTagFirst(info, "language", "c");
    if (lang && !lang.toLowerCase().startsWith("hr")) continue;

    let level = null, color = null;
    const params = getTag(info, "parameter", "c");
    for (const p of params) {
      const vn = getTagFirst(p, "valueName", "c");
      if (vn === "awareness_level") {
        const parts = getTagFirst(p, "value", "c").split(";").map(s => s.trim());
        if (parts.length >= 2) { level = parseInt(parts[0]) || null; color = parts[1].toLowerCase(); }
      }
    }

    const areaBlocks = getTag(info, "area", "c");
    const areas = areaBlocks.map(a => getTagFirst(a, "areaDesc", "c")).filter(Boolean);

    out.push({
      event: getTagFirst(info, "event", "c"),
      severity: getTagFirst(info, "severity", "c"),
      level, color,
      onset: getTagFirst(info, "onset", "c"),
      expires: getTagFirst(info, "expires", "c"),
      areas,
      description: getTagFirst(info, "description", "c"),
      instruction: getTagFirst(info, "instruction", "c"),
    });
  }
  return out;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=60");
  try {
    const r = await fetch(DHMZ_CAP, { headers: { "User-Agent": "maritimo-web/1.0" } });
    if (!r.ok) throw new Error(`DHMZ ${r.status}`);
    const xml = await r.text();
    const warnings = parseCap(xml);
    res.status(200).json({ source: "DHMZ", fetched: Math.floor(Date.now() / 1000), warnings });
  } catch (e) {
    res.status(200).json({ source: "DHMZ", error: e.message, warnings: [] });
  }
}
