# ⚡ LazyMotionToolkit — All-in-One Motion Graphics Suite for After Effects

<p align="center">
  <img src="https://img.shields.io/badge/Adobe%20After%20Effects-2020--2026+-9999FF?style=for-the-badge&logo=adobeaftereffects&logoColor=white" alt="AE Support" />
  <img src="https://img.shields.io/badge/Type-ScriptUI%20Dockable%20Panel-orange?style=for-the-badge" alt="Panel Type" />
  <img src="https://img.shields.io/badge/Engine-ExtendScript%20ES3-blue?style=for-the-badge" alt="ExtendScript" />
  <img src="https://img.shields.io/badge/License-MIT%20%C2%B7%20Free-yellow?style=for-the-badge" alt="MIT License" />
  <img src="https://img.shields.io/badge/Developed%20By-RaisulSohan-00E676?style=for-the-badge&logo=github" alt="Developer" />
</p>

<p align="center">
  <strong>The ultimate Swiss Army Knife for After Effects motion designers. Combines smart boundary-aware precomposing, non-distorting auto text boxes, advanced mathematical fade animators, interactive 9-point anchor alignment, grid generation, live color palettes, a lightning generator and background preview renders in a single dockable panel.</strong>
</p>

<p align="center">
  <a href="https://raisulsohan.com"><strong>🌐 raisulsohan.com</strong></a> • 
  <a href="#-key-features">Features</a> • 
  <a href="#-installation">Installation</a> • 
  <a href="#-development--tests">Tests</a> • 
  <a href="#-author--credits">Credits</a>
</p>

Developed by **[Raisul Sohan](https://raisulsohan.com)** · **Version 1.8.6** · Free & open source ([MIT](LICENSE)) · [Changelog](CHANGELOG.md)

---

## 🆕 What's New in 1.8

- **Figma / React Premium Dark Theme:** Rebuilt the entire ScriptUI interface based on the modern React design (`LazyMotionToolkit UI`).
- **Custom Vector onDraw Buttons:** Rich dark styled buttons (`#222428`) with clean border styling and crisp centered typography.
- **Glowing Accent Buttons:** Full-width Indigo/Blue accent (`#5865f2`) for `⚡ LazyStrike FX` and `⚡ Apply` with white typography.
- **Interactive 9-Point Anchor Pad:** 3×3 direction grid with live active-state highlighting (matching the React UI's indigo circle indicator).
- **Etched Section Headers:** Clean uppercase category titles with 1px horizontal etched divider lines (`#2a2c32`).
- **Pill-Style Swatch Controls:** Color blocks with live active border indicators and mini `F` (Fill) and `S` (Stroke) pill buttons.

- **⚡ LazyStrike FX** (was *QuickStrike FX*): lightning bolts, flashes and sky flashes, by timing or driven by audio.
  - Effect settings are found by match name, so it works in any After Effects language.
  - Fixed: Forking was always maxed out.
  - Keyframes are set in one call per property (faster).
  - Audio-Driven removes its temporary Audio Amplitude layer and puts back your work area and selection.
  - If nothing fits (the playhead is past the work area) it says so instead of making empty layers.
- **🎬 LazyPreview Render** (was *QuickPreviewRender*): renders the work area to H.264 in the background and plays it back as a solo'd layer.
  - **Cancel stops only this render.** It used to kill every aerender on the computer.
  - It knows a render has finished when aerender actually exits, not when the file size stops changing.
  - It refuses to render the wrong comp when two share a name.
  - **Remove deletes the rendered file too.** If After Effects is still holding it open, the file is deleted on a later try.
  - **Toggle can switch the preview back on.** It used to fail.
  - It works from project folders with non-English letters (e.g. Bengali): paths reach aerender in their short ASCII form.

## What's New in 1.5

Every change below was checked inside After Effects 2026 (26.5) by [`tools/ae-smoke-test.jsx`](tools/ae-smoke-test.jsx), as well as by the offline tests.

- **Precomp (1:1) no longer loses animation or cuts the layer.** 1.4 deleted Position/Scale/Rotation keyframes, froze them at the current frame, and started the precomp at the playhead, cutting off everything before it. Footage, solid and comp layers are now precomposed with **all attributes left outside**, so keyframes, effects, masks, time remapping and parenting stay exactly as they were. Shape and text layers keep their in/out points.
- **Mask cropping is now exact at every frame.** The crop covers the masks across all their keyframes, including Bézier handles, feather and expansion. Inverted or expression-driven masks are never cropped, and the anchor point, mask paths and effect points are moved with the crop. The result: no pixel moves on screen.
- **Fade Speed works the right way round.** 2 means twice as fast; in 1.4 it meant twice as slow.
- **Fades respect the layer's own opacity** (a layer at 60% fades between 0 and 60) and start and end on fully transparent frames. A layer shorter than two fades no longer jumps in the middle.
- **Clear only removes what the toolkit added.** It removes LazyMotion fade expressions and the `fade in` / `fade out` markers. 1.4 deleted every marker and any opacity expression. Applying a fade twice no longer stacks markers, and an opacity expression of your own is never overwritten.
- **QuickSwatch colours solids again.** The solid check never matched in 1.4. Stroke now works on text layers too, and animated colours get a keyframe instead of an error.
- **Anchor Point pad handles animated position and split X/Y position.** Center in Comp centres the layer's *content*, not its anchor point.
- **No silent failures.** Layers that can't be processed (cameras, parented shapes, animated rotation…) are listed with the reason, and one bad layer no longer stops the rest.
- **Grid Designer** refuses impossible margins and more than 400 cells instead of making hundreds of broken layers.
- **Group Precomp** refuses to strand a child whose parent isn't selected, and turns on Collapse Transformations when 3D layers go inside, so they keep the scene camera.

---

## 🌟 Overview

**LazyMotionToolkit** is a lightweight, high-performance ScriptUI panel designed to eliminate repetitive motion design tasks. It unifies nine toolsets into one cohesive workflow without relying on external plugins or bloated dependencies.

---

## 🚀 Key Features

### 1. 📦 Smart Precomposition Engine
* **`[ 📦 Precomp (1:1) ]` (Individual Precomp)**: Select multiple layers and precompose each layer into its own precomposition.
  * **Footage, solids and comps**: attributes stay on the outside ("Leave all attributes"), so every keyframe, effect, mask, time remap and parent is untouched. If the layer has masks, the precomp is cropped to the area they can ever show (over all keyframes, with Bézier handles, feather and expansion). The anchor point, mask paths and effect points move with the crop, so nothing shifts on screen at any frame.
  * **Shape and text layers**: attributes move inside a comp-sized precomp that keeps the layer's in/out points. Parented or 3D shape/text layers are skipped with a note: use Group Precomp for 3D.
  * Nulls, cameras and lights are skipped and listed.
* **`[ 📁 Precomp (Group) ]` (Group Precomp)**: Combine all selected layers into a single precomposition spanning their collective in/out. It refuses (and says why) if a selected layer's parent is not selected. With 3D layers inside, Collapse Transformations is turned on so they keep the scene's camera and lights.

### 2. 📝 Pixel-Perfect Auto Text Box
* **Zero Squish / Non-Distorting Roundness**: Unlike traditional box makers that scale layer transform scale, LazyMotionToolkit sizes the vector shape rectangle geometry directly. Corner roundness remains 100% circular and undistorted at any text length or aspect ratio.
* **Live Typewriter & Character Tracking**: Dynamically reads Text Animators, Range Selectors (`Start`, `End`, `Offset`), and character lengths. The box expands smoothly from left to right as letters are typed in real-time.
* **Fade In / Fade Out Sync**: Automatically inherits the parent text layer's `Transform > Opacity` and character animator opacity.
* **Dedicated Effect Controls**: Adds `Padding X`, `Padding Y`, `Roundness`, `Box Opacity`, and `Box Color` controls directly to the box layer.

### 3. 🏹 Head to Line (Animated Arrows & Path Follower)
* **1-Click Arrow & Pointer Generator**: Select any Pen-drawn line or Bezier path, choose a head style, and click **`🎯 Head it!`** to instantly attach an auto-orienting head.
* **8 Head Styles**: `Triangle`, `Circle`, `Star`, `Rectangle`, `Pentagon`, `Hexagon`, `Heptagon`, and `Octagon`.
* **Smart Tangent Tracking**: Head automatically rotates (`tangentOnPath`) and follows every curve and bend without manual keyframing.
* **Round Corners & Double-Sided**: Optional rounded corner smoothing and double-sided heads (heads at both Start and End).
* **Trim Paths Animation Sync**: Check `Animate (f)` with custom duration in frames to automatically generate smooth, easy-eased path drawing with the head riding the animated tip.

### 4. 🎨 Fade Animator Pro (7 Easing Curves)
* **Mathematical Easing Curves**:
  1. `Linear` (Constant rate)
  2. `Ease In (Expo)` (Exponential acceleration)
  3. `Ease Out (Sine)` (Smooth deceleration)
  4. `Ease InOut (Quad)` (Smooth quadratic transition)
  5. `Ease InOut (Cubic)` (Deep cubic transition)
  6. `Bounce` (Physics-based bounce)
  7. `Elastic` (Spring-damped overshoot)
* **Custom Parameters**: Fade Duration in frames, and a Speed multiplier (2 = twice as fast, 0.5 = twice as slow).
* **Keeps your opacity**: the fade scales the layer's own opacity value or keyframes; the first and last frames are fully transparent.
* **Flexible Application**: Independent `Fade In` and `Fade Out` toggles, with optional timeline **Layer Markers** (`fade in` / `fade out`). Re-applying replaces the fade instead of stacking markers.
* **`[ 🚀 Apply Fade ]` & `[ ❌ Clear ]`**: batch apply and clean up across selected layers. Fade expressions start with `// LazyMotion Fade`. Apply never overwrites another opacity expression, and Clear removes only LazyMotion fades and their markers.

### 5. 🎯 9-Point Visual Anchor Point Alignment Pad
* **Directional Keypad**: Visual 3x3 pad (`◤ ▲ ◥ ◀ ● ▶ ◣ ▼ ◢`) to snap anchor points to Top-Left, Center, Bottom-Right, etc.
* **Zero Visual Shift**: Compensates Position (including scale and rotation, every Position keyframe, and separated X/Y Position) so the layer does not jump when the anchor point moves. Layers with animated anchor, scale or rotation, and 3D layers, are skipped with a note, because no single offset could keep them in place.
* **Center in Comp**: moves the centre of the layer's visible content to the centre of the comp. Parented layers are skipped, since their position isn't in comp space.

### 6. ⊞ Grid Designer Dialog
* **Layout Presets**: 1-click presets for `2x2`, `3x3 Rule of Thirds`, `3 Columns Split`, and `12 Columns Web Layout`.
* **Custom Dimensions**: Full control over Columns, Rows, Gutters (X/Y px), and Margins (X/Y px).
* **Multiple Output Formats**: Generate solid **Shape Tiles (Fill)**, **Outline Strokes**, or **Guide Nulls**.
* **Guard rails**: up to 400 cells; margins and gutters that leave no room are refused, and the dialog stays open to fix them.

### 7. 🎨 QuickSwatch (Live Color Palette)
* **Instant Fill & Stroke**: 1-click buttons under each swatch.
  * **Shape layers**: every Fill or Stroke in their contents, nested groups included.
  * **Text layers**: fill or stroke. Stroke is switched on with a visible width.
  * **Solids**: Fill, via a Fill effect, so other layers using the same solid keep their colour.
  * Animated colours get a keyframe at the current time.
* **Native Color Picker**: Click any swatch tile to open the native OS color dialog (`$.colorPicker`) and update palette colors on the fly.
* **Configurable Layout**: Customize total swatches (1–10) and grid columns (1–6).
* **Session Persistence**: Palette configurations and custom colors are automatically saved via `app.settings` across After Effects restarts.

---

### 8. ⚡ LazyStrike FX (Lightning & Sky Flash)
Click **`⚡ LazyStrike FX`** to open its window (it stays open while you work).
* **Styles**:
  * `Direct Bolt + Flash`: an animated Advanced Lightning bolt plus a full-frame flash.
  * `Sky Flash`: decaying flickers across the frame.
  * `Both Combined`: bolt, flash and sky flash together.
  * `Audio-Driven`: one flash per loud peak of an audio layer.
* **Colors**: Bolt and Flash, via the system colour picker.
* **Timing**: strike length and gap (frames), number of strikes, sky flickers per strike. Either fill the work area, or start at the playhead.
* **Intensity & Randomness**: bolt and flash brightness, and how irregular the strikes are.
* **Audio Sync** (Audio-Driven):
  * `Threshold`: how loud a peak must be.
  * `Gain`: how bright its flash gets.
  * `Decay`: frames each flash holds.
  * `Min Gap`: frames between flashes.
  * It uses After Effects' *Convert Audio to Keyframes*, then removes the helper layer and restores your work area and selection.
* **Pre-compose** option wraps the generated layers in one precomp.
* Layers are Add-mode solids named `LazyStrike …`; everything is one undo step.

### 9. 🎬 LazyPreview Render (Smooth Playback of Heavy Comps)
Like Premiere Pro's *Render In to Out*.
* **`▶ Render In→Out`**:
  1. Set the work area (`B` / `N`) first.
  2. The panel **saves the project**, then renders the work area with `aerender` to `AE_Previews/preview_<date>_<time>_<n>.mp4` next to the project, using H.264 at 15 Mbps.
  3. The render runs in the background while you keep working, with a Cancel button.
  4. When it finishes, the video goes on top of the comp as a solo'd `[PREVIEW] preview` layer (red label), spanning the work area. Its footage goes in the *Lazy Preview Files* bin.
* **`Toggle`**: switch between the preview and the live comp.
* **`Remove`**: delete the preview layer, its footage and the rendered file. A file After Effects still holds open is deleted the next time you render or open the panel.
* **Needs**:
  * a saved project;
  * After Effects 2023 or newer (for the H.264 output module);
  * on Windows, a composition name in English letters (aerender can't receive other letters there).
* **Good to know**:
  * Project folders with other letters work when Windows short names are available, which is the default on the system drive. Otherwise the panel explains what to change.
  * Cancel stops only this render's aerender.
  * If two compositions share a name, rename one first: aerender picks compositions by name.

## 💻 Installation

### Method 1: Installer (Recommended)

1. Download **`LazyMotionToolkit-v1.6.zip`** from the [latest release](https://github.com/raisulsohan/LazyMotionToolkit/releases/latest) and unzip it.
2. **Windows:** double-click `Install LazyMotionToolkit.bat` and click **Yes** when Windows asks for administrator rights.  
   **macOS:** double-click `Install LazyMotionToolkit (macOS).command` (if macOS refuses, right-click → Open) and type your Mac password if asked.
3. Restart After Effects and open **Window > LazyMotionToolkit.jsx**.

The installer copies the panel into the `ScriptUI Panels` folder of every After Effects it finds. Run it again to update. The zip also has an uninstaller.

> **LazyPreview Render** also needs *Allow Scripts to Write Files and Access Network*: **Edit > Preferences > Scripting & Expressions** (Windows) or **After Effects > Settings > Scripting & Expressions** (macOS).

---

### Method 2: Dockable ScriptUI Panel, by hand

1. Copy [`LazyMotionToolkit.jsx`](LazyMotionToolkit.jsx) to your After Effects `ScriptUI Panels` directory:

   * **Windows**:
     ```text
     C:\Program Files\Adobe\Adobe After Effects <Version>\Support Files\Scripts\ScriptUI Panels\
     ```
     *OR for current user:*
     ```text
     C:\Users\<Your-Username>\AppData\Roaming\Adobe\After Effects\<Version>\Scripts\ScriptUI Panels\
     ```

   * **macOS**:
     ```text
     /Applications/Adobe After Effects <Version>/Scripts/ScriptUI Panels/
     ```

2. Restart **After Effects**.
3. Open the panel via the top menu bar:
   * **Window > LazyMotionToolkit.jsx**
4. Dock the panel anywhere into your AE workspace.

---

### Method 3: Direct Execution (Without Installation)

1. In After Effects, go to **File > Scripts > Run Script File...**
2. Browse and select `LazyMotionToolkit.jsx`.

---

## 🛠️ Technical Specifications

* **Language**: Adobe ExtendScript (ES3 compliant, compatible with all AE versions).
* **Host Support**: Adobe After Effects CC 2020 through CC 2026+.
* **Operating Systems**: Windows 10/11 & macOS (Intel / Apple Silicon).
* **Dependencies**: Zero external plugins or libraries required.

---

## 🧪 Development & Tests

The panel is a single file, `LazyMotionToolkit.jsx`. The `tools/` folder is only for development; users never need it.

| Command (Windows) | What it checks |
| :--- | :--- |
| `cscript //Nologo tools\check-extendscript.js` | The script compiles as ES3 and avoids names and comments that real ExtendScript rejects. |
| `cscript //Nologo tools\test-toolkit.js` | The engine against a mocked After Effects: precompose choices and cropping (including After Effects' own re-centring on comp resize), mask bounds, fade expressions evaluated frame by frame, anchor maths, colours, grid limits, lightning schedules and audio peaks, the aerender job (encoded command lines, non-English paths) and preview file clean-up. |
| `"C:\Program Files\Adobe\Adobe After Effects 2026\Support Files\AfterFX.com" -noui -r tools\ae-smoke-test.jsx` | The same behaviour **inside the real After Effects**: pixel placement measured with After Effects' own expression engine, fades, colours, LazyStrike layers, and a real aerender preview render (from a folder with Bengali letters) including Cancel. It writes `%TEMP%\lazymotion-smoke-results.txt` and quits without saving. Close After Effects first; needs *Allow Scripts to Write Files*. |
| `… AfterFX.com -r tools\ae-ui-test-audio.jsx` | LazyStrike's Audio-Driven mode, which needs After Effects' UI (no `-noui`): a generated WAV with two bursts must give two flashes, with the helper layer removed and the work area restored. Results in `%TEMP%\lazystrike-audio-results.txt`. |
| `… AfterFX.com -r tools\ae-ui-test-panel.jsx` | Builds the real panel and the LazyStrike FX window. Results in `%TEMP%\lazymotion-panel-results.txt`. |

When `$.global.LazyMotionToolkitTest` is set before loading, the script hands back its engine functions instead of building the panel; the tests use this. It is never set in normal use.

**Release zip:** `node tools/package-release.mjs` puts `LazyMotionToolkit-v<version>.zip` (the script, the installers from `tools/installer/`, and the licence) into the `00 Install from here` folder next to the repository. It stops if the README or CHANGELOG describe another version.

---

## 👨‍💻 Author & Credits

* **Developer**: **Raisul Sohan**
* **Website**: [https://raisulsohan.com](https://raisulsohan.com)
* **GitHub**: [@raisulsohan](https://github.com/raisulsohan)
* **Suite**: LazySuite Creative Tools Ecosystem

---

## 📄 License

LazyMotionToolkit is **free and open source** under the [MIT License](LICENSE): use it, share it, change it, including in commercial work.
