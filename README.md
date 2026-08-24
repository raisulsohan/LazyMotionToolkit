# ⚡ LazyMotionToolkit — All-in-One Motion Graphics Suite for After Effects

<p align="center">
  <img src="https://img.shields.io/badge/Adobe%20After%20Effects-2020--2026+-9999FF?style=for-the-badge&logo=adobeaftereffects&logoColor=white" alt="AE Support" />
  <img src="https://img.shields.io/badge/Type-ScriptUI%20Dockable%20Panel-orange?style=for-the-badge" alt="Panel Type" />
  <img src="https://img.shields.io/badge/Engine-ExtendScript%20ES3-blue?style=for-the-badge" alt="ExtendScript" />
  <img src="https://img.shields.io/badge/Developed%20By-RaisulSohan-00E676?style=for-the-badge&logo=github" alt="Developer" />
</p>

<p align="center">
  <strong>The ultimate Swiss Army Knife for After Effects motion designers. Combines smart boundary-aware precomposing, non-distorting auto text boxes, advanced mathematical fade animators, interactive 9-point anchor alignment, grid generation, and live color palettes in a single dockable panel.</strong>
</p>

<p align="center">
  <a href="https://raisulsohan.com"><strong>🌐 raisulsohan.com</strong></a> • 
  <a href="#-features">Features</a> • 
  <a href="#-installation">Installation</a> • 
  <a href="#-toolset-overview">Toolset Overview</a> • 
  <a href="#-credits">Credits</a>
</p>

---

## 🌟 Overview

**LazyMotionToolkit** is a lightweight, high-performance ScriptUI panel designed to eliminate repetitive motion design tasks. It unifies five essential toolsets into one cohesive workflow without relying on external plugins or bloated dependencies.

---

## 🚀 Key Features

### 1. 📦 Smart Precomposition Engine
* **`[ 📦 Precomp (1:1) ]` (Individual Precomp)**: Select multiple layers and precompose each layer into its own isolated, boundary-aware precomposition cropped to its exact layer or mask bounds. Preserves world space transforms and CTI playhead synchronization.
* **`[ 📁 Precomp (Group) ]` (Group Precomp)**: Combine all selected layers into a single precomposition spanning their collective timeline in/out duration with a single click.

### 2. 📝 Pixel-Perfect Auto Text Box
* **Zero Squish / Non-Distorting Roundness**: Unlike traditional box makers that scale layer transform scale, LazyMotionToolkit sizes the vector shape rectangle geometry directly. Corner roundness remains 100% circular and undistorted at any text length or aspect ratio.
* **Live Typewriter & Character Tracking**: Dynamically reads Text Animators, Range Selectors (`Start`, `End`, `Offset`), and character lengths. The box expands smoothly from left to right as letters are typed in real-time.
* **Fade In / Fade Out Sync**: Automatically inherits the parent text layer's `Transform > Opacity` and character animator opacity.
* **Dedicated Effect Controls**: Adds `Padding X`, `Padding Y`, `Roundness`, `Box Opacity`, and `Box Color` controls directly to the box layer.

### 3. 🎨 Fade Animator Pro (7 Easing Curves)
* **Mathematical Easing Curves**:
  1. `Linear` (Constant rate)
  2. `Ease In (Expo)` (Exponential acceleration)
  3. `Ease Out (Sine)` (Smooth deceleration)
  4. `Ease InOut (Quad)` (Smooth quadratic transition)
  5. `Ease InOut (Cubic)` (Deep cubic transition)
  6. `Bounce` (Physics-based bounce)
  7. `Elastic` (Spring-damped overshoot)
* **Custom Parameters**: Control Fade Duration (frames) and Speed Multipliers.
* **Flexible Application**: Independent `Fade In` and `Fade Out` toggles, with optional timeline **Layer Markers** (`fade in` / `fade out`).
* **`[ 🚀 Apply Fade ]` & `[ ❌ Clear ]`**: 1-click batch application and expression cleanup across all selected layers.

### 4. 🎯 9-Point Visual Anchor Point Alignment Pad
* **Directional Keypad**: Visual 3x3 pad (`◤ ▲ ◥ ◀ ● ▶ ◣ ▼ ◢`) to snap anchor points to Top-Left, Center, Bottom-Right, etc.
* **Zero Visual Shift**: Compensates layer position in comp space so the layer does not jump when the anchor point moves.
* **Center in Comp**: 1-click button to align layer centers directly to the composition viewport.

### 5. ⊞ Grid Designer Dialog
* **Layout Presets**: 1-click presets for `2x2`, `3x3 Rule of Thirds`, `3 Columns Split`, and `12 Columns Web Layout`.
* **Custom Dimensions**: Full control over Columns, Rows, Gutters (X/Y px), and Margins (X/Y px).
* **Multiple Output Formats**: Generate solid **Shape Tiles (Fill)**, **Outline Strokes**, or **Guide Nulls**.

### 6. 🎨 QuickSwatch (Live Color Palette)
* **Instant Fill & Stroke**: 1-click buttons under each swatch to apply colors directly to Shape fills, strokes, Text layers, or Solids.
* **Native Color Picker**: Click any swatch tile to open the native OS color dialog (`$.colorPicker`) and update palette colors on the fly.
* **Configurable Layout**: Customize total swatches (1–10) and grid columns (1–6).
* **Session Persistence**: Palette configurations and custom colors are automatically saved via `app.settings` across After Effects restarts.

---

## 💻 Installation

### Method 1: Dockable ScriptUI Panel (Recommended)

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

### Method 2: Direct Execution (Without Installation)

1. In After Effects, go to **File > Scripts > Run Script File...**
2. Browse and select `LazyMotionToolkit.jsx`.

---

## 🛠️ Technical Specifications

* **Language**: Adobe ExtendScript (ES3 compliant, compatible with all AE versions).
* **Host Support**: Adobe After Effects CC 2020 through CC 2026+.
* **Operating Systems**: Windows 10/11 & macOS (Intel / Apple Silicon).
* **Dependencies**: Zero external plugins or libraries required.

---

## 👨‍💻 Author & Credits

* **Developer**: **Raisul Sohan**
* **Website**: [https://raisulsohan.com](https://raisulsohan.com)
* **GitHub**: [@raisulsohan](https://github.com/raisulsohan)
* **Suite**: LazySuite Creative Tools Ecosystem
* **License**: Proprietary / Creative Commons — © 2026 Raisul Sohan. All rights reserved.
