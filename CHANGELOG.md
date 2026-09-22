# Changelog

All notable changes to LazyMotionToolkit.

## 1.12.0

### ✨ Branding & Visuals
- **Official Brand Identity:** Integrated the official Sleeping Cat on Diamond Keyframe logo into the panel header with automatic high-DPI asset extraction.
- **Hero Brand Banner & Animated Demo:** Added high-resolution SVG hero banner and full animated feature demo GIF and 60fps MP4 video to documentation.
- **Documentation Overhaul:** Rebuilt repository documentation matching LazyLord's high-impact layout and visual hierarchy.

## 1.11.0

### 🐛 Bug Fixes
- **Head to Line drew the wrong shape.** Every "Triangle" was a three-pointed star turned inside out, and the polygons were stars too. Three separate mistakes, all in the same few lines, found by asking After Effects what it actually calls things:
  - **Type 1 is a Star and Type 2 is a Polygon**, not the other way round. A fresh polystar comes back as Type 1 with five points and an inner radius -- that is a star.
  - **After Effects spells the roundness match names `Roundess`**, with one n. Looking them up by the sensible spelling returned null every time.
  - **Every numeric fallback was off by one**: property 1 of a polystar is `Shape Direction`, not `Type`. So the null roundness lookup fell through to property 6, which is `Inner Radius`, and a tick in the Round box quietly set the inner radius to 15. With the outer radius driven down to about 17 while the inner one sat at its default 50, the head folded in on itself -- the pinched shape in the bug report.
  The numeric fallbacks are gone. A property that cannot be found by match name is now skipped rather than silently writing to whichever property happens to sit at that index.

### ✨ What is new
- **A second click changes the head instead of stacking another one behind it.** Pick Triangle, change your mind, pick Circle: you get a circle, not a circle on top of a triangle. The Head Size and Offset Angle you had dialled in come back with the new shape, and a head you renamed is still recognised -- heads are found by carrying a Head Size control, not by their name.
- **Stagger can move keyframes instead of layers.** `Keys only` leaves every layer bar where it is and steps the animation apart instead, which is what you want when the layers run the whole comp. Easing, hold keys, spatial tangents and roving keys all survive the move. Left off, the whole layer moves and its keyframes ride along with it, because a keyframe's time is stored against its layer's start.

### 🧪 Testing
- **`tools/ae-headline-render.jsx`.** The old test checked the head had *some* width and height, which a star passes as happily as a triangle -- which is exactly how this shipped. The new one renders every head on a real line to a PNG so the shapes can be looked at.
- The head test now reads the polystar back: Type, point count, and that Round reached the roundness rather than the radius. It also covers the swap, the kept size and angle, and a renamed head.
- Recorded, not worked around: switching Type to Polygon makes After Effects delete any expression on `Inner Radius`, reset it to 50 and lock it, and switching back to Star does not restore it. A polygon ignores the value, and the test asserts the lock so a future release changing this is noticed.

## 1.10.0

### ✨ What is new
- **Stagger.** The most repeated chore in motion design, and After Effects only ships Sequence Layers, which butt-joins clips end to end and nothing else. `⇥ Stagger` steps the selected layers apart in time, top to bottom, by the number of frames in the box beside it. It *adds* spacing rather than rebuilding the timing, so running it on a stack that is already animated keeps everything you built, and a negative number closes the spread back up. `Rev` works from the bottom layer up. Layers go in timeline order, not the order they were clicked, because `comp.selectedLayers` hands them back in click order and nobody means that by "in order". Locked layers are skipped with a reason.
- **Null + Parent.** One null on top, centred on the selection, with everything selected parented to it. A layer whose own parent is also in the selection keeps that parent: it already follows the null through it, and re-parenting it would flatten the rig. The null becomes 3D if anything in the selection is, and its anchor is moved to its middle so it rotates and scales around itself rather than its corner. Nothing on screen moves.

### 🧪 Testing
- 16 more checks in `tools/ae-smoke-test.jsx`: the ordering, the reverse, the negative step that undoes a spread, a locked layer, the null landing on the selection's centre, the layers not moving, and a child of a selected parent being left alone.

## 1.9.0

### 🐛 Bug Fixes
- **Head to Line: the head never turned.** A 2D layer's rotation is `ADBE Rotate Z`; the code asked for `ADBE Rotation`, which comes back as null. Setting an expression on null threw, inside one try that wrapped the rotation *and* the opacity, and the throw was swallowed. So the head landed on the end of the line and then just sat there pointing right, whatever the line did -- and its opacity never followed the line either. Both work now, and each expression is applied on its own so one failure cannot take the others with it.
- **Head to Line: the head survives losing its line.** Same landmine as the box: a bare `thisLayer.parent` read in five expressions, which After Effects disables for good the first time it throws.
- **Auto Box says when it could not build.** A box or measure layer that failed to parent was left in place, silently measuring nothing. It is now removed and reported in the skipped list, like every other refusal.

### ⚡ Performance
- **Auto Box costs about a third less per frame.** `Box Rect` and `Box Center` each ran the whole smoothing loop, so the text was measured twice over -- eight `sourceRectAtTime` calls a frame at the defaults. Only the size is worth smoothing: the left and top edges barely move while text types on, so the centre now measures once and reads the smoothed size off `Box Rect`. Measured on the same box in After Effects 2026: 939 ms to 657 ms over 100 frames, 30% less.
- **Long paragraphs turn their own smoothing down.** Past about 160 characters Box Smooth drops to 1, past 400 to 0. A 600-character paragraph now evaluates in 10.8 ms a frame instead of being the slowest thing in the comp; a big block of text moves slowly enough that the smoothing was buying nothing anyway. The slider is still yours to raise.

### ✨ What is new
- **Box and caret colours in the dialog.** They were only ever reachable as effect controls on the finished layer -- the dialog had the variable for them and never showed a picker. Now you choose before you apply.
- **Reveal ease in the dialog.** Three modes existed in the code and none of them had a control; every box ever made used the middle one.
- **Remove box.** There was no way back except undo, and deleting the box by hand left the measure layer, the LazyType animators and the Reveal controls on the text. The dialog has a Remove box button now.
- **The panel remembers what you set.** The Auto Box dialog reopens where you left it, and the fade length, speed, easing, head shape and the rest come back after a restart.

### 🧪 Testing
- **`tools/ae-autobox-test.jsx` now has company: `tools/ae-headline-test.jsx`.** Head to Line had no test at all, which is how a head that never rotated shipped. 67 checks in a headless After Effects: the head on the end of a straight line, a line that turns, both ends, Trim Paths, all eight shapes, an orphaned head and a layer that is not a shape.
- **Head to Line has an engine.** It was the only tool here that did its work inside the panel's click handler, reading `comp.selectedLayers` directly, so nothing could drive it but a human. It is now `headToLineLayers(comp, layers, ...)` with a thin wrapper, like everything else.
- **The syntax checker covers the developer scripts too, and catches a reserved word used as a name.** `var short = ...` passes JScript and makes After Effects run nothing at all, in silence. That cost an hour here; it is one line of lint now.
- **`tools/ae-autobox-perf.jsx` and `tools/ae-autobox-unicode.jsx`.** One times the rig, the other types Bengali on and checks the box never jumps -- `substr` cuts UTF-16 code units and a cluster like ksha is three of them. It holds up.

## 1.8.22

### 🐛 Bug Fixes
- **Auto Box: the box survives losing its text layer.** Every box expression opened with `var T = thisLayer.parent;`. Deleting the text layer (or unparenting the box) made that line throw, and After Effects does not just skip an expression that throws, it switches it off for good — so the box stayed broken even after an undo, and the only way back was re-running Auto Box. The parent is now read inside a try, and the `T == null` branches that were already written for it finally get used: the box quietly measures nothing and fades out instead.

### 🧪 Testing
- **`tools/ae-autobox-test.jsx`.** The Auto Box rig is the one part of the toolkit the mocked suite cannot reach, because it depends on real text measurement, real parenting and After Effects actually evaluating expressions. The new test builds the rig on real text layers in a headless After Effects and checks 79 things: that the box lands on the text to the pixel for all six styles, that nothing is left disabled, that re-running replaces instead of stacking, that two layers measure their own text, and that the caret tracks the typing. It found the bug above.

## 1.8.21

### 🐛 Bug Fixes
- **Auto Box: layer ordering.** Box shape layer stayed at the top of the timeline (above the text), so it covered the text. `moveTo(txtIdx + 1)` silently failed because of index-shift arithmetic. Replaced with `moveAfter(textLayer)` using fresh `findLayerIdx` lookups — this directly places the box right below the text layer in the stack.

## 1.8.20

### 🐛 Bug Fixes
- **Auto Box: position reset after parenting.** When AE assigns a parent to a layer, it automatically adjusts the child's position to maintain its visual position in comp space. Since position was set to `[0,0,0]` (comp space) *before* parenting, AE changed it to `[-parentX, -parentY]`, placing the box at the comp origin instead of on the text. Fixed by re-setting anchor, position and scale to `[0,0,0]` *after* parent assignment, so they're interpreted in parent space. Same fix applied to the measure layer.

## 1.8.19

### 🐛 Bug Fixes
- **Auto Box: parent-before-expression in both box AND measure layers.** The same expression-ordering bug existed in `createMeasureLayer` too — `measureSourceExpression` references `thisLayer.parent`, so parent must be set first. Moved parent assignment above expression assignment in both functions.
- **Robust parent assignment with 3 fallback attempts.** If the first parent assignment fails, re-fetches indices and tries again. If that also fails, does a full nested iteration of all layers. This ensures parent is set even under the most aggressive DOM invalidation.

## 1.8.18

### 🐛 Bug Fixes
- **Auto Box: expression ordering fix.** AE evaluates expressions the instant they are set. Because expressions like `exprBoxOpacity()` reference `thisLayer.parent`, setting them *before* the parent is assigned causes AE to permanently disable them ("layer has no parent"). Fixed by splitting `buildBoxLayer` into three phases: (1) create structure with values only, (2) set parent + reorder, (3) apply all expressions. This ensures `.parent` is always valid when expressions are first evaluated.

## 1.8.17

### 🐛 Bug Fixes
- **Auto Box: Nuclear rewrite for reference safety.** Replaced every `comp.layer(name)` call in the Auto Box engine with a `findLayerIdx()` helper that iterates `comp.numLayers` by index — the only access pattern in ExtendScript that is immune to DOM invalidation. Removed all `moveAfter()` calls during construction (parent + reorder done as the very last step). Shape layer is fully built (effects, shapes, expressions) before any parent or move operation touches it. This eliminates every possible `ReferenceError: Object is invalid` path.

## 1.8.16

### 🐛 Bug Fixes
- **Auto Box: moveAfter invalidation fix:** `moveAfter()` shifts layer indices, invalidating both the moved layer and any cached references to other layers. Fixed `buildBoxLayer` and `createMeasureLayer` to set `.parent` before calling `moveAfter()` (parent assignment doesn't shift indices), then re-fetch every layer reference by name after the move. Returns layer names instead of stale object references.

## 1.8.15

### 🐛 Bug Fixes
- **Auto Box: Zero Cached Layer References:** Completely eliminated all cached `textLayer` / `txtLyr` references from the Auto Box engine. Every layer access now goes through `comp.layer(tempName)` inline so that AE's aggressive DOM invalidation after `addShape()`, `duplicate()`, `addProperty()`, or `addSliderControl()` can never produce a stale object. This definitively fixes the `ReferenceError: Object is invalid` crash on all AE versions.
- **Stable Layer Capture:** Entry point now captures layer indices before any mutation instead of relying on `comp.selectedLayers` array references, and selects created box layers by name instead of by stored object reference.

## 1.8.14

### 🐛 Bug Fixes
- **Auto Box Reference Error:** Fixed an ExtendScript bug where duplicating or adding layers during the Auto Box routine invalidated internal text layer object references, causing a ReferenceError: Object is invalid crash. Implemented robust temporary layer naming cache to maintain strict DOM access despite dynamic index shifting.

## 1.8.13

### ✨ LazyType Reveal Rig for Auto Text Box
- **Complete Auto Box Overhaul:** Replaced plain typewriter animation with an advanced 'LazyType reveal rig'.
- **Measurement Layer System:** Adds an invisible 'Measure layer' with substr precision for calculating dynamic bounding boxes synchronized accurately with typed text frames.
- **LazyType Settling:** Beautifully settles newly typed characters using combinations of blur, rise, scale pop, or drop based on user preference.
- **Dynamic Animated UI Caret:** Added a customizable blinking caret (with width, color, and stroke settings) synced flawlessly to the typing progress.
- **New Text Dialog:** Full-featured user interface added to configure auto box styles, settling animations, exact padding parameters, and text measurement modes (by chars, words, or lines).

## 1.8.12

### ✨ Header Bar Link, Repaint Performance & Robust Swatch Wrapping
- **Interactive Header Bar:** Redesigned header with edge clustering (brand group on left, credits on right). Author name and menu dots are interactive links that launch `https://raisulsohan.com` via system browser.
- **Removed Bottom Footer:** Eliminated the redundant bottom credit line to maximize usable vertical workspace.
- **Count-Based Swatch Persistence:** Migrated setting storage from index-based `ColIndex` to count-based `SwatchCols` (1–6) with automatic legacy migration and `selectByText()` fallback, eliminating blank dropdown states.
- **Non-Destructive Color Picking (`repaintSwatches`):** Picking colors now triggers a fast in-place canvas repaint (`notify("onDraw")`) without destroying and rebuilding UI hierarchy. Swatch blocks have locked geometric dimensions via `lockSize`.
- **Throttled Resize Handling:** Swatch container dynamically re-wraps only when the fitting column count changes on panel resizing, with reentrancy protection (`inResize` guard).

## 1.8.11

### 📐 Pixel-Perfect 50/50 Column Geometry & Swatch Width Synchronization
- **Strict Column Width Locking (`lockWidth` & `syncColumns`):** Locks `minimumSize.width = preferredSize.width = maximumSize.width = colW` on all registered column pairs (`Head to Line` / `Anchor`, `Fade` / `Swatch`, and dual headers). Eliminates ScriptUI width biasing from child content, ensuring the center gap across all sections is in exact vertical alignment with the Motion Tools buttons.
- **Responsive Swatch Grid Fitting:** Dynamically computes fitting column count (`wantCols` vs `fitCols`) based on `lastColW`, `SW_W = 30`, and `SW_GAP = 3`. Swatch blocks and pill buttons cleanly adapt to column width without pushing boundaries.
- **Header & Layout Polish:** Re-added etched section header for `🎬 LazyPreview Render`, standardized row spacing to `COL_SPACING` (4px), and streamlined `addSharedHeader` to register header halves directly.
- **Robust Dropdown Defaults:** Guarded `swColDrop` selection against out-of-range/uninitialized saved index values, cleanly defaulting to 5 columns.

## 1.8.10

### 🐛 Safe Window Initialization & Robust 50/50 Geometry
- **Fixed ScriptUI Resize Exception:** Removed unsafe secondary `win.layout.resize()` invocation on floating `Window` instances during launch, resolving the `cannot get value of location property for statictext` runtime error.
- **Equal Base Column Geometry (240px):** Preset initial `preferredSize.width = 240` on all 2-column groups (`Head to Line`, `Anchor`, `Fade`, `Swatch`, and dual headers) so they start in exact symmetry on show without requiring dynamic force-relayout.

## 1.8.9

### 📐 Dynamic 50/50 Column Symmetry & Left-Aligned Swatches
- **Exact Center Alignment (`syncTwoColumnWidths`):** Dynamically synchronizes column widths across `Head to Line`, `Anchor`, `Fade`, and `Swatch` to exactly match half of the content width. The gap between `Head it!` and `Center Comp` now sits on the exact same vertical center axis as the Motion Tools buttons above.
- **Header & Swatch Alignment:** Left-aligned `SWATCH` header, `Tot:` controls, and the color swatch grid blocks so they align seamlessly along the center divider line, eliminating unwanted horizontal offset.

## 1.8.8

### 📐 Balanced Button Heights & Spacing Polish
- **Equal Touch Targets (30px Heights):** Standardized button heights across Motion Tools, Preview Render, Head to Line, Anchor, and Fade action rows to a comfortable 30px (and 32px for LazyStrike FX).
- **Even Multi-Column Spacing:** Set column and header spacing consistently to 4px with `preferredSize.width = 10` across rows, ensuring seamless 50/50 and 33/33/33 distribution without clipping on narrow docked panels.

## 1.8.7

### 📐 Equal-Width Column Split
- **Exact 50/50 Center Divider:** Applied `preferredSize.width = 10` to all column pairs and shared header groups. This tricks ScriptUI's layout engine into treating both columns as equally small, so the `fill` alignment distributes remaining space perfectly evenly — matching CSS Grid's `grid-cols-2` behavior. The vertical center divider now sits at the exact pixel-center of the panel across all sections (Motion Tools, Head/Anchor, Fade/Swatch).

## 1.8.6

### 📐 Layout Alignment Fix
- **Bottom-Aligned Two-Column Grid:** Switched from `top` alignment to `bottom` alignment on all two-column row containers (`Head to Line / Anchor` and `Fade / Swatch`), matching the Figma `grid grid-cols-2 items-end` behavior. This ensures the bottom action buttons ("Head it!" ↔ "Center Comp", "Apply" ↔ swatch row) always sit on the exact same horizontal baseline regardless of differing content heights above them.
- **Removed Fixed Width/Height Hacks:** Eliminated `preferredSize.width = 155` and `preferredSize.height` wrappers that were fighting ScriptUI's native `fill` distribution. Now both columns grow equally to fill the available panel width.

## 1.8.5

### 📏 Layout Alignment Perfected
- **Horizontal & Vertical Alignment:** Refactored column layouts to force a strict `155px` width per column, perfectly centering the gap. Adjusted internal group heights (`78px` and `70px`) and spacing constraints to ensure the bottom action buttons ("Head it!", "Center Comp", "Apply", "Clear") snap precisely to the identical horizontal baseline across different sections, matching the Figma grid pixel-by-pixel.

## 1.8.4

### 🎨 Visual Precision Refinements
- **Perfect Rounded Corners:** Fixed an issue where the native After Effects panel background color was bleeding into the `clearBrush` of rounded buttons, creating dark corner artifacts. The panel now strictly enforces `#141518` background to match Figma.
- **Circular Checkboxes:** Reverted "Round", "Double", and "Rev" checkboxes back to true perfect circles (`radius=7`) as intended in the Figma design.
- **Anchor Grid Active Dot:** The active Anchor grid icon now correctly renders as a bold centered vector circle (`radius=3.5`) instead of a tiny character.
- **Swatch Layout Tweaks:** Increased Swatch boxes to `30x22` and Pill buttons to `30x16` for better touch density and readability.

## 1.8.3

### 🐛 Visual Hotfix
- Fixed overlapping path artifacts in `fillRoundRect` for active buttons by using solid pre-blended colors (`#25294E` and `#363D85`) instead of semi-transparent brushes.
- Fixed clipped checkbox text by separating the vector box (`iconbutton`) and text (`statictext`) into their own horizontal layouts.

## 1.8.2

### 🎨 Visual Refinements (Figma Accuracy)
- **Rounded Buttons & Corners:** Implemented custom vector `fillRoundRect` drawing logic to accurately render Figma-style rounded buttons (`radius=4` for primary, `radius=3` for default, `radius=2` for pills).
- **Custom SVG Checkboxes:** Replaced standard native Windows/macOS checkboxes with custom 14x14 stylized rounded boxes and SVG vector checkmarks.
- **Improved Spacing:** Expanded master panel margins and section spacing. Adjusted the 9-point Anchor Grid to a perfect square layout (`24x24`) with proper `3px` padding between items.
- **Swatch Radii:** Color swatches and F/S pills now render with `3px` rounded borders.

## 1.8.1

### 🐛 Bug Fix
- Fixed ScriptUI runtime error in After Effects (`UI element type 'customControl' is unknown or invalid in this context`) by replacing non-standard controls with native ScriptUI `panel` dividers and `statictext` elements.

## 1.8.0

### 🎨 Modern Figma / React Dark Theme UI
- **Custom Vector onDraw Rendering:**
  - Styled all buttons with modern dark theme palette (`#222428` fill, `#2e3039` border, `#b0b5c3` text).
  - Primary Indigo/Blue accent (`#5865f2`) with glowing styling for `⚡ LazyStrike FX` and `⚡ Apply`.
  - Subtle dark red accent styling for `Remove` preview button (`#ed4245`).
- **Interactive 9-Point Anchor Pad:**
  - Dynamic 3×3 direction grid with live active point highlighting (indigo circle active state).
- **Etched Section Category Headers:**
  - Uppercase category titles with 1px etched horizontal divider lines (`#2a2c32`).
- **Top Header Bar & Branding:**
  - Glowing indigo indicator dot, `LazyMotionToolkit` bold title, author branding, and version pill badge (`v1.8`).
- **Pill-Style Swatch Controls:**
  - Rounded color blocks with active border highlight and mini `F` (Fill) and `S` (Stroke) pill buttons.

## 1.7.0

### 📐 Compact Two-Column UI & Collapsible Sections
- **Two-Column Pairing:**
  - Head to Line and 9-Point Anchor Point & Align arranged side-by-side in a single row.
  - Fade Animator Pro and Quick Swatch arranged side-by-side in a single row.
  - Symmetrical height matching (~85px) for both columns, eliminating dead space.
- **Collapsible Accordion Sections:**
  - Added toggle controls (`▾`/`▸`) to collapse and expand Motion Tools, Preview Render, Head+Anchor, and Fade+Swatch sections.
  - Open/collapsed state persists across After Effects restarts via `app.settings`.
- **Vertical Height Reduction:**
  - Panel vertical footprint reduced by ~40% so all controls remain visible and fully functional when docked.
  - Tighter margins (6px) and spacing (4px) with compact control dimensions.

## 1.6.0

Checked inside After Effects 2026 (26.5): `tools/ae-smoke-test.jsx`, `tools/ae-ui-test-audio.jsx`, `tools/ae-ui-test-panel.jsx`; offline with `tools/test-toolkit.js`.

### ⚡ LazyStrike FX (merged from QuickStrike FX)
- Opens from the Motion Tools panel as its own window.
- Lightning parameters found by match name, so any After Effects language works.
- Fixed: Forking was set to 40–80 on a 0–1 scale, so it was always maxed out.
- Colours passed with alpha; keyframes set with one `setValuesAtTimes` per property; duplicate key times merged.
- Audio-Driven:
  - Convert Audio to Keyframes found by its English name, or by command ID in a translated After Effects.
  - The Both Channels slider found by position, not by its translated name.
  - The temporary Audio Amplitude layer is removed.
  - Work area and selection are restored.
- Work areas set through a helper, because After Effects adjusts start and duration against each other.
- No empty layers when no strike fits; a clear message instead.
- Plateau peaks counted once; a strike landing exactly on the end of the work area no longer counts.
- Layers named `LazyStrike …`; one undo step.
- Removed a leftover chat comment from the old script.

### 🎬 LazyPreview Render (merged from QuickPreviewRender)
- A LazyPreview Render section in the panel: Render In→Out, Toggle, Remove, and a status line.
- **Cancel stops only this render.** It finds aerender by the unique output name in its command line and ends that process tree. The old script ran `taskkill /IM aerender.exe`, killing every render.
- Finished means aerender exited: the runner writes its exit code to a marker file. It no longer guesses from the file size, and there is no 15-minute timeout.
- Refuses to start when another composition has the same name, because aerender picks by name.
- H.264 output template chosen from the installed templates (15 Mbps preferred), so translated template names work. Render settings come from After Effects' default template instead of `-RStemplate "Best Settings"`, a name that changes in a translated After Effects.
- Windows:
  - aerender runs from a PowerShell script (UTF-8 with BOM), started through `cmd`, with the command line passed as `-EncodedCommand`.
  - Project and output paths reach aerender as 8.3 short paths, so folders with non-English letters work; when no short name exists, a clear message instead.
  - Composition names outside English letters are refused with advice.
- Fixed: Toggle could not turn the preview back on (After Effects refuses solo on a hidden layer).
- Remove also deletes the rendered file. A file After Effects still holds open is queued and deleted on the next render or panel launch, rather than purging the user's RAM previews.
- Preview footage goes to the *Lazy Preview Files* bin (an existing *Quick Preview Files* bin is reused); red label.

### Install
- The release zip has one-click installers and uninstallers for Windows (`.bat`, asks for administrator rights once) and macOS (`.command`). They put the panel into the ScriptUI Panels folder of every After Effects found, and update a copy in the user's own After Effects folder. Old QuickStrike FX / QuickPreviewRender files and other LazyMotion copies are pointed out, not deleted.
- `tools/package-release.mjs` builds the zip.

## 1.5.0

Checked inside After Effects 2026 (26.5) with `tools/ae-smoke-test.jsx`, and offline with `tools/test-toolkit.js`.

### Precomp
- **Fixed: Precomp (1:1) destroyed animation.** Position/Scale/Rotation keyframes were deleted and frozen at the current frame. Footage, solid and comp layers are now precomposed with attributes left outside, so keyframes, effects, masks, time remapping and parenting are untouched.
- **Fixed: Precomp (1:1) cut off everything before the playhead** by starting the precomp at the current time. Timing is now kept; shape and text layers keep their in/out points.
- Mask cropping covers every keyframe of the mask path, Bézier handles, feather and expansion, clipped to the layer. Inverted, subtract-only and expression-driven masks are not cropped.
- The anchor point, mask paths and 2D effect points move with the crop. They are read before the precomp is resized, because After Effects re-centres the layers inside and rescales effect points when a comp's size changes. No pixel moves on screen at any frame.
- Fixed: text and shape layers were skipped as "cameras". In After Effects they are not `instanceof AVLayer`.
- Parented and 3D shape/text layers, nulls, cameras and lights are skipped and listed instead of breaking.
- Group Precomp refuses when a selected layer's parent is not selected, and turns on Collapse Transformations when 3D layers go inside. It finds the new layer by its source instead of relying on the selection.

### Fade Animator Pro
- **Fixed: Speed was inverted** (it multiplied the duration). 2 is now twice as fast.
- The fade scales the layer's own opacity (value or keyframes) instead of forcing 0–100.
- First and last frames are fully transparent; fades on short layers meet without a jump.
- **Fixed: Clear deleted every marker** on the layer and any opacity expression. It now removes only LazyMotion fades (tagged `// LazyMotion Fade`; 1.4 fades are recognised too) and `fade in` / `fade out` markers.
- Applying twice no longer duplicates markers; a user's own opacity expression is never overwritten.
- Cameras, audio layers and other layers without opacity are skipped and listed.

### Anchor Point & Align
- Anchor changes keep Position keyframes and separated X/Y Position in place.
- Layers with animated anchor, scale or rotation, and 3D layers, are skipped and listed rather than jumping or throwing.
- Center in Comp centres the layer's visible content, not its anchor point; parented layers are skipped.

### QuickSwatch
- **Fixed: solids never got a colour.** The check compared the layer's source item instead of its main source.
- Text layers take Stroke too (switched on with a visible width).
- Animated colours and Source Text get a keyframe at the current time instead of an error.
- Saved palettes are validated (1–10 swatches, matching fill/stroke counts, valid hex), so a bad setting can't break the panel.

### Grid Designer
- Refuses more than 400 cells and margins/gutters that leave no room; the dialog stays open.

### Other
- LazyMotionToolkit is free and open source under the MIT License (`LICENSE` added; README and the script header updated).
- One failing layer no longer stops the rest of a batch.
- Auto Box accepts a selection where the first layer isn't the text layer.
- Tooltips for fade Duration, Speed and Clear; version in the panel footer.
- Development tools: `tools/check-extendscript.js`, `tools/test-toolkit.js`, `tools/ae-smoke-test.jsx`.

## 1.4.0 and earlier
- Head to Line (animated arrows), Smart Precomp, Auto Text Box, Fade Animator Pro, 9-point anchor pad, Grid Designer, QuickSwatch.
