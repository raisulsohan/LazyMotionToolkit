# Changelog

All notable changes to LazyMotionToolkit.

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
