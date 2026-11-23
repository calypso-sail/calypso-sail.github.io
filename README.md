# Calypso — website

Single-page site for Calypso, UCL's Microtransat Challenge team: a WebGL hero, the
challenge explained, an interactive 3D boat section built around a live wingsail
simulation, boat galleries, team, contact and sponsors. Team profiles and news can
be enabled when the content is ready.

```
npm install
npm run dev        # http://127.0.0.1:5173
npm run build      # tsc --noEmit, then a static build into dist/
npm run preview    # serves dist/ at http://127.0.0.1:4173
```

| script | what it does |
| --- | --- |
| `npm run dev` / `build` / `preview` | Vite. Both `dev` and `build` first check that `public/boat.opt.glb` exists. |
| `npm run typecheck` | `tsc --noEmit` on its own |
| `npm run model` | `boat.glb` → `public/boat.opt.glb` (names parts, flattens, quantizes, verifies pose) |
| `npm run inspect` | Dumps nodes, primitives, materials and world bounds of a GLB |
| `npm run fonts` | Copies the two self-hosted woff2 files and their licences into `public/fonts/` |
| `npm run chart` | Bakes the Atlantic coastline into `src/generated/atlantic.ts` (Natural Earth 110m, Mercator) |
| `npm run shots` | Screenshots every section at 1440 and 390 px into `.screenshots/` using the installed Chrome |

Generated files (`public/boat.opt.glb`, `public/fonts/*`, `src/generated/atlantic.ts`) are
committed, so a fresh clone runs without the generator steps.

## Editing content

Feature flags, team profiles, news items, previous boats and the challenge route
coordinates live in `src/content.ts`. The hero copy, race figures, current boats,
contact details and sponsor logos are in `index.html`.

Media is optional. A person with no `photo`, or a previous boat with no `image`, gets a
placeholder tile. Drop a file into `public/` and set the path to switch. Everything that
still needs replacing carries `data-placeholder`; open the site with `?debug` to see them
outlined.

Flags in `src/content.ts`:

- `SMOOTH_SCROLL` — Lenis wheel smoothing (touch is always native).
- `SHOW_TEAM_PROFILES` — set to `true` to restore the Team section, profile galleries and navigation links.
- `SHOW_NEWS` — set to `true` to restore the homepage news and navigation links and enable `/news/`. While disabled, `/news/` redirects to the homepage.

See [Restoring Team and News](RESTORE_TEAM_AND_NEWS.md) for the content, preview and deployment steps.

## URL switches

| query | effect |
| --- | --- |
| `?debug` | outlines placeholders, draws the joint axes, exposes `window.lenis`, `window.ocean`, `window.viewer` |
| `?shots` | screenshot mode: no scroll smoothing, reveals land instantly |
| `?nosmooth` | native scrolling only |
| `?nohero` | skip the hero WebGL scene |
| `?motion=full` / `?motion=reduce` | full motion is the default; `reduce` opts into the low-motion presentation |
| `?graphics=off` | exercise the readable fallback for both WebGL scenes |
| `?qa=model-error` | request a missing model to exercise the loading failure path |

## Layout

```
index.html                 page shell: nav, hero, challenge, boat, team, news, contact, footer
src/main.ts                composition root
src/content.ts             placeholder-first content + flags
src/lib/                   scroll (Lenis + GSAP + ScrollTrigger), spring, visibility, dom helpers
src/hero/                  shaded Gerstner ocean, procedural detail texture, capped renderer, hero wiring
src/sections/              nav, reveals, challenge chart, boat scrollytelling, content renderers
src/viewer/                the 3D viewer: stage, model, materials, rig, sim, camera — knows nothing about the page
src/ui/                    labels, controls, HUD, loader — know nothing about three.js
src/config/                parts, joint axes and the six authored views: all the model-specific data
src/styles/                tokens, fonts, base, primitives, nav, hero, sections, boat, viewer, motion
scripts/                   model pipeline, font sync, chart bake, screenshots
```

## The 3D boat

`src/viewer/` is self-contained behind one function:

```ts
const viewer = await createBoatViewer(element, { onProgress, reducedMotion, controls: { zoom: false } })
viewer.setTourProgress(0.2)
viewer.setInteractionMode('explore')
viewer.sim.set({ tabDeg: 15 })
```

`src/sections/boat.ts` maps the six chapters to continuous `setTourProgress(0…1)`.
Each chapter has a settled reading interval followed by a reversible spherical camera
path. Only chapter changes update annotations, materials and simulation presets.
`setView(id)` remains available for authored, static presentations.

Explore preserves the displayed camera and exposes the existing simulation controls.
Resume, chapter links, or a subsequent page scroll return from the current camera to
the tour and restore its simulation settings. Wheel zoom is disabled. One finger
scrolls the page; two fingers orbit in Explore. Keyboard users can select chapters,
adjust controls and press Escape to resume.

The hero uses seven unequal crossing waves with curved crests and varying wave-group
amplitudes, analytic surface normals and a small procedural normal/foam texture generated
once. A pale-blue silhouette of the supplied boat rides the same displaced surface,
with damped heave, pitch and roll; water occludes its keel. Portrait layouts reserve
space below the copy for the boat. Its independent clock advances with real elapsed
time. Rendering uses antialiasing, fits its mesh to the camera and supports up to 2×
device resolution, capped at 3.6 million pixels (1.8 million on touch devices) so the
larger hero boat retains crisp edges. Quality stays stable when browser timers throttle.
Visible banks of sea mist drift over the waves on the same clock; distant wave crests
darken gradually to give the sea depth. Scrolling away slows this clock to 30% speed and fades the boat first,
then blurs and darkens the waves and mist into a fixed background behind the following
sections, including the transparent boat viewer and applications section. On tall mobile
heroes, the lower scene enters view before this transition starts.
The hero atmosphere keeps animating while the main page is visible; the interactive
viewer pauses offscreen. Both scenes pause in hidden tabs.
The large swells take about 14.5 seconds per cycle; short ripples and highlights are softened to avoid shimmer. Reduced motion defaults to a still ocean and static chapter framings. The Play/Pause
waves & fog button lets the reader choose ocean, fog and boat motion explicitly.

`npm run test:tour` checks boundaries, reverse paths, interrupted handoffs, Explore,
portrait framing, reduced motion, touch policy and simulation restoration.

### Updating the model

`boat.glb` is Calypso's simplified full-boat export. `npm run model` maps its named
meshes, converts its Z-up export frame to the viewer's Y-up frame, and verifies that
optimisation preserves the pose. The resulting `public/boat.opt.glb` is the asset the
site serves.

For a new export, confirm the source axes and part map in `scripts/process-model.mjs`
and update the matching settings in `src/config/`. Run `npm run model` and
`npm run test:tour`. Use `?debug` to see the three joint axes.

The simplified export omits the actuator hardware. The viewer rotates the free mast,
tail vane and rudder, with the two driven surfaces bounded by their CAD travel limits.

- Check UCL brand rules for student teams before adding any logo.

Interface font: Archivo, SIL Open Font License (`public/fonts/LICENSES.txt`).



## Local verification — 6 September 2026

- Production build and `npm run test:tour` pass.
- Browser layouts reviewed at 1440 × 900, 768 × 1024, 390 × 844 and 320 × 740, including resizing, chapter links and label clearance.
- Tested desktop orbiting, scroll-to-resume, reverse scrolling, keyboard sliders, Escape, mobile menu focus, and both motion preferences.
- Reviewed the ocean across moving frames. The revised sea runs at one quarter of its earlier speed; visible desktop samples settled at 55–60 fps.
- Tested missing-model and graphics-disabled fallbacks: all six captions remain readable and unavailable controls are hidden.
- Touch gesture routing is covered by the camera checks. Physical iOS/Android multitouch remains a device QA step.
