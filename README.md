# Maritimo — prototip (Kvarner)

Brzi, jednostavni pomorski asistent za **hrvatske voditelje brodica**.
Probno područje: **Kvarner** (Krk, Cres, Lošinj, Rab).

## Što radi (MVP)

Aplikacija ima dvije kartice: **Vrijeme** i **Karta i sidrišta**.

### Tab Vrijeme
- **Kontinuirani meteogram za 3 dana** (Open-Meteo) — jedan graf kroz svih 72 h s
  dnevnim separatorima i oznakama dana. 6 panela: oblaci, oborina, **temperatura zraka
  i mora**, vjetar + udari (sa strelicama smjera), valovi i **tlak zraka**.
  **Jedan dan ispuni širinu ekrana**, a preostala dva dana se **skrolaju horizontalno**
  unutar okvira; **y-os je fiksna lijevo** pa se vrijednosti čitaju dok skrolaš.
  **Prelaskom miša** prikazuje se križić + točke na svim krivuljama i tooltip sa svim
  vrijednostima za odabrani sat.
- **Dnevne oznake isplovljavanja** (zeleno/žuto/crveno) u zaglavlju, po jedna za svaki dan.
- **Dnevna oznaka isplovljavanja** — zeleno / žuto / crveno, izračunata iz dnevnih
  maksimuma vjetra, udara i valova (ovisi o odabranoj lokaciji). Ako DHMZ ima aktivno
  upozorenje za vjetar/buru koje se preklapa s tim danom, uz oznaku se dodaje marker
  **⚠️ DHMZ vjetar** + detalji (zona, sati, jačina) i link — oznaka po meteogramu ostaje
  nepromijenjena jer se upozorenje često odnosi samo na dio dana ili zone.
- **Službena DHMZ upozorenja** — prava, uživo, filtrirana na riječku regiju i pomorske
  zone (Kvarner i Kvarnerić, Velebitski kanal). Uključuje upozorenja za buru/vjetar,
  vrućinu itd. **Bez EUMETNET ključa** — dohvaća se s DHMZ CAP feeda preko malog proxyja.
- **Automatski sloj "More i vjetar"** — izveden iz prognoze (jak vjetar/udari, valovito
  more, obilna oborina), kao dopuna službenim upozorenjima.

### DHMZ proxy (bez ključa)
`server.py` poslužuje statiku i endpoint `/api/warnings` koji server-side dohvaća
[DHMZ CAP feed](https://meteo.hr/upozorenja/cap_hr_today.xml) (Otvorena licenca RH),
parsira ga i vraća čisti JSON. Isti origin → nema CORS-a, nema ključa. U produkciji
isti posao odradi serverless funkcija (Cloudflare Worker / Vercel).
### Tab Karta i sidrišta
- **Karta** (MapLibre + OpenStreetMap + OpenSeaMap oznake) s kuriranim sidrištima, marinama i lukama.
- **Automatski zaklon** — pri odabiru sidrišta izračuna se iz kojih je smjerova zaklonjeno,
  uzorkovanjem reljefa (Copernicus DEM preko Open-Meteo Elevation, bez ključa) u 8 smjerova ×
  5 udaljenosti: more = 0 m, kopno > 0 m. Označeno "auto"; za vrlo uske uvale (DEM 90 m) približno.
- **Temperatura mora po sidrištu** — trenutna površinska temperatura mora (Open-Meteo Marine)
  za odabranu lokaciju, oznaka "sada".
- **Sloj dna (sediment)** — živi WMS iz [EMODnet Geology](https://emodnet.ec.europa.eu/en/geology)
  (sloj `seabed_substrate_250k`, Folk 5: mulj / pijesak / grubi / miješani / stijena), s prekidačem i legendom.
- **Izvedeno držanje** — pri odabiru sidrišta app upita EMODnet (`GetFeatureInfo`) na točnoj
  poziciji i izvede procjenu držanja sidra iz vrste dna (pijesak→dobro, mulj→dobro,
  grubi/miješano→srednje, stijena→slabo). Prikazuje se uz kurirani demo podatak.
- **Detalji sidrišta** — vrsta dna, kvaliteta držanja, dubina, iz kojih je vjetrova
  zaklonjeno, plutače, kontakti. Uz upozorenje ako trenutni vjetar puše u uvalu.
- **Prognoza 24 h** — vjetar (smjer + čvorovi) i valovi u 3-satnim koracima.
- **SOS panel** — MRCC 195, 112, VHF 16/10, lučka kapetanija, SeaHelp (klik za poziv).

## Izvori podataka

- Prognoza vjetra: [Open-Meteo Forecast API](https://open-meteo.com/) (besplatno, bez ključa)
- Valovi/more: [Open-Meteo Marine API](https://open-meteo.com/en/docs/marine-weather-api)
- Sidrišta/luke: `data/spots.json` — **ručno kurirano, DEMO, nije za navigaciju**

## Pokretanje (web)

```bash
python server.py
```
Zatim otvori http://localhost:5173

## Android aplikacija

### Preduvjeti

1. **JDK 17** — preuzmi [Adoptium](https://adoptium.net/) ili `winget install EclipseAdoptium.Temurin.17.JDK`
2. **Android Studio** — preuzmi s [developer.android.com](https://developer.android.com/studio),
   unutar SDK Managera instaliraj **Android SDK 34** i **Build-Tools 34**
3. Postavi varijablu okruženja `ANDROID_HOME` na SDK putanju
   (obično `%LOCALAPPDATA%\Android\Sdk`)

### Izgradnja

```bash
npm install
npx cap sync android
npx cap open android
```

U Android Studiju: **Build → Build Bundle(s) / APK(s) → Build APK**.
APK se nalazi u `android/app/build/outputs/apk/debug/app-debug.apk`.

Za pokretanje na spojenom telefonu (USB debugging uključen):
```bash
npx cap run android
```

### Razvoj (workflow)

Uređuj izvorne datoteke u korijenu (`app.js`, `styles.css`, `index.html`).
Promjene se kopiraju u `www/` i sinkroniziraju na Android:
```bash
npm run cap:sync
```
Ili otvori Android Studio i pokreni iz njega:
```bash
npm run cap:open:android
```

## iOS aplikacija

### Preduvjeti

1. **macOS** s instaliranim **Xcode 15+** (iz App Storea)
2. **CocoaPods** — `sudo gem install cocoapods` ili `brew install cocoapods`
3. Xcode Command Line Tools — `xcode-select --install`

### Izgradnja

```bash
npm install
npx cap sync ios
npx cap open ios
```

U Xcodeu odaberi uređaj ili simulator i klikni **Run** (▶).

Za pokretanje iz terminala:
```bash
npx cap run ios
```

### Razvoj (workflow)

Isto kao za Android — uređuj datoteke u korijenu, pa sinkroniziraj:
```bash
npm run cap:sync
```
Ili otvori Xcode:
```bash
npm run cap:open:ios
```

## Sljedeći koraci

- Preciznije sidrišne granice (višarezolucijski DEM / OSM obalna linija) za uske uvale
- Za potpuno zatvorene uvale bez pokrivenosti dna — kuriranje iz HHI Peljara
- Integracija službenih DHMZ upozorenja i Plovput obavijesti pomorcima
- Plima/oseka, offline način (PWA), lokacija najbliže kapetanije po GPS-u
- Proširenje na cijeli Jadran
