#!/usr/bin/env python3
"""Maritimo dev server: statika + /api/warnings proxy za DHMZ CAP feed.

Bez EUMETNET ključa: dohvaća službeni DHMZ CAP XML server-side (nema CORS-a
na serveru) i vraća čisti JSON. Preglednik zove /api/warnings na istom originu,
pa CORS uopće nije problem. Podaci: DHMZ, Otvorena licenca RH.
"""
import json
import os
import time
import urllib.request
import xml.etree.ElementTree as ET
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

DHMZ_CAP = "https://meteo.hr/upozorenja/cap_hr_today.xml"
NS = {"c": "urn:oasis:names:tc:emergency:cap:1.2"}
CACHE = {"ts": 0, "data": None}
TTL = 600  # 10 min

def parse_awareness(info):
    level, color = None, None
    for p in info.findall("c:parameter", NS):
        if p.findtext("c:valueName", default="", namespaces=NS) == "awareness_level":
            val = p.findtext("c:value", default="", namespaces=NS)  # "3; orange; Severe"
            parts = [x.strip() for x in val.split(";")]
            if len(parts) >= 2:
                try:
                    level = int(parts[0])
                except ValueError:
                    level = None
                color = parts[1].lower()
    return level, color

def fetch_warnings():
    now = time.time()
    if CACHE["data"] is not None and now - CACHE["ts"] < TTL:
        return CACHE["data"]
    req = urllib.request.Request(DHMZ_CAP, headers={"User-Agent": "maritimo-proto/0.1"})
    raw = urllib.request.urlopen(req, timeout=20).read()
    root = ET.fromstring(raw)
    out = []
    for info in root.findall("c:info", NS):
        lang = info.findtext("c:language", default="", namespaces=NS)
        if lang and not lang.lower().startswith("hr"):
            continue  # zadrži samo hrvatske blokove
        level, color = parse_awareness(info)
        areas = [a.findtext("c:areaDesc", default="", namespaces=NS)
                 for a in info.findall("c:area", NS)]
        out.append({
            "event": info.findtext("c:event", default="", namespaces=NS),
            "severity": info.findtext("c:severity", default="", namespaces=NS),
            "level": level,
            "color": color,
            "onset": info.findtext("c:onset", default="", namespaces=NS),
            "expires": info.findtext("c:expires", default="", namespaces=NS),
            "areas": [a for a in areas if a],
            "description": info.findtext("c:description", default="", namespaces=NS).strip(),
            "instruction": info.findtext("c:instruction", default="", namespaces=NS).strip(),
        })
    payload = {"source": "DHMZ", "fetched": int(now), "warnings": out}
    CACHE["data"], CACHE["ts"] = payload, now
    return payload

class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        # Tijekom razvoja: nikad ne keširaj statiku (izmjene se odmah vide)
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        super().end_headers()

    def do_GET(self):
        if self.path.split("?")[0] == "/api/warnings":
            return self.handle_warnings()
        return super().do_GET()

    def handle_warnings(self):
        try:
            body = json.dumps(fetch_warnings(), ensure_ascii=False).encode("utf-8")
            code = 200
        except Exception as e:
            body = json.dumps({"source": "DHMZ", "error": str(e), "warnings": []}).encode("utf-8")
            code = 200  # graciozno: app pokaže "nedostupno"
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):
        pass  # tiši log

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5173))
    print(f"Maritimo dev server on http://localhost:{port}  (/api/warnings = DHMZ CAP)")
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()
