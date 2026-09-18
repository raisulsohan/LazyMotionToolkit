# Changelog

All notable changes to LazyMotionToolkit.

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
