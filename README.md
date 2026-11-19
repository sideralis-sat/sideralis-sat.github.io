# Sideralis

Live satellite tracker and first-order mission analysis tool for new small satellites, Earth imaging and early-phase debris removal studies, using public orbital data from [CelesTrak](https://celestrak.org). Results are preliminary estimates, not operational products.

The name is Latin for "of the stars" and the root of sidereal time, the rotation of the Earth measured against the stars: the angle that turns the inertial frame where orbits are computed into the Earth-fixed frame where we live.

## Run locally

You need Node.js 20 or later.

```bash
npm install
npm run dev
```

`npm run dev` first downloads the CelesTrak catalog (unless you already have one from the last 2 hours), then starts the development server at http://localhost:5173.

To only download the data: `npm run fetch-data`.

## Using the app

**Navigation (Google Earth style)**

| Action | Mouse | Touch |
|---|---|---|
| Move the globe | Left-drag: the grabbed point follows the cursor, over the poles too | One-finger drag |
| Zoom | Wheel (towards the point under the cursor), `+` and `−` | Pinch |
| Tilt and change heading | Right-drag or Shift + drag | Two fingers: drag vertically and rotate |
| Zoom to a point | Double-click | |
| North up | Click the compass or press `N` | Compass |
| Move with the keyboard | Arrow keys | |

**Satellites**: hover to see the name and NORAD number; click to open the dossier. `Esc` or a click on empty space closes it. Search from the top bar (or press `/`).

**Reference frame**: *ECEF* keeps the Earth fixed (the ground does not move under the camera); *ECI* lets it rotate and shows orbits as fixed ellipses in inertial space.

**Time**: pause, run backwards and speed up ×1, ×10, ×60 and ×600. *Back to live* returns to real time.

**Layers**: orbit of the selected object, ground track (½ revolution back and 1½ ahead), coverage footprint at 0° elevation, ground station, and a 15° graticule.

## The satellite dossier

Clicking a satellite opens a dossier with eight tabs. Almost every value has a **?** button that explains what it is and shows the formula with that satellite's numbers.

| Tab | What it computes | Equations and models |
|---|---|---|
| State | Geodetic position, inertial, circular and escape velocity, Earth-relative velocity, state vector | SGP4, vis-viva, WGS-84 |
| Orbit | Diagram to scale, osculating and mean elements, period, energy, angular momentum, J2 drifts, sun-synchronism, B*; SGP4 against a numerical integrator (two-body, J2, J2 + drag) with the difference in the RIC frame | RV2COE (Vallado), Kepler III, secular J2, Cowell with RK4 |
| Power | Sunlight, penumbra and umbra timeline; β angle and its 120-day evolution; eclipse; solar array and battery sizing | Conical shadow, f_E = (1/π)·arccos(√(h²+2Rh)/((R+h)cos β)) |
| Passes | Ground station, 48 h passes with AOS/TCA/LOS, sky plot, naked-eye visibility, Doppler, and a downlink budget (EIRP, free-space loss, G/T, C/N₀, E_b/N₀, margin and data volume per pass) | SEZ topocentric angles, f = f₀(1 − ρ̇/c), L_fs = 20 log(4πρf/c) |
| Maneuver | Hohmann or bi-elliptic transfer to any circular orbit, plane change merged into the cheapest burn, time of flight, propellant mass with Tsiolkovsky, Edelbaum estimate for electric propulsion; the transfer is drawn on the globe | Curtis ch. 6, Δv = √(v₁² + v₂² − 2v₁v₂ cos Δi), Δv = I_sp g₀ ln(m₀/m_f) |
| Conjunctions | Screens the whole catalog for close approaches over 12, 24 or 72 h: TCA, miss distance, relative speed and RIC components; shows the encounter on the globe | Apsis filter, linear relative motion per step, safe time skipping, golden-section refinement on SGP4 |
| Reentry | Live space weather (F10.7, Ap, Kp, solar cycle forecast), atmosphere model choice, lifetime under each scenario, deorbit burn and simulation down to the ground with impact point | King-Hele density driven by NOAA data, da/dt = −ρ√(μa)/BC, RK4 with J2 + drag |
| Compare | Side-by-side table with a second object (drawn in blue), distance, relative velocity, angle between orbital planes and synodic period | ĥ₁·ĥ₂, 1/|1/T₁ − 1/T₂| |

**Share** copies a link that reopens the same object, tab, comparison and view; if you are not in real time it also carries the simulation instant (`?sat=25544&tab=passes&t=…`).

## Sky view

The **Sky** switch in the top bar replaces the globe with the sky above your ground station, in an azimuthal equidistant projection (zenith at the center, north up, east right). The first time it offers to use your location, which stays in your browser. It shows:

- every object above the horizon, sunlit or in the Earth's shadow, with the twilight phase from the Sun's elevation;
- **Naked eye**: only what you can actually see (object sunlit, Sun below −6°, elevation above 10°);
- **GNSS and DOP**: GPS, Galileo, GLONASS and BeiDou satellites with their PRN, and the dilution of precision (PDOP, HDOP, VDOP, TDOP, GDOP) now and over the next 24 h, with one clock unknown per system.
- **Astrophoto**: pick a deep-sky target (or your own RA/Dec), sensor and focal length. Every catalogued object is propagated through the night to find which ones cross your frame, which of those are sunlit (they leave a trail) and which sub-exposures you would lose. The frame is drawn on the sky plot. The target is precessed from J2000 to the date (IAU 1976) and each satellite is projected onto the tangent plane of the target, the same gnomonic projection a lens performs.

## Catalog analysis

The **Analysis** panel works on whole groups of objects:

- **Gabbard diagram**: apogee and perigee against period, the classic plot of a fragmentation cloud. The *Debris* group gathers the tracked fragments of Fengyun-1C, Iridium 33 and Cosmos 2251.
- **Constellation geometry**: altitude against inclination, automatic detection of shells, number of planes, Walker pattern estimate, and right ascension of the node against argument of latitude for each shell.

## Names when zoomed in

Zoom in towards the Earth and the satellites closest to the camera show their name, constellation colour and altitude, without overlapping one another. They fade out again when you zoom out. The labels can be turned off in **Layers → Names when zoomed in**.

## Navigation

The sections (Globe, Sky, Missions, Analysis, Learn and Help) are always visible with their names: in a side bar on a computer and in a bottom bar on a phone. A satellite opens as a sheet that shows the essentials over the globe; **Details** or a swipe up opens it full screen, and the arrow brings the globe back. Filters open as a large sheet with **Done**, **Show all** and **Only** for each group. First-time visitors get a short guide with five starting points; **Help** brings it back.

## Missions

The **Missions** panel turns the app into a design tool:

- **Design a satellite**: three steps (mission, spacecraft, results). It recommends an orbit with the reasons (sun-synchronous with a node time for imaging, dawn-dusk for science, an inclination matched to the region for communications) and sizes the rest around it: coverage of the region, solar array and battery for the worst eclipse of the year, daily contacts and data volume with your ground station, orbital lifetime with NOAA's solar cycle forecast, the 5-year deorbit rule and the drag sail it would need, the Δv and propellant budget, and how crowded the altitude is. **Launch it to the globe** adds it to the catalog as a virtual satellite, with the full dossier like any real one. Your satellites are kept in this browser.
- **Earth imaging**: when Sentinel-2, Landsat 8/9, Sentinel-1 and Sentinel-3 can image a place over the next 15 days, using each instrument's real swath, with the off-nadir angle, daylight for optical sensors and the cloud forecast from Open-Meteo for the time of each pass. Tap a pass to see it on the globe; links lead to the free archives (Copernicus Browser, USGS EarthExplorer).
- **Debris removal**: plan a chaser that visits up to six objects and fits a deorbit kit to each. It ranks the objects worth removing (long-lived and in crowded shells), tries every visiting order and uses J2 to align the planes for free when the wait is acceptable. It reports Δv, duration, launch mass and whether the mission is realistic. The targets are drawn in orange on the globe.

**Fundamentals** now has seventeen notes, most with an exercise built from live catalog data that checks your answer and shows the worked solution.

## How it works

```
CelesTrak (OMM/JSON)
   │  scripts/fetch-data.mjs   ← downloads "active" plus small groups, 2 h cache
   ▼
public/data/catalog.json       ← one file with every satellite and its constellation
   │
   │  + NOAA SWPC (F10.7, Kp, solar cycle) → public/data/spaceweather.json
   ▼  browser
Web Worker (satellite.js, SGP4) ── positions every ~1 s of simulated time
   │
   ▼
three.js: points are interpolated on the GPU between two epochs → smooth 60 fps
```

- **Reference frame**: the scene is in inertial coordinates (ECI/TEME). The Earth rotates with sidereal time (GMST) and the day/night terminator uses the real Sun position.
- **Scale**: 1 unit = 6371 km (mean Earth radius).
- **Performance**: all satellites are a single `THREE.Points` with a custom shader. Filtering a constellation only changes an attribute, without rebuilding buffers.

## Project layout

| Path | Contents |
|---|---|
| `scripts/fetch-data.mjs` | Downloads and prepares the catalog, following CelesTrak's usage policy |
| `src/data/constellations.json` | Constellations: CelesTrak group, name, color and fallback name pattern |
| `src/workers/propagator.worker.ts` | SGP4 propagation off the main thread |
| `src/lib/positionStream.ts` | Requests positions ahead of time and picks the epochs to interpolate between |
| `src/lib/clock.ts` | Simulation clock (pause, speed up, run backwards) |
| `src/lib/astro.ts` | Sideralis time and Sun direction |
| `src/lib/orbit.ts` | Orbital regime (LEO/MEO/GEO/HEO) |
| `src/lib/astrodynamics.ts` | RV2COE, mean elements, β, eclipse, J2 drifts |
| `src/lib/frame.ts` | ECEF/ECI frames and the GMST rotation |
| `src/lib/sky.ts` | Topocentric coordinates of the whole catalog, shadow test, DOP |
| `src/lib/maneuvers.ts` | Hohmann, bi-elliptic, plane change, Tsiolkovsky |
| `src/lib/linkBudget.ts` | Downlink budget in decibels |
| `src/workers/conjunction.worker.ts` | Conjunction screening off the main thread |
| `src/lib/spaceWeather.ts` | NOAA data and the King-Hele density model |
| `src/lib/propagators.ts` | Numerical propagation to compare with SGP4 |
| `src/lib/constellationGeometry.ts` | Shells, planes and Walker pattern |
| `src/lib/url.ts` | Shareable links |
| `src/lib/missionDesign.ts` | Orbit recommendation, SSO, solar sizing, lifetime, Δv and debris budget |
| `src/lib/debrisRemoval.ts` | Plane angles, J2 phasing, tour optimization and chaser mass |
| `src/lib/earthImaging.ts` | Earth observation satellites, swaths, cloud forecast |
| `src/workers/overpass.worker.ts` | Imaging passes over a point, off the main thread |
| `src/lib/astroPhoto.ts` | Deep-sky targets, precession and the camera frame |
| `src/workers/trails.worker.ts` | Satellite crossings through a photo frame, off the main thread |
| `src/lib/imagery.ts` | Tile imagery providers (day and night) |
| `src/scene/Earth.tsx` | Globe with 4K textures, day/night and atmosphere |
| `src/scene/DetailTiles.tsx` | High-resolution tile imagery when zoomed in |
| `src/scene/Satellites.tsx` | All satellites as points (a single 3D object) |
| `src/scene/Picker.tsx` | Finds the satellite under the mouse or finger |
| `src/scene/GlobeControls.tsx` | Google Earth style camera (grab, inertia, zoom to cursor, tilt, follow) |
| `src/scene/Selection.tsx` | Orbit, ground track, footprint and marker of the selected object |
| `src/scene/Graticule.tsx` | Meridians and parallels |
| `src/ui/` | Search, filters and layers, time, dossier, compass, status bar |

## Earth imagery

- **From afar**: NASA 4096 px textures (Blue Marble by day, Black Marble by night), included in `public/textures`.
- **Up close**: high-resolution tiles load as you zoom in, like a web map. By day, Esri World Imagery satellite photos; by night, NASA city lights (GIBS service, up to zoom 8). If a provider does not respond, the global texture is used.

To use a different imagery provider, create a `.env` file in the project root:

```
VITE_TILE_URL=https://example.com/tiles/{z}/{y}/{x}.jpg
VITE_TILE_ATTRIBUTION=Provider name
VITE_NIGHT_TILE_URL=https://example.com/night/{z}/{y}/{x}.jpg
```

## Adding or changing a constellation

Edit `src/data/constellations.json`. Order is priority: a satellite that belongs to several CelesTrak groups goes to the first one. `celestrak` is the `GROUP` value in `gp.php`; if it is `null`, or the group fails, `match` (a regular expression on the satellite name) is used instead. Then run `npm run fetch-data`.

## Publishing on GitHub Pages

The `.github/workflows/deploy.yml` workflow builds and publishes the site on every push to `main` and every 6 hours, downloading fresh CelesTrak and NOAA data on each run (neither is stored in the repository).

1. Push the project to a GitHub repository.
2. In the repository: **Settings → Pages → Source: GitHub Actions**.
3. Push to `main`. The site will be at `https://<user>.github.io/<repository>/`.

For an address that is just the site name, create a free GitHub organization with that name (for example `cenit-app`) and a repository called `cenit-app.github.io` inside it: the site is then served at `https://cenit-app.github.io/`. The workflow detects it and builds for the root path.

When the link is shared (WhatsApp, Telegram, LinkedIn, X), the preview shows the name, a description and `public/og.png`. The workflow fills in the absolute address that those previews need.

## Using CelesTrak responsibly

CelesTrak updates its data every ~2 hours, blocks clients that download more often, and is starting to limit large downloads (the "active" group and Starlink). So the script:

- stores downloads in `~/.cenit-cache` (your home folder), so they survive unzipping a new version of the project;
- does not request anything again until 2 hours have passed;
- does not download Starlink, OneWeb, Kuiper or Qianfan separately: they are already in "active" and are recognized by name;
- stops requesting for that run if CelesTrak returns an error (for example 403), as its policy asks, and uses the last saved copy.

If you see an HTTP 403 warning, wait a few hours before running `npm run fetch-data` again. Avoid `--force`.

## Credits

- Orbital data: CelesTrak (Dr. T.S. Kelso).
- SGP4 propagation: [satellite.js](https://github.com/shashwatak/satellite-js) (MIT).
- Earth textures: NASA Blue Marble and Black Marble (copies from [three-globe](https://github.com/vasturiano/three-globe)); ocean mask from the [three.js](https://github.com/mrdoob/three.js) examples.
- High-resolution imagery: Esri World Imagery (Esri, Maxar, Earthstar Geographics) and NASA GIBS.
