/*
========================================================================
  Script Name: LazyMotionToolkit
  Author: Raisul Sohan (raisulsohan.com)
  Developed By: RaisulSohan
  Description: All-in-One Motion Graphics Toolkit for Adobe After Effects.
               Includes Smart Precomp (1:1 & Group), Auto Text Box,
               Fade Tools Pro (7 Easing Curves), Head to Line (Animated Arrows),
               Grid Designer, 9-Point Anchor Aligner, Live Color Swatches,
               LazyStrike FX (lightning) and LazyPreview Render.
  Copyright (c) 2026 Raisul Sohan. Free and open source under the MIT License.
========================================================================
*/

(function LazyMotionToolkit(thisObj) {
    "use strict";

    var _scriptName       = "LazyMotionToolkit";
    var _scriptAuthor     = "Raisul Sohan";
    var _authorWebsite    = "https://raisulsohan.com";
    var _buildVersion     = "1.8.20";
    var _settingsSection  = "LazyMotionToolkit_Data";

    // ============================================================
    // 1. Color Helper Utilities
    // ============================================================
    function hexToDec(hex) { return parseInt(hex.replace("#", ""), 16); }
    function decToHex(dec) {
        var hex = dec.toString(16);
        while (hex.length < 6) hex = "0" + hex;
        return "#" + hex.toUpperCase();
    }
    function hexToAeColor(hex) {
        hex = hex.replace("#", "");
        var r = parseInt(hex.substring(0, 2), 16) / 255;
        var g = parseInt(hex.substring(2, 4), 16) / 255;
        var b = parseInt(hex.substring(4, 6), 16) / 255;
        return [r, g, b, 1];
    }

    // ============================================================
    // 2. Swatch State & Persistence
    // ============================================================
    var fillColors = ["#E63946", "#F1FAEE", "#A8DADC", "#457B9D", "#1D3557"];
    var strokeColors = ["#1D3557", "#457B9D", "#A8DADC", "#F1FAEE", "#E63946"];
    var savedSwatchCols = 5;                                  // swatches per row (1-6)
    var SWATCH_COL_OPTIONS = ["1", "2", "3", "4", "5", "6"];

    function isHexColor(s) { return typeof s === "string" && /^#[0-9A-Fa-f]{6}$/.test(s); }

    /**
     * A saved palette can be hand-edited or cut short: keep 1-10 swatches, the
     * same number of fills and strokes, and only valid #RRGGBB colours, so a bad
     * entry can never stop the panel from drawing.
     */
    function normalizePalette(fills, strokes) {
        var n = Math.max(1, Math.min(10, Math.max(fills.length, strokes.length)));
        var f = [];
        var s = [];
        for (var i = 0; i < n; i++) {
            f.push(isHexColor(fills[i]) ? fills[i].toUpperCase() : "#CCCCCC");
            s.push(isHexColor(strokes[i]) ? strokes[i].toUpperCase() : "#888888");
        }
        return { fills: f, strokes: s };
    }

    try {
        if (app.settings.haveSetting(_settingsSection, "FillColors")) {
            fillColors = app.settings.getSetting(_settingsSection, "FillColors").split(",");
        }
        if (app.settings.haveSetting(_settingsSection, "StrokeColors")) {
            strokeColors = app.settings.getSetting(_settingsSection, "StrokeColors").split(",");
        }
        // 1.8.11 and earlier saved the dropdown's *index*; the count is saved now,
        // so an out-of-range index can never leave the Col menu blank again.
        if (app.settings.haveSetting(_settingsSection, "SwatchCols")) {
            var savedCols = parseInt(app.settings.getSetting(_settingsSection, "SwatchCols"), 10);
            if (savedCols >= 1 && savedCols <= 6) savedSwatchCols = savedCols;
        } else if (app.settings.haveSetting(_settingsSection, "ColIndex")) {
            var oldIdx = parseInt(app.settings.getSetting(_settingsSection, "ColIndex"), 10);
            if (oldIdx >= 0 && oldIdx <= 5) savedSwatchCols = oldIdx + 1;
        }
    } catch (eSettings) {}
    (function () {
        var palette = normalizePalette(fillColors, strokeColors);
        fillColors = palette.fills;
        strokeColors = palette.strokes;
    })();

    function saveSwatchSettings() {
        app.settings.saveSetting(_settingsSection, "FillColors", fillColors.join(","));
        app.settings.saveSetting(_settingsSection, "StrokeColors", strokeColors.join(","));
        app.settings.saveSetting(_settingsSection, "SwatchCols", savedSwatchCols.toString());
    }

    /** Set a value, or add a keyframe at `time` when the property is already animated. */
    function setValueSmart(prop, value, time) {
        if (prop.numKeys > 0) {
            prop.setValueAtTime(time, value);
        } else {
            prop.setValue(value);
        }
    }

    /** Returns how many Fill/Stroke colours were changed. */
    function changeShapeColorRecursive(propGroup, colorValue, targetType, time) {
        var changed = 0;
        for (var i = 1; i <= propGroup.numProperties; i++) {
            var prop = propGroup.property(i);
            if (prop.propertyType === PropertyType.PROPERTY) continue;

            if (targetType === "Fill" && prop.matchName === "ADBE Vector Graphic - Fill") {
                setValueSmart(prop.property("ADBE Vector Fill Color"), colorValue, time);
                changed++;
            } else if (targetType === "Stroke" && prop.matchName === "ADBE Vector Graphic - Stroke") {
                setValueSmart(prop.property("ADBE Vector Stroke Color"), colorValue, time);
                changed++;
            } else if (prop.propertyType === PropertyType.INDEXED_GROUP || prop.propertyType === PropertyType.NAMED_GROUP) {
                changed += changeShapeColorRecursive(prop, colorValue, targetType, time);
            }
        }
        return changed;
    }

    function isSolidLayer(layer) {
        try {
            return !!(layer.source && layer.source.mainSource && layer.source.mainSource instanceof SolidSource && !layer.nullLayer);
        } catch (e) {
            return false;
        }
    }

    function applySwatchColor(colorHex, targetType) {
        var comp = app.project.activeItem;
        if (!comp || !(comp instanceof CompItem)) {
            alert("Please open a composition first.");
            return;
        }
        var layers = comp.selectedLayers;
        if (layers.length === 0) {
            alert("Please select at least one layer to apply color.");
            return;
        }
        var skipped = colorLayers(comp, layers, colorHex, targetType);
        if (skipped.length) {
            alert(targetType + " color was not applied to:\n" + skipped.join("\n"));
        }
    }

    /** Engine: colour `layers` in `comp`. Returns what it could not colour, with the reason. */
    function colorLayers(comp, layers, colorHex, targetType) {
        var colorValue = hexToAeColor(colorHex);
        var rgb = [colorValue[0], colorValue[1], colorValue[2]];
        var skipped = [];
        app.beginUndoGroup("LazyMotion: Apply " + targetType + " Color");
        try {
            for (var i = 0; i < layers.length; i++) {
                var layer = layers[i];
                // One layer that fails must not stop the others.
                try {
                    if (layer instanceof ShapeLayer) {
                        if (changeShapeColorRecursive(layer.property("ADBE Root Vectors Group"), colorValue, targetType, comp.time) === 0) {
                            skipped.push(layer.name + " (no " + targetType.toLowerCase() + " in its contents)");
                        }
                    } else if (layer instanceof TextLayer) {
                        var sourceText = layer.property("ADBE Text Properties").property("ADBE Text Document");
                        var textDoc = sourceText.value;
                        if (targetType === "Fill") {
                            textDoc.applyFill = true;
                            textDoc.fillColor = rgb;
                        } else {
                            textDoc.applyStroke = true;
                            textDoc.strokeColor = rgb;
                            if (!(textDoc.strokeWidth > 0)) textDoc.strokeWidth = 2;
                        }
                        setValueSmart(sourceText, textDoc, comp.time);
                    } else if (isSolidLayer(layer) && targetType === "Fill") {
                        // A Fill effect per layer: changing the solid itself would
                        // recolour every other layer that uses the same solid.
                        var effects = layer.property("ADBE Effect Parade");
                        var fillEffect = effects.property("ADBE Fill");
                        if (!fillEffect) fillEffect = effects.addProperty("ADBE Fill");
                        setValueSmart(fillEffect.property("ADBE Fill-0002"), colorValue, comp.time);
                    } else {
                        skipped.push(layer.name + (isSolidLayer(layer) ? " (solids take Fill only)" : " (not a shape, text or solid layer)"));
                    }
                } catch (eLayer) {
                    skipped.push(layer.name + " (" + eLayer.toString() + ")");
                }
            }
        } finally {
            app.endUndoGroup();
        }
        return skipped;
    }

    // ============================================================
    // 3. Smart Precomp Engines (Individual & Group Combined)
    // ============================================================
    /** Every value a property takes: its keyframes, or its one static value. */
    function allValues(prop) {
        var values = [];
        if (prop.numKeys > 0) {
            for (var k = 1; k <= prop.numKeys; k++) values.push(prop.keyValue(k));
        } else {
            values.push(prop.value);
        }
        return values;
    }

    /**
     * The area a layer's masks can ever show, in layer space, as
     * { x, y, width, height } — or null when cropping to the masks is not safe:
     * no additive mask, an inverted mask (it shows everything outside its path),
     * or a mask path driven by an expression. Covers every keyframe of the path,
     * feather and expansion, and the Bezier handles (curves bulge past vertices).
     * The result is clipped to the layer's own size.
     */
    function getMaskBounds(layer) {
        var masks = layer.property("ADBE Mask Parade");
        if (!masks || masks.numProperties === 0) return null;
        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        var found = false;

        for (var i = 1; i <= masks.numProperties; i++) {
            var mask = masks.property(i);
            var mode = mask.maskMode;
            if (mode === MaskMode.NONE) continue;
            if (mask.inverted) return null;
            // Subtract, Intersect and Darken only ever take pixels away.
            if (mode === MaskMode.SUBTRACT || mode === MaskMode.INTERSECT || mode === MaskMode.DARKEN) continue;

            var shapeProp = mask.property("ADBE Mask Shape");
            if (shapeProp.expressionEnabled && shapeProp.expression) return null;

            var grow = 0;
            var feathers = allValues(mask.property("ADBE Mask Feather"));
            for (var f = 0; f < feathers.length; f++) grow = Math.max(grow, feathers[f][0], feathers[f][1]);
            var expansions = allValues(mask.property("ADBE Mask Offset"));
            var maxExpansion = 0;
            for (var e = 0; e < expansions.length; e++) maxExpansion = Math.max(maxExpansion, expansions[e]);
            grow += maxExpansion;

            var shapes = allValues(shapeProp);
            for (var s = 0; s < shapes.length; s++) {
                var verts = shapes[s].vertices;
                var ins = shapes[s].inTangents || [];
                var outs = shapes[s].outTangents || [];
                for (var v = 0; v < verts.length; v++) {
                    var pts = [verts[v]];
                    if (ins[v]) pts.push([verts[v][0] + ins[v][0], verts[v][1] + ins[v][1]]);
                    if (outs[v]) pts.push([verts[v][0] + outs[v][0], verts[v][1] + outs[v][1]]);
                    for (var p = 0; p < pts.length; p++) {
                        minX = Math.min(minX, pts[p][0] - grow);
                        minY = Math.min(minY, pts[p][1] - grow);
                        maxX = Math.max(maxX, pts[p][0] + grow);
                        maxY = Math.max(maxY, pts[p][1] + grow);
                        found = true;
                    }
                }
            }
        }
        if (!found) return null;

        // Nothing outside the layer is visible anyway.
        minX = Math.max(0, Math.floor(minX));
        minY = Math.max(0, Math.floor(minY));
        maxX = Math.min(layer.width, Math.ceil(maxX));
        maxY = Math.min(layer.height, Math.ceil(maxY));
        if (maxX - minX < 1 || maxY - minY < 1) return null;
        if (minX === 0 && minY === 0 && maxX === layer.width && maxY === layer.height) return null;
        return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    }

    /**
     * Footage, solid and comp layers can be precomposed with their attributes
     * left on the outside ("Leave all attributes"): transforms, keyframes,
     * effects, masks, time remapping and parenting all stay exactly as they
     * were. Shape and text layers have no source, so theirs must move inside.
     */
    function canLeaveAttributes(layer) {
        return !!(layer.source) && !(layer instanceof ShapeLayer) && !(layer instanceof TextLayer);
    }

    function findLayerBySource(comp, source) {
        for (var i = 1; i <= comp.numLayers; i++) {
            var l = comp.layer(i);
            try {
                if (l.source && l.source.id === source.id) return l;
            } catch (e) {}
        }
        return null;
    }

    function offsetPoint(value, dx, dy) {
        var out = [];
        for (var i = 0; i < value.length; i++) out.push(value[i]);
        out[0] -= dx;
        out[1] -= dy;
        return out;
    }

    /** Move a point property (every keyframe, or its value) by -dx, -dy. */
    function shiftPointProperty(prop, dx, dy) {
        if (prop.numKeys > 0) {
            for (var k = 1; k <= prop.numKeys; k++) prop.setValueAtKey(k, offsetPoint(prop.keyValue(k), dx, dy));
        } else {
            prop.setValue(offsetPoint(prop.value, dx, dy));
        }
    }

    function shiftShape(shape, dx, dy) {
        var verts = shape.vertices;
        var moved = [];
        for (var i = 0; i < verts.length; i++) moved.push([verts[i][0] - dx, verts[i][1] - dy]);
        shape.vertices = moved; // tangents are relative to their vertex, so they stay
        return shape;
    }

    /** A property's keyframe values (or its one value), read now to be written back later. */
    function snapshotProperty(prop) {
        var snap = { prop: prop, keys: [], value: null };
        if (prop.numKeys > 0) {
            for (var k = 1; k <= prop.numKeys; k++) snap.keys.push(prop.keyValue(k));
        } else {
            snap.value = prop.value;
        }
        return snap;
    }

    /** Write a snapshot back through `shift` (offsetPoint or shiftShape), moved by -dx, -dy. */
    function restoreShifted(snap, dx, dy, shift) {
        if (snap.keys.length) {
            for (var k = 1; k <= snap.keys.length; k++) snap.prop.setValueAtKey(k, shift(snap.keys[k - 1], dx, dy));
        } else {
            snap.prop.setValue(shift(snap.value, dx, dy));
        }
    }

    function snapshotMaskShapes(layer) {
        var snaps = [];
        var masks = layer.property("ADBE Mask Parade");
        if (!masks) return snaps;
        for (var i = 1; i <= masks.numProperties; i++) snaps.push(snapshotProperty(masks.property(i).property("ADBE Mask Shape")));
        return snaps;
    }

    /** Effect point controls (2D) are in layer space, so they move with the crop too. */
    function snapshotEffectPoints(group, snaps) {
        if (!group) return snaps;
        for (var i = 1; i <= group.numProperties; i++) {
            var prop = group.property(i);
            if (prop.propertyType === PropertyType.PROPERTY) {
                if (prop.propertyValueType === PropertyValueType.TwoD_SPATIAL) snaps.push(snapshotProperty(prop));
            } else {
                snapshotEffectPoints(prop, snaps);
            }
        }
        return snaps;
    }

    /**
     * Shrink a "leave attributes" precomp to `crop` (layer space). The source
     * moves up-left inside the precomp by the crop offset, and everything on
     * the outer layer that is measured in layer space — anchor point, mask
     * paths, effect points — moves by the same amount, so nothing shifts on
     * screen at any frame.
     *
     * After Effects re-centres the layers of a comp whose size changes, and
     * rescales effect points when a layer's source changes size. So every
     * value is read before the resize and written back explicitly after it.
     */
    function cropPrecomp(preLayer, precomp, crop) {
        var innerPos = snapshotProperty(precomp.layer(1).property("ADBE Transform Group").property("ADBE Position"));
        var anchor = snapshotProperty(preLayer.property("ADBE Transform Group").property("ADBE Anchor Point"));
        var maskShapes = snapshotMaskShapes(preLayer);
        var effectPoints = snapshotEffectPoints(preLayer.property("ADBE Effect Parade"), []);

        precomp.width = Math.max(4, crop.width);
        precomp.height = Math.max(4, crop.height);

        restoreShifted(innerPos, crop.x, crop.y, offsetPoint);
        restoreShifted(anchor, crop.x, crop.y, offsetPoint);
        for (var m = 0; m < maskShapes.length; m++) restoreShifted(maskShapes[m], crop.x, crop.y, shiftShape);
        for (var e = 0; e < effectPoints.length; e++) restoreShifted(effectPoints[e], crop.x, crop.y, offsetPoint);
    }

    /** Cameras and lights. (Text and shape layers are not `instanceof AVLayer` in After Effects.) */
    function isCameraOrLight(layer) {
        return (typeof CameraLayer !== "undefined" && layer instanceof CameraLayer) ||
               (typeof LightLayer !== "undefined" && layer instanceof LightLayer);
    }

    function executeIndividualPrecomp() {
        var comp = app.project.activeItem;
        if (!(comp instanceof CompItem) || comp.selectedLayers.length === 0) {
            alert("Please select at least one layer to precompose.");
            return;
        }
        var skipped = precomposeEach(comp, comp.selectedLayers);
        if (skipped.length) alert("Not precomposed:\n" + skipped.join("\n"));
    }

    /** Engine: each layer into its own precomp. Returns what it skipped, with the reason. */
    function precomposeEach(comp, layers) {
        var skipped = [];
        app.beginUndoGroup("LazyMotion: Individual Precomp");
        try {
            // Bottom-up: precomposing a layer never renumbers the ones above it.
            for (var i = layers.length - 1; i >= 0; i--) {
                var layer = layers[i];
                var name = layer.name;
                try {
                    if (isCameraOrLight(layer) || layer.nullLayer) {
                        skipped.push(name + " (null, camera or light)");
                        continue;
                    }

                    if (canLeaveAttributes(layer)) {
                        var crop = getMaskBounds(layer);
                        var precomp = comp.layers.precompose([layer.index], name + "_PC", false);
                        var preLayer = findLayerBySource(comp, precomp);
                        if (crop && preLayer) cropPrecomp(preLayer, precomp, crop);
                    } else {
                        // Shape/text: attributes move inside a comp-sized precomp,
                        // which keeps every keyframe and the layer's placement.
                        if (layer.parent) {
                            skipped.push(name + " (parented: its parent would not come into the precomp — unparent it first)");
                            continue;
                        }
                        if (layer.threeDLayer) {
                            skipped.push(name + " (3D shape/text layer — use Precomp (Group), which keeps the scene camera)");
                            continue;
                        }
                        var oldIn = layer.inPoint;
                        var oldOut = layer.outPoint;
                        var movedComp = comp.layers.precompose([layer.index], name + "_PC", true);
                        var movedLayer = findLayerBySource(comp, movedComp);
                        if (movedLayer) {
                            movedLayer.inPoint = oldIn;
                            movedLayer.outPoint = oldOut;
                        }
                    }
                } catch (eLayer) {
                    skipped.push(name + " (" + eLayer.toString() + ")");
                }
            }
        } finally {
            app.endUndoGroup();
        }
        return skipped;
    }

    function executeGroupPrecomp() {
        var comp = app.project.activeItem;
        if (!(comp instanceof CompItem) || comp.selectedLayers.length === 0) {
            alert("Please select layers to group precompose.");
            return;
        }

        var layers = comp.selectedLayers;
        if (layers.length === 1) {
            executeIndividualPrecomp();
            return;
        }
        var problem = precomposeGroup(comp, layers);
        if (problem) alert(problem);
    }

    /** Engine: all `layers` into one precomp. Returns "" or what stopped it. */
    function precomposeGroup(comp, layers) {
        var layerIndices = [];
        var selectedIndex = {};
        var minIn = Infinity;
        var maxOut = -Infinity;
        var any3D = false;
        var topName = layers[0].name;
        for (var i = 0; i < layers.length; i++) {
            layerIndices.push(layers[i].index);
            selectedIndex[layers[i].index] = true;
            if (layers[i].inPoint < minIn) minIn = layers[i].inPoint;
            if (layers[i].outPoint > maxOut) maxOut = layers[i].outPoint;
            if (layers[i].threeDLayer) any3D = true;
        }

        // A child whose parent stays outside would jump once it is inside.
        var orphans = [];
        for (var j = 0; j < layers.length; j++) {
            var parent = layers[j].parent;
            if (parent && !selectedIndex[parent.index]) orphans.push(layers[j].name + " (parent: " + parent.name + ")");
        }
        if (orphans.length) {
            return "These layers are parented to a layer that is not selected:\n" + orphans.join("\n") +
                   "\n\nSelect the parent too, or unparent them, then precompose.";
        }

        app.beginUndoGroup("LazyMotion: Group Precomp");
        try {
            var precomp = comp.layers.precompose(layerIndices, topName + "_Group_PC", true);
            var preLayer = findLayerBySource(comp, precomp);
            if (preLayer) {
                preLayer.inPoint = minIn;
                preLayer.outPoint = maxOut;
                // 3D layers inside keep rendering with this comp's camera and lights.
                if (any3D) preLayer.collapseTransformation = true;
            }
        } catch (err) {
            return "Group Precomp Error:\n" + err.toString();
        } finally {
            app.endUndoGroup();
        }
        return "";
    }

    // ============================================================
    // ============================================================
    // 4. Auto Text Box Maker (LazyType reveal rig)
    // ============================================================
    var BOX_TAG     = " - Box";
    var MEASURE_TAG = " - Box Measure";
    var TYPE_HIDE   = "LazyType Hide";
    var TYPE_SETTLE = "LazyType Settle";
    var FX_REVEAL   = "LazyType Reveal";
    var FX_BAND     = "LazyType Band";

    // Range selector options live in a nested "Advanced" group and their match
    // names have changed across versions, so each is looked up by a list of
    // candidates and then by its display name. A miss only loses that one option.
    var RANGE = {
        start:      { match: ["ADBE Text Percent Start"], name: "Start" },
        end:        { match: ["ADBE Text Percent End"], name: "End" },
        basedOn:    { match: ["ADBE Text Range Type2", "ADBE Text Range Type"], name: "Based On" },
        shape:      { match: ["ADBE Text Range Shape", "ADBE Text Selector Shape"], name: "Shape" },
        smoothness: { match: ["ADBE Text Selector Smoothness", "ADBE Text Range Smoothness"], name: "Smoothness" }
    };
    var BASED_ON    = { chars: 1, charsNoSpace: 2, words: 3, lines: 4 };
    var RANGE_SHAPE = { square: 1, rampUp: 2, rampDown: 3, triangle: 4, round: 5, smooth: 6 };

    var AUTOBOX_STYLES = [
        { label: "Typewriter (smooth)",  unit: "chars", animate: true,  soft: true },
        { label: "Typewriter (hard)",    unit: "chars", animate: true,  soft: false, band: 0 },
        { label: "Word by word",         unit: "words", animate: true,  soft: true,  band: 1 },
        { label: "Line by line",         unit: "lines", animate: true,  soft: true,  band: 1 },
        { label: "Box only (I animate Reveal)", unit: "chars", animate: false, soft: true },
        { label: "Static box (no reveal)",      unit: "chars", animate: false, soft: false, noReveal: true }
    ];

    var AUTOBOX_SETTLES = [
        { label: "Blur + rise", rise: 0.30, blur: 0.22 },
        { label: "Rise",        rise: 0.45 },
        { label: "Drop",        rise: -0.45 },
        { label: "Scale pop",   scale: 55 },
        { label: "Fade only",   plain: true }
    ];

    var AUTOBOX_DEFAULTS = {
        style: 0, settle: 0, band: 2,
        timingPerUnit: true, framesPerUnit: 1.5, totalFrames: 40, maxFrames: 120,
        ease: 1, atPlayhead: true,
        padX: 44, padY: 26, roundness: 14,
        lead: 1, smooth: 3, fade: 4,
        caret: true, caretWidth: 6, caretBlink: 2,
        stroke: false, strokeWidth: 3,
        boxColor: [0.10, 0.11, 0.13],
        caretColor: [1, 1, 1]
    };

    /** Only the keys the engine knows about, arrays cloned so defaults stay clean. */
    function mergeOptions(defaults, custom) {
        var out = {};
        for (var k in defaults) {
            if (!defaults.hasOwnProperty(k)) continue;
            var v = defaults[k];
            out[k] = (v && typeof v !== "string" && v.length !== undefined) ? v.slice(0) : v;
            if (custom && custom[k] !== undefined && custom[k] !== null) out[k] = custom[k];
        }
        return out;
    }

    // ---- Effect control helpers ----
    function addSliderControl(layer, name, defaultValue) {
        var slider = layer.property("ADBE Effect Parade").addProperty("ADBE Slider Control");
        slider.name = name;
        slider.property(1).setValue(defaultValue);
        return slider;
    }

    function addColorControl(layer, name, defaultRgba) {
        var ctrl = layer.property("ADBE Effect Parade").addProperty("ADBE Color Control");
        ctrl.name = name;
        ctrl.property(1).setValue(defaultRgba);
        return ctrl;
    }

    function addCheckboxControl(layer, name, on) {
        var ctrl = layer.property("ADBE Effect Parade").addProperty("ADBE Checkbox Control");
        ctrl.name = name;
        ctrl.property(1).setValue(on ? 1 : 0);
        return ctrl;
    }

    function addPointControl(layer, name, defaultValue) {
        var ctrl = layer.property("ADBE Effect Parade").addProperty("ADBE Point Control");
        ctrl.name = name;
        try { ctrl.property(1).setValue(defaultValue); } catch (e) {}
        return ctrl;
    }

    function findEffectByName(layer, name) {
        var fx = layer.property("ADBE Effect Parade");
        if (!fx) return null;
        for (var i = 1; i <= fx.numProperties; i++) {
            if (fx.property(i).name === name) return fx.property(i);
        }
        return null;
    }

    function removeProperties(group) {
        if (!group) return;
        for (var i = group.numProperties; i >= 1; i--) {
            try { group.property(i).remove(); } catch (e) {}
        }
    }

    /** A property anywhere under `root`, by match name then by display name. */
    function deepProp(root, matchName, displayName) {
        if (!root) return null;
        try {
            var direct = root.property(matchName);
            if (direct) return direct;
        } catch (e) {}
        try {
            for (var i = 1; i <= root.numProperties; i++) {
                var p = root.property(i);
                if (p.matchName === matchName) return p;
                if (displayName && p.name === displayName) return p;
                if (p.propertyType !== PropertyType.PROPERTY) {
                    var found = deepProp(p, matchName, displayName);
                    if (found) return found;
                }
            }
        } catch (e2) {}
        return null;
    }

    function selectorProp(selector, spec) {
        for (var i = 0; i < spec.match.length; i++) {
            var p = deepProp(selector, spec.match[i], spec.name);
            if (p) return p;
        }
        return null;
    }

    function setSelectorValue(selector, spec, value) {
        var p = selectorProp(selector, spec);
        if (!p) return false;
        try { p.setValue(value); return true; } catch (e) { return false; }
    }

    function addTextAnimator(textLayer, name) {
        var anim = textLayer.property("ADBE Text Properties").property("ADBE Text Animators").addProperty("ADBE Text Animator");
        anim.name = name;
        return anim;
    }

    function animatorProps(anim) { return anim.property("ADBE Text Animator Properties"); }
    function addRangeSelector(anim) { return anim.property("ADBE Text Selectors").addProperty("ADBE Text Selector"); }

    /** A JavaScript string literal, safe to paste into an expression. */
    function exprString(s) {
        return "\"" + String(s).replace(/\\/g, "\\\\").replace(/"/g, "\\\"").replace(/\r/g, "\\r").replace(/\n/g, "\\n") + "\"";
    }

    function countUnits(text, unit) {
        var s = String(text);
        if (unit === "lines") return Math.max(1, s.split(/[\r\n\u0003]/).length);
        if (unit === "words") {
            var parts = s.split(/[\s\u0003]+/);
            var n = 0;
            for (var i = 0; i < parts.length; i++) if (parts[i].length) n++;
            return Math.max(1, n);
        }
        return Math.max(1, s.length);
    }

    // ---- Expression pieces ----

    /** Leaves `n` = how many characters / words / lines the text has. */
    function unitCountSnippet(unit) {
        if (unit === "words") {
            return [
                "var n = 0, wasWs = true;",
                "for (var q = 0; q < s.length; q++) {",
                "    var cq = s.charAt(q);",
                "    var wq = (cq === \" \" || cq === \"\\r\" || cq === \"\\n\" || cq === \"\\t\" || cq === \"\\u0003\");",
                "    if (!wq && wasWs) n++;",
                "    wasWs = wq;",
                "}",
                "n = Math.max(1, n);"
            ].join("\n");
        }
        if (unit === "lines") {
            return [
                "var n = 1;",
                "for (var q = 0; q < s.length; q++) {",
                "    var cq = s.charAt(q);",
                "    if (cq === \"\\r\" || cq === \"\\n\" || cq === \"\\u0003\") n++;",
                "}"
            ].join("\n");
        }
        return "var n = Math.max(1, s.length);";
    }

    /** Cuts `s` down to its first `k` units, so the measure layer shows only typed text. */
    function unitCutSnippet(unit) {
        if (unit === "words") {
            return [
                "if (k <= 0) { \"\"; } else {",
                "    var end = s.length, cnt = 0, inWord = false;",
                "    for (var i = 0; i < s.length; i++) {",
                "        var c = s.charAt(i);",
                "        var ws = (c === \" \" || c === \"\\r\" || c === \"\\n\" || c === \"\\t\" || c === \"\\u0003\");",
                "        if (!ws && !inWord) { inWord = true; cnt++; if (cnt > k) { end = i; break; } }",
                "        if (ws) inWord = false;",
                "        end = i + 1;",
                "    }",
                "    s.substr(0, end);",
                "}"
            ].join("\n");
        }
        if (unit === "lines") {
            return [
                "if (k <= 0) { \"\"; } else {",
                "    var end = s.length, cnt = 0;",
                "    for (var i = 0; i < s.length; i++) {",
                "        var c = s.charAt(i);",
                "        if (c === \"\\r\" || c === \"\\n\" || c === \"\\u0003\") { cnt++; if (cnt >= k) { end = i; break; } }",
                "    }",
                "    s.substr(0, end);",
                "}"
            ].join("\n");
        }
        return "s.substr(0, Math.max(0, k));";
    }

    /** Source Text of the measure layer: the typed part of its parent's text. */
    function measureSourceExpression(unit) {
        return [
            "// LazyMotion AutoBox measure",
            "var T = thisLayer.parent;",
            "if (T == null) { value; } else {",
            "    var s = \"\";",
            "    try { s = T.text.sourceText.value; } catch (e1) { s = \"\"; }",
            "    var p = 1;",
            "    try { p = T.effect(" + exprString(FX_REVEAL) + ")(\"Slider\") / 100; } catch (e2) { p = 1; }",
            "    p = Math.max(0, Math.min(1, p));",
            unitCountSnippet(unit),
            "    var k = Math.round(n * p);",
            unitCutSnippet(unit),
            "}"
        ].join("\n");
    }

    /**
     * Leaves `caret` (0-100+, the reveal edge) and `bandPct` (the settle band) for
     * the range selectors. The caret sweeps past 100 so the band can clear the last
     * unit and the settle animation actually finishes.
     */
    function caretSnippet(unit) {
        return [
            "// LazyMotion AutoBox reveal",
            "var s = \"\";",
            "try { s = thisLayer.text.sourceText.value; } catch (e1) { s = \"\"; }",
            unitCountSnippet(unit),
            "var band = 0;",
            "try { band = effect(" + exprString(FX_BAND) + ")(\"Slider\"); } catch (e2) { band = 0; }",
            "band = Math.max(0, Math.min(n, band));",
            "var bandPct = 100 * band / n;",
            "var p = 1;",
            "try { p = effect(" + exprString(FX_REVEAL) + ")(\"Slider\") / 100; } catch (e3) { p = 1; }",
            "p = Math.max(0, Math.min(1, p));",
            "var caret = p * (100 + bandPct);"
        ].join("\n");
    }

    /**
     * The head of the two measuring expressions. Averaging a few frames of the
     * measure layer's width turns the per-character staircase into a smooth slide,
     * which is what makes the box feel attached to the typing instead of stepping.
     */
    function measurePrelude() {
        return [
            "// LazyMotion AutoBox " + _buildVersion,
            "function num(nm, d){ try { var v = effect(nm)(\"Slider\"); return (v == null) ? d : v; } catch (e) { return d; } }",
            "var T = thisLayer.parent;",
            "var FD = thisComp.frameDuration;",
            "function findMeasure(){",
            "    if (T == null) return null;",
            "    try { var byName = thisComp.layer(T.name + " + exprString(MEASURE_TAG) + "); if (byName != null) return byName; } catch (e1) {}",
            "    for (var i = 1; i <= thisComp.numLayers; i++) {",
            "        try {",
            "            var L = thisComp.layer(i);",
            "            if (L.index == thisLayer.index) continue;",
            "            if (L.name.indexOf(" + exprString(MEASURE_TAG) + ") < 0) continue;",
            "            if (L.parent != null && L.parent.index == T.index) return L;",
            "        } catch (e2) {}",
            "    }",
            "    return null;",
            "}",
            "var MEAS = findMeasure();",
            "var SRC = (MEAS != null) ? MEAS : T;",
            "function boxRect(){",
            "    var lead = num(\"Box Lead\", 0);",
            "    var n = Math.max(0, Math.min(20, Math.round(num(\"Box Smooth\", 0))));",
            "    var l = 0, tp = 0, w = 0, h = 0, wt = 0;",
            "    for (var i = 0; i <= n; i++) {",
            "        var k = n - i + 1;",  // newest frame weighs the most
            "        var r = SRC.sourceRectAtTime(time + (lead - i) * FD, false);",
            "        l += r.left * k; tp += r.top * k; w += r.width * k; h += r.height * k; wt += k;",
            "    }",
            "    return { left: l / wt, top: tp / wt, width: w / wt, height: h / wt };",
            "}"
        ].join("\n");
    }

    // Every other property reads the two Point Controls, which After Effects
    // evaluates once per frame, so the text is only measured twice a frame.
    var BOX_EXPR_HEAD = [
        "// LazyMotion AutoBox",
        "function num(nm, d){ try { var v = effect(nm)(\"Slider\"); return (v == null) ? d : v; } catch (e) { return d; } }",
        "function flag(nm, d){ try { return effect(nm)(\"Checkbox\") ? 1 : 0; } catch (e) { return d; } }",
        "function measured(nm, d){ try { return effect(nm)(\"Point\"); } catch (e) { return d; } }",
        "var T = thisLayer.parent;"
    ].join("\n");

    function exprMeasuredSize() {
        return measurePrelude() + "\nif (T == null) { value; } else { var r = boxRect(); [r.width, r.height]; }";
    }

    function exprMeasuredCenter() {
        return measurePrelude() + "\nif (T == null) { value; } else { var r = boxRect(); [r.left + r.width / 2, r.top + r.height / 2]; }";
    }

    function exprBoxSize() {
        return BOX_EXPR_HEAD + "\n" + [
            "var s = measured(\"Box Rect\", [0, 0]);",
            "var px = num(\"Padding X\", 0), py = num(\"Padding Y\", 0);",
            "if (s[0] < 0.5 && s[1] < 0.5) { [0, 0]; } else { [Math.max(1, s[0] + px * 2), Math.max(1, s[1] + py * 2)]; }"
        ].join("\n");
    }

    function exprBoxPosition() {
        return BOX_EXPR_HEAD + "\nmeasured(\"Box Center\", value);";
    }

    function exprBoxRoundness() {
        return BOX_EXPR_HEAD + "\n" + [
            "var s = measured(\"Box Rect\", [0, 0]);",
            "var py = num(\"Padding Y\", 0);",
            // Never rounder than half the box, which is what makes a pill look wrong.
            "Math.max(0, Math.min(num(\"Roundness\", 0), (s[1] + py * 2) / 2));"
        ].join("\n");
    }

    function exprBoxOpacity() {
        return BOX_EXPR_HEAD + "\n" + [
            "var s = measured(\"Box Rect\", [0, 0]);",
            "var vis = (s[0] > 0.5 || s[1] > 0.5) ? 1 : 0;",
            "var k = 1;",
            "var fade = Math.max(0, num(\"Box Fade\", 0));",
            "if (fade > 0) {",
            "    try {",
            // The reveal's first keyframe is when the box should start fading in.
            "        var st = T.effect(" + exprString(FX_REVEAL) + ")(\"Slider\").key(1).time;",
            "        var x = Math.max(0, Math.min(1, (time - st) / framesToTime(fade)));",
            "        k = x * x * (3 - 2 * x);",
            "    } catch (e) { k = 1; }",
            "}",
            "var base = 100;",
            "try { base = T.transform.opacity; } catch (e2) {}",
            "Math.max(0, Math.min(100, base * (num(\"Box Opacity\", 100) / 100) * vis * k));"
        ].join("\n");
    }

    function exprCaretSize() {
        return BOX_EXPR_HEAD + "\n" + [
            "var s = measured(\"Box Rect\", [0, 0]);",
            "var h = s[1];",
            "if (h < 1) { try { h = T.text.sourceText.style.fontSize; } catch (e) { h = 40; } }",
            "[Math.max(1, num(\"Caret Width\", 6)), Math.max(1, h)];"
        ].join("\n");
    }

    function exprCaretPosition() {
        return BOX_EXPR_HEAD + "\n" + [
            "var c = measured(\"Box Center\", [0, 0]);",
            "var s = measured(\"Box Rect\", [0, 0]);",
            "[c[0] + s[0] / 2 + num(\"Caret Gap\", 3) + Math.max(1, num(\"Caret Width\", 6)) / 2, c[1]];"
        ].join("\n");
    }

    function exprCaretOpacity() {
        return BOX_EXPR_HEAD + "\n" + [
            "var on = flag(\"Caret\", 0);",
            "var p = 1;",
            "try { p = T.effect(" + exprString(FX_REVEAL) + ")(\"Slider\") / 100; } catch (e) { p = 1; }",
            "var typing = (p > 0.0001 && p < 0.999) ? 1 : 0;",
            "var blink = 1;",
            "var rate = num(\"Caret Blink\", 0);",
            "if (rate > 0) blink = (Math.floor(time * rate * 2) % 2 === 0) ? 1 : 0;",
            // A single caret cannot sit at the end of wrapped text, so it steps aside.
            "var multi = 0;",
            "try {",
            "    var fs = T.text.sourceText.style.fontSize;",
            "    if (fs > 0 && measured(\"Box Rect\", [0, 0])[1] > fs * 1.7) multi = 1;",
            "} catch (e2) {}",
            "100 * on * blink * typing * (1 - multi);"
        ].join("\n");
    }

    // ---- Rig builders ----

    function applyRevealEase(prop, mode) {
        if (prop.numKeys < 2) return;
        try {
            if (mode === 0) {
                prop.setInterpolationTypeAtKey(1, KeyframeInterpolationType.LINEAR, KeyframeInterpolationType.LINEAR);
                prop.setInterpolationTypeAtKey(2, KeyframeInterpolationType.LINEAR, KeyframeInterpolationType.LINEAR);
                return;
            }
            // Ease out types fast and settles; smooth eases at both ends.
            var influence = (mode === 2) ? [40, 70] : [12, 85];
            prop.setTemporalEaseAtKey(1, [new KeyframeEase(0, influence[0])], [new KeyframeEase(0, influence[0])]);
            prop.setTemporalEaseAtKey(2, [new KeyframeEase(0, influence[1])], [new KeyframeEase(0, influence[1])]);
        } catch (e) {}
    }

    /**
     * Finds a layer's index by iterating all layers. Never stale, never throws.
     * Returns 0 if not found.
     */
    function findLayerIdx(comp, name) {
        for (var i = 1; i <= comp.numLayers; i++) {
            try { if (comp.layer(i).name === name) return i; } catch (e) {}
        }
        return 0;
    }

    function createMeasureLayer(comp, tempName, unit, origName) {
        var measName = origName + MEASURE_TAG;
        var srcIdx = findLayerIdx(comp, tempName);
        if (!srcIdx) return;
        var m = comp.layer(srcIdx).duplicate();
        // duplicate() places copy directly above original; m is fresh
        m.name = measName;
        removeProperties(m.property("ADBE Text Properties").property("ADBE Text Animators"));
        removeProperties(m.property("ADBE Effect Parade"));
        try {
            var op = m.property("ADBE Transform Group").property("ADBE Opacity");
            op.expression = "";
            while (op.numKeys > 0) op.removeKey(1);
            op.setValue(0);
        } catch (e1) {}
        try { m.guideLayer = true; } catch (e2) {}
        try { m.shy = true; } catch (e3) {}
        try { m.motionBlur = false; } catch (e4) {}
        try { m.label = 0; } catch (e5) {}
        m.enabled = true;

        // Set parent BEFORE setting the Source Text expression
        // (the expression uses thisLayer.parent, so parent must exist first)
        var parentIdx = findLayerIdx(comp, tempName);
        var measIdx = findLayerIdx(comp, measName);
        if (parentIdx && measIdx) {
            try { comp.layer(measIdx).parent = comp.layer(parentIdx); } catch (e6) {}
            // Re-set position after parent to keep it at parent's origin
            measIdx = findLayerIdx(comp, measName);
            try {
                var mTr = comp.layer(measIdx).property("ADBE Transform Group");
                mTr.property("ADBE Anchor Point").setValue([0, 0, 0]);
                mTr.property("ADBE Position").setValue([0, 0, 0]);
            } catch (eMT) {}
        }

        // NOW set the expression (parent is available)
        measIdx = findLayerIdx(comp, measName);
        if (measIdx) {
            comp.layer(measIdx).property("ADBE Text Properties").property("ADBE Text Document").expression = measureSourceExpression(unit);
        }
        try { comp.layer(findLayerIdx(comp, measName)).selected = false; } catch (e7) {}
    }

    function buildTypeAnimators(comp, tempName, style, o, fontSize) {
        var basedOn = (style.unit === "words") ? BASED_ON.words
                    : (style.unit === "lines") ? BASED_ON.lines : BASED_ON.chars;
        var soft = style.soft && o.band > 0;

        var idx = findLayerIdx(comp, tempName);
        if (!idx) return;
        // 1. Hide everything past the caret, so the text types itself on.
        var hide = addTextAnimator(comp.layer(idx), TYPE_HIDE);
        animatorProps(hide).addProperty("ADBE Text Opacity").setValue(0);
        var hideSel = addRangeSelector(hide);
        setSelectorValue(hideSel, RANGE.basedOn, basedOn);
        setSelectorValue(hideSel, RANGE.shape, RANGE_SHAPE.square);
        setSelectorValue(hideSel, RANGE.smoothness, soft ? 100 : 0);
        var hideStart = selectorProp(hideSel, RANGE.start);
        if (hideStart) hideStart.expression = caretSnippet(style.unit) + "\nMath.max(0, Math.min(100, caret));";

        if (!soft) return;

        idx = findLayerIdx(comp, tempName);
        if (!idx) return;
        // 2. The few units at the caret arrive offset, blurred and transparent, and
        //    land as the caret moves on. This is the part that stops it looking flat.
        var settle = addTextAnimator(comp.layer(idx), TYPE_SETTLE);
        var sp = animatorProps(settle);
        var look = AUTOBOX_SETTLES[o.settle] || AUTOBOX_SETTLES[0];
        try { sp.addProperty("ADBE Text Opacity").setValue(0); } catch (eO) {}
        if (look.rise) { try { sp.addProperty("ADBE Text Position 3D").setValue([0, fontSize * look.rise, 0]); } catch (eP) {} }
        if (look.scale) { try { sp.addProperty("ADBE Text Scale 3D").setValue([look.scale, look.scale, 100]); } catch (eS) {} }
        if (look.blur) { try { sp.addProperty("ADBE Text Blur").setValue([fontSize * look.blur, fontSize * look.blur]); } catch (eB) {} }

        var settleSel = addRangeSelector(settle);
        setSelectorValue(settleSel, RANGE.basedOn, basedOn);
        setSelectorValue(settleSel, RANGE.shape, RANGE_SHAPE.rampUp);
        var sStart = selectorProp(settleSel, RANGE.start);
        var sEnd = selectorProp(settleSel, RANGE.end);
        if (sStart) sStart.expression = caretSnippet(style.unit) + "\nMath.max(0, Math.min(100, caret - bandPct));";
        if (sEnd) sEnd.expression = caretSnippet(style.unit) + "\nMath.max(0, Math.min(100, caret));";
    }

    function buildBoxLayer(comp, tempName, o, wantsReveal, origName) {
        var boxName = origName + BOX_TAG;

        // ── Phase 1: Create layer + structure (NO expressions yet) ──
        var box = comp.layers.addShape();
        box.name = boxName;

        // Effect controls (values only, no expressions)
        addSliderControl(box, "Padding X", o.padX);
        addSliderControl(box, "Padding Y", o.padY);
        addSliderControl(box, "Roundness", o.roundness);
        addSliderControl(box, "Box Opacity", 100);
        addColorControl(box, "Box Color", [o.boxColor[0], o.boxColor[1], o.boxColor[2], 1]);
        addSliderControl(box, "Box Lead", o.lead);
        addSliderControl(box, "Box Smooth", o.smooth);
        addSliderControl(box, "Box Fade", wantsReveal ? o.fade : 0);
        addCheckboxControl(box, "Caret", (o.caret && wantsReveal) ? 1 : 0);
        addSliderControl(box, "Caret Width", o.caretWidth);
        addSliderControl(box, "Caret Gap", Math.max(2, Math.round(o.caretWidth * 0.6)));
        addSliderControl(box, "Caret Blink", o.caretBlink);
        addColorControl(box, "Caret Color", [o.caretColor[0], o.caretColor[1], o.caretColor[2], 1]);
        addPointControl(box, "Box Rect", [0, 0]);
        addPointControl(box, "Box Center", [0, 0]);

        // Shape contents (structure only, no expressions)
        var boxIdx = findLayerIdx(comp, boxName);
        var bx = comp.layer(boxIdx);
        var contents = bx.property("ADBE Root Vectors Group");

        var caretGrp = contents.addProperty("ADBE Vector Group");
        caretGrp.name = "Caret";
        var caretItems = caretGrp.property("ADBE Vectors Group");
        caretItems.addProperty("ADBE Vector Shape - Rect");
        caretItems.property("ADBE Vector Shape - Rect").property("ADBE Vector Rect Roundness").setValue(Math.min(3, o.caretWidth / 2));
        caretItems.addProperty("ADBE Vector Graphic - Fill");

        var boxGrp = contents.addProperty("ADBE Vector Group");
        boxGrp.name = "Auto Box";
        var boxItems = boxGrp.property("ADBE Vectors Group");
        boxItems.addProperty("ADBE Vector Shape - Rect");
        if (o.stroke) {
            var stroke = boxItems.addProperty("ADBE Vector Graphic - Stroke");
            stroke.property("ADBE Vector Stroke Width").setValue(Math.max(0.5, o.strokeWidth));
        }
        boxItems.addProperty("ADBE Vector Graphic - Fill");

        // Transform values (no expressions yet)
        boxIdx = findLayerIdx(comp, boxName);
        bx = comp.layer(boxIdx);
        var tr = bx.property("ADBE Transform Group");
        tr.property("ADBE Anchor Point").setValue([0, 0, 0]);
        tr.property("ADBE Position").setValue([0, 0, 0]);
        tr.property("ADBE Scale").setValue([100, 100, 100]);

        // ── Phase 2: Set parent + reorder ──
        // IMPORTANT: When AE sets parent, it auto-adjusts position to maintain
        // visual position. So position [0,0,0] (comp space) becomes [-parentX, -parentY].
        // We must RE-SET position to [0,0,0] AFTER parent to get parent-relative origin.
        boxIdx = findLayerIdx(comp, boxName);
        var txtIdx = findLayerIdx(comp, tempName);
        if (boxIdx && txtIdx) {
            try { comp.layer(boxIdx).parent = comp.layer(txtIdx); } catch (eP) {}
            // Re-set transform AFTER parent so values are in parent space
            boxIdx = findLayerIdx(comp, boxName);
            try {
                var tr2 = comp.layer(boxIdx).property("ADBE Transform Group");
                tr2.property("ADBE Anchor Point").setValue([0, 0, 0]);
                tr2.property("ADBE Position").setValue([0, 0, 0]);
                tr2.property("ADBE Scale").setValue([100, 100, 100]);
            } catch (eTr) {}
            // Reorder
            boxIdx = findLayerIdx(comp, boxName);
            txtIdx = findLayerIdx(comp, tempName);
            if (boxIdx && txtIdx && boxIdx !== txtIdx + 1) {
                try { comp.layer(boxIdx).moveTo(txtIdx + 1); } catch (eM) {}
            }
        }

        // ── Phase 3: Apply ALL expressions (parent is set, so .parent works) ──
        boxIdx = findLayerIdx(comp, boxName);
        bx = comp.layer(boxIdx);

        // Point control expressions
        findEffectByName(bx, "Box Rect").property(1).expression = exprMeasuredSize();
        findEffectByName(bx, "Box Center").property(1).expression = exprMeasuredCenter();

        // Shape group expressions
        var cnt = bx.property("ADBE Root Vectors Group");

        // Caret group
        var cGrp = cnt.property("Caret");
        var cItems = cGrp.property("ADBE Vectors Group");
        var cRect = cItems.property("ADBE Vector Shape - Rect");
        cRect.property("ADBE Vector Rect Size").expression = exprCaretSize();
        cRect.property("ADBE Vector Rect Position").expression = exprCaretPosition();
        cItems.property("ADBE Vector Graphic - Fill")
            .property("ADBE Vector Fill Color").expression =
                "try { effect(\"Caret Color\")(\"Color\"); } catch (e) { [1, 1, 1, 1]; }";
        try {
            cGrp.property("ADBE Vector Transform Group").property("ADBE Vector Group Opacity").expression = exprCaretOpacity();
        } catch (eCO) {}

        // Auto Box group
        var aGrp = cnt.property("Auto Box");
        var aItems = aGrp.property("ADBE Vectors Group");
        var aRect = aItems.property("ADBE Vector Shape - Rect");
        aRect.property("ADBE Vector Rect Size").expression = exprBoxSize();
        aRect.property("ADBE Vector Rect Position").expression = exprBoxPosition();
        aRect.property("ADBE Vector Rect Roundness").expression = exprBoxRoundness();
        if (o.stroke) {
            aItems.property("ADBE Vector Graphic - Stroke")
                .property("ADBE Vector Stroke Color").expression =
                    "try { effect(\"Caret Color\")(\"Color\"); } catch (e) { [1, 1, 1, 1]; }";
        }
        aItems.property("ADBE Vector Graphic - Fill")
            .property("ADBE Vector Fill Color").expression =
                "try { effect(\"Box Color\")(\"Color\"); } catch (e) { [0.1, 0.11, 0.13, 1]; }";

        // Transform expression
        boxIdx = findLayerIdx(comp, boxName);
        comp.layer(boxIdx).property("ADBE Transform Group").property("ADBE Opacity").expression = exprBoxOpacity();

        return boxName;
    }

    /** Everything Auto Box ever added to `textLayer`, so re-running replaces instead of stacking. */
    function removeAutoBoxRig(comp, tempName) {
        var removed = 0;
        var txtIdx = findLayerIdx(comp, tempName);
        if (!txtIdx) return removed;
        for (var i = comp.numLayers; i >= 1; i--) {
            try {
                var l = comp.layer(i);
                if (l.parent !== null && l.parent.index === txtIdx) {
                    if (l.name.indexOf(BOX_TAG) >= 0 || l.name.indexOf(MEASURE_TAG) >= 0) {
                        l.remove(); removed++;
                        // After remove, txtIdx may shift. Re-find it.
                        txtIdx = findLayerIdx(comp, tempName);
                        if (!txtIdx) break;
                    }
                }
            } catch (e) {}
        }
        txtIdx = findLayerIdx(comp, tempName);
        if (!txtIdx) return removed;
        var animators = comp.layer(txtIdx).property("ADBE Text Properties").property("ADBE Text Animators");
        if (animators) {
            for (var a = animators.numProperties; a >= 1; a--) {
                var nm = animators.property(a).name;
                if (nm === TYPE_HIDE || nm === TYPE_SETTLE) {
                    try { animators.property(a).remove(); removed++; } catch (e3) {}
                }
            }
        }
        var fxNames = [FX_REVEAL, FX_BAND];
        for (var f = 0; f < fxNames.length; f++) {
            txtIdx = findLayerIdx(comp, tempName);
            if (!txtIdx) break;
            var fx = findEffectByName(comp.layer(txtIdx), fxNames[f]);
            if (fx) { try { fx.remove(); removed++; } catch (e4) {} }
        }
        return removed;
    }

    function createAutoBox(comp, tempName, o, origName) {
        var style = AUTOBOX_STYLES[o.style] || AUTOBOX_STYLES[0];

        var txtIdx = findLayerIdx(comp, tempName);
        if (!txtIdx) throw new Error("Text layer not found: " + tempName);
        var doc = comp.layer(txtIdx).property("ADBE Text Properties").property("ADBE Text Document").value;
        var fontSize = 50;
        try { if (doc.fontSize > 0) fontSize = doc.fontSize; } catch (eFs) {}
        var band = (style.band !== undefined) ? style.band : o.band;
        var opts = mergeOptions(o, { band: band });

        removeAutoBoxRig(comp, tempName);

        var wantsReveal = !style.noReveal;
        if (wantsReveal) {
            txtIdx = findLayerIdx(comp, tempName);
            addSliderControl(comp.layer(txtIdx), FX_REVEAL, 0);
            txtIdx = findLayerIdx(comp, tempName);
            addSliderControl(comp.layer(txtIdx), FX_BAND, Math.max(0, band));

            txtIdx = findLayerIdx(comp, tempName);
            var reveal = findEffectByName(comp.layer(txtIdx), FX_REVEAL).property(1);
            var units = countUnits(doc.text, style.unit);
            var frames = opts.timingPerUnit
                ? Math.min(opts.maxFrames, Math.max(2, Math.round(units * opts.framesPerUnit)))
                : Math.max(2, Math.round(opts.totalFrames));
            txtIdx = findLayerIdx(comp, tempName);
            var startTime = opts.atPlayhead ? comp.time : comp.layer(txtIdx).inPoint;
            reveal.setValueAtTime(startTime, 0);
            reveal.setValueAtTime(startTime + frames / comp.frameRate, 100);
            applyRevealEase(reveal, opts.ease);

            createMeasureLayer(comp, tempName, style.unit, origName);
        }

        if (style.animate) buildTypeAnimators(comp, tempName, style, opts, fontSize);
        return buildBoxLayer(comp, tempName, opts, wantsReveal, origName);
    }

    /** Engine: box + reveal rig for every text layer in `layers`. Returns what it skipped. */
    function autoBoxLayers(comp, layers, options) {
        var o = mergeOptions(AUTOBOX_DEFAULTS, options);
        var made = [];
        var skipped = [];
        app.beginUndoGroup("LazyMotion: Auto Box");
        try {
            // Capture layer indices first — the layers array from comp.selectedLayers
            // holds live references that go stale after any DOM mutation.
            var uniqueId = "LM_TEMP_" + new Date().getTime() + "_";
            var targets = [];
            for (var i = 0; i < layers.length; i++) {
                if (!(layers[i] instanceof TextLayer)) {
                    skipped.push(layers[i].name + " (not a text layer)");
                    continue;
                }
                targets.push({ origName: layers[i].name, idx: layers[i].index });
            }
            // Rename using index (most stable accessor, never invalidated)
            for (var r = 0; r < targets.length; r++) {
                var tempName = uniqueId + r;
                comp.layer(targets[r].idx).name = tempName;
                targets[r].tempName = tempName;
            }

            // Now build the rig for each target
            for (var t = 0; t < targets.length; t++) {
                try {
                    var boxLayer = createAutoBox(comp, targets[t].tempName, o, targets[t].origName);
                    made.push(targets[t].origName + BOX_TAG);
                } catch (eLayer) {
                    skipped.push(targets[t].origName + " (" + eLayer.name + ": " + eLayer.message + ")");
                }
            }

            // Restore original names
            for (var u = 0; u < targets.length; u++) {
                try {
                    comp.layer(targets[u].tempName).name = targets[u].origName;
                } catch (eRestore) {}
            }

            // Select the box layers by name (never use stale layer references)
            try {
                for (var s = 1; s <= comp.numLayers; s++) comp.layer(s).selected = false;
                for (var m = 0; m < made.length; m++) {
                    try { comp.layer(made[m]).selected = true; } catch (eS) {}
                }
            } catch (eSel) {}
        } finally {
            app.endUndoGroup();
        }
        return { made: made, skipped: skipped };
    }

    function executeAutoBoxMaker(options) {
        var comp = app.project.activeItem;
        if (!comp || !(comp instanceof CompItem)) {
            alert("Please open a composition first.");
            return;
        }
        var selected = comp.selectedLayers;
        var anyText = false;
        for (var s = 0; s < selected.length; s++) {
            if (selected[s] instanceof TextLayer) anyText = true;
        }
        if (!anyText) {
            alert("Please select a Text Layer first, then click Auto Box.");
            return;
        }
        var result = autoBoxLayers(comp, selected, options);
        if (result.skipped.length) alert("Auto Box skipped:\n" + result.skipped.join("\n"));
    }

    // ---- Auto Box dialog ----
    function showAutoBoxDialog() {
        var comp = app.project.activeItem;
        if (!comp || !(comp instanceof CompItem)) {
            alert("Please open a composition first.");
            return;
        }
        var o = mergeOptions(AUTOBOX_DEFAULTS, null);
        var picked = { box: o.boxColor.slice(0), caret: o.caretColor.slice(0) };

        function styleLabels() {
            var out = [];
            for (var i = 0; i < AUTOBOX_STYLES.length; i++) out.push(AUTOBOX_STYLES[i].label);
            return out;
        }
        function settleLabels() {
            var out = [];
            for (var i = 0; i < AUTOBOX_SETTLES.length; i++) out.push(AUTOBOX_SETTLES[i].label);
            return out;
        }
        function numberRow(parent, label, value, tip, chars) {
            var g = parent.add("group");
            g.orientation = "row";
            g.alignChildren = ["left", "center"];
            var l = g.add("statictext", undefined, label);
            l.preferredSize.width = 104;
            var ed = g.add("edittext", undefined, String(value));
            ed.characters = chars || 5;
            if (tip) ed.helpTip = tip;
            return ed;
        }

        var dlg = new Window("dialog", "LazyMotion — Auto Box & Text Reveal", undefined, { resizeable: false });
        dlg.orientation = "column";
        dlg.alignChildren = ["fill", "top"];
        dlg.spacing = 10;
        dlg.margins = 15;

        var cols = dlg.add("group");
        cols.orientation = "row";
        cols.alignChildren = ["fill", "top"];
        cols.spacing = 10;

        var pReveal = cols.add("panel", undefined, "Text reveal");
        pReveal.orientation = "column";
        pReveal.alignChildren = ["fill", "top"];
        pReveal.margins = 12;
        pReveal.spacing = 6;
        var ddStyle = pReveal.add('dropdownlist', undefined, styleLabels());
        ddStyle.selection = o.style;
        var ddSettle = pReveal.add('dropdownlist', undefined, settleLabels());
        ddSettle.selection = o.settle;
        
        var edBand = numberRow(pReveal, 'Settle band:', o.band, 'Size of the transition wave');
        
        var gTiming = pReveal.add('group');
        gTiming.orientation = 'row';
        gTiming.alignChildren = ['left', 'center'];
        var rbUnit = gTiming.add('radiobutton', undefined, 'Time per unit');
        var rbTotal = gTiming.add('radiobutton', undefined, 'Total time');
        rbUnit.value = o.timingPerUnit;
        rbTotal.value = !o.timingPerUnit;
        
        var edFramesUnit = numberRow(pReveal, 'Frames / unit:', o.framesPerUnit);
        var edTotalFrames = numberRow(pReveal, 'Total frames:', o.totalFrames);
        var chkPlayhead = pReveal.add('checkbox', undefined, 'Start at playhead');
        chkPlayhead.value = o.atPlayhead;
        
        var pBox = cols.add('panel', undefined, 'Box and Padding');
        pBox.orientation = 'column';
        pBox.alignChildren = ['fill', 'top'];
        pBox.margins = 12;
        pBox.spacing = 6;
        var edPadX = numberRow(pBox, 'Padding X:', o.padX);
        var edPadY = numberRow(pBox, 'Padding Y:', o.padY);
        var edRound = numberRow(pBox, 'Roundness:', o.roundness);
        var edLead = numberRow(pBox, 'Box Lead:', o.lead);
        var edSmooth = numberRow(pBox, 'Box Smooth:', o.smooth);
        var edFade = numberRow(pBox, 'Box Fade:', o.fade);
        
        var pCaret = cols.add('panel', undefined, 'Caret and Stroke');
        pCaret.orientation = 'column';
        pCaret.alignChildren = ['fill', 'top'];
        pCaret.margins = 12;
        pCaret.spacing = 6;
        var chkCaret = pCaret.add('checkbox', undefined, 'Show Caret');
        chkCaret.value = o.caret;
        var edCWidth = numberRow(pCaret, 'Caret Width:', o.caretWidth);
        var edCBlink = numberRow(pCaret, 'Caret Blink:', o.caretBlink);
        
        var chkStroke = pCaret.add('checkbox', undefined, 'Add Stroke');
        chkStroke.value = o.stroke;
        var edSWidth = numberRow(pCaret, 'Stroke Width:', o.strokeWidth);
        
        var btnGrp = dlg.add('group');
        btnGrp.alignment = ['right', 'bottom'];
        var btnCancel = btnGrp.add('button', undefined, 'Cancel');
        var btnApply = btnGrp.add('button', undefined, 'Apply');
        
        btnApply.onClick = function() {
            var opts = {
                style: ddStyle.selection ? ddStyle.selection.index : 0,
                settle: ddSettle.selection ? ddSettle.selection.index : 0,
                band: parseFloat(edBand.text) || o.band,
                timingPerUnit: rbUnit.value,
                framesPerUnit: parseFloat(edFramesUnit.text) || o.framesPerUnit,
                totalFrames: parseFloat(edTotalFrames.text) || o.totalFrames,
                maxFrames: o.maxFrames,
                ease: o.ease,
                atPlayhead: chkPlayhead.value,
                padX: parseFloat(edPadX.text) || 0,
                padY: parseFloat(edPadY.text) || 0,
                roundness: parseFloat(edRound.text) || 0,
                lead: parseFloat(edLead.text) || 0,
                smooth: parseFloat(edSmooth.text) || 0,
                fade: parseFloat(edFade.text) || 0,
                caret: chkCaret.value,
                caretWidth: parseFloat(edCWidth.text) || o.caretWidth,
                caretBlink: parseFloat(edCBlink.text) || o.caretBlink,
                stroke: chkStroke.value,
                strokeWidth: parseFloat(edSWidth.text) || o.strokeWidth,
                boxColor: o.boxColor,
                caretColor: o.caretColor
            };
            dlg.close();
            executeAutoBoxMaker(opts);
        };
        btnCancel.onClick = function() { dlg.close(); };
        
        dlg.show();
    }

    // ============================================================
    // 5. Fade Tools Pro (7 Easing Functions & Layer Markers)
    // ============================================================
    var easingFuncs = [
        "function ease(t){ return t; }",
        "function ease(t){ return (t==0)?0:Math.pow(2, 10*(t-1)); }",
        "function ease(t){ return Math.sin((t * Math.PI)/2); }",
        "function ease(t){ return t<0.5 ? 2*t*t : -1+(4-2*t)*t; }",
        "function ease(t){ return t<0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3)/2; }",
        "function ease(t){ var s=7.5625, p=2.75, l; if(t<1/p){l=s*t*t;} else if(t<2/p){t-=1.5/p;l=s*t*t+0.75;} else if(t<2.5/p){t-=2.25/p;l=s*t*t+0.9375;} else{t-=2.625/p;l=s*t*t+0.984375;} return l; }",
        "function ease(t){ var c4 = (2 * Math.PI) / 3; return t === 0 ? 0 : t === 1 ? 1 : -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * c4); }"
    ];

    // First line of every fade expression, so Clear and a re-apply know which
    // expressions are LazyMotion's and leave anyone else's alone.
    var FADE_TAG = "// LazyMotion Fade";

    function isFadeExpression(expr) {
        if (!expr) return false;
        if (expr.indexOf(FADE_TAG) === 0) return true;
        // Written by 1.4 and earlier, before the tag existed.
        return expr.indexOf("ease = function(t)") === 0 && expr.indexOf("fadeDuration = ") !== -1;
    }

    /**
     * The opacity expression. Speed divides the duration (2 = twice as fast).
     * The layer's own opacity (value or keyframes) is kept and scaled, the
     * first and last frames are fully transparent, and a layer shorter than
     * two fades eases in and out without a jump in the middle.
     */
    function buildFadeExpression(easeType, durationFrames, speed, fadeIn, fadeOut) {
        var frames = durationFrames / speed;
        return FADE_TAG + "\n" +
            easingFuncs[easeType] + "\n" +
            "function clamp01(x){ return Math.max(0, Math.min(1, x)); }\n" +
            "var d = framesToTime(" + frames + ");\n" +
            "var k = 1;\n" +
            (fadeIn ? "k = Math.min(k, ease(clamp01((time - inPoint) / d)));\n" : "") +
            (fadeOut ? "k = Math.min(k, ease(clamp01((outPoint - thisComp.frameDuration - time) / d)));\n" : "") +
            "value * clamp01(k);";
    }

    function removeFadeMarkers(layer) {
        var markers = layer.property("ADBE Marker");
        if (!markers) return;
        for (var j = markers.numKeys; j >= 1; j--) {
            var comment = markers.keyValue(j).comment;
            if (comment === "fade in" || comment === "fade out") markers.removeKey(j);
        }
    }

    function opacityOf(layer) {
        var transform = layer.property("ADBE Transform Group");
        return transform ? transform.property("ADBE Opacity") : null;
    }

    function applyFadeTools(fadeDuration, fadeSpeed, easeType, applyFadeIn, applyFadeOut, addMarkers) {
        var comp = app.project.activeItem;
        if (!(comp && comp instanceof CompItem)) {
            alert("Please open a composition first.");
            return;
        }

        var selectedLayers = comp.selectedLayers;
        if (selectedLayers.length === 0) {
            alert("Please select at least one layer to apply fades.");
            return;
        }
        var skipped = fadeLayers(selectedLayers, fadeDuration, fadeSpeed, easeType, applyFadeIn, applyFadeOut, addMarkers);
        if (skipped.length) alert("Fade not applied to:\n" + skipped.join("\n"));
    }

    /** Engine: put the fade on `selectedLayers`. Returns what it skipped, with the reason. */
    function fadeLayers(selectedLayers, fadeDuration, fadeSpeed, easeType, applyFadeIn, applyFadeOut, addMarkers) {
        var expression = buildFadeExpression(easeType, fadeDuration, fadeSpeed, applyFadeIn, applyFadeOut);
        var skipped = [];
        app.beginUndoGroup("LazyMotion: Apply Fade Tools");
        try {
            for (var i = 0; i < selectedLayers.length; i++) {
                var layer = selectedLayers[i];
                try {
                    var opacityProp = opacityOf(layer);
                    if (!opacityProp) {
                        skipped.push(layer.name + " (no opacity)");
                        continue;
                    }
                    if (opacityProp.expression && !isFadeExpression(opacityProp.expression)) {
                        skipped.push(layer.name + " (already has its own opacity expression)");
                        continue;
                    }
                    opacityProp.expression = expression;

                    removeFadeMarkers(layer);
                    if (addMarkers) {
                        var markers = layer.property("ADBE Marker");
                        if (applyFadeIn) markers.setValueAtTime(layer.inPoint, new MarkerValue("fade in"));
                        if (applyFadeOut) markers.setValueAtTime(layer.outPoint, new MarkerValue("fade out"));
                    }
                } catch (eLayer) {
                    skipped.push(layer.name + " (" + eLayer.toString() + ")");
                }
            }
        } finally {
            app.endUndoGroup();
        }
        return skipped;
    }

    function deleteFadeTools() {
        var comp = app.project.activeItem;
        if (!(comp && comp instanceof CompItem)) {
            alert("Please open a composition first.");
            return;
        }

        var selectedLayers = comp.selectedLayers;
        if (selectedLayers.length === 0) {
            alert("Please select at least one layer.");
            return;
        }
        var kept = clearFades(selectedLayers);
        if (kept.length) alert("Left alone (their opacity expression is not a LazyMotion fade):\n" + kept.join("\n"));
    }

    /** Engine: remove LazyMotion fades from `selectedLayers`. Returns the layers it left alone. */
    function clearFades(selectedLayers) {
        var kept = [];
        app.beginUndoGroup("LazyMotion: Delete Fade Effects");
        try {
            for (var i = 0; i < selectedLayers.length; i++) {
                var layer = selectedLayers[i];
                try {
                    var opacityProp = opacityOf(layer);
                    if (opacityProp && opacityProp.expression) {
                        if (isFadeExpression(opacityProp.expression)) {
                            opacityProp.expression = "";
                        } else {
                            kept.push(layer.name);
                        }
                    }
                    // Only the "fade in" / "fade out" markers; the user's own stay.
                    removeFadeMarkers(layer);
                } catch (eLayer) {
                    kept.push(layer.name + " (" + eLayer.toString() + ")");
                }
            }
        } finally {
            app.endUndoGroup();
        }
        return kept;
    }

    // ============================================================
    // 6. Head to Line Engine (Animated Arrows & Path Follower)
    // ============================================================
    function getLineColorAndWidth(layer) {
        var color = [0.0, 0.6, 1.0, 1];
        var width = 8;
        try {
            function searchProps(grp) {
                for (var i = 1; i <= grp.numProperties; i++) {
                    var p = grp.property(i);
                    if (p.matchName === "ADBE Vector Graphic - Stroke") {
                        color = p.property("ADBE Vector Stroke Color").value;
                        width = p.property("ADBE Vector Stroke Width").value;
                        return true;
                    }
                    if (p.propertyType === PropertyType.INDEXED_GROUP || p.propertyType === PropertyType.NAMED_GROUP) {
                        if (searchProps(p)) return true;
                    }
                }
                return false;
            }
            searchProps(layer.property("ADBE Root Vectors Group"));
        } catch (e) {}
        return { color: color, width: width };
    }

    function createHeadShape(comp, lineLayer, headTypeStr, roundCorners, isStartHead, reverseDir) {
        if (!lineLayer) return null;

        var headLayer = comp.layers.addShape();
        headLayer.name = lineLayer.name + (isStartHead ? " - Head Start" : " - Head");
        headLayer.moveBefore(lineLayer);
        headLayer.parent = lineLayer;

        var lineInfo = getLineColorAndWidth(lineLayer);
        var headSize = Math.max(16, lineInfo.width * 3.5);

        addSliderControl(headLayer, "Head Size", headSize);
        addSliderControl(headLayer, "Offset Angle", 0);

        var rootVec = headLayer.property("ADBE Root Vectors Group");
        var shapeGrp = rootVec.addProperty("ADBE Vector Group");
        shapeGrp.name = "Head Shape";
        var grpContents = shapeGrp.property("ADBE Vectors Group");

        // Shape Geometry based on Type
        switch (headTypeStr) {
            case "Circle":
                var circ = grpContents.addProperty("ADBE Vector Shape - Ellipse");
                try { (circ.property("ADBE Vector Ellipse Size") || circ.property(2)).expression = "var s = effect(\"Head Size\")(\"Slider\"); [s, s];"; } catch(eC) {}
                break;

            case "Rectangle":
                var rect = grpContents.addProperty("ADBE Vector Shape - Rect");
                try { (rect.property("ADBE Vector Rect Size") || rect.property(2)).expression = "var s = effect(\"Head Size\")(\"Slider\"); [s, s];"; } catch(eR1) {}
                if (roundCorners) {
                    try { (rect.property("ADBE Vector Rect Roundness") || rect.property(3)).setValue(8); } catch(eR2) {}
                }
                break;

            case "Star":
                var star = grpContents.addProperty("ADBE Vector Shape - Star");
                // 1. Type: 2 = Star
                try { (star.property("ADBE Vector Star Type") || star.property(1)).setValue(2); } catch(eS1) {}
                // 2. Points: 5
                try { (star.property("ADBE Vector Star Points") || star.property(2)).setValue(5); } catch(eS2) {}
                // 3. Rotation: 90
                try { (star.property("ADBE Vector Star Rotation") || star.property(4)).setValue(90); } catch(eS3) {}
                // 4. Inner Radius: Property 5
                try { (star.property("ADBE Vector Star Inner Radius") || star.property(5)).expression = "effect(\"Head Size\")(\"Slider\") * 0.22;"; } catch(eS4) {}
                // 5. Outer Radius: Property 7
                try { (star.property("ADBE Vector Star Outer Radius") || star.property(7)).expression = "effect(\"Head Size\")(\"Slider\") * 0.5;"; } catch(eS5) {}
                if (roundCorners) {
                    try {
                        (star.property("ADBE Vector Star Inner Roundness") || star.property(6)).setValue(10);
                        (star.property("ADBE Vector Star Outer Roundness") || star.property(8)).setValue(10);
                    } catch(eS6) {}
                }
                break;

            case "Triangle":
            default:
                var poly = grpContents.addProperty("ADBE Vector Shape - Star");
                // 1. Type: 1 = Polygon
                try { (poly.property("ADBE Vector Star Type") || poly.property(1)).setValue(1); } catch(eP1) {}
                var numPts = 3;
                if (headTypeStr === "Pentagon") numPts = 5;
                else if (headTypeStr === "Hexagon") numPts = 6;
                else if (headTypeStr === "Heptagon") numPts = 7;
                else if (headTypeStr === "Octagon") numPts = 8;

                // 2. Points
                try { (poly.property("ADBE Vector Star Points") || poly.property(2)).setValue(numPts); } catch(eP2) {}
                // 3. Rotation
                try { (poly.property("ADBE Vector Star Rotation") || poly.property(4)).setValue(90); } catch(eP3) {}
                // 4. Outer Radius (Property 5 for Polygons)
                try { (poly.property("ADBE Vector Star Outer Radius") || poly.property(5)).expression = "effect(\"Head Size\")(\"Slider\") * 0.5;"; } catch(eP4) {}
                if (roundCorners) {
                    try { (poly.property("ADBE Vector Star Outer Roundness") || poly.property(6)).setValue(15); } catch(eP5) {}
                }
                break;
        }

        // Fill with Line Color
        var fill = grpContents.addProperty("ADBE Vector Graphic - Fill");
        try { (fill.property("ADBE Vector Fill Color") || fill.property(4)).setValue(lineInfo.color); } catch(eF) {}

        // Safe dynamic path tracker in expressions
        var posExprEnd =
            "var line = thisLayer.parent;\n" +
            "if (line != null) {\n" +
            "    try {\n" +
            "        var targetPath = null;\n" +
            "        for (var i = 1; i <= line.content.numProperties; i++) {\n" +
            "            var g = line.content(i);\n" +
            "            if (g.content && g.content.numProperties > 0) {\n" +
            "                for (var j = 1; j <= g.content.numProperties; j++) {\n" +
            "                    if (g.content(j).path) { targetPath = g.content(j).path; break; }\n" +
            "                }\n" +
            "            }\n" +
            "            if (targetPath != null) break;\n" +
            "        }\n" +
            "        if (targetPath == null) targetPath = line.content(1).content(1).path;\n" +
            "        var pct = 1.0;\n" +
            "        try {\n" +
            "            var trim = line.content(\"Trim Paths 1\");\n" +
            "            if (trim) { pct = trim.end / 100; }\n" +
            "        } catch(eT) {}\n" +
            "        var p = Math.max(0.0001, Math.min(0.9999, pct));\n" +
            "        targetPath.pointOnPath(p, time);\n" +
            "    } catch(e) { value; }\n" +
            "} else { value; }";

        var rotExprEnd =
            "var line = thisLayer.parent;\n" +
            "if (line != null) {\n" +
            "    try {\n" +
            "        var targetPath = null;\n" +
            "        for (var i = 1; i <= line.content.numProperties; i++) {\n" +
            "            var g = line.content(i);\n" +
            "            if (g.content && g.content.numProperties > 0) {\n" +
            "                for (var j = 1; j <= g.content.numProperties; j++) {\n" +
            "                    if (g.content(j).path) { targetPath = g.content(j).path; break; }\n" +
            "                }\n" +
            "            }\n" +
            "            if (targetPath != null) break;\n" +
            "        }\n" +
            "        if (targetPath == null) targetPath = line.content(1).content(1).path;\n" +
            "        var pct = 1.0;\n" +
            "        try {\n" +
            "            var trim = line.content(\"Trim Paths 1\");\n" +
            "            if (trim) { pct = trim.end / 100; }\n" +
            "        } catch(eT) {}\n" +
            "        var p = Math.max(0.0001, Math.min(0.9999, pct));\n" +
            "        var tan = targetPath.tangentOnPath(p, time);\n" +
            "        var angle = radiansToDegrees(Math.atan2(tan[1], tan[0]));\n" +
            "        var offset = 0;\n" +
            "        try { offset = effect(\"Offset Angle\")(\"Slider\"); } catch(eO) {}\n" +
            (reverseDir ? "        angle + 180 + offset;\n" : "        angle + offset;\n") +
            "    } catch(e) { value; }\n" +
            "} else { value; }";

        var posExprStart =
            "var line = thisLayer.parent;\n" +
            "if (line != null) {\n" +
            "    try {\n" +
            "        var targetPath = null;\n" +
            "        for (var i = 1; i <= line.content.numProperties; i++) {\n" +
            "            var g = line.content(i);\n" +
            "            if (g.content && g.content.numProperties > 0) {\n" +
            "                for (var j = 1; j <= g.content.numProperties; j++) {\n" +
            "                    if (g.content(j).path) { targetPath = g.content(j).path; break; }\n" +
            "                }\n" +
            "            }\n" +
            "            if (targetPath != null) break;\n" +
            "        }\n" +
            "        if (targetPath == null) targetPath = line.content(1).content(1).path;\n" +
            "        targetPath.pointOnPath(0.0001, time);\n" +
            "    } catch(e) { value; }\n" +
            "} else { value; }";

        var rotExprStart =
            "var line = thisLayer.parent;\n" +
            "if (line != null) {\n" +
            "    try {\n" +
            "        var targetPath = null;\n" +
            "        for (var i = 1; i <= line.content.numProperties; i++) {\n" +
            "            var g = line.content(i);\n" +
            "            if (g.content && g.content.numProperties > 0) {\n" +
            "                for (var j = 1; j <= g.content.numProperties; j++) {\n" +
            "                    if (g.content(j).path) { targetPath = g.content(j).path; break; }\n" +
            "                }\n" +
            "            }\n" +
            "            if (targetPath != null) break;\n" +
            "        }\n" +
            "        if (targetPath == null) targetPath = line.content(1).content(1).path;\n" +
            "        var tan = targetPath.tangentOnPath(0.0001, time);\n" +
            "        var angle = radiansToDegrees(Math.atan2(tan[1], tan[0]));\n" +
            "        var offset = 0;\n" +
            "        try { offset = effect(\"Offset Angle\")(\"Slider\"); } catch(eO) {}\n" +
            (reverseDir ? "        angle + offset;\n" : "        angle + 180 + offset;\n") +
            "    } catch(e) { value; }\n" +
            "} else { value; }";

        try {
            var trGroup = headLayer.property("ADBE Transform Group");
            if (!isStartHead) {
                trGroup.property("ADBE Position").expression = posExprEnd;
                trGroup.property("ADBE Rotation").expression = rotExprEnd;
            } else {
                trGroup.property("ADBE Position").expression = posExprStart;
                trGroup.property("ADBE Rotation").expression = rotExprStart;
            }

            // Opacity sync
            trGroup.property("ADBE Opacity").expression =
                "var line = thisLayer.parent;\n" +
                "if (line != null) {\n" +
                "    var op = line.transform.opacity;\n" +
                "    try {\n" +
                "        var trim = line.content(\"Trim Paths 1\");\n" +
                "        if (trim && trim.end <= 0) { 0; } else { op; }\n" +
                "    } catch(e) { op; }\n" +
                "} else { value; }";
        } catch(eTr) {}

        return headLayer;
    }

    function executeHeadToLine(headType, roundCorners, doubleSided, reverseDir, doAnimate, animFrames) {
        var comp = app.project.activeItem;
        if (!comp || !(comp instanceof CompItem)) {
            alert("Please open a composition first.");
            return;
        }

        var selectedLayers = comp.selectedLayers;
        if (selectedLayers.length === 0 || !(selectedLayers[0] instanceof ShapeLayer)) {
            alert("Please select a Shape Layer with a Path first.");
            return;
        }

        app.beginUndoGroup("LazyMotion: Head to Line");
        try {
            for (var i = 0; i < selectedLayers.length; i++) {
                var lineLayer = selectedLayers[i];
                if (!(lineLayer instanceof ShapeLayer)) continue;

                var rootVec = lineLayer.property("ADBE Root Vectors Group");
                if (!rootVec || rootVec.numProperties === 0) continue;

                // Animate with Trim Paths if requested
                if (doAnimate) {
                    var trim = rootVec.property("ADBE Vector Filter - Trim");
                    if (!trim) trim = rootVec.addProperty("ADBE Vector Filter - Trim");
                    if (trim) {
                        trim.name = "Trim Paths 1";

                        var fps = comp.frameRate;
                        var durSec = Math.max(1, animFrames) / fps;
                        var curT = comp.time;

                        var endProp = null;
                        try {
                            endProp = trim.property("ADBE Vector Trim End") ||
                                      trim.property("ADBE Vector Trim-0002") ||
                                      trim.property("End") ||
                                      (trim.numProperties >= 2 ? trim.property(2) : null);
                        } catch(eProp) {}

                        if (endProp) {
                            while (endProp.numKeys > 0) endProp.removeKey(1);

                            if (!reverseDir) {
                                endProp.setValueAtTime(curT, 0);
                                endProp.setValueAtTime(curT + durSec, 100);
                            } else {
                                endProp.setValueAtTime(curT, 100);
                                endProp.setValueAtTime(curT + durSec, 0);
                            }

                            if (endProp.numKeys >= 2) {
                                var easeIn = new KeyframeEase(0, 75);
                                var easeOut = new KeyframeEase(0, 75);
                                endProp.setTemporalEaseAtKey(1, [easeIn], [easeOut]);
                                endProp.setTemporalEaseAtKey(2, [easeIn], [easeOut]);
                            }
                        }
                    }
                }

                // Create Head Layer(s)
                createHeadShape(comp, lineLayer, headType, roundCorners, false, reverseDir);
                if (doubleSided) {
                    createHeadShape(comp, lineLayer, headType, roundCorners, true, reverseDir);
                }
            }
        } catch (err) {
            alert("Head to Line Error: " + err.toString());
        } finally {
            app.endUndoGroup();
        }
    }

    // ============================================================
    // 7. 9-Point Anchor Point Aligner
    // ============================================================
    /** A layer-space offset as it appears in the parent's space: scaled, then rotated. */
    function layerToParentDelta(dx, dy, scale, rotationDeg) {
        var sx = dx * (scale[0] / 100);
        var sy = dy * (scale[1] / 100);
        var rad = rotationDeg * Math.PI / 180;
        return [sx * Math.cos(rad) - sy * Math.sin(rad), sx * Math.sin(rad) + sy * Math.cos(rad)];
    }

    /**
     * Why a 2D layer's anchor or position cannot be moved without it jumping,
     * or "" when it can. Position keyframes are fine (they all move by the same
     * amount); animated anchor, scale or rotation change that amount over time.
     */
    function transformBlocker(layer) {
        if (isCameraOrLight(layer)) return "camera or light";
        if (layer.threeDLayer) return "3D layer";
        var t = layer.property("ADBE Transform Group");
        if (t.property("ADBE Anchor Point").numKeys > 0) return "animated anchor point";
        if (t.property("ADBE Scale").numKeys > 0) return "animated scale";
        if (t.property("ADBE Rotate Z").numKeys > 0) return "animated rotation";
        return "";
    }

    /** Move Position by (dx, dy): every keyframe, split X/Y dimensions included. */
    function offsetPosition(layer, dx, dy) {
        var t = layer.property("ADBE Transform Group");
        var pos = t.property("ADBE Position");
        if (pos.dimensionsSeparated) {
            var parts = [[t.property("ADBE Position_0"), dx], [t.property("ADBE Position_1"), dy]];
            for (var p = 0; p < parts.length; p++) {
                var prop = parts[p][0];
                if (prop.numKeys > 0) {
                    for (var k = 1; k <= prop.numKeys; k++) prop.setValueAtKey(k, prop.keyValue(k) + parts[p][1]);
                } else {
                    prop.setValue(prop.value + parts[p][1]);
                }
            }
        } else {
            shiftPointProperty(pos, -dx, -dy);
        }
    }

    function reportSkipped(action, skipped) {
        if (skipped.length) alert(action + " skipped:\n" + skipped.join("\n"));
    }

    function alignAnchorPoint(xRatio, yRatio) {
        var comp = app.project.activeItem;
        if (!comp || !(comp instanceof CompItem)) return;
        var layers = comp.selectedLayers;
        if (layers.length === 0) return;
        reportSkipped("Anchor point", alignAnchors(comp, layers, xRatio, yRatio));
    }

    /** Engine: anchor to a point of each layer's content without moving it. Returns what it skipped. */
    function alignAnchors(comp, layers, xRatio, yRatio) {
        var skipped = [];
        app.beginUndoGroup("LazyMotion: Align Anchor Point");
        try {
            for (var i = 0; i < layers.length; i++) {
                var layer = layers[i];
                try {
                    var blocker = transformBlocker(layer);
                    if (blocker) {
                        skipped.push(layer.name + " (" + blocker + ")");
                        continue;
                    }
                    var t = layer.property("ADBE Transform Group");
                    var anchorProp = t.property("ADBE Anchor Point");
                    var r = layer.sourceRectAtTime(comp.time, false);
                    var curAnchor = anchorProp.value;
                    var newAnchor = [r.left + r.width * xRatio, r.top + r.height * yRatio, curAnchor[2] || 0];

                    var d = layerToParentDelta(newAnchor[0] - curAnchor[0], newAnchor[1] - curAnchor[1],
                        t.property("ADBE Scale").value, t.property("ADBE Rotate Z").value);
                    anchorProp.setValue(newAnchor);
                    offsetPosition(layer, d[0], d[1]);
                } catch (eLayer) {
                    skipped.push(layer.name + " (" + eLayer.toString() + ")");
                }
            }
        } finally {
            app.endUndoGroup();
        }
        return skipped;
    }

    /**
     * Put the centre of each layer's visible content (not just its anchor
     * point) at the centre of the comp. Needs comp space, so parented layers
     * are left alone.
     */
    function centerInComp() {
        var comp = app.project.activeItem;
        if (!comp || !(comp instanceof CompItem)) return;
        var layers = comp.selectedLayers;
        if (layers.length === 0) return;
        reportSkipped("Center in Comp", centerLayers(comp, layers));
    }

    /** Engine: centre each layer's content in `comp`. Returns what it skipped. */
    function centerLayers(comp, layers) {
        var skipped = [];
        app.beginUndoGroup("LazyMotion: Center In Comp");
        try {
            for (var i = 0; i < layers.length; i++) {
                var layer = layers[i];
                try {
                    var blocker = transformBlocker(layer);
                    if (!blocker && layer.parent) blocker = "parented — its position is not in comp space";
                    if (blocker) {
                        skipped.push(layer.name + " (" + blocker + ")");
                        continue;
                    }
                    var t = layer.property("ADBE Transform Group");
                    var r = layer.sourceRectAtTime(comp.time, false);
                    var anchor = t.property("ADBE Anchor Point").value;
                    var pos = t.property("ADBE Position").valueAtTime(comp.time, false);
                    var d = layerToParentDelta(r.left + r.width / 2 - anchor[0], r.top + r.height / 2 - anchor[1],
                        t.property("ADBE Scale").value, t.property("ADBE Rotate Z").value);
                    offsetPosition(layer, comp.width / 2 - (pos[0] + d[0]), comp.height / 2 - (pos[1] + d[1]));
                } catch (eLayer) {
                    skipped.push(layer.name + " (" + eLayer.toString() + ")");
                }
            }
        } finally {
            app.endUndoGroup();
        }
        return skipped;
    }

    // ============================================================
    // 8. Grid Designer Dialog
    // ============================================================
    var GRID_MAX_CELLS = 400;

    /**
     * Cell size for a grid, or { error } when the numbers cannot make one:
     * margins and gutters wider than the comp would give zero-size tiles, and
     * thousands of cells would mean thousands of layers.
     */
    function computeGrid(compW, compH, cols, rows, gutX, gutY, marX, marY) {
        cols = Math.max(1, cols || 1);
        rows = Math.max(1, rows || 1);
        gutX = Math.max(0, gutX || 0);
        gutY = Math.max(0, gutY || 0);
        marX = Math.max(0, marX || 0);
        marY = Math.max(0, marY || 0);
        if (cols * rows > GRID_MAX_CELLS) {
            return { error: cols + " x " + rows + " makes " + (cols * rows) + " layers. Keep it to " + GRID_MAX_CELLS + " cells or fewer." };
        }
        var availW = compW - marX * 2 - (cols - 1) * gutX;
        var availH = compH - marY * 2 - (rows - 1) * gutY;
        if (availW < cols || availH < rows) {
            return { error: "The margins and gutters leave no room for the tiles in a " + compW + " x " + compH + " comp. Make them smaller." };
        }
        return {
            cols: cols, rows: rows, gutX: gutX, gutY: gutY, marX: marX, marY: marY,
            cellW: availW / cols, cellH: availH / rows
        };
    }

    function showGridMakerDialog() {
        var comp = app.project.activeItem;
        if (!comp || !(comp instanceof CompItem)) {
            alert("Please open a composition first to create a grid.");
            return;
        }

        var dlg = new Window("dialog", "LazyMotion — Grid Designer", undefined, { resizeable: false });
        dlg.orientation = "column";
        dlg.alignChildren = ["fill", "top"];
        dlg.spacing = 10;
        dlg.margins = 15;

        var presetPnl = dlg.add("panel", undefined, "⚡ Quick Presets");
        presetPnl.orientation = "row";
        presetPnl.spacing = 6;
        var btnP2x2 = presetPnl.add("button", undefined, "2 x 2");
        var btnP3x3 = presetPnl.add("button", undefined, "3 x 3 (Thirds)");
        var btnP3x1 = presetPnl.add("button", undefined, "3 Columns");
        var btnP12c = presetPnl.add("button", undefined, "12 Columns");

        var setPnl = dlg.add("panel", undefined, "Grid Configuration");
        setPnl.orientation = "column";
        setPnl.alignChildren = ["fill", "top"];
        setPnl.spacing = 8;
        setPnl.margins = 12;

        var rowColGrp = setPnl.add("group");
        rowColGrp.orientation = "row";
        rowColGrp.add("statictext", undefined, "Columns:");
        var editCols = rowColGrp.add("edittext", undefined, "3");
        editCols.characters = 4;
        rowColGrp.add("statictext", undefined, "Rows:");
        var editRows = rowColGrp.add("edittext", undefined, "3");
        editRows.characters = 4;

        var gutGrp = setPnl.add("group");
        gutGrp.orientation = "row";
        gutGrp.add("statictext", undefined, "Gutter X (px):");
        var editGutX = gutGrp.add("edittext", undefined, "20");
        editGutX.characters = 4;
        gutGrp.add("statictext", undefined, "Gutter Y (px):");
        var editGutY = gutGrp.add("edittext", undefined, "20");
        editGutY.characters = 4;

        var marGrp = setPnl.add("group");
        marGrp.orientation = "row";
        marGrp.add("statictext", undefined, "Margin X (px):");
        var editMarX = marGrp.add("edittext", undefined, "40");
        editMarX.characters = 4;
        marGrp.add("statictext", undefined, "Margin Y (px):");
        var editMarY = marGrp.add("edittext", undefined, "40");
        editMarY.characters = 4;

        var outGrp = setPnl.add("group");
        outGrp.orientation = "row";
        outGrp.add("statictext", undefined, "Output:");
        var outDropdown = outGrp.add("dropdownlist", undefined, ["Shape Tiles (Fill)", "Outline Strokes", "Guide Nulls"]);
        outDropdown.selection = 0;

        btnP2x2.onClick = function () { editCols.text = "2"; editRows.text = "2"; editGutX.text = "20"; editGutY.text = "20"; editMarX.text = "40"; editMarY.text = "40"; };
        btnP3x3.onClick = function () { editCols.text = "3"; editRows.text = "3"; editGutX.text = "20"; editGutY.text = "20"; editMarX.text = "40"; editMarY.text = "40"; };
        btnP3x1.onClick = function () { editCols.text = "3"; editRows.text = "1"; editGutX.text = "20"; editGutY.text = "0"; editMarX.text = "40"; editMarY.text = "40"; };
        btnP12c.onClick = function () { editCols.text = "12"; editRows.text = "1"; editGutX.text = "15"; editGutY.text = "0"; editMarX.text = "60"; editMarY.text = "0"; };

        var btnGrp = dlg.add("group");
        btnGrp.orientation = "row";
        btnGrp.alignment = ["right", "center"];
        btnGrp.spacing = 8;
        var btnCancel = btnGrp.add("button", undefined, "Cancel");
        var btnCreate = btnGrp.add("button", undefined, "Generate Grid", { name: "ok" });

        btnCancel.onClick = function () { dlg.close(); };

        btnCreate.onClick = function () {
            var outType = outDropdown.selection.index;
            var grid = computeGrid(comp.width, comp.height,
                parseInt(editCols.text, 10), parseInt(editRows.text, 10),
                parseInt(editGutX.text, 10), parseInt(editGutY.text, 10),
                parseInt(editMarX.text, 10), parseInt(editMarY.text, 10));
            if (grid.error) {
                alert(grid.error); // the dialog stays open to fix the numbers
                return;
            }
            var cols = grid.cols;
            var rows = grid.rows;
            var gutX = grid.gutX;
            var gutY = grid.gutY;
            var marX = grid.marX;
            var marY = grid.marY;
            var cellW = grid.cellW;
            var cellH = grid.cellH;

            app.beginUndoGroup("LazyMotion: Generate Grid (" + cols + "x" + rows + ")");
            try {
                for (var r = 0; r < rows; r++) {
                    for (var c = 0; c < cols; c++) {
                        var posX = marX + c * (cellW + gutX) + cellW / 2;
                        var posY = marY + r * (cellH + gutY) + cellH / 2;
                        var tileName = "Grid_" + (r + 1) + "x" + (c + 1);

                        if (outType === 2) {
                            var nullLayer = comp.layers.addNull();
                            nullLayer.name = tileName + "_Null";
                            nullLayer.property("Position").setValue([posX, posY, 0]);
                            nullLayer.guideLayer = true;
                        } else {
                            var shape = comp.layers.addShape();
                            shape.name = tileName;
                            shape.property("Position").setValue([posX, posY, 0]);

                            var rootVec = shape.property("ADBE Root Vectors Group");
                            var grp = rootVec.addProperty("ADBE Vector Group");
                            grp.name = "Tile";
                            var grpContents = grp.property("ADBE Vectors Group");

                            var rect = grpContents.addProperty("ADBE Vector Shape - Rect");
                            rect.property("ADBE Vector Rect Size").setValue([cellW, cellH]);
                            rect.property("ADBE Vector Rect Position").setValue([0, 0]);
                            rect.property("ADBE Vector Rect Roundness").setValue(8);

                            if (outType === 0) {
                                var fill = grpContents.addProperty("ADBE Vector Graphic - Fill");
                                fill.property("ADBE Vector Fill Color").setValue([0.25, 0.25, 0.28, 1]);
                            } else {
                                var stroke = grpContents.addProperty("ADBE Vector Graphic - Stroke");
                                stroke.property("ADBE Vector Stroke Color").setValue([0.0, 0.6, 1.0, 1]);
                                stroke.property("ADBE Vector Stroke Width").setValue(2);
                            }
                        }
                    }
                }
            } catch (eG) {
                alert("Grid Generation Error: " + eG.toString());
            } finally {
                app.endUndoGroup();
            }

            dlg.close();
        };

        dlg.center();
        dlg.show();
    }

    // ============================================================
    // 9. LazyStrike FX: lightning, flash and sky flash generator
    //    (formerly the separate QuickStrike FX script)
    // ============================================================

    // Effect parameters by match name: display names such as "Core Color" are
    // translated in other After Effects languages, match names never are.
    var LIGHTNING = {
        effect: "ADBE Lightning 2",
        type: "ADBE Lightning 2-0001",
        origin: "ADBE Lightning 2-0002",
        direction: "ADBE Lightning 2-0003",
        conductivity: "ADBE Lightning 2-0004",
        coreColor: "ADBE Lightning 2-0008",
        glowColor: "ADBE Lightning 2-0013",
        forking: "ADBE Lightning 2-0017",
        decay: "ADBE Lightning 2-0018"
    };
    // "Convert Audio to Keyframes" is looked up by its English menu name; a
    // translated After Effects falls back to its command ID (2026).
    var CONVERT_AUDIO_COMMAND_ID = 4218;
    var MAX_STRIKES = 500;

    var strikeColors = { bolt: [0.75, 0.88, 1.0], flash: [1.0, 1.0, 1.0] };
    var strikeWindow = null;

    /** When each strike starts, in seconds. `random` returns 0..1 (Math.random, or a test's own). */
    function strikeTimes(comp, o, random) {
        var frameLen = 1 / comp.frameRate;
        var strikeDur = o.duration * frameLen;
        var gapDur = o.gap * frameLen;
        var cursor = o.atTime ? comp.time : comp.workAreaStart;
        var end = o.fillWA ? comp.workAreaStart + comp.workAreaDuration : Infinity;
        var count = o.fillWA ? MAX_STRIKES : Math.min(MAX_STRIKES, Math.max(0, o.strikes));
        var times = [];
        // A millisecond of slack: 2 + 5 * 0.88 comes out as 6.3999999…, which
        // would otherwise start one extra strike exactly at the end of the work area.
        while (times.length < count && cursor < end - 0.001) {
            times.push(Math.max(0, cursor + (random() - 0.5) * o.random * gapDur));
            cursor += strikeDur + gapDur;
        }
        return times;
    }

    /** Peaks of an amplitude curve above `threshold`, at least `minGap` seconds apart. */
    function audioPeaks(times, values, threshold, minGap) {
        var peaks = [];
        var last = -Infinity;
        for (var i = 1; i < values.length - 1; i++) {
            var v = values[i];
            if (v < threshold || v <= values[i - 1] || v < values[i + 1]) continue;
            if (times[i] - last < minGap) continue;
            peaks.push({ time: times[i], value: v });
            last = times[i];
        }
        return peaks;
    }

    /** Keyframes collected first and set in one call; a later key at the same time replaces an earlier one. */
    function keyList() { return { times: [], values: [], at: {} }; }
    function addKey(list, time, value) {
        var t = Math.max(0, time);
        var id = "t" + Math.round(t * 100000);
        if (list.at.hasOwnProperty(id)) {
            list.values[list.at[id]] = value;
            return;
        }
        list.at[id] = list.times.length;
        list.times.push(t);
        list.values.push(value);
    }
    function applyKeys(prop, list) {
        if (list.times.length) prop.setValuesAtTimes(list.times, list.values);
    }

    function rgba(rgb) { return [rgb[0], rgb[1], rgb[2], 1]; }

    function newFlashSolid(comp, rgb, name, inPoint, outPoint) {
        var layer = comp.layers.addSolid(rgb, name, comp.width, comp.height, comp.pixelAspect, comp.duration);
        layer.blendingMode = BlendingMode.ADD;
        layer.inPoint = inPoint;
        layer.outPoint = outPoint;
        return layer;
    }

    function precomposeCreated(comp, created, name, inPoint, outPoint) {
        var indexes = [];
        for (var k = 0; k < created.length; k++) indexes.push(created[k].index);
        indexes.sort(function (a, b) { return a - b; });
        var pc = comp.layers.precompose(indexes, name, true);
        var outer = findLayerBySource(comp, pc);
        if (outer) {
            outer.inPoint = inPoint;
            outer.outPoint = outPoint;
            return [outer];
        }
        return [];
    }

    /**
     * Build lightning in `comp` from the dialog's options `o`.
     * Returns { layers, strikes } or { error } (nothing is created then).
     */
    function generateLightning(comp, o, random) {
        random = random || Math.random;
        if (o.makeAudio) return generateAudioFlash(comp, o);

        var times = strikeTimes(comp, o, random);
        if (!times.length) {
            return { error: "No strikes fit between the playhead and the end of the work area.\nMove the playhead back, or turn off Start at CTI." };
        }
        var frameLen = 1 / comp.frameRate;
        var strikeDur = o.duration * frameLen;
        var first = Infinity;
        var last = 0;
        for (var i = 0; i < times.length; i++) {
            first = Math.min(first, times[i]);
            last = Math.max(last, times[i]);
        }
        if (first >= comp.duration) return { error: "The strikes would start after the end of the composition." };
        var inPoint = Math.max(0, first - frameLen);
        var outPoint = Math.min(comp.duration, last + strikeDur * (1 + o.random) + 0.1);

        var created = [];
        app.beginUndoGroup("LazyStrike FX: Generate Lightning");
        try {
            if (o.makeFlash) {
                var flash = newFlashSolid(comp, o.flashColor, "LazyStrike Flash", inPoint, outPoint);
                var fk = keyList();
                addKey(fk, inPoint, 0);
                for (var f = 0; f < times.length; f++) {
                    var st = times[f];
                    var dur = strikeDur * (1 - o.random * 0.25 * random());
                    var peak = o.flashInt * 100 * (0.75 + random() * 0.25);
                    addKey(fk, st, 0);
                    addKey(fk, st + dur * 0.12, peak);
                    addKey(fk, st + dur * 0.35, peak * 0.45);
                    addKey(fk, st + dur * 0.55, peak * 0.85);
                    addKey(fk, st + dur, 0);
                }
                applyKeys(opacityOf(flash), fk);
                created.push(flash);
            }

            if (o.makeBolt) {
                var bolt = newFlashSolid(comp, [0, 0, 0], "LazyStrike Bolt", inPoint, outPoint);
                var fx = bolt.property("ADBE Effect Parade").addProperty(LIGHTNING.effect);
                fx.property(LIGHTNING.type).setValue(1);
                fx.property(LIGHTNING.origin).setValue([comp.width / 2, 0]);
                fx.property(LIGHTNING.direction).setValue([comp.width / 2, comp.height * 0.85]);
                fx.property(LIGHTNING.coreColor).setValue(rgba(o.boltColor));
                fx.property(LIGHTNING.glowColor).setValue(rgba(o.boltColor));
                // Percentages are stored as fractions: 0.4 is 40%.
                fx.property(LIGHTNING.forking).setValue((40 + o.random * 40) / 100);
                fx.property(LIGHTNING.decay).setValue(0.15);

                var ck = keyList();
                var dk = keyList();
                var bk = keyList();
                addKey(ck, inPoint, 0);
                addKey(bk, inPoint, 0);
                for (var b = 0; b < times.length; b++) {
                    var bt = times[b];
                    var bPeak = o.boltInt * 100;
                    addKey(ck, bt, random() * 10);
                    addKey(ck, bt + strikeDur * 0.33, random() * 10);
                    addKey(ck, bt + strikeDur * 0.66, random() * 10);
                    addKey(ck, bt + strikeDur, random() * 10);
                    addKey(dk, bt, [comp.width / 2 + (random() - 0.5) * comp.width * o.random * 0.5, comp.height * 0.85]);
                    addKey(bk, bt - frameLen * 0.5, 0);
                    addKey(bk, bt, bPeak);
                    addKey(bk, bt + strikeDur * 0.35, bPeak * 0.55);
                    addKey(bk, bt + strikeDur * 0.65, bPeak * 0.9);
                    addKey(bk, bt + strikeDur, 0);
                }
                applyKeys(fx.property(LIGHTNING.conductivity), ck);
                applyKeys(fx.property(LIGHTNING.direction), dk);
                applyKeys(opacityOf(bolt), bk);
                created.push(bolt);
            }

            if (o.makeSky) {
                var sky = newFlashSolid(comp, o.flashColor, "LazyStrike Sky Flash", inPoint, outPoint);
                var sk = keyList();
                addKey(sk, inPoint, 0);
                for (var s = 0; s < times.length; s++) {
                    var total = strikeDur * (1 + random() * o.random);
                    var flicks = Math.max(1, o.flickers);
                    if (o.random > 0.3) flicks = Math.max(1, flicks + Math.round((random() - 0.5) * 2));
                    var flickWin = total / flicks;
                    for (var n = 0; n < flicks; n++) {
                        var fs = times[s] + n * flickWin + (random() - 0.5) * flickWin * 0.3 * o.random;
                        var fPeak = o.flashInt * 100 * Math.pow(0.7, n) * (0.7 + random() * 0.3);
                        var fDur = flickWin * (0.4 + random() * 0.3);
                        addKey(sk, fs, 0);
                        addKey(sk, fs + fDur * 0.15, fPeak);
                        addKey(sk, fs + fDur * 0.5, fPeak * 0.3);
                        addKey(sk, fs + fDur, 0);
                    }
                }
                applyKeys(opacityOf(sky), sk);
                created.push(sky);
            }

            if (o.preComp && created.length) {
                created = precomposeCreated(comp, created, "LazyStrike Pre-comp", inPoint, outPoint);
            }
        } finally {
            app.endUndoGroup();
        }
        return { layers: created, strikes: times.length };
    }

    /**
     * Set the work area. After Effects adjusts start and duration against each
     * other: from [0, 0.04 s], "start = 0.2" leaves start at 0 and stretches the
     * duration (seen in After Effects 2026). Spanning the whole comp first makes
     * both assignments land exactly.
     */
    function setWorkArea(comp, start, duration) {
        comp.workAreaStart = 0;
        comp.workAreaDuration = comp.duration;
        comp.workAreaStart = start;
        comp.workAreaDuration = duration;
    }

    function findAudioLayer(comp) {
        var sel = comp.selectedLayers;
        for (var s = 0; s < sel.length; s++) if (sel[s].hasAudio && !sel[s].hasVideo) return sel[s];
        for (var s2 = 0; s2 < sel.length; s2++) if (sel[s2].hasAudio) return sel[s2];
        for (var i = 1; i <= comp.numLayers; i++) {
            var layer = comp.layer(i);
            if (layer.hasAudio && !layer.hasVideo) return layer;
        }
        return null;
    }

    /**
     * The "Both Channels" loudness of `audioLayer` over time, as { times, values },
     * via Convert Audio to Keyframes. The temporary Audio Amplitude layer is
     * removed again; the work area and the selection are put back. null when
     * After Effects did not make the amplitude layer.
     */
    function audioAmplitude(comp, audioLayer) {
        var commandId = app.findMenuCommandId("Convert Audio to Keyframes");
        if (!commandId) commandId = CONVERT_AUDIO_COMMAND_ID;
        var savedStart = comp.workAreaStart;
        var savedDuration = comp.workAreaDuration;
        var savedSelection = comp.selectedLayers;
        var before = comp.numLayers;
        var amp = null;
        try {
            var aStart = Math.max(0, Math.min(comp.duration - comp.frameDuration, audioLayer.inPoint));
            var aEnd = Math.max(aStart + comp.frameDuration, Math.min(comp.duration, audioLayer.outPoint));
            setWorkArea(comp, aStart, aEnd - aStart);
            for (var i = 1; i <= comp.numLayers; i++) comp.layer(i).selected = false;
            audioLayer.selected = true;
            app.executeCommand(commandId);
            if (comp.numLayers > before) amp = comp.layer(1);
        } catch (eCmd) {
            amp = null;
        }

        var result = null;
        if (amp) {
            var effects = amp.property("ADBE Effect Parade");
            // Left, Right, Both Channels: the third slider, whatever its translated name.
            if (effects && effects.numProperties >= 3 && effects.property(3).matchName === "ADBE Slider Control") {
                var slider = effects.property(3).property(1);
                result = { times: [], values: [] };
                for (var k = 1; k <= slider.numKeys; k++) {
                    result.times.push(slider.keyTime(k));
                    result.values.push(slider.keyValue(k));
                }
                amp.remove(); // the flash gets keyframes of its own
            }
        }

        try {
            setWorkArea(comp, savedStart, savedDuration);
        } catch (eWA) {}
        try {
            for (var d = 1; d <= comp.numLayers; d++) comp.layer(d).selected = false;
            for (var r = 0; r < savedSelection.length; r++) savedSelection[r].selected = true;
        } catch (eSel) {}
        return result;
    }

    function generateAudioFlash(comp, o) {
        var audioLayer = findAudioLayer(comp);
        if (!audioLayer) return { error: "No audio layer found. Select one, or add audio to the composition." };

        var created = [];
        var peaks = [];
        app.beginUndoGroup("LazyStrike FX: Audio-Driven Flash");
        try {
            var amp = audioAmplitude(comp, audioLayer);
            if (!amp) return { error: "After Effects could not run Convert Audio to Keyframes on '" + audioLayer.name + "'." };
            if (amp.values.length < 3) return { error: "The audio is too short to find peaks in." };

            var frameLen = comp.frameDuration;
            peaks = audioPeaks(amp.times, amp.values, o.threshold, o.minGapFr * frameLen);
            if (!peaks.length) return { error: "No peaks above Threshold " + o.threshold + ". Lower the Threshold and try again." };

            var flash = newFlashSolid(comp, o.flashColor, "LazyStrike Audio Flash", 0, comp.duration);
            var maxOp = o.flashInt * 100;
            var hold = Math.max(1, o.decayFr || 0) * frameLen;
            var keys = keyList();
            addKey(keys, 0, 0);
            for (var p = 0; p < peaks.length; p++) {
                var op = Math.min(maxOp, Math.max(0, (peaks[p].value - o.threshold) * o.gain));
                if (op <= 0) continue;
                var at = peaks[p].time;
                var post = at + hold;
                if (p < peaks.length - 1) {
                    var nextPre = peaks[p + 1].time - frameLen * 0.5;
                    if (nextPre < post) post = Math.max(at + frameLen * 0.5, nextPre);
                }
                addKey(keys, at - frameLen * 0.5, 0);
                addKey(keys, at, op);
                addKey(keys, post, 0);
            }
            applyKeys(opacityOf(flash), keys);
            created.push(flash);
            if (o.preComp) created = precomposeCreated(comp, created, "LazyStrike Audio Pre-comp", 0, comp.duration);
        } finally {
            app.endUndoGroup();
        }
        return { layers: created, strikes: peaks.length };
    }

    function strikeInput(parent, label, defaultVal, tip) {
        var g = parent.add("group");
        g.orientation = "row";
        g.alignChildren = ["left", "center"];
        g.alignment = ["fill", "top"];
        var lbl = g.add("statictext", undefined, label);
        lbl.preferredSize.width = 110;
        var ed = g.add("edittext", undefined, defaultVal);
        ed.characters = 4;
        ed.alignment = ["right", "center"];
        if (tip) ed.helpTip = tip;
        return ed;
    }

    function strikeSlider(parent, label, defaultVal, minVal, maxVal, tip) {
        var g = parent.add("group");
        g.orientation = "row";
        g.alignChildren = ["left", "center"];
        g.alignment = ["fill", "top"];
        var lbl = g.add("statictext", undefined, label);
        lbl.preferredSize.width = 75;
        var sl = g.add("slider", undefined, defaultVal, minVal, maxVal);
        sl.alignment = ["fill", "center"];
        var val = g.add("statictext", undefined, String(defaultVal));
        val.characters = 3;
        sl.onChanging = function () { val.text = Math.round(sl.value); };
        if (tip) sl.helpTip = tip;
        return sl;
    }

    function paintColorButton(btn, rgb) {
        btn.onDraw = function () {
            var g = btn.graphics;
            g.newPath();
            g.rectPath(0, 0, btn.size[0], btn.size[1]);
            g.fillPath(g.newBrush(g.BrushType.SOLID_COLOR, [rgb[0], rgb[1], rgb[2], 1]));
        };
        btn.notify("onDraw");
    }

    function decToRgb(dec) {
        return [((dec >> 16) & 0xFF) / 255, ((dec >> 8) & 0xFF) / 255, (dec & 0xFF) / 255];
    }

    function rgbToDec(rgb) {
        return (Math.round(rgb[0] * 255) << 16) | (Math.round(rgb[1] * 255) << 8) | Math.round(rgb[2] * 255);
    }

    function showLazyStrikeDialog() {
        if (strikeWindow) {
            try {
                strikeWindow.show();
                return;
            } catch (eShow) {
                strikeWindow = null;
            }
        }

        var win = new Window("palette", "LazyStrike FX", undefined, { resizeable: true });
        win.orientation = "row";
        win.alignChildren = ["fill", "top"];
        win.spacing = 10;
        win.margins = 10;

        var col1 = win.add("group");
        col1.orientation = "column";
        col1.alignChildren = ["fill", "top"];
        col1.spacing = 5;
        var col2 = win.add("group");
        col2.orientation = "column";
        col2.alignChildren = ["fill", "top"];
        col2.spacing = 5;

        var pStyle = col1.add("panel", undefined, "Style");
        pStyle.alignChildren = ["fill", "center"];
        pStyle.margins = 10;
        var ddStyle = pStyle.add("dropdownlist", undefined, ["Direct Bolt + Flash", "Sky Flash", "Both Combined", "Audio-Driven"]);
        ddStyle.selection = 1;

        var pColor = col1.add("panel", undefined, "Colors");
        pColor.alignChildren = ["fill", "top"];
        pColor.margins = 10;
        var rowB = pColor.add("group");
        rowB.add("statictext", undefined, "Bolt Color:");
        var btnBoltColor = rowB.add("button", undefined, "");
        btnBoltColor.preferredSize = [60, 20];
        var rowF = pColor.add("group");
        rowF.add("statictext", undefined, "Flash Color:");
        var btnFlashColor = rowF.add("button", undefined, "");
        btnFlashColor.preferredSize = [60, 20];

        var pTime = col1.add("panel", undefined, "Timing");
        pTime.alignChildren = ["fill", "top"];
        pTime.margins = 10;
        pTime.spacing = 5;
        var inDur = strikeInput(pTime, "Strike Dur. (fr):", "10", "Length of one strike in frames");
        var inStrikes = strikeInput(pTime, "Manual strikes:", "3", "How many strikes when Fill Work Area is off");
        var inGap = strikeInput(pTime, "Gap (frames):", "12", "Frames between strikes");
        var inFlicks = strikeInput(pTime, "Flickers/Sky:", "3", "Sky Flash: flickers per strike");

        var pInt = col2.add("panel", undefined, "Intensity & Randomness");
        pInt.alignChildren = ["fill", "top"];
        pInt.margins = 10;
        pInt.spacing = 5;
        var sBolt = strikeSlider(pInt, "Bolt Int:", 75, 0, 100);
        var sFlash = strikeSlider(pInt, "Flash Int:", 80, 0, 100);
        var sRand = strikeSlider(pInt, "Random:", 50, 0, 100);

        var pAudio = col2.add("panel", undefined, "Audio Sync");
        pAudio.alignChildren = ["fill", "top"];
        pAudio.margins = 10;
        pAudio.spacing = 5;
        var sThresh = strikeSlider(pAudio, "Threshold:", 10, 0, 100, "Audio-Driven: loudness a peak must pass");
        var sGain = strikeSlider(pAudio, "Gain:", 12, 1, 25, "Audio-Driven: how bright a peak gets");
        var sDecay = strikeSlider(pAudio, "Decay (fr):", 0, 0, 30, "Audio-Driven: frames each flash holds");
        var sMinGap = strikeSlider(pAudio, "Min Gap:", 5, 0, 30, "Audio-Driven: frames between flashes");

        var pOpt = col2.add("panel", undefined, "Options");
        pOpt.alignChildren = ["left", "top"];
        pOpt.margins = 10;
        pOpt.spacing = 5;
        var chkFillWA = pOpt.add("checkbox", undefined, "Fill Work Area");
        chkFillWA.value = true;
        var chkAtTime = pOpt.add("checkbox", undefined, "Start at CTI");
        var chkPreComp = pOpt.add("checkbox", undefined, "Pre-compose");

        var btnGo = col2.add("button", undefined, "⚡ Generate Lightning");
        btnGo.preferredSize.height = 35;

        paintColorButton(btnBoltColor, strikeColors.bolt);
        paintColorButton(btnFlashColor, strikeColors.flash);
        btnBoltColor.onClick = function () {
            var c = $.colorPicker(rgbToDec(strikeColors.bolt));
            if (c !== -1) {
                strikeColors.bolt = decToRgb(c);
                paintColorButton(btnBoltColor, strikeColors.bolt);
            }
        };
        btnFlashColor.onClick = function () {
            var c = $.colorPicker(rgbToDec(strikeColors.flash));
            if (c !== -1) {
                strikeColors.flash = decToRgb(c);
                paintColorButton(btnFlashColor, strikeColors.flash);
            }
        };

        btnGo.onClick = function () {
            var comp = app.project.activeItem;
            if (!(comp && comp instanceof CompItem)) {
                alert("Please select or open a composition first.");
                return;
            }
            var styleIdx = ddStyle.selection.index;
            var result = generateLightning(comp, {
                duration: Math.max(1, parseInt(inDur.text, 10) || 10),
                strikes: Math.max(1, parseInt(inStrikes.text, 10) || 3),
                gap: Math.max(0, parseInt(inGap.text, 10) || 12),
                flickers: Math.max(1, parseInt(inFlicks.text, 10) || 3),
                boltColor: strikeColors.bolt,
                flashColor: strikeColors.flash,
                boltInt: sBolt.value / 100,
                flashInt: sFlash.value / 100,
                random: sRand.value / 100,
                threshold: sThresh.value,
                gain: sGain.value,
                decayFr: Math.round(sDecay.value),
                minGapFr: Math.round(sMinGap.value),
                makeBolt: styleIdx === 0 || styleIdx === 2,
                makeFlash: styleIdx === 0 || styleIdx === 2,
                makeSky: styleIdx === 1 || styleIdx === 2,
                makeAudio: styleIdx === 3,
                fillWA: chkFillWA.value,
                atTime: chkAtTime.value,
                preComp: chkPreComp.value
            });
            if (result.error) alert(result.error);
        };

        win.onClose = function () { strikeWindow = null; };
        win.onResizing = win.onResize = function () { this.layout.resize(); };
        win.center();
        win.show();
        strikeWindow = win;
    }

    // ============================================================
    // 10. LazyPreview Render: render the work area to an H.264 file
    //     in the background and play it back as a solo'd layer
    //     (formerly the separate QuickPreviewRender script)
    // ============================================================
    var PREVIEW_PREFIX = "[PREVIEW]";
    var PREVIEW_FOLDER = "AE_Previews";
    var PREVIEW_BIN = "Lazy Preview Files";
    var PREVIEW_BIN_OLD = "Quick Preview Files"; // made by QuickPreviewRender; reused if present
    var PREVIEW_LABEL = 1; // red
    var previewStatusText = null;

    function setPreviewStatus(msg) {
        try { if (previewStatusText) previewStatusText.text = msg; } catch (e) {}
    }

    function isWindowsOS() { return $.os.indexOf("Windows") !== -1; }

    /** Full path to Windows PowerShell: After Effects' own PATH may not reach it. */
    function powershellPath() {
        try {
            var p = $.getenv("SystemRoot") + "\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
            if (new File(p).exists) return p;
        } catch (e) {}
        return "powershell.exe";
    }

    function getAerenderPath() {
        var bin = isWindowsOS() ? "aerender.exe" : "aerender";
        var sep = isWindowsOS() ? "\\" : "/";
        var candidates = [];
        try {
            if (app.path) candidates.push((app.path instanceof Folder ? app.path.fsName : String(app.path)) + sep + bin);
        } catch (e1) {}
        try {
            if (Folder.startup && Folder.startup.fsName) candidates.push(Folder.startup.fsName + sep + bin);
        } catch (e2) {}
        for (var i = 0; i < candidates.length; i++) {
            try {
                if (new File(candidates[i]).exists) return candidates[i];
            } catch (e3) {}
        }
        return null;
    }

    /** The H.264 output module template to render with (template names can be translated; "H.264" is not). */
    function findH264Template(names) {
        var fallback = null;
        for (var i = 0; i < names.length; i++) {
            if (String(names[i]).indexOf("H.264") !== 0) continue;
            if (String(names[i]).indexOf("15 Mbps") !== -1) return names[i];
            if (!fallback) fallback = names[i];
        }
        return fallback;
    }

    function outputTemplatesFor(comp) {
        var item = app.project.renderQueue.items.add(comp);
        try {
            return item.outputModule(1).templates;
        } finally {
            item.remove();
        }
    }

    function pad2(n) { return n < 10 ? "0" + n : "" + n; }

    /** A name no other preview has. It is also how Cancel finds this render's aerender. */
    function previewStamp(date, rand) {
        return "preview_" + date.getFullYear() + pad2(date.getMonth() + 1) + pad2(date.getDate()) + "_" +
            pad2(date.getHours()) + pad2(date.getMinutes()) + pad2(date.getSeconds()) + "_" +
            (1000 + Math.floor(rand * 9000));
    }

    function findPreviewLayer(comp) {
        for (var i = 1; i <= comp.numLayers; i++) {
            if (comp.layer(i).name.indexOf(PREVIEW_PREFIX) === 0) return comp.layer(i);
        }
        return null;
    }

    /** Only files LazyPreview made itself: preview_*.mp4 inside an AE_Previews folder. */
    function isPreviewFile(file) {
        try {
            return !!file && !!file.parent && decodeURI(file.parent.name) === PREVIEW_FOLDER &&
                /^preview_.*\.mp4$/i.test(decodeURI(file.name));
        } catch (e) {
            return false;
        }
    }

    function previewBin() {
        var root = app.project.rootFolder;
        var old = null;
        for (var i = 1; i <= root.numItems; i++) {
            var it = root.item(i);
            if (!(it instanceof FolderItem)) continue;
            if (it.name === PREVIEW_BIN) return it;
            if (it.name === PREVIEW_BIN_OLD) old = it;
        }
        return old || app.project.items.addFolder(PREVIEW_BIN);
    }

    var PENDING_DELETES_KEY = "PreviewFilesToDelete";

    function pendingPreviewDeletes() {
        try {
            if (app.settings.haveSetting(_settingsSection, PENDING_DELETES_KEY)) {
                var saved = app.settings.getSetting(_settingsSection, PENDING_DELETES_KEY);
                return saved ? saved.split("\n") : [];
            }
        } catch (e) {}
        return [];
    }

    /**
     * Delete rendered preview files, including earlier ones still waiting.
     * After Effects keeps an imported file open even after its footage item is
     * removed (until its image cache is purged, which would also throw away the
     * user's RAM previews), so a file it still holds is remembered and deleted
     * on a later try: the next render, or the next time the panel opens.
     * Returns how many are still waiting.
     */
    function deletePreviewFiles(newPath) {
        var paths = pendingPreviewDeletes();
        if (newPath) paths.push(newPath);
        var waiting = [];
        for (var i = 0; i < paths.length; i++) {
            if (!paths[i]) continue;
            var f = new File(paths[i]);
            if (!f.exists || !isPreviewFile(f)) continue;
            if (!f.remove()) waiting.push(paths[i]);
        }
        try { app.settings.saveSetting(_settingsSection, PENDING_DELETES_KEY, waiting.join("\n")); } catch (eSave) {}
        return waiting.length;
    }

    /** Remove a comp's preview layer, its footage if nothing else uses it, and the file LazyPreview rendered. */
    function removePreviewLayer(comp) {
        var layer = findPreviewLayer(comp);
        if (!layer) return false;
        var source = layer.source;
        layer.remove();
        try {
            if (source && source instanceof FootageItem && source.usedIn.length === 0) {
                var file = source.file;
                source.remove();
                if (isPreviewFile(file)) deletePreviewFiles(file.fsName);
            }
        } catch (e) {}
        return true;
    }

    /** Solo/enable the preview layer on or off. Returns the new state, or null when there is none. */
    function togglePreviewLayer(comp) {
        var layer = findPreviewLayer(comp);
        if (!layer) return null;
        var on = !layer.solo;
        // After Effects refuses solo on a hidden layer: show before solo, unsolo before hiding.
        if (on) {
            layer.enabled = true;
            layer.solo = true;
        } else {
            layer.solo = false;
            layer.enabled = false;
        }
        return on;
    }

    function placePreview(comp, file, waStart, waDuration) {
        var footage = app.project.importFile(new ImportOptions(file));
        try { footage.parentFolder = previewBin(); } catch (eBin) {}
        var layer = comp.layers.add(footage);
        layer.startTime = waStart;
        layer.inPoint = waStart;
        layer.outPoint = waStart + waDuration;
        layer.name = PREVIEW_PREFIX + " preview";
        layer.enabled = true;
        layer.solo = true;
        try { layer.label = PREVIEW_LABEL; } catch (eLabel) {}
        try { layer.moveToBeginning(); } catch (eMove) {}
        return layer;
    }

    // PowerShell also treats typographic single quotes as quotes; doubling escapes each.
    function psQuote(s) { return "'" + String(s).replace(/['‘’‚‛]/g, "$&$&") + "'"; }
    function shQuote(s) { return "'" + String(s).replace(/'/g, "'\\''") + "'"; }

    var BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

    /**
     * Base64 of a string's UTF-16LE bytes, which is what powershell
     * -EncodedCommand takes. ExtendScript hands system.callSystem its command
     * line in the Windows ANSI code page, so a Bengali or Japanese folder name
     * would arrive as "????"; an encoded command is plain ASCII.
     */
    function utf16leBase64(str) {
        var bytes = [];
        for (var i = 0; i < str.length; i++) {
            var c = str.charCodeAt(i);
            bytes.push(c & 255, (c >> 8) & 255);
        }
        var out = [];
        for (var j = 0; j < bytes.length; j += 3) {
            var b0 = bytes[j];
            var b1 = j + 1 < bytes.length ? bytes[j + 1] : -1;
            var b2 = j + 2 < bytes.length ? bytes[j + 2] : -1;
            out.push(BASE64.charAt(b0 >> 2));
            out.push(BASE64.charAt(((b0 & 3) << 4) | (b1 < 0 ? 0 : b1 >> 4)));
            out.push(b1 < 0 ? "=" : BASE64.charAt(((b1 & 15) << 2) | (b2 < 0 ? 0 : b2 >> 6)));
            out.push(b2 < 0 ? "=" : BASE64.charAt(b2 & 63));
        }
        return out.join("");
    }

    /**
     * How aerender is run in the background. A script runs the render and then
     * writes aerender's exit code to `marker`, so the panel knows when it has
     * really finished; a cancel command stops only this render (found by the
     * unique token in its output name). Returns { error } when the comp name
     * can't be passed.
     *
     * Windows uses PowerShell, not a .bat file: cmd.exe misreads a batch file
     * with non-ASCII paths after `chcp 65001` (seen in After Effects 2026).
     */
    function buildRenderJob(job) {
        if (/["\r\n]/.test(job.compName)) {
            return { error: "The composition name contains a double quote or a line break, which aerender can't be given.\nRename the composition and try again." };
        }

        if (job.windows) {
            // aerender reads its command line in the ANSI code page: any other
            // letter in a comp name arrives as "?" and matches no composition.
            if (/[^\x20-\x7E]/.test(job.compName)) {
                return { error: "aerender on Windows only accepts English letters, digits and symbols in the composition name.\nRename \"" + job.compName + "\" (for example to \"Main_Preview\") and render again." };
            }
            var ps1 = job.dir + "\\" + job.token + ".ps1";
            var powershell = "\"" + (job.powershell || "powershell.exe") + "\"";
            var runBody = [
                "$exe = " + psQuote(job.aerender),
                "$log = " + psQuote(job.log),
                "$marker = " + psQuote(job.marker),
                // The same goes for paths, so pass their short 8.3 forms, which are ASCII.
                "$project = " + psQuote(job.project),
                "$output = " + psQuote(job.output),
                "try {",
                "  $fso = New-Object -ComObject Scripting.FileSystemObject",
                "  $project = $fso.GetFile($project).ShortPath",
                "  $output = Join-Path $fso.GetFolder(" + psQuote(job.dir) + ").ShortPath " + psQuote(job.token + ".mp4"),
                "} catch {}",
                "if (($project + $output) -match '[^\\x00-\\x7F]') {",
                "  'aerender cannot open a path with non-English letters, and this drive has no short (8.3) names to use instead. Move the project to a folder whose path uses only English letters, or render it from the Render Queue.' | Out-File -LiteralPath $log -Encoding utf8",
                "  Set-Content -LiteralPath $marker -Value 'PATH' -Encoding ascii",
                "  exit",
                "}",
                "$renderArgs = @('-project', $project, '-comp', " + psQuote(job.compName) + ", '-output', $output, '-OMtemplate', " +
                    psQuote(job.template) + ", '-s', '" + job.startFrame + "', '-e', '" + job.endFrame + "')",
                "& $exe @renderArgs 2>&1 | Out-File -LiteralPath $log -Encoding utf8",
                "Set-Content -LiteralPath $marker -Value $LASTEXITCODE -Encoding ascii"
            ].join("\n") + "\n";
            // Start-Process in Windows PowerShell joins -ArgumentList unquoted, hence the inner quotes.
            var launcher = "Start-Process -FilePath " + psQuote(job.powershell || "powershell.exe") +
                " -WindowStyle Hidden -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', " +
                psQuote("\"" + ps1 + "\"") + ")";
            var canceller = "Get-CimInstance Win32_Process -Filter \"Name='aerender.exe'\" | " +
                "Where-Object { $_.CommandLine -like '*" + job.token + "*' } | " +
                "ForEach-Object { taskkill /PID $_.ProcessId /T /F | Out-Null }";
            // Started from After Effects, PowerShell only runs when cmd.exe starts
            // it (called directly it exits at once), and `cmd /c start` can take
            // a UI-less After Effects down. So cmd runs PowerShell, which hands the
            // render to a hidden process of its own and returns.
            var viaCmd = function (psArgs) { return "cmd /c \"" + powershell + " " + psArgs + "\""; };
            return {
                runFile: ps1,
                runBody: runBody,
                bom: true, // Windows PowerShell reads a .ps1 without a BOM as ANSI
                lineFeed: "Windows",
                launch: viaCmd("-NoProfile -NonInteractive -WindowStyle Hidden -EncodedCommand " + utf16leBase64(launcher)),
                runAndWait: viaCmd("-NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand " + utf16leBase64("& " + psQuote(ps1))),
                cancel: viaCmd("-NoProfile -NonInteractive -WindowStyle Hidden -EncodedCommand " + utf16leBase64(canceller))
            };
        }

        var renderArgs = ["-project", job.project, "-comp", job.compName, "-output", job.output,
            "-OMtemplate", job.template, "-s", String(job.startFrame), "-e", String(job.endFrame)];
        var sh = job.dir + "/" + job.token + ".sh";
        var shArgs = [shQuote(job.aerender)];
        for (var k = 0; k < renderArgs.length; k++) shArgs.push(shQuote(renderArgs[k]));
        return {
            runFile: sh,
            runBody: "#!/bin/sh\n" + shArgs.join(" ") + " > " + shQuote(job.log) + " 2>&1\necho $? > " + shQuote(job.marker) + "\n",
            bom: false,
            lineFeed: "Unix",
            launch: "nohup /bin/sh " + shQuote(sh) + " >/dev/null 2>&1 &",
            runAndWait: "/bin/sh " + shQuote(sh),
            cancel: "pkill -f " + shQuote(job.token)
        };
    }

    /** A string's UTF-8 bytes, one character per byte, for writing in BINARY mode. */
    function utf8Bytes(str) {
        var out = [];
        for (var i = 0; i < str.length; i++) {
            var c = str.charCodeAt(i);
            if (c >= 0xD800 && c <= 0xDBFF && i + 1 < str.length) {
                var low = str.charCodeAt(i + 1);
                if (low >= 0xDC00 && low <= 0xDFFF) {
                    c = 0x10000 + ((c - 0xD800) << 10) + (low - 0xDC00);
                    i++;
                }
            }
            if (c < 0x80) {
                out.push(String.fromCharCode(c));
            } else if (c < 0x800) {
                out.push(String.fromCharCode(0xC0 | (c >> 6), 0x80 | (c & 63)));
            } else if (c < 0x10000) {
                out.push(String.fromCharCode(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63)));
            } else {
                out.push(String.fromCharCode(0xF0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63)));
            }
        }
        return out.join("");
    }

    /**
     * Write text as UTF-8 with the given line endings, optionally with a BOM.
     * The bytes are built here and written in BINARY mode: in UTF-8 mode After
     * Effects drops a BOM, even one written separately, and Windows PowerShell
     * then reads the script as ANSI and mangles non-ASCII paths in it.
     */
    function writeTextFile(path, body, bom, lineFeed) {
        var text = String(body).replace(/\r\n/g, "\n");
        if (lineFeed === "Windows") text = text.replace(/\n/g, "\r\n");
        var f = new File(path);
        f.encoding = "BINARY";
        f.lineFeed = "Unix"; // no translation: the line endings are already in `text`
        if (!f.open("w")) throw new Error("Could not write " + path);
        f.write((bom ? "ï»¿" : "") + utf8Bytes(text));
        f.close();
        return f;
    }

    function removeQuietly(path) {
        try {
            var f = new File(path);
            if (f.exists) f.remove();
        } catch (e) {}
    }

    function readTail(path, chars) {
        try {
            var f = new File(path);
            if (!f.exists) return "";
            f.encoding = "UTF-8";
            f.open("r");
            var text = f.read();
            f.close();
            return text.length > chars ? text.substring(text.length - chars) : text;
        } catch (e) {
            return "";
        }
    }

    /** Called every second by app.scheduleTask while a render runs. */
    function previewCheck() {
        var s = $.global.LazyPreviewRender;
        if (!s || !s.busy) return;
        var elapsed = Math.round((new Date().getTime() - s.startedAt) / 1000);
        var marker = new File(s.marker);
        if (!marker.exists) {
            var gaveUp = s.cancelled && new Date().getTime() - s.cancelledAt > 15000;
            if (!gaveUp) {
                try { s.label.text = (s.cancelled ? "Cancelling… " : "Rendering… ") + elapsed + " s"; } catch (eLabel) {}
                setPreviewStatus((s.cancelled ? "Cancelling… " : "Rendering in background… ") + elapsed + " s");
                return;
            }
        }
        var code = "";
        if (marker.exists) {
            marker.open("r");
            code = marker.read().replace(/\s+/g, "");
            marker.close();
        }
        previewFinish(code);
    }

    function previewFinish(code) {
        var s = $.global.LazyPreviewRender;
        s.busy = false;
        if (s.taskId !== null) { try { app.cancelTask(s.taskId); } catch (eTask) {} }
        try { s.dialog.close(); } catch (eDlg) {}
        removeQuietly(s.marker);
        removeQuietly(s.runFile);

        var output = new File(s.output);
        if (s.cancelled) {
            removeQuietly(s.output);
            removeQuietly(s.log);
            setPreviewStatus("Cancelled.");
            return;
        }
        if (code === "PATH") {
            setPreviewStatus("Render not possible from this folder.");
            alert(readTail(s.log, 800));
            return;
        }
        if (code !== "0" || !output.exists) {
            setPreviewStatus("Render failed.");
            alert("aerender did not finish the preview (exit code " + (code || "unknown") + ").\n\nEnd of the log:\n" + readTail(s.log, 800));
            return;
        }

        var comp = null;
        for (var i = 1; i <= app.project.numItems; i++) {
            var it = app.project.item(i);
            if (it instanceof CompItem && it.id === s.compId) comp = it;
        }
        if (!comp) {
            setPreviewStatus("Comp not found.");
            alert("The composition was not found any more.\nThe preview is saved at:\n" + output.fsName);
            return;
        }
        app.beginUndoGroup("LazyPreview Render: Add Preview");
        try {
            placePreview(comp, output, s.waStart, s.waDuration);
        } finally {
            app.endUndoGroup();
        }
        removeQuietly(s.log);
        setPreviewStatus("✓ Preview ready. Toggle to compare with the comp.");
    }

    function previewCancel() {
        var s = $.global.LazyPreviewRender;
        if (!s || !s.busy || s.cancelled) return;
        s.cancelled = true;
        s.cancelledAt = new Date().getTime();
        try { system.callSystem(s.cancel); } catch (e) {}
        setPreviewStatus("Cancelling…");
    }

    function countCompsNamed(name) {
        var n = 0;
        for (var i = 1; i <= app.project.numItems; i++) {
            var it = app.project.item(i);
            if (it instanceof CompItem && it.name === name) n++;
        }
        return n;
    }

    /** Start rendering `comp`'s work area. Returns "" or why it could not start. */
    function startPreviewRender(comp) {
        deletePreviewFiles(null);
        if (!(comp && comp instanceof CompItem)) return "Please select or open a composition first.";
        if (comp.workAreaDuration <= 0) return "The work area is empty.\nSet it first (B = in, N = out).";
        if (!app.project.file) return "Save your project first: aerender renders the saved .aep file.";
        var running = $.global.LazyPreviewRender;
        if (running && running.busy) return "A preview render is already running.";
        var aerender = getAerenderPath();
        if (!aerender) return "aerender was not found next to After Effects.";
        if (countCompsNamed(comp.name) > 1) {
            return "Another composition is also named \"" + comp.name + "\".\naerender picks compositions by name, so rename one of them first.";
        }
        var template = findH264Template(outputTemplatesFor(comp));
        if (!template) return "No H.264 output module template was found (After Effects 2023 or newer is needed).";

        app.beginUndoGroup("LazyPreview Render: Prepare");
        try {
            removePreviewLayer(comp);
        } finally {
            app.endUndoGroup();
        }
        try {
            app.project.save();
        } catch (eSave) {
            return "Could not save the project: " + eSave.toString();
        }

        var folder = new Folder(app.project.file.parent.fsName + "/" + PREVIEW_FOLDER);
        if (!folder.exists) folder.create();
        var token = previewStamp(new Date(), Math.random());
        var windows = isWindowsOS();
        var sep = windows ? "\\" : "/";
        var fps = comp.frameRate;
        var startFrame = Math.round(comp.workAreaStart * fps);
        var job = buildRenderJob({
            windows: windows,
            powershell: windows ? powershellPath() : null,
            dir: folder.fsName,
            token: token,
            aerender: aerender,
            project: app.project.file.fsName,
            compName: comp.name,
            output: folder.fsName + sep + token + ".mp4",
            log: folder.fsName + sep + token + "-log.txt",
            marker: folder.fsName + sep + token + ".done",
            template: template,
            startFrame: startFrame,
            endFrame: startFrame + Math.round(comp.workAreaDuration * fps) - 1
        });
        if (job.error) return job.error;
        writeTextFile(job.runFile, job.runBody, job.bom, job.lineFeed);

        var dlg = new Window("palette", "LazyPreview Render", undefined);
        dlg.orientation = "column";
        dlg.alignChildren = ["fill", "center"];
        dlg.margins = 18;
        dlg.add("statictext", undefined, "Rendering the work area in the background…").alignment = "center";
        dlg.add("statictext", undefined, "Comp: " + comp.name).alignment = "center";
        var label = dlg.add("statictext", undefined, "Starting…");
        label.preferredSize.width = 320;
        label.alignment = "center";
        var cancelBtn = dlg.add("button", undefined, "Cancel");
        cancelBtn.onClick = previewCancel;

        $.global.LazyPreviewRender = {
            busy: true,
            cancelled: false,
            cancelledAt: 0,
            startedAt: new Date().getTime(),
            compId: comp.id,
            waStart: comp.workAreaStart,
            waDuration: comp.workAreaDuration,
            output: folder.fsName + sep + token + ".mp4",
            log: folder.fsName + sep + token + "-log.txt",
            marker: folder.fsName + sep + token + ".done",
            runFile: job.runFile,
            cancel: job.cancel,
            dialog: dlg,
            label: label,
            taskId: null,
            check: previewCheck
        };

        try {
            system.callSystem(job.launch);
        } catch (eLaunch) {
            $.global.LazyPreviewRender.busy = false;
            return "Could not start aerender: " + eLaunch.toString();
        }
        dlg.show();
        $.global.LazyPreviewRender.taskId = app.scheduleTask("$.global.LazyPreviewRender.check();", 1000, true);
        setPreviewStatus("Rendering in background…");
        return "";
    }

    // ============================================================
    // 11. Main ScriptUI Window / Panel Builder (Modern Figma Theme)
    // ============================================================
    function buildToolkitUI(thisObj) {
        var win = (thisObj instanceof Panel)
            ? thisObj
            : new Window("palette", _scriptName, undefined, { resizeable: true });

        win.orientation = "column";
        win.alignChildren = ["fill", "top"];
        // Keep the reference layout airy, but never force a fixed width: docked
        // ScriptUI panels are allowed to be narrower than the floating palette.
        // A fixed minimum width makes AE crop the right side instead of flowing.
        win.spacing = 10;
        win.margins = [12, 12, 12, 12];

        // ---- Theme Colors (matches src/index.css) ----
        var C = {
            bgBase:        [0.055, 0.059, 0.067, 1],
            bgPanel:       [0.078, 0.082, 0.094, 1],
            bgButton:      [0.133, 0.141, 0.157, 1],
            bgButtonHover: [0.165, 0.173, 0.196, 1],
            borderSubtle:  [0.165, 0.173, 0.196, 1],
            borderMedium:  [0.180, 0.188, 0.224, 1],
            textPrimary:   [0.910, 0.914, 0.937, 1],
            textSecondary: [0.569, 0.588, 0.639, 1],
            textMuted:     [0.450, 0.460, 0.500, 1],
            accent:        [0.345, 0.396, 0.949, 1],
            accentHover:   [0.278, 0.322, 0.769, 1],
            accentRed:     [0.929, 0.259, 0.271, 1],
            activeTint:    [0.145, 0.161, 0.308, 1],
            activeBorder:  [0.211, 0.239, 0.521, 1],
            activeText:    [0.545, 0.584, 0.973, 1],
            white:         [1.000, 1.000, 1.000, 1]
        };

        try {
            win.graphics.backgroundColor = win.graphics.newBrush(win.graphics.BrushType.SOLID_COLOR, C.bgPanel);
        } catch(e) {}

        // ---- Two-column geometry (must match the Motion Tools rows) ----
        var PANEL_MARGIN = 12;   // win.margins
        var COL_SPACING  = 4;    // gap between the two columns
        var MIN_COL_W    = 150;  // narrowest a column's content can live in
        var SW_W = 30, SW_GAP = 3; // one swatch block + its gap

        var columnPairs = [];
        var lastColW = MIN_COL_W;

        function registerColumnPair(left, right) { columnPairs.push([left, right]); }

        /** min = preferred = max, so ScriptUI cannot give one side more than the other. */
        function lockWidth(ctrl, w) {
            ctrl.minimumSize.width   = w;
            ctrl.preferredSize.width = w;
            ctrl.maximumSize.width   = w;
        }

        /** Both columns of every registered pair get exactly half the panel. */
        function syncColumns() {
            var total = 0;
            if (win.size && win.size[0] > 0) total = win.size[0];
            else if (win.preferredSize && win.preferredSize[0] > 0) total = win.preferredSize[0];
            if (total <= 0) total = MIN_COL_W * 2 + PANEL_MARGIN * 2 + COL_SPACING;

            var colW = Math.floor((total - PANEL_MARGIN * 2 - COL_SPACING) / 2);
            if (colW < MIN_COL_W) colW = MIN_COL_W;
            lastColW = colW;

            for (var i = 0; i < columnPairs.length; i++) {
                lockWidth(columnPairs[i][0], colW);
                lockWidth(columnPairs[i][1], colW);
            }
            return colW;
        }

        // ---- UI Drawing Helpers ----

        function fillRoundRect(g, brush, x, y, w, h, r) {
            if (r <= 0) {
                g.newPath(); g.rectPath(x, y, w, h); g.fillPath(brush); return;
            }
            g.newPath(); g.ellipsePath(x, y, r*2, r*2); g.fillPath(brush);
            g.newPath(); g.ellipsePath(x+w-r*2, y, r*2, r*2); g.fillPath(brush);
            g.newPath(); g.ellipsePath(x, y+h-r*2, r*2, r*2); g.fillPath(brush);
            g.newPath(); g.ellipsePath(x+w-r*2, y+h-r*2, r*2, r*2); g.fillPath(brush);
            g.newPath(); g.rectPath(x+r, y, w-r*2, h); g.fillPath(brush);
            g.newPath(); g.rectPath(x, y+r, w, h-r*2); g.fillPath(brush);
        }

        /** Applies Figma-styled custom vector rendering to a button. */
        function styleBtn(btn, text, variant, customH) {
            btn.text = text;
            var h = customH || 28;
            btn.preferredSize.height = h;

            btn.onDraw = function () {
                var g = this.graphics;
                var w = this.size[0], ht = this.size[1];

                var bg, brd, txt, isBold;
                var r = (variant === "primary") ? 4 : (variant === "pill" ? 2 : 3);
                if (variant === "primary") {
                    bg = C.accent; brd = [0.42, 0.47, 1.0, 1]; txt = C.white; isBold = true;
                } else if (variant === "danger") {
                    bg = [0.14, 0.10, 0.11, 1]; brd = [0.23, 0.12, 0.13, 1]; txt = C.accentRed; isBold = false;
                } else if (variant === "active") {
                    bg = C.activeTint; brd = C.activeBorder; txt = C.activeText; isBold = true;
                } else if (variant === "pill") {
                    bg = [0.102, 0.106, 0.122, 1]; brd = C.borderSubtle; txt = C.textMuted; isBold = false;
                } else {
                    bg = C.bgButton; brd = C.borderMedium; txt = [0.69, 0.71, 0.76, 1]; isBold = false;
                }

                // Clear background
                var clearBrush = g.newBrush(g.BrushType.SOLID_COLOR, C.bgPanel);
                g.rectPath(0, 0, w, ht); g.fillPath(clearBrush);

                var brdBrush = g.newBrush(g.BrushType.SOLID_COLOR, brd);
                var bgBrush = g.newBrush(g.BrushType.SOLID_COLOR, bg);

                fillRoundRect(g, brdBrush, 0, 0, w, ht, r);
                fillRoundRect(g, bgBrush, 1, 1, w - 2, ht - 2, Math.max(0, r - 1));

                if (variant === "active" && text === "●") {
                    var dotBrush = g.newBrush(g.BrushType.SOLID_COLOR, txt);
                    g.newPath(); g.ellipsePath(w/2 - 3.5, ht/2 - 3.5, 7, 7); g.fillPath(dotBrush);
                } else {
                    var font = ScriptUI.newFont("sans", isBold ? "BOLD" : "REGULAR", variant === "pill" ? 10 : 10);
                    var textPen = g.newPen(g.PenType.SOLID_COLOR, txt, 1);
                    var sz = g.measureString(text, font);
                    var tw = (sz && sz.width) ? sz.width : (sz ? sz[0] : 0);
                    var th = (sz && sz.height) ? sz.height : (sz ? sz[1] : 11);
                    var tx = Math.max(1, (w - tw) / 2);
                    var ty = Math.max(1, (ht - th) / 2);
                    g.drawString(text, textPen, tx, ty, font);
                }
            };

            return btn;
        }

        /** Creates a Figma-styled checkbox using an iconbutton and statictext */
        function createCheckbox(parent, text, defaultVal, isCircle) {
            var grp = parent.add("group");
            grp.orientation = "row";
            grp.alignChildren = ["left", "center"];
            grp.spacing = 4;
            
            var btn = grp.add("iconbutton", undefined, undefined);
            btn.preferredSize = [14, 14];
            btn.value = defaultVal;
            // Removed btn.text to prevent native overlapping draw. Test scripts will find the statictext instead.
            
            btn.onDraw = function() {
                var g = this.graphics;
                var w = this.size[0], h = this.size[1];
                var clear = g.newBrush(g.BrushType.SOLID_COLOR, C.bgPanel);
                g.rectPath(0, 0, w, h); g.fillPath(clear);
                
                var boxBg = this.value ? C.accent : [0.086, 0.090, 0.106, 1];
                var boxBrd = this.value ? C.accent : C.borderMedium;
                var bgBrush = g.newBrush(g.BrushType.SOLID_COLOR, boxBg);
                var brdBrush = g.newBrush(g.BrushType.SOLID_COLOR, boxBrd);
                
                if (isCircle) {
                    g.newPath(); g.ellipsePath(0, 0, w, h); g.fillPath(brdBrush);
                    g.newPath(); g.ellipsePath(1, 1, w-2, h-2); g.fillPath(bgBrush);
                } else {
                    fillRoundRect(g, brdBrush, 0, 0, w, h, 2);
                    fillRoundRect(g, bgBrush, 1, 1, w-2, h-2, 1);
                }
                
                if (this.value) {
                    var pen = g.newPen(g.PenType.SOLID_COLOR, C.white, 1.5);
                    g.newPath(); g.moveTo(3, 7); g.lineTo(6, 10); g.lineTo(11, 4); g.strokePath(pen);
                }
            };
            btn.onClick = function() { this.value = !this.value; this.notify("onDraw"); };
            
            var lbl = grp.add("statictext", undefined, text);
            lbl.graphics.font = ScriptUI.newFont("sans", "REGULAR", 10);
            try { lbl.graphics.foregroundColor = grp.graphics.newPen(grp.graphics.PenType.SOLID_COLOR, C.textSecondary, 1); } catch (e) {}
            lbl.addEventListener("mousedown", function() { btn.notify("onClick"); });
            
            return btn;
        }

        /** Draws an uppercase section title with an etched horizontal line divider. */
        function addSectionHeader(parent, title) {
            var hdr = parent.add("group");
            hdr.orientation = "row";
            hdr.alignChildren = ["left", "center"];
            hdr.spacing = 6;
            hdr.margins = [0, 4, 0, 1];

            var lbl = hdr.add("statictext", undefined, title.toUpperCase());
            lbl.graphics.font = ScriptUI.newFont("sans", "BOLD", 9);
            try { lbl.graphics.foregroundColor = parent.graphics.newPen(parent.graphics.PenType.SOLID_COLOR, C.textMuted, 1); } catch (e) {}

            var div = hdr.add("panel");
            div.alignment = ["fill", "center"];
            div.maximumSize.height = 1;

            return hdr;
        }

        /** Draws shared dual headers with divider lines for 2-column sections. */
        function addSharedHeader(rowGrp, title1, title2) {
            var hdrRow = rowGrp.add("group");
            hdrRow.orientation = "row";
            hdrRow.alignChildren = ["fill", "center"];
            hdrRow.spacing = COL_SPACING;
            hdrRow.margins = [0, 4, 0, 2];

            function half(title) {
                var g = hdrRow.add("group");
                g.orientation = "row";
                g.alignChildren = ["left", "center"];
                g.alignment = ["fill", "center"];
                g.spacing = 6;
                g.margins = 0;

                var lbl = g.add("statictext", undefined, title.toUpperCase());
                lbl.graphics.font = ScriptUI.newFont("sans", "BOLD", 9);
                try { lbl.graphics.foregroundColor = rowGrp.graphics.newPen(rowGrp.graphics.PenType.SOLID_COLOR, C.textMuted, 1); } catch (e) {}

                var div = g.add("panel");
                div.alignment = ["fill", "center"];
                div.maximumSize.height = 1;
                return g;
            }

            hdrRow.leftHdr  = half(title1);
            hdrRow.rightHdr = half(title2);
            registerColumnPair(hdrRow.leftHdr, hdrRow.rightHdr);
            return hdrRow;
        }

        // ============================================================
        // ---- Top Header Bar ----
        // ============================================================
        /** Opens a URL in the browser: a ScriptUI statictext cannot be a real link. */
        function openURL(url) {
            try {
                system.callSystem(isWindowsOS() ? 'cmd /c start "" "' + url + '"' : 'open "' + url + '"');
                return;
            } catch (e) {}
            try { new File(url).execute(); } catch (e2) {}
        }

        var topBar = win.add("group");
        topBar.orientation = "row";
        // "left", never "fill": "fill" stretches every label (even the dot) and
        // spreads the whole bar out instead of keeping the two clusters at the edges.
        topBar.alignChildren = ["left", "center"];
        topBar.spacing = 0;
        topBar.margins = [0, 0, 0, 4];

        // -- Left cluster: dot + title, tight together --
        var brandGrp = topBar.add("group");
        brandGrp.orientation = "row";
        brandGrp.alignChildren = ["left", "center"];
        brandGrp.spacing = 4;
        brandGrp.margins = 0;

        var dot = brandGrp.add("statictext", undefined, "●");
        dot.graphics.font = ScriptUI.newFont("sans", "BOLD", 10);
        dot.preferredSize.width = 10;
        try { dot.graphics.foregroundColor = topBar.graphics.newPen(topBar.graphics.PenType.SOLID_COLOR, C.accent, 1); } catch (eD) {}

        var titleTxt = brandGrp.add("statictext", undefined, _scriptName);
        titleTxt.graphics.font = ScriptUI.newFont("sans", "BOLD", 11);
        try { titleTxt.graphics.foregroundColor = topBar.graphics.newPen(topBar.graphics.PenType.SOLID_COLOR, [0.83, 0.85, 0.91, 1], 1); } catch (e) {}

        // -- Flexible gap: everything after it sits on the right edge --
        var topSpacer = topBar.add("group");
        topSpacer.alignment = ["fill", "center"];
        topSpacer.minimumSize.width = 8;

        // -- Right cluster: credit, version, menu dots --
        var metaGrp = topBar.add("group");
        metaGrp.orientation = "row";
        metaGrp.alignChildren = ["right", "center"];
        metaGrp.spacing = 5;
        metaGrp.margins = 0;

        var madeTxt = metaGrp.add("statictext", undefined, "Made by");
        madeTxt.graphics.font = ScriptUI.newFont("sans", "REGULAR", 9);
        try { madeTxt.graphics.foregroundColor = topBar.graphics.newPen(topBar.graphics.PenType.SOLID_COLOR, C.textMuted, 1); } catch (e) {}

        var authorLink = metaGrp.add("statictext", undefined, _scriptAuthor);
        authorLink.graphics.font = ScriptUI.newFont("sans", "BOLD", 9);
        authorLink.helpTip = _authorWebsite;
        try { authorLink.graphics.foregroundColor = topBar.graphics.newPen(topBar.graphics.PenType.SOLID_COLOR, C.activeText, 1); } catch (eA) {}
        authorLink.addEventListener("mousedown", function () { openURL(_authorWebsite); });

        var verPill = metaGrp.add("statictext", undefined, "v" + _buildVersion.replace(/\.0$/, ""));
        verPill.graphics.font = ScriptUI.newFont("sans", "BOLD", 9);
        try { verPill.graphics.foregroundColor = topBar.graphics.newPen(topBar.graphics.PenType.SOLID_COLOR, C.textMuted, 1); } catch (eV) {}

        var dots = metaGrp.add("statictext", undefined, "••");
        dots.graphics.font = ScriptUI.newFont("sans", "BOLD", 9);
        dots.helpTip = _authorWebsite;
        try { dots.graphics.foregroundColor = topBar.graphics.newPen(topBar.graphics.PenType.SOLID_COLOR, C.borderMedium, 1); } catch (eM) {}
        dots.addEventListener("mousedown", function () { openURL(_authorWebsite); });

        // ============================================================
        // ---- 1. Motion Tools Section ----
        // ============================================================
        addSectionHeader(win, "Motion Tools");

        var toolsGrid = win.add("group");
        toolsGrid.orientation = "column";
        toolsGrid.alignChildren = ["fill", "center"];
        toolsGrid.spacing = 3;

        var tRow1 = toolsGrid.add("group");
        tRow1.orientation = "row";
        tRow1.alignChildren = ["fill", "center"];
        tRow1.spacing = COL_SPACING;
        var btnPrecompIndiv = tRow1.add("iconbutton", undefined, undefined);
        styleBtn(btnPrecompIndiv, "⊞ Precomp (1:1)", "default", 30);
        btnPrecompIndiv.preferredSize.width = 10;
        btnPrecompIndiv.alignment = ["fill", "center"];
        btnPrecompIndiv.helpTip = "Smart Crop & Precompose Each Selected Layer Separately";
        btnPrecompIndiv.onClick = executeIndividualPrecomp;

        var btnPrecompGroup = tRow1.add("iconbutton", undefined, undefined);
        styleBtn(btnPrecompGroup, "▣ Precomp (Group)", "default", 30);
        btnPrecompGroup.preferredSize.width = 10;
        btnPrecompGroup.alignment = ["fill", "center"];
        btnPrecompGroup.helpTip = "Precompose All Selected Layers Combined into ONE Single Precomp";
        btnPrecompGroup.onClick = executeGroupPrecomp;

        var tRow2 = toolsGrid.add("group");
        tRow2.orientation = "row";
        tRow2.alignChildren = ["fill", "center"];
        tRow2.spacing = COL_SPACING;
        var btnAutoBox = tRow2.add("iconbutton", undefined, undefined);
        styleBtn(btnAutoBox, "⊡ Auto Box", "default", 30);
        btnAutoBox.preferredSize.width = 10;
        btnAutoBox.alignment = ["fill", "center"];
        btnAutoBox.helpTip = "Create Pixel-Perfect Auto-Resizing Background Box for Text Layer";
        btnAutoBox.onClick = showAutoBoxDialog;

        var btnGrid = tRow2.add("iconbutton", undefined, undefined);
        styleBtn(btnGrid, "⊞ Grid Maker", "default", 30);
        btnGrid.preferredSize.width = 10;
        btnGrid.alignment = ["fill", "center"];
        btnGrid.helpTip = "Open Grid Designer to create Rows, Columns, and Layouts";
        btnGrid.onClick = showGridMakerDialog;

        var btnStrike = toolsGrid.add("iconbutton", undefined, undefined);
        styleBtn(btnStrike, "⚡ LazyStrike FX", "primary", 32);
        btnStrike.alignment = ["fill", "center"];
        btnStrike.helpTip = "Lightning bolts, flashes and sky flashes — by timing or driven by audio";
        btnStrike.onClick = showLazyStrikeDialog;

        // ============================================================
        // ---- 2. Preview Render Section ----
        // ============================================================
        addSectionHeader(win, "🎬 LazyPreview Render");

        var prevRow = win.add("group");
        prevRow.orientation = "row";
        prevRow.alignChildren = ["fill", "center"];
        prevRow.spacing = COL_SPACING;

        var btnRender = prevRow.add("iconbutton", undefined, undefined);
        styleBtn(btnRender, "▶ Render In→Out", "default", 30);
        btnRender.preferredSize.width = 10;
        btnRender.alignment = ["fill", "center"];
        btnRender.helpTip = "Saves the project, renders the work area (B / N) to H.264 in the background, and puts it on top as a solo'd preview layer for smooth playback";

        var btnTogglePreview = prevRow.add("iconbutton", undefined, undefined);
        styleBtn(btnTogglePreview, "Toggle", "default", 30);
        btnTogglePreview.preferredSize.width = 10;
        btnTogglePreview.alignment = ["fill", "center"];
        btnTogglePreview.helpTip = "Switch between the rendered preview and the live composition";

        var btnRemovePreview = prevRow.add("iconbutton", undefined, undefined);
        styleBtn(btnRemovePreview, "Remove", "danger", 30);
        btnRemovePreview.preferredSize.width = 10;
        btnRemovePreview.alignment = ["fill", "center"];
        btnRemovePreview.helpTip = "Delete the preview layer and its rendered file";

        previewStatusText = win.add("statictext", undefined, "Set the work area (B / N), then render.");
        previewStatusText.alignment = ["fill", "top"];
        previewStatusText.graphics.font = ScriptUI.newFont("sans", "REGULAR", 9);
        try { previewStatusText.graphics.foregroundColor = win.graphics.newPen(win.graphics.PenType.SOLID_COLOR, C.textMuted, 1); } catch (e) {}
        try { deletePreviewFiles(null); } catch (ePending) {}

        btnRender.onClick = function () {
            var problem = startPreviewRender(app.project.activeItem);
            if (problem) {
                setPreviewStatus("Not started.");
                alert(problem);
            }
        };
        btnTogglePreview.onClick = function () {
            var comp = app.project.activeItem;
            if (!(comp && comp instanceof CompItem)) return alert("No active composition.");
            app.beginUndoGroup("LazyPreview Render: Toggle Preview");
            var on;
            try {
                on = togglePreviewLayer(comp);
            } finally {
                app.endUndoGroup();
            }
            if (on === null) return alert("No preview layer in this composition.\nClick Render In\u2192Out first.");
            setPreviewStatus(on ? "\u2713 Preview ON" : "\u25CB Preview OFF (showing the composition)");
        };
        btnRemovePreview.onClick = function () {
            var comp = app.project.activeItem;
            if (!(comp && comp instanceof CompItem)) return alert("No active composition.");
            app.beginUndoGroup("LazyPreview Render: Remove Preview");
            var removed;
            try {
                removed = removePreviewLayer(comp);
            } finally {
                app.endUndoGroup();
            }
            if (!removed) return alert("No preview layer to remove.");
            setPreviewStatus("Preview removed.");
        };

        // ============================================================
        // ---- 3. Head to Line & Anchor (Two Columns) ----
        // ============================================================
        addSharedHeader(win, "Head to Line", "Anchor");

        var twoCol1 = win.add("group");
        twoCol1.orientation = "row";
        twoCol1.alignChildren = ["fill", "bottom"];
        twoCol1.spacing = COL_SPACING;

        // -- Left: Head to Line Form --
        var headCol = twoCol1.add("group");
        headCol.orientation = "column";
        headCol.alignChildren = ["fill", "top"];
        headCol.spacing = 4;
        headCol.alignment = ["fill", "bottom"];

        var hTypeRow = headCol.add("group");
        hTypeRow.orientation = "row";
        hTypeRow.alignChildren = ["left", "center"];
        hTypeRow.spacing = 4;
        var hTypeLbl = hTypeRow.add("statictext", undefined, "Type:");
        hTypeLbl.graphics.font = ScriptUI.newFont("sans", "REGULAR", 9);
        try { hTypeLbl.graphics.foregroundColor = headCol.graphics.newPen(headCol.graphics.PenType.SOLID_COLOR, C.textMuted, 1); } catch (e) {}
        var dropHeadType = hTypeRow.add("dropdownlist", undefined, [
            "Triangle", "Circle", "Star", "Rectangle",
            "Pentagon", "Hexagon", "Heptagon", "Octagon"
        ]);
        dropHeadType.selection = 0;
        dropHeadType.preferredSize = [86, 20];

        var hCheckRow1 = headCol.add("group");
        hCheckRow1.orientation = "row";
        hCheckRow1.spacing = 8;
        var chkRoundCorners = createCheckbox(hCheckRow1, "Round", false, true);
        var chkDoubleSided = createCheckbox(hCheckRow1, "Double", false, true);

        var hCheckRow2 = headCol.add("group");
        hCheckRow2.orientation = "row";
        hCheckRow2.alignChildren = ["left", "center"];
        hCheckRow2.spacing = 4;
        var chkReverseDir = createCheckbox(hCheckRow2, "Rev", false, true);
        var chkAnimate = createCheckbox(hCheckRow2, "Anim:", true, false);
        var inputAnimFrames = hCheckRow2.add("edittext", undefined, "30");
        inputAnimFrames.characters = 3;

        var btnHeadIt = headCol.add("iconbutton", undefined, undefined);
        styleBtn(btnHeadIt, "⚙ Head it!", "default", 30);
        btnHeadIt.preferredSize.width = 10;
        btnHeadIt.alignment = ["fill", "center"];
        btnHeadIt.helpTip = "Attach selected Head shape to line with path tracking & animation";
        btnHeadIt.onClick = function () {
            var hType = dropHeadType.selection.text;
            var rCorners = chkRoundCorners.value;
            var dSided = chkDoubleSided.value;
            var rDir = chkReverseDir.value;
            var doAnim = chkAnimate.value;
            var frames = parseInt(inputAnimFrames.text, 10) || 30;
            executeHeadToLine(hType, rCorners, dSided, rDir, doAnim, frames);
        };

        // -- Right: Anchor 9-Point DirectionGrid --
        var anchorCol = twoCol1.add("group");
        anchorCol.orientation = "column";
        anchorCol.alignChildren = ["fill", "top"];
        anchorCol.spacing = 4;
        anchorCol.alignment = ["fill", "bottom"];
        registerColumnPair(headCol, anchorCol);

        var activeAnchorIdx = 4; // Default to Center '●'
        var dirChars = ['↖', '↑', '↗', '←', '●', '→', '↙', '↓', '↘'];
        var dirCoords = [
            [0, 0],   [0.5, 0],   [1, 0],
            [0, 0.5], [0.5, 0.5], [1, 0.5],
            [0, 1],   [0.5, 1],   [1, 1]
        ];
        var anchorBtns = [];

        var gridContainer = anchorCol.add("group");
        gridContainer.orientation = "column";
        gridContainer.alignChildren = ["center", "center"];
        gridContainer.spacing = 3;

        function refreshAnchorPad() {
            for (var k = 0; k < anchorBtns.length; k++) {
                styleBtn(anchorBtns[k], dirChars[k], (k === activeAnchorIdx) ? "active" : "pill", 24);
                anchorBtns[k].notify("onDraw");
            }
        }

        for (var rowIdx = 0; rowIdx < 3; rowIdx++) {
            var rowG = gridContainer.add("group");
            rowG.orientation = "row";
            rowG.spacing = 3;
            for (var colIdx = 0; colIdx < 3; colIdx++) {
                var btnIdx = rowIdx * 3 + colIdx;
                var aBtn = rowG.add("iconbutton", undefined, undefined);
                aBtn.preferredSize = [24, 24];
                styleBtn(aBtn, dirChars[btnIdx], (btnIdx === activeAnchorIdx) ? "active" : "pill", 24);
                (function (idx) {
                    aBtn.onClick = function () {
                        activeAnchorIdx = idx;
                        refreshAnchorPad();
                        alignAnchorPoint(dirCoords[idx][0], dirCoords[idx][1]);
                    };
                })(btnIdx);
                anchorBtns.push(aBtn);
            }
        }

        var btnCenterComp = anchorCol.add("iconbutton", undefined, undefined);
        styleBtn(btnCenterComp, "Center Comp", "default", 30);
        btnCenterComp.preferredSize.width = 10;
        btnCenterComp.alignment = ["fill", "center"];
        btnCenterComp.helpTip = "Center selected layers in composition";
        btnCenterComp.onClick = centerInComp;

        // ============================================================
        // ---- 4. Fade & Swatch (Two Columns) ----
        // ============================================================
        addSharedHeader(win, "Fade", "Swatch");

        var twoCol2 = win.add("group");
        twoCol2.orientation = "row";
        twoCol2.alignChildren = ["fill", "bottom"];
        twoCol2.spacing = COL_SPACING;

        // -- Left: Fade Form --
        var fadeCol = twoCol2.add("group");
        fadeCol.orientation = "column";
        fadeCol.alignChildren = ["fill", "top"];
        fadeCol.spacing = 4;
        fadeCol.alignment = ["fill", "bottom"];

        var fParamsRow = fadeCol.add("group");
        fParamsRow.orientation = "row";
        fParamsRow.alignChildren = ["left", "center"];
        fParamsRow.spacing = 4;

        var durLbl = fParamsRow.add("statictext", undefined, "Dur:");
        durLbl.graphics.font = ScriptUI.newFont("sans", "REGULAR", 9);
        try { durLbl.graphics.foregroundColor = fadeCol.graphics.newPen(fadeCol.graphics.PenType.SOLID_COLOR, C.textMuted, 1); } catch (e) {}
        var inputFadeDur = fParamsRow.add("edittext", undefined, "20");
        inputFadeDur.characters = 3;
        inputFadeDur.helpTip = "Fade length in frames at speed 1";

        var spdLbl = fParamsRow.add("statictext", undefined, "Spd:");
        spdLbl.graphics.font = ScriptUI.newFont("sans", "REGULAR", 9);
        try { spdLbl.graphics.foregroundColor = fadeCol.graphics.newPen(fadeCol.graphics.PenType.SOLID_COLOR, C.textMuted, 1); } catch (e) {}
        var inputFadeSpd = fParamsRow.add("edittext", undefined, "1");
        inputFadeSpd.characters = 3;
        inputFadeSpd.helpTip = "Speed multiplier: 2 = twice as fast, 0.5 = twice as slow";

        var fEaseRow = fadeCol.add("group");
        fEaseRow.orientation = "row";
        fEaseRow.alignChildren = ["left", "center"];
        fEaseRow.spacing = 4;
        var easeLbl = fEaseRow.add("statictext", undefined, "Ease:");
        easeLbl.graphics.font = ScriptUI.newFont("sans", "REGULAR", 9);
        try { easeLbl.graphics.foregroundColor = fadeCol.graphics.newPen(fadeCol.graphics.PenType.SOLID_COLOR, C.textMuted, 1); } catch (e) {}
        var dropEase = fEaseRow.add("dropdownlist", undefined, [
            "Linear", "Ease In (Expo)", "Ease Out (Sine)",
            "Ease InOut (Quad)", "Ease InOut (Cubic)", "Bounce", "Elastic"
        ]);
        dropEase.selection = 0;
        dropEase.preferredSize = [86, 20];

        var fOptsRow = fadeCol.add("group");
        fOptsRow.orientation = "row";
        fOptsRow.spacing = 4;
        var chkFadeIn = createCheckbox(fOptsRow, "In", true);
        var chkFadeOut = createCheckbox(fOptsRow, "Out", true);
        var chkMarkers = createCheckbox(fOptsRow, "Markers", true);

        var fActionsRow = fadeCol.add("group");
        fActionsRow.orientation = "row";
        fActionsRow.alignChildren = ["fill", "center"];
        fActionsRow.spacing = 4;

        var btnApplyFade = fActionsRow.add("iconbutton", undefined, undefined);
        styleBtn(btnApplyFade, "⚡ Apply", "primary", 30);
        btnApplyFade.preferredSize.width = 10;
        btnApplyFade.alignment = ["fill", "center"];
        btnApplyFade.onClick = function () {
            var dur = parseInt(inputFadeDur.text, 10);
            var spd = parseFloat(inputFadeSpd.text);
            var easeIdx = dropEase.selection.index;
            if (isNaN(dur) || dur <= 0) return alert("Enter valid fade duration in frames.");
            if (isNaN(spd) || spd <= 0) return alert("Enter valid speed multiplier.");
            if (!chkFadeIn.value && !chkFadeOut.value) return alert("Select at least Fade In or Fade Out.");
            applyFadeTools(dur, spd, easeIdx, chkFadeIn.value, chkFadeOut.value, chkMarkers.value);
        };

        var btnDeleteFade = fActionsRow.add("iconbutton", undefined, undefined);
        styleBtn(btnDeleteFade, "✕ Clear", "default", 30);
        btnDeleteFade.preferredSize.width = 10;
        btnDeleteFade.alignment = ["fill", "center"];
        btnDeleteFade.helpTip = "Remove LazyMotion fades and markers";
        btnDeleteFade.onClick = deleteFadeTools;

        // -- Right: Quick Swatch --
        var swatchCol = twoCol2.add("group");
        swatchCol.orientation = "column";
        swatchCol.alignChildren = ["fill", "top"];
        swatchCol.spacing = 4;
        swatchCol.alignment = ["fill", "bottom"];
        registerColumnPair(fadeCol, swatchCol);

        // ---- Dropdown helpers ----
        /**
         * Select the item with this text. Setting `selection` to an out-of-range
         * index leaves it null and the closed list draws blank; this can only ever
         * land on a real item.
         */
        function selectByText(list, text) {
            var wanted = String(text);
            for (var i = 0; i < list.items.length; i++) {
                if (list.items[i].text === wanted) { list.selection = i; return; }
            }
            list.selection = list.items.length - 1;
        }

        function dropdownNumber(list, fallback) {
            var n = (list && list.selection) ? parseInt(list.selection.text, 10) : NaN;
            return (n >= 1) ? n : fallback;
        }

        var swCtrlRow = swatchCol.add("group");
        swCtrlRow.orientation = "row";
        swCtrlRow.alignChildren = ["left", "center"];
        swCtrlRow.alignment = ["left", "top"];
        swCtrlRow.spacing = 4;

        var totLbl = swCtrlRow.add("statictext", undefined, "Tot:");
        totLbl.graphics.font = ScriptUI.newFont("sans", "REGULAR", 9);
        try { totLbl.graphics.foregroundColor = swatchCol.graphics.newPen(swatchCol.graphics.PenType.SOLID_COLOR, C.textMuted, 1); } catch (e) {}
        var swTotalDrop = swCtrlRow.add("dropdownlist", undefined, ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]);
        swTotalDrop.preferredSize = [46, 20];
        swTotalDrop.helpTip = "How many swatches the palette has";
        selectByText(swTotalDrop, fillColors.length);

        var colLbl = swCtrlRow.add("statictext", undefined, "Col:");
        colLbl.graphics.font = ScriptUI.newFont("sans", "REGULAR", 9);
        try { colLbl.graphics.foregroundColor = swatchCol.graphics.newPen(swatchCol.graphics.PenType.SOLID_COLOR, C.textMuted, 1); } catch (e) {}
        var swColDrop = swCtrlRow.add("dropdownlist", undefined, SWATCH_COL_OPTIONS);
        swColDrop.preferredSize = [46, 20];
        swColDrop.helpTip = "Swatches per row (fewer are used when the panel is too narrow)";
        selectByText(swColDrop, savedSwatchCols);

        var swContainer = swatchCol.add("group");
        swContainer.orientation = "column";
        swContainer.alignChildren = ["left", "top"];
        swContainer.alignment = ["left", "top"];
        swContainer.spacing = SW_GAP;
        swContainer.margins = 0;

        var activeSwatchIdx = 0;
        var swatchButtons = [];  // every drawn block, for one repaint pass
        var buildingUI = true;   // no re-layout while the panel is still being built
        var lastFitCols = 0;

        /** min = preferred = max: layout() cannot resize a swatch block afterwards. */
        function lockSize(ctrl, w, h) {
            ctrl.minimumSize   = [w, h];
            ctrl.preferredSize = [w, h];
            ctrl.maximumSize   = [w, h];
        }

        function repaintSwatches() {
            for (var i = 0; i < swatchButtons.length; i++) {
                try { swatchButtons[i].notify("onDraw"); } catch (e) {}
            }
        }

        /** How many swatch blocks fit across the swatch column at its current width. */
        function swatchFitCols() {
            return Math.max(1, Math.floor((lastColW + SW_GAP) / (SW_W + SW_GAP)));
        }

        function swatchCols() {
            return Math.min(dropdownNumber(swColDrop, 5), swatchFitCols());
        }

        function renderSwatches() {
            while (swContainer.children.length > 0) swContainer.remove(swContainer.children[0]);
            swatchButtons = [];

            var cols = swatchCols();
            lastFitCols = cols;
            var curRowGrp = null;

            for (var i = 0; i < fillColors.length; i++) {
                if (i % cols === 0) {
                    curRowGrp = swContainer.add("group");
                    curRowGrp.orientation = "row";
                    curRowGrp.alignChildren = ["left", "top"];
                    curRowGrp.alignment = ["left", "top"];
                    curRowGrp.spacing = SW_GAP;
                    curRowGrp.margins = 0;
                }

                var colBox = curRowGrp.add("group");
                colBox.orientation = "column";
                colBox.alignChildren = ["center", "top"];
                colBox.spacing = 2;
                colBox.margins = 0;

                // Rounded colour block
                var fillIcn = colBox.add("iconbutton", undefined, undefined);
                lockSize(fillIcn, SW_W, 22);
                fillIcn.helpTip = "Click to pick this swatch's colour";
                fillIcn.onDraw = (function (idx) {
                    return function () {
                        var g = this.graphics;
                        var w = this.size[0], ht = this.size[1];
                        var isAct = (idx === activeSwatchIdx);

                        var clear = g.newBrush(g.BrushType.SOLID_COLOR, C.bgPanel);
                        g.rectPath(0, 0, w, ht); g.fillPath(clear);

                        var brd = g.newBrush(g.BrushType.SOLID_COLOR, isAct ? C.accent : C.borderSubtle);
                        var bg = g.newBrush(g.BrushType.SOLID_COLOR, hexToAeColor(fillColors[idx]));

                        fillRoundRect(g, brd, 0, 0, w, ht, 3);
                        fillRoundRect(g, bg, (isAct ? 2 : 1), (isAct ? 2 : 1), w - (isAct ? 4 : 2), ht - (isAct ? 4 : 2), (isAct ? 1 : 2));
                    };
                })(i);
                fillIcn.onClick = (function (idx) {
                    return function () {
                        activeSwatchIdx = idx;
                        var picked = $.colorPicker(hexToDec(fillColors[idx]));
                        if (picked !== -1) {
                            fillColors[idx] = decToHex(picked);
                            saveSwatchSettings();
                        }
                        repaintSwatches();
                    };
                })(i);
                swatchButtons.push(fillIcn);

                // 'F' pill
                var btnF = colBox.add("iconbutton", undefined, undefined);
                styleBtn(btnF, "F", "pill", 16);
                lockSize(btnF, SW_W, 16);
                btnF.helpTip = "Apply Fill color";
                btnF.onClick = (function (idx) {
                    return function () {
                        activeSwatchIdx = idx;
                        repaintSwatches();
                        applySwatchColor(fillColors[idx], "Fill");
                    };
                })(i);
                swatchButtons.push(btnF);

                // 'S' pill
                var btnS = colBox.add("iconbutton", undefined, undefined);
                styleBtn(btnS, "S", "pill", 16);
                lockSize(btnS, SW_W, 16);
                btnS.helpTip = "Apply Stroke color";
                btnS.onClick = (function (idx) {
                    return function () {
                        activeSwatchIdx = idx;
                        repaintSwatches();
                        applySwatchColor(strokeColors[idx], "Stroke");
                    };
                })(i);
                swatchButtons.push(btnS);
            }

            if (!buildingUI) {
                try {
                    win.layout.layout(true);
                    win.layout.resize();
                } catch (eLay) {}
            }
            repaintSwatches();
        }

        swTotalDrop.onChange = function () {
            var newLen = dropdownNumber(this, fillColors.length);
            var oldLen = fillColors.length;
            if (newLen > oldLen) {
                for (var j = oldLen; j < newLen; j++) {
                    fillColors.push("#CCCCCC");
                    strokeColors.push("#888888");
                }
            } else if (newLen < oldLen) {
                fillColors.splice(newLen, oldLen - newLen);
                strokeColors.splice(newLen, oldLen - newLen);
            }
            if (activeSwatchIdx >= fillColors.length) activeSwatchIdx = fillColors.length - 1;
            saveSwatchSettings();
            renderSwatches();
        };

        swColDrop.onChange = function () {
            savedSwatchCols = dropdownNumber(this, 5);
            saveSwatchSettings();
            renderSwatches();
        };

        syncColumns();
        renderSwatches();

        var inResize = false;
        win.onResizing = win.onResize = function () {
            if (inResize) return;
            inResize = true;
            try {
                syncColumns();
                // Rewrap the swatch grid only when the number that fits changed.
                if (swatchCols() !== lastFitCols) {
                    renderSwatches();
                } else {
                    this.layout.resize();
                    repaintSwatches();
                }
            } catch (eR) {
            } finally {
                inResize = false;
            }
        };

        if (win instanceof Window) {
            win.center();
            win.show();
            syncColumns();          // the real width is known only after show()
            buildingUI = false;
            renderSwatches();
        } else {
            win.layout.layout(true); // docked panel: get its real width first
            syncColumns();
            buildingUI = false;
            renderSwatches();
        }

        return win;
    }


    // tools/test-toolkit.js (and the After Effects smoke test) load this file
    // with $.global.LazyMotionToolkitTest set, and get the engine back instead
    // of a panel. Never set in normal use.
    if (typeof $ !== "undefined" && $.global && $.global.LazyMotionToolkitTest) {
        $.global.LazyMotionToolkitTest.api = {
            version: _buildVersion,
            normalizePalette: normalizePalette,
            applySwatchColor: applySwatchColor,
            colorLayers: colorLayers,
            getMaskBounds: getMaskBounds,
            canLeaveAttributes: canLeaveAttributes,
            cropPrecomp: cropPrecomp,
            executeIndividualPrecomp: executeIndividualPrecomp,
            executeGroupPrecomp: executeGroupPrecomp,
            precomposeEach: precomposeEach,
            precomposeGroup: precomposeGroup,
            easingFuncs: easingFuncs,
            buildFadeExpression: buildFadeExpression,
            isFadeExpression: isFadeExpression,
            applyFadeTools: applyFadeTools,
            deleteFadeTools: deleteFadeTools,
            fadeLayers: fadeLayers,
            clearFades: clearFades,
            layerToParentDelta: layerToParentDelta,
            alignAnchorPoint: alignAnchorPoint,
            centerInComp: centerInComp,
            alignAnchors: alignAnchors,
            centerLayers: centerLayers,
            computeGrid: computeGrid,
            LIGHTNING: LIGHTNING,
            strikeTimes: strikeTimes,
            audioPeaks: audioPeaks,
            generateLightning: generateLightning,
            findH264Template: findH264Template,
            previewStamp: previewStamp,
            isPreviewFile: isPreviewFile,
            buildRenderJob: buildRenderJob,
            utf16leBase64: utf16leBase64,
            utf8Bytes: utf8Bytes,
            writeTextFile: writeTextFile,
            placePreview: placePreview,
            findPreviewLayer: findPreviewLayer,
            togglePreviewLayer: togglePreviewLayer,
            removePreviewLayer: removePreviewLayer,
            deletePreviewFiles: deletePreviewFiles,
            pendingPreviewDeletes: pendingPreviewDeletes,
            getAerenderPath: getAerenderPath,
            powershellPath: powershellPath,
            buildToolkitUI: buildToolkitUI,
            showLazyStrikeDialog: showLazyStrikeDialog,
            closeLazyStrikeDialog: function () { if (strikeWindow) strikeWindow.close(); },
            outputTemplatesFor: outputTemplatesFor
        };
        return null;
    }

    return buildToolkitUI(thisObj);
})(this);
