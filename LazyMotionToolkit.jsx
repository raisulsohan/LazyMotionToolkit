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
    var _buildVersion     = "1.8.0";
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
    var savedColIndex = 4; // default 5 cols

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
        if (app.settings.haveSetting(_settingsSection, "ColIndex")) {
            var savedCols = parseInt(app.settings.getSetting(_settingsSection, "ColIndex"), 10);
            savedColIndex = (savedCols >= 0 && savedCols <= 5) ? savedCols : 4;
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
        app.settings.saveSetting(_settingsSection, "ColIndex", savedColIndex.toString());
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
    // 4. Auto Text Box Maker (Smooth Animations & Real-Time Sync)
    // ============================================================
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

    function executeAutoBoxMaker() {
        var comp = app.project.activeItem;
        if (!comp || !(comp instanceof CompItem)) {
            alert("Please open a composition first.");
            return;
        }

        var selectedLayers = comp.selectedLayers;
        var anyText = false;
        for (var s = 0; s < selectedLayers.length; s++) {
            if (selectedLayers[s] instanceof TextLayer) anyText = true;
        }
        if (!anyText) {
            alert("Please select a Text Layer first, then click Auto Box.");
            return;
        }

        app.beginUndoGroup("LazyMotion: Create Auto Box");
        try {
            for (var i = 0; i < selectedLayers.length; i++) {
                var textLayer = selectedLayers[i];
                if (!(textLayer instanceof TextLayer)) continue;

                var boxLayer = comp.layers.addShape();
                boxLayer.name = textLayer.name + " - Box";
                boxLayer.moveAfter(textLayer);
                boxLayer.parent = textLayer;

                // Controls on Box Layer
                addSliderControl(boxLayer, "Padding X", 50);
                addSliderControl(boxLayer, "Padding Y", 30);
                addSliderControl(boxLayer, "Roundness", 25);
                addSliderControl(boxLayer, "Box Opacity", 100);
                addColorControl(boxLayer, "Box Color", [0.85, 0.12, 0.15, 1]);

                var shapeGroup = boxLayer.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group");
                shapeGroup.name = "Auto Box";

                var rectPath = shapeGroup.property("ADBE Vectors Group").addProperty("ADBE Vector Shape - Rect");

                // Dynamic Size Expression
                rectPath.property("ADBE Vector Rect Size").expression =
                    "var t = thisLayer.parent;\n" +
                    "if (t != null) {\n" +
                    "    var r = t.sourceRectAtTime(time, false);\n" +
                    "    var px = effect(\"Padding X\")(\"Slider\");\n" +
                    "    var py = effect(\"Padding Y\")(\"Slider\");\n" +
                    "    \n" +
                    "    var progress = 100;\n" +
                    "    var hasRangeSel = false;\n" +
                    "    try {\n" +
                    "        if (t.text && t.text.animator && t.text.animator.numProperties > 0) {\n" +
                    "            for (var a = 1; a <= t.text.animator.numProperties; a++) {\n" +
                    "                var anim = t.text.animator(a);\n" +
                    "                if (anim.selector && anim.selector.numProperties > 0) {\n" +
                    "                    for (var s = 1; s <= anim.selector.numProperties; s++) {\n" +
                    "                        var sel = anim.selector(s);\n" +
                    "                        if (sel.start && (sel.start.numKeys > 0 || sel.start.isTimeVarying)) {\n" +
                    "                            progress = Math.min(progress, sel.start.value);\n" +
                    "                            hasRangeSel = true;\n" +
                    "                        } else if (sel.end && (sel.end.numKeys > 0 || sel.end.isTimeVarying)) {\n" +
                    "                            progress = Math.min(progress, sel.end.value);\n" +
                    "                            hasRangeSel = true;\n" +
                    "                        } else if (sel.offset && (sel.offset.numKeys > 0 || sel.offset.isTimeVarying)) {\n" +
                    "                            progress = Math.min(progress, Math.max(0, Math.min(100, 100 + sel.offset.value)));\n" +
                    "                            hasRangeSel = true;\n" +
                    "                        }\n" +
                    "                    }\n" +
                    "                }\n" +
                    "            }\n" +
                    "        }\n" +
                    "    } catch(e) {}\n" +
                    "    \n" +
                    "    var visibleRatio = hasRangeSel ? Math.max(0, Math.min(1, progress / 100)) : 1;\n" +
                    "    var curW = r.width * visibleRatio;\n" +
                    "    \n" +
                    "    if (curW > 0 && r.height > 0) {\n" +
                    "        [Math.max(1, curW + px * 2), Math.max(1, r.height + py * 2)];\n" +
                    "    } else {\n" +
                    "        [0, 0];\n" +
                    "    }\n" +
                    "} else {\n" +
                    "    value;\n" +
                    "}";

                // Dynamic Position Expression
                rectPath.property("ADBE Vector Rect Position").expression =
                    "var t = thisLayer.parent;\n" +
                    "if (t != null) {\n" +
                    "    var r = t.sourceRectAtTime(time, false);\n" +
                    "    \n" +
                    "    var progress = 100;\n" +
                    "    var hasRangeSel = false;\n" +
                    "    try {\n" +
                    "        if (t.text && t.text.animator && t.text.animator.numProperties > 0) {\n" +
                    "            for (var a = 1; a <= t.text.animator.numProperties; a++) {\n" +
                    "                var anim = t.text.animator(a);\n" +
                    "                if (anim.selector && anim.selector.numProperties > 0) {\n" +
                    "                    for (var s = 1; s <= anim.selector.numProperties; s++) {\n" +
                    "                        var sel = anim.selector(s);\n" +
                    "                        if (sel.start && (sel.start.numKeys > 0 || sel.start.isTimeVarying)) {\n" +
                    "                            progress = Math.min(progress, sel.start.value);\n" +
                    "                            hasRangeSel = true;\n" +
                    "                        } else if (sel.end && (sel.end.numKeys > 0 || sel.end.isTimeVarying)) {\n" +
                    "                            progress = Math.min(progress, sel.end.value);\n" +
                    "                            hasRangeSel = true;\n" +
                    "                        } else if (sel.offset && (sel.offset.numKeys > 0 || sel.offset.isTimeVarying)) {\n" +
                    "                            progress = Math.min(progress, Math.max(0, Math.min(100, 100 + sel.offset.value)));\n" +
                    "                            hasRangeSel = true;\n" +
                    "                        }\n" +
                    "                    }\n" +
                    "                }\n" +
                    "            }\n" +
                    "        }\n" +
                    "    } catch(e) {}\n" +
                    "    \n" +
                    "    var visibleRatio = hasRangeSel ? Math.max(0, Math.min(1, progress / 100)) : 1;\n" +
                    "    var curW = r.width * visibleRatio;\n" +
                    "    \n" +
                    "    if (curW > 0 && r.height > 0) {\n" +
                    "        [r.left + curW / 2, r.top + r.height / 2];\n" +
                    "    } else {\n" +
                    "        [r.left, r.top + r.height / 2];\n" +
                    "    }\n" +
                    "} else {\n" +
                    "    value;\n" +
                    "}";

                // Roundness Expression
                rectPath.property("ADBE Vector Rect Roundness").expression =
                    "try { effect(\"Roundness\")(\"Slider\"); } catch(e) { 0; }";

                var rectFill = shapeGroup.property("ADBE Vectors Group").addProperty("ADBE Vector Graphic - Fill");
                rectFill.property("ADBE Vector Fill Color").expression =
                    "try { effect(\"Box Color\")(\"Color\"); } catch(e) { [0.15,0.15,0.15,1]; }";

                var transform = boxLayer.property("ADBE Transform Group");
                transform.property("ADBE Anchor Point").setValue([0, 0, 0]);
                transform.property("ADBE Position").setValue([0, 0, 0]);
                transform.property("ADBE Scale").setValue([100, 100, 100]);

                // Opacity Expression
                transform.property("ADBE Opacity").expression =
                    "var t = thisLayer.parent;\n" +
                    "if (t != null) {\n" +
                    "    var baseOp = t.transform.opacity.value;\n" +
                    "    var boxOpMult = 1;\n" +
                    "    try { boxOpMult = effect(\"Box Opacity\")(\"Slider\") / 100; } catch(e) {}\n" +
                    "    \n" +
                    "    var animOp = 100;\n" +
                    "    var hasRangeSel = false;\n" +
                    "    var rangeProg = 100;\n" +
                    "    \n" +
                    "    try {\n" +
                    "        if (t.text && t.text.animator && t.text.animator.numProperties > 0) {\n" +
                    "            for (var a = 1; a <= t.text.animator.numProperties; a++) {\n" +
                    "                var anim = t.text.animator(a);\n" +
                    "                var propOp = 100;\n" +
                    "                try {\n" +
                    "                    if (anim.property(\"ADBE Text Animator Properties\") && anim.property(\"ADBE Text Animator Properties\").property(\"ADBE Text Opacity\")) {\n" +
                    "                        propOp = anim.property(\"ADBE Text Animator Properties\").property(\"ADBE Text Opacity\").value;\n" +
                    "                    } else if (anim.property(\"Opacity\")) {\n" +
                    "                        propOp = anim.property(\"Opacity\").value;\n" +
                    "                    }\n" +
                    "                } catch(eProp) {}\n" +
                    "                \n" +
                    "                if (anim.selector && anim.selector.numProperties > 0) {\n" +
                    "                    for (var s = 1; s <= anim.selector.numProperties; s++) {\n" +
                    "                        var sel = anim.selector(s);\n" +
                    "                        if (sel.start && (sel.start.numKeys > 0 || sel.start.isTimeVarying)) {\n" +
                    "                            rangeProg = Math.min(rangeProg, sel.start.value);\n" +
                    "                            hasRangeSel = true;\n" +
                    "                        } else if (sel.end && (sel.end.numKeys > 0 || sel.end.isTimeVarying)) {\n" +
                    "                            rangeProg = Math.min(rangeProg, sel.end.value);\n" +
                    "                            hasRangeSel = true;\n" +
                    "                        } else if (sel.offset && (sel.offset.numKeys > 0 || sel.offset.isTimeVarying)) {\n" +
                    "                            rangeProg = Math.min(rangeProg, Math.max(0, Math.min(100, 100 + sel.offset.value)));\n" +
                    "                            hasRangeSel = true;\n" +
                    "                        }\n" +
                    "                    }\n" +
                    "                }\n" +
                    "                \n" +
                    "                if (hasRangeSel) {\n" +
                    "                    var effectiveAnimOp = propOp + (100 - propOp) * (rangeProg / 100);\n" +
                    "                    animOp = (animOp * effectiveAnimOp) / 100;\n" +
                    "                } else if (propOp < 100) {\n" +
                    "                    animOp = (animOp * propOp) / 100;\n" +
                    "                }\n" +
                    "            }\n" +
                    "        }\n" +
                    "    } catch(err) {}\n" +
                    "    \n" +
                    "    if (hasRangeSel && rangeProg <= 0) {\n" +
                    "        0;\n" +
                    "    } else {\n" +
                    "        Math.max(0, Math.min(100, (baseOp * animOp / 100) * boxOpMult));\n" +
                    "    }\n" +
                    "} else {\n" +
                    "    value;\n" +
                    "}";

                textLayer.selected = false;
                boxLayer.selected = true;
            }
        } catch (e) {
            alert("Auto Box Error: " + e.toString());
        } finally {
            app.endUndoGroup();
        }
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
        win.spacing = 6;
        win.margins = [10, 10, 10, 10];

        // ---- Theme Colors (matches src/index.css) ----
        var C = {
            bgBase:        [0.055, 0.059, 0.067, 1], // #0e0f11
            bgPanel:       [0.078, 0.082, 0.094, 1], // #141518
            bgButton:      [0.133, 0.141, 0.157, 1], // #222428
            bgButtonHover: [0.165, 0.173, 0.196, 1], // #2a2c32
            borderSubtle:  [0.165, 0.173, 0.196, 1], // #2a2c32
            borderMedium:  [0.180, 0.188, 0.224, 1], // #2e3039
            textPrimary:   [0.910, 0.914, 0.937, 1], // #e8e9ef
            textSecondary: [0.569, 0.588, 0.639, 1], // #9196a3
            textMuted:     [0.369, 0.384, 0.431, 1], // #5e626e
            accent:        [0.345, 0.396, 0.949, 1], // #5865f2
            accentHover:   [0.278, 0.322, 0.769, 1], // #4752c4
            accentRed:     [0.929, 0.259, 0.271, 1], // #ed4245
            activeTint:    [0.345, 0.396, 0.949, 0.25],
            activeBorder:  [0.345, 0.396, 0.949, 0.5],
            activeText:    [0.545, 0.584, 0.973, 1],
            white:         [1.000, 1.000, 1.000, 1]
        };

        // ---- UI Drawing Helpers ----

        /** Applies Figma-styled custom vector rendering to a button. */
        function styleBtn(btn, text, variant, customH) {
            btn.text = text;
            var h = customH || 24;
            btn.preferredSize.height = h;

            btn.onDraw = function () {
                var g = this.graphics;
                var w = this.size[0];
                var ht = this.size[1];

                var bg, brd, txt, isBold;
                if (variant === "primary") {
                    bg = C.accent;
                    brd = [0.42, 0.47, 1.0, 1];
                    txt = C.white;
                    isBold = true;
                } else if (variant === "danger") {
                    bg = [0.14, 0.10, 0.11, 1];
                    brd = [0.23, 0.12, 0.13, 1];
                    txt = C.accentRed;
                    isBold = false;
                } else if (variant === "active") {
                    bg = C.activeTint;
                    brd = C.activeBorder;
                    txt = C.activeText;
                    isBold = true;
                } else if (variant === "pill") {
                    bg = [0.102, 0.106, 0.122, 1];
                    brd = C.borderSubtle;
                    txt = C.textMuted;
                    isBold = false;
                } else {
                    bg = C.bgButton;
                    brd = C.borderMedium;
                    txt = [0.69, 0.71, 0.76, 1];
                    isBold = false;
                }

                // Background
                var bgBrush = g.newBrush(g.BrushType.SOLID_COLOR, bg);
                g.rectPath(0, 0, w, ht);
                g.fillPath(bgBrush);

                // Border
                var brdPen = g.newPen(g.PenType.SOLID_COLOR, brd, 1);
                g.rectPath(0.5, 0.5, w - 1, ht - 1);
                g.strokePath(brdPen);

                // Centered text
                var font = ScriptUI.newFont("sans", isBold ? "BOLD" : "REGULAR", variant === "pill" ? 8 : 10);
                var textPen = g.newPen(g.PenType.SOLID_COLOR, txt, 1);
                var sz = g.measureString(text, font);
                var tw = (sz && sz.width) ? sz.width : (sz ? sz[0] : 0);
                var th = (sz && sz.height) ? sz.height : (sz ? sz[1] : 11);
                var tx = Math.max(1, (w - tw) / 2);
                var ty = Math.max(1, (ht - th) / 2);
                g.drawString(text, textPen, tx, ty, font);
            };

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
            hdrRow.spacing = 10;
            hdrRow.margins = [0, 4, 0, 2];

            // Left Header
            var leftHdr = hdrRow.add("group");
            leftHdr.orientation = "row";
            leftHdr.alignChildren = ["left", "center"];
            leftHdr.spacing = 6;
            leftHdr.alignment = ["fill", "center"];

            var lbl1 = leftHdr.add("statictext", undefined, title1.toUpperCase());
            lbl1.graphics.font = ScriptUI.newFont("sans", "BOLD", 9);
            try { lbl1.graphics.foregroundColor = rowGrp.graphics.newPen(rowGrp.graphics.PenType.SOLID_COLOR, C.textMuted, 1); } catch (e) {}

            var div1 = leftHdr.add("panel");
            div1.alignment = ["fill", "center"];
            div1.maximumSize.height = 1;

            // Right Header
            var rightHdr = hdrRow.add("group");
            rightHdr.orientation = "row";
            rightHdr.alignChildren = ["left", "center"];
            rightHdr.spacing = 6;
            rightHdr.alignment = ["fill", "center"];

            var lbl2 = rightHdr.add("statictext", undefined, title2.toUpperCase());
            lbl2.graphics.font = ScriptUI.newFont("sans", "BOLD", 9);
            try { lbl2.graphics.foregroundColor = rowGrp.graphics.newPen(rowGrp.graphics.PenType.SOLID_COLOR, C.textMuted, 1); } catch (e) {}

            var div2 = rightHdr.add("panel");
            div2.alignment = ["fill", "center"];
            div2.maximumSize.height = 1;

            return hdrRow;
        }

        // ============================================================
        // ---- Top Header Bar ----
        // ============================================================
        var topBar = win.add("group");
        topBar.orientation = "row";
        topBar.alignChildren = ["fill", "center"];
        topBar.spacing = 6;
        topBar.margins = [0, 0, 0, 4];

        // Glowing Blue Dot
        var dot = topBar.add("statictext", undefined, "●");
        dot.graphics.font = ScriptUI.newFont("sans", "BOLD", 10);
        try { dot.graphics.foregroundColor = topBar.graphics.newPen(topBar.graphics.PenType.SOLID_COLOR, C.accent, 1); } catch (eD) {}

        var titleTxt = topBar.add("statictext", undefined, _scriptName);
        titleTxt.graphics.font = ScriptUI.newFont("sans", "BOLD", 11);
        try { titleTxt.graphics.foregroundColor = topBar.graphics.newPen(topBar.graphics.PenType.SOLID_COLOR, [0.83, 0.85, 0.91, 1], 1); } catch (e) {}

        var topSpacer = topBar.add("group");
        topSpacer.alignment = ["fill", "center"];

        var authorTxt = topBar.add("statictext", undefined, "Made by Raisul Sohan");
        authorTxt.graphics.font = ScriptUI.newFont("sans", "REGULAR", 9);
        try { authorTxt.graphics.foregroundColor = topBar.graphics.newPen(topBar.graphics.PenType.SOLID_COLOR, C.textMuted, 1); } catch (e) {}

        // Version badge pill
        var verPill = topBar.add("statictext", undefined, "v" + _buildVersion.replace(/\.0$/, ""));
        verPill.graphics.font = ScriptUI.newFont("sans", "BOLD", 9);
        try { verPill.graphics.foregroundColor = topBar.graphics.newPen(topBar.graphics.PenType.SOLID_COLOR, C.textMuted, 1); } catch (eV) {}

        // Subtle menu dots
        var dots = topBar.add("statictext", undefined, "••");
        dots.graphics.font = ScriptUI.newFont("sans", "BOLD", 9);
        try { dots.graphics.foregroundColor = topBar.graphics.newPen(topBar.graphics.PenType.SOLID_COLOR, C.borderMedium, 1); } catch (eM) {}

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
        tRow1.spacing = 4;
        var btnPrecompIndiv = tRow1.add("iconbutton", undefined, undefined);
        styleBtn(btnPrecompIndiv, "⊞ Precomp (1:1)", "default", 24);
        btnPrecompIndiv.alignment = ["fill", "center"];
        btnPrecompIndiv.helpTip = "Smart Crop & Precompose Each Selected Layer Separately";
        btnPrecompIndiv.onClick = executeIndividualPrecomp;

        var btnPrecompGroup = tRow1.add("iconbutton", undefined, undefined);
        styleBtn(btnPrecompGroup, "▣ Precomp (Group)", "default", 24);
        btnPrecompGroup.alignment = ["fill", "center"];
        btnPrecompGroup.helpTip = "Precompose All Selected Layers Combined into ONE Single Precomp";
        btnPrecompGroup.onClick = executeGroupPrecomp;

        var tRow2 = toolsGrid.add("group");
        tRow2.orientation = "row";
        tRow2.alignChildren = ["fill", "center"];
        tRow2.spacing = 4;
        var btnAutoBox = tRow2.add("iconbutton", undefined, undefined);
        styleBtn(btnAutoBox, "⊡ Auto Box", "default", 24);
        btnAutoBox.alignment = ["fill", "center"];
        btnAutoBox.helpTip = "Create Pixel-Perfect Auto-Resizing Background Box for Text Layer";
        btnAutoBox.onClick = executeAutoBoxMaker;

        var btnGrid = tRow2.add("iconbutton", undefined, undefined);
        styleBtn(btnGrid, "⊞ Grid Maker", "default", 24);
        btnGrid.alignment = ["fill", "center"];
        btnGrid.helpTip = "Open Grid Designer to create Rows, Columns, and Layouts";
        btnGrid.onClick = showGridMakerDialog;

        var btnStrike = toolsGrid.add("iconbutton", undefined, undefined);
        styleBtn(btnStrike, "⚡ LazyStrike FX", "primary", 26);
        btnStrike.alignment = ["fill", "center"];
        btnStrike.helpTip = "Lightning bolts, flashes and sky flashes — by timing or driven by audio";
        btnStrike.onClick = showLazyStrikeDialog;

        // ============================================================
        // ---- 2. Preview Render Section ----
        // ============================================================
        var prevHdr = addSectionHeader(win, "Preview Render");
        prevHdr.text = "🎬 LazyPreview Render";

        var prevRow = win.add("group");
        prevRow.orientation = "row";
        prevRow.alignChildren = ["fill", "center"];
        prevRow.spacing = 4;

        var btnRender = prevRow.add("iconbutton", undefined, undefined);
        styleBtn(btnRender, "▶ Render In→Out", "default", 24);
        btnRender.alignment = ["fill", "center"];
        btnRender.helpTip = "Saves the project, renders the work area (B / N) to H.264 in the background, and puts it on top as a solo'd preview layer for smooth playback";

        var btnTogglePreview = prevRow.add("iconbutton", undefined, undefined);
        styleBtn(btnTogglePreview, "Toggle", "default", 24);
        btnTogglePreview.alignment = ["fill", "center"];
        btnTogglePreview.helpTip = "Switch between the rendered preview and the live composition";

        var btnRemovePreview = prevRow.add("iconbutton", undefined, undefined);
        styleBtn(btnRemovePreview, "Remove", "danger", 24);
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
        twoCol1.alignChildren = ["fill", "top"];
        twoCol1.spacing = 10;

        // -- Left: Head to Line Form --
        var headCol = twoCol1.add("group");
        headCol.orientation = "column";
        headCol.alignChildren = ["fill", "top"];
        headCol.spacing = 4;
        headCol.alignment = ["fill", "top"];

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
        dropHeadType.preferredSize = [95, 20];

        var hCheckRow1 = headCol.add("group");
        hCheckRow1.orientation = "row";
        hCheckRow1.spacing = 8;
        var chkRoundCorners = hCheckRow1.add("checkbox", undefined, "Round");
        var chkDoubleSided = hCheckRow1.add("checkbox", undefined, "Double");

        var hCheckRow2 = headCol.add("group");
        hCheckRow2.orientation = "row";
        hCheckRow2.alignChildren = ["left", "center"];
        hCheckRow2.spacing = 4;
        var chkReverseDir = hCheckRow2.add("checkbox", undefined, "Rev");
        var chkAnimate = hCheckRow2.add("checkbox", undefined, "Anim:");
        chkAnimate.value = true;
        var inputAnimFrames = hCheckRow2.add("edittext", undefined, "30");
        inputAnimFrames.characters = 3;

        var btnHeadIt = headCol.add("iconbutton", undefined, undefined);
        styleBtn(btnHeadIt, "⚙ Head it!", "default", 22);
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
        anchorCol.alignChildren = ["center", "top"];
        anchorCol.spacing = 3;

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
        gridContainer.spacing = 2;

        function refreshAnchorPad() {
            for (var k = 0; k < anchorBtns.length; k++) {
                styleBtn(anchorBtns[k], dirChars[k], (k === activeAnchorIdx) ? "active" : "pill", 20);
                anchorBtns[k].notify("onDraw");
            }
        }

        for (var rowIdx = 0; rowIdx < 3; rowIdx++) {
            var rowG = gridContainer.add("group");
            rowG.orientation = "row";
            rowG.spacing = 2;
            for (var colIdx = 0; colIdx < 3; colIdx++) {
                var btnIdx = rowIdx * 3 + colIdx;
                var aBtn = rowG.add("iconbutton", undefined, undefined);
                aBtn.preferredSize = [24, 20];
                styleBtn(aBtn, dirChars[btnIdx], (btnIdx === activeAnchorIdx) ? "active" : "pill", 20);
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
        styleBtn(btnCenterComp, "Center Comp", "default", 22);
        btnCenterComp.preferredSize = [84, 22];
        btnCenterComp.alignment = ["fill", "center"];
        btnCenterComp.helpTip = "Center selected layers in composition";
        btnCenterComp.onClick = centerInComp;

        // ============================================================
        // ---- 4. Fade & Swatch (Two Columns) ----
        // ============================================================
        addSharedHeader(win, "Fade", "Swatch");

        var twoCol2 = win.add("group");
        twoCol2.orientation = "row";
        twoCol2.alignChildren = ["fill", "top"];
        twoCol2.spacing = 10;

        // -- Left: Fade Form --
        var fadeCol = twoCol2.add("group");
        fadeCol.orientation = "column";
        fadeCol.alignChildren = ["fill", "top"];
        fadeCol.spacing = 4;
        fadeCol.alignment = ["fill", "top"];

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
        dropEase.preferredSize = [95, 20];

        var fOptsRow = fadeCol.add("group");
        fOptsRow.orientation = "row";
        fOptsRow.spacing = 6;
        var chkFadeIn = fOptsRow.add("checkbox", undefined, "In");
        chkFadeIn.value = true;
        var chkFadeOut = fOptsRow.add("checkbox", undefined, "Out");
        chkFadeOut.value = true;
        var chkMarkers = fOptsRow.add("checkbox", undefined, "Markers");
        chkMarkers.value = true;

        var fActionsRow = fadeCol.add("group");
        fActionsRow.orientation = "row";
        fActionsRow.alignChildren = ["fill", "center"];
        fActionsRow.spacing = 4;

        var btnApplyFade = fActionsRow.add("iconbutton", undefined, undefined);
        styleBtn(btnApplyFade, "⚡ Apply", "primary", 22);
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
        styleBtn(btnDeleteFade, "✕ Clear", "default", 22);
        btnDeleteFade.alignment = ["fill", "center"];
        btnDeleteFade.helpTip = "Remove LazyMotion fades and markers";
        btnDeleteFade.onClick = deleteFadeTools;

        // -- Right: Quick Swatch --
        var swatchCol = twoCol2.add("group");
        swatchCol.orientation = "column";
        swatchCol.alignChildren = ["fill", "top"];
        swatchCol.spacing = 3;

        var swCtrlRow = swatchCol.add("group");
        swCtrlRow.orientation = "row";
        swCtrlRow.alignChildren = ["left", "center"];
        swCtrlRow.spacing = 4;

        var totLbl = swCtrlRow.add("statictext", undefined, "Tot:");
        totLbl.graphics.font = ScriptUI.newFont("sans", "REGULAR", 9);
        try { totLbl.graphics.foregroundColor = swatchCol.graphics.newPen(swatchCol.graphics.PenType.SOLID_COLOR, C.textMuted, 1); } catch (e) {}
        var swTotalDrop = swCtrlRow.add("dropdownlist", undefined, ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]);
        swTotalDrop.selection = Math.min(fillColors.length - 1, 9);
        swTotalDrop.preferredSize = [42, 20];

        var colLbl = swCtrlRow.add("statictext", undefined, "Col:");
        colLbl.graphics.font = ScriptUI.newFont("sans", "REGULAR", 9);
        try { colLbl.graphics.foregroundColor = swatchCol.graphics.newPen(swatchCol.graphics.PenType.SOLID_COLOR, C.textMuted, 1); } catch (e) {}
        var swColDrop = swCtrlRow.add("dropdownlist", undefined, ["1", "2", "3", "4", "5", "6"]);
        swColDrop.selection = Math.min(savedColIndex, 5);
        swColDrop.preferredSize = [38, 20];

        var swContainer = swatchCol.add("group");
        swContainer.orientation = "column";
        swContainer.alignChildren = ["center", "top"];
        swContainer.spacing = 3;

        var activeSwatchIdx = 0;

        function renderSwatches() {
            while (swContainer.children.length > 0) {
                swContainer.remove(swContainer.children[0]);
            }

            var currentCols = parseInt(swColDrop.selection.text, 10) || 5;
            var curRowGrp = null;

            for (var i = 0; i < fillColors.length; i++) {
                if (i % currentCols === 0) {
                    curRowGrp = swContainer.add("group");
                    curRowGrp.orientation = "row";
                    curRowGrp.alignChildren = ["left", "top"];
                    curRowGrp.spacing = 3;
                }

                var colBox = curRowGrp.add("group");
                colBox.orientation = "column";
                colBox.alignChildren = ["center", "top"];
                colBox.spacing = 2;

                // Rounded Color swatch block
                var fillIcn = colBox.add("iconbutton", undefined, undefined);
                fillIcn.size = [28, 20];
                fillIcn.onDraw = (function (idx) {
                    return function () {
                        var g = this.graphics;
                        var w = this.size[0];
                        var ht = this.size[1];
                        var br = g.newBrush(g.BrushType.SOLID_COLOR, hexToAeColor(fillColors[idx]));
                        g.rectPath(0, 0, w, ht);
                        g.fillPath(br);

                        // If active, draw indigo highlight border; else subtle border
                        var isAct = (idx === activeSwatchIdx);
                        var pen = g.newPen(g.PenType.SOLID_COLOR, isAct ? C.accent : C.borderSubtle, isAct ? 2 : 1);
                        g.rectPath(0.5, 0.5, w - 1, ht - 1);
                        g.strokePath(pen);
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
                        renderSwatches();
                    };
                })(i);

                // 'F' Pill Button
                var btnF = colBox.add("iconbutton", undefined, undefined);
                btnF.size = [28, 14];
                styleBtn(btnF, "F", "pill", 14);
                btnF.helpTip = "Apply Fill color";
                btnF.onClick = (function (idx) {
                    return function () {
                        activeSwatchIdx = idx;
                        renderSwatches();
                        applySwatchColor(fillColors[idx], "Fill");
                    };
                })(i);

                // 'S' Pill Button
                var btnS = colBox.add("iconbutton", undefined, undefined);
                btnS.size = [28, 14];
                styleBtn(btnS, "S", "pill", 14);
                btnS.helpTip = "Apply Stroke color";
                btnS.onClick = (function (idx) {
                    return function () {
                        activeSwatchIdx = idx;
                        renderSwatches();
                        applySwatchColor(strokeColors[idx], "Stroke");
                    };
                })(i);
            }

            win.layout.layout(true);
        }

        swTotalDrop.onChange = function () {
            var newLen = parseInt(this.selection.text, 10);
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
            saveSwatchSettings();
            renderSwatches();
        };

        swColDrop.onChange = function () {
            savedColIndex = this.selection.index;
            saveSwatchSettings();
            renderSwatches();
        };

        renderSwatches();

        var footer = win.add("statictext", undefined, "v" + _buildVersion.replace(/\.0$/, "") + " • Developed By RaisulSohan • raisulsohan.com");
        footer.graphics.font = ScriptUI.newFont("sans", "ITALIC", 8);
        footer.alignment = ["center", "bottom"];
        try { footer.graphics.foregroundColor = win.graphics.newPen(win.graphics.PenType.SOLID_COLOR, C.textMuted, 1); } catch (eF) {}

        win.onResizing = win.onResize = function () { this.layout.resize(); };

        if (win instanceof Window) {
            win.center();
            win.show();
        } else {
            win.layout.layout(true);
            win.layout.resize();
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
