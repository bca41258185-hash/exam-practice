# 建築師考試急救 — shared brief for helpers

Work directory (use absolute paths): `/tmp/claude-0/-home-user-shuke/0bb726f6-55f7-5748-a6ae-b421489f2f2d/scratchpad/help-text`

## What this is
A single-page, game-first crash course (Traditional Chinese, Taiwan) that teaches a complete novice
the 建築師考試「建築計畫與設計」(大設計) pass-line workflow. The learner **gets bored easily**. The page
is published as a Claude Artifact and as a standalone PWA. Vanilla JS, inline SVG, no libraries.

The owner (a practising architectural designer) gave two pieces of feedback you are fixing:
1. **"我希望上面出現的圖是專業的建築圖"** — every drawing must read as a real architectural drawing,
   not a box diagram.
2. **"每關卡不要只有一關"** — every game must have several levels (at least 3), not one.

## Files
`parts/*.html` are concatenated in filename order into one page. You own ONLY the files your task
names. Never edit a file you do not own (other helpers are editing them right now). If you need
something changed elsewhere, say so in your final report instead.

- `00-head`, `05-style2`, `06-style3` — CSS (tokens, blueprint look, game chrome). Read-only for you.
- `10-shell`, `20-m0` … `28-m8`, `29-play` — markup of each stage (`<article class="view mod" id="v-mN">`).
- `90-script.html` — core: routing, progress, XP (`window.KY`). Read-only.
- `90b-kit.html` — **shared kit: READ THIS FIRST.** Helpers, the multi-level framework `K.levels`,
  and the drafting kit `K.draw`. Read-only (ask in your report if you need an addition; meanwhile put
  any extra drawing helper inside your own file).
- `92-w-*.html`, `93-g-*.html`, `94-g-*.html`, `95-g-*.html` — one widget/game per file (an IIFE).
- `98-layout.html` — moves each game to the top of its stage (the `PLAN` object, by element id),
  collapses the lecture text into `<details class="notes">`, builds the arcade page. Read-only;
  **keep your game's root element id unchanged** so it still gets placed.

## Build and look
```
cd <work dir>
python3 wrap.py prev-<yourname>.html      # writes only that preview file; safe in parallel
```
Open `file://<work dir>/prev-<yourname>.html#m4` (hash = stage id m0…m8, `play`, `cheat`) with
Playwright (`require('playwright')`, `chromium.launch()` — already installed, do not install anything).
Write your own small test script named `t-<yourname>.js` in the work dir. Because other helpers edit
other parts at the same time, a build can briefly contain someone else's half-written file: if a
page error clearly comes from a file you do not own, rebuild a little later and re-check; only fix
your own files.

**You must look at your result**: screenshot each drawing/game (element screenshot, viewport 1200
wide, and once at 400 wide) and Read the PNG. Iterate until it looks like a drawing an architect
would accept. Check both light and dark (`colorScheme:'dark'`) for anything outside a `.game` box.
Lecture content sits in a closed `<details class="notes">`; open it in tests with
`document.querySelectorAll('details.notes').forEach(d=>d.open=true)`.

## Drafting standard (this is the main point)
Use `var D=K.draw(inGame)` (`inGame=true` inside a `.game` blueprint panel) and the CSS classes in
`90b-kit.html`. No literal colours in SVG — use the classes (`lw-cut lw-out lw-vis lw-thin lw-hid
lw-axis lw-site lw-setb poche f-void f-soft f-ok f-warn f-bad f-line f-paper f-sheet s-ink s-mut
s-blue s-ok s-bad t-dim t-room t-area t-ttl t-axis`, tokens `var(--ink)` etc.) so both themes work.

A drawing is professional when it has:
- **Line-weight hierarchy**: cut elements heaviest (walls/slabs in section, walls in plan), outlines
  next, visible edges medium, dimensions/hatches/furniture thinnest. Never one weight for everything.
- **Plans**: walls with real thickness (poché or double line), columns as filled squares on the grid,
  door openings with leaf + swing arc, windows as 3 thin lines in an opening, stairs with treads +
  UP arrow + break line, elevator box with X, toilets with fixtures hinted, grid axes (dash-dot) with
  numbered/lettered bubbles, a dimension chain in mm (e.g. 8000) with oblique ticks, room name +
  area, entrance triangles, section-cut marks, north arrow, graphic scale bar, title with underline
  and scale (`D.title`).
- **Site plans**: property line (`lw-site` dash-dot), setback line (`lw-setb`), roads with centre
  line and width, building as roof plan with heavy outline + floor count, paving/grass hatches,
  trees with canopy symbol, parking bays, driveway, entrance triangles, north arrow, scale bar,
  neighbour labels.
- **Sections**: cut slabs/beams/walls filled solid, earth hatch under the ground line, level marks
  (GL ±0, 2FL +4500 …), floor-height dimension chain, room names, parapet, basement, scale figures
  and trees, title + scale.
- **Elevations**: heavy ground line, building outline, floor lines light, window mullions, a
  material hatch or shadow on one bay, canopy, people/trees, title + scale.
- Text never overlaps lines or other text. Minimum text size 9px in a 720-wide viewBox. Leave room in
  the viewBox for bubbles, dims and titles. Keep figures `viewBox` 720 wide unless told otherwise.

Numbers used in the course (keep consistent): column grid 8 × 8 m; corridor 2.4 m; stair core about
3.5 × 6.5 m, two stairs at opposite ends; lift about 2.5 × 2.5 m; floor heights 1F 4.5 m, typical
3.6 m, basement 3.6 m; parapet 1.1 m; car bay 2.5 × 5.5 m, accessible bay 3.5 × 6 m, aisle 5.5 m;
ramp 1:6. The running example: 社區圖書分館暨樂齡學習中心 — site 40 m (E–W) × 50 m (N–S) = 2,000 ㎡,
建蔽率 50%, 容積率 160%; south 15 m main road with bus stop, west 8 m road, east community park,
north 4-storey housing; old banyan tree at the SE corner (keep); setbacks 4 m on road sides, 3 m on
neighbour sides; building 24 × 32 m (3 × 4 bays), 3 floors + B1, placed west, 7 m from north
boundary; 1F 多功能廳/咖啡/共餐/門廳, 2F 兒童閱覽/樂齡教室×4/故事角, 3F 一般閱覽/行政.

## Multi-level standard
Use `K.levels(box,{key,names,pass,start})` from the kit (read its comment). Every game gets **at
least 3 levels** that genuinely differ (new site, new programme, new rules, rising difficulty) — not
the same thing with new numbers only. Level names are short (2–5 characters). Call `L.done(i,score)`
with a 0–100 score; the framework handles XP, tick marks and the 合格 stamp. After a level is
passed, offer a clear "下一小關 →" button (`L.next()`). Keep the old XP key prefix (e.g. `g:site`).
Feedback must be immediate and specific (say *why* in one sentence). Touch must work (pointer
events, `touch-action:none` on draggable things), and keyboard where reasonable.

## Copy rules (Traditional Chinese, Taiwan terms)
Plain, direct sentences a knowledgeable friend would say. No em-dash asides, no "不是X而是Y" framing,
no hype, no emoji. Buttons say what happens. Use 建蔽率、容積率、退縮、法定空地、柱距、服務核、剖面、立面.
Do not invent statute article numbers. Regulation figures are "exam shorthand".

## Hard constraints
- Do not rename existing root ids of games/widgets. New ids must be unique and prefixed with yours.
- No external resources, no `alert/confirm/prompt`, no `window.print`, wrap storage in try/catch
  (use `K.st` + `K.save()` rather than your own storage).
- Page must not scroll horizontally at 400 px width.
- Do not publish, commit, or push anything. Do not touch files outside the work directory.

## Final report (keep it short)
List: files you changed; what each game/figure now contains (levels, rules); how you verified
(what you looked at); anything unfinished or that needs a change in a file you do not own.
