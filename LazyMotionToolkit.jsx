/*
========================================================================
  Script Name: LazyMotionToolkit
  Author: Raisul Sohan (raisulsohan.com)
  Developed By: RaisulSohan
  Description: All-in-One Motion Graphics Toolkit for Adobe After Effects.
               Includes Smart Precomp (1:1 & Group), Auto Text Box,
               Fade Tools Pro (7 Easing Curves), Head to Line (Animated Arrows),
               Grid Designer, 9-Point Anchor Aligner, and Live Color Swatches.
  Copyright (c) 2026 Raisul Sohan. Free and open source under the MIT License.
========================================================================
*/

(function LazyMotionToolkit(thisObj) {
    "use strict";

    var _scriptName       = "LazyMotionToolkit";
    var _scriptAuthor     = "Raisul Sohan";
    var _authorWebsite    = "https://raisulsohan.com";
    var _buildVersion     = "1.5.0";
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
    // 9. Main ScriptUI Window / Panel Builder
    // ============================================================
    function buildToolkitUI(thisObj) {
        var win = (thisObj instanceof Panel)
            ? thisObj
            : new Window("palette", _scriptName, undefined, { resizeable: true });

        win.orientation = "column";
        win.alignChildren = ["fill", "top"];
        win.spacing = 8;
        win.margins = 8;

        // ---- Header Bar ----
        var header = win.add("group");
        header.orientation = "row";
        header.alignChildren = ["left", "center"];
        var titleTxt = header.add("statictext", undefined, "⚡ " + _scriptName);
        titleTxt.graphics.font = ScriptUI.newFont("sans", "BOLD", 12);

        // ---- 1. Layer & Comp Tools Panel ----
        var toolsPnl = win.add("panel", undefined, "Motion Tools");
        toolsPnl.orientation = "column";
        toolsPnl.alignChildren = ["fill", "center"];
        toolsPnl.spacing = 6;
        toolsPnl.margins = [8, 10, 8, 8];

        var precompRow = toolsPnl.add("group");
        precompRow.orientation = "row";
        precompRow.alignChildren = ["fill", "center"];
        precompRow.spacing = 6;

        var btnPrecompIndiv = precompRow.add("button", undefined, "📦 Precomp (1:1)");
        btnPrecompIndiv.helpTip = "Smart Crop & Precompose Each Selected Layer Separately";
        btnPrecompIndiv.onClick = executeIndividualPrecomp;

        var btnPrecompGroup = precompRow.add("button", undefined, "📁 Precomp (Group)");
        btnPrecompGroup.helpTip = "Precompose All Selected Layers Combined into ONE Single Precomp";
        btnPrecompGroup.onClick = executeGroupPrecomp;

        var boxGridRow = toolsPnl.add("group");
        boxGridRow.orientation = "row";
        boxGridRow.alignChildren = ["fill", "center"];
        boxGridRow.spacing = 6;

        var btnAutoBox = boxGridRow.add("button", undefined, "📝 Auto Box");
        btnAutoBox.helpTip = "Create Pixel-Perfect Auto-Resizing Background Box for Text Layer";
        btnAutoBox.onClick = executeAutoBoxMaker;

        var btnGrid = boxGridRow.add("button", undefined, "⊞ Grid Maker");
        btnGrid.helpTip = "Open Grid Designer to create Rows, Columns, and Layouts";
        btnGrid.onClick = showGridMakerDialog;

        // ---- 2. Head to Line (Animated Arrows) Panel ----
        var headPnl = win.add("panel", undefined, "🏹 Head to Line");
        headPnl.orientation = "column";
        headPnl.alignChildren = ["fill", "top"];
        headPnl.spacing = 6;
        headPnl.margins = [8, 10, 8, 8];

        // Head Sub-Panel
        var headSub = headPnl.add("panel", undefined, "Head:");
        headSub.orientation = "column";
        headSub.alignChildren = ["fill", "top"];
        headSub.spacing = 4;

        var headTypeRow = headSub.add("group");
        headTypeRow.orientation = "row";
        headTypeRow.add("statictext", undefined, "Type:");
        var dropHeadType = headTypeRow.add("dropdownlist", undefined, [
            "Triangle", "Circle", "Star", "Rectangle", "Pentagon", "Hexagon", "Heptagon", "Octagon"
        ]);
        dropHeadType.selection = 0;
        dropHeadType.preferredSize.width = 130;

        var chkRoundCorners = headSub.add("checkbox", undefined, "Round Corners");
        var chkDoubleSided = headSub.add("checkbox", undefined, "Double-Sided");

        // Line Sub-Panel
        var lineSub = headPnl.add("panel", undefined, "Line:");
        lineSub.orientation = "column";
        lineSub.alignChildren = ["fill", "top"];
        lineSub.spacing = 4;

        var chkReverseDir = lineSub.add("checkbox", undefined, "Reverse Direction");

        var animRow = lineSub.add("group");
        animRow.orientation = "row";
        var chkAnimate = animRow.add("checkbox", undefined, "Animate (f):");
        chkAnimate.value = true;
        var inputAnimFrames = animRow.add("edittext", undefined, "30");
        inputAnimFrames.characters = 4;
        inputAnimFrames.preferredSize = [45, 20];

        // Head it! button
        var btnHeadIt = headPnl.add("button", undefined, "🎯 Head it!");
        btnHeadIt.helpTip = "Attach selected Head shape to line with path tracking & animation";
        btnHeadIt.onClick = function () {
            var hType = dropHeadType.selection.text;
            var rCorners = chkRoundCorners.value;
            var dSided = chkDoubleSided.value;
            var rDir = chkReverseDir.value;
            var doAnim = chkAnimate.value;
            var frames = parseInt(inputAnimFrames.text) || 30;
            executeHeadToLine(hType, rCorners, dSided, rDir, doAnim, frames);
        };

        // ---- 3. Fade Tools Pro Panel ----
        var fadePnl = win.add("panel", undefined, "🎨 Fade Animator Pro");
        fadePnl.orientation = "column";
        fadePnl.alignChildren = ["fill", "top"];
        fadePnl.spacing = 6;
        fadePnl.margins = [8, 10, 8, 8];

        var fParamsRow = fadePnl.add("group");
        fParamsRow.orientation = "row";
        fParamsRow.spacing = 6;
        fParamsRow.add("statictext", undefined, "Dur (fr):");
        var inputFadeDur = fParamsRow.add("edittext", undefined, "20");
        inputFadeDur.characters = 3;
        fParamsRow.add("statictext", undefined, "Spd:");
        var inputFadeSpd = fParamsRow.add("edittext", undefined, "1");
        inputFadeSpd.characters = 3;
        inputFadeSpd.helpTip = "Speed multiplier: 2 = twice as fast (half the duration), 0.5 = twice as slow";
        inputFadeDur.helpTip = "Fade length in frames at speed 1";

        var fEaseRow = fadePnl.add("group");
        fEaseRow.orientation = "row";
        fEaseRow.add("statictext", undefined, "Ease:");
        var dropEase = fEaseRow.add("dropdownlist", undefined, [
            "Linear", "Ease In (Expo)", "Ease Out (Sine)",
            "Ease InOut (Quad)", "Ease InOut (Cubic)", "Bounce", "Elastic"
        ]);
        dropEase.selection = 0;
        dropEase.preferredSize.width = 140;

        var fOptsRow = fadePnl.add("group");
        fOptsRow.orientation = "row";
        fOptsRow.spacing = 8;
        var chkFadeIn = fOptsRow.add("checkbox", undefined, "In");
        chkFadeIn.value = true;
        var chkFadeOut = fOptsRow.add("checkbox", undefined, "Out");
        chkFadeOut.value = true;
        var chkMarkers = fOptsRow.add("checkbox", undefined, "Markers");
        chkMarkers.value = true;

        var fActionsRow = fadePnl.add("group");
        fActionsRow.orientation = "row";
        fActionsRow.alignChildren = ["fill", "center"];
        fActionsRow.spacing = 6;

        var btnApplyFade = fActionsRow.add("button", undefined, "🚀 Apply Fade");
        btnApplyFade.onClick = function () {
            var dur = parseInt(inputFadeDur.text);
            var spd = parseFloat(inputFadeSpd.text);
            var easeIdx = dropEase.selection.index;
            if (isNaN(dur) || dur <= 0) return alert("Enter valid fade duration in frames.");
            if (isNaN(spd) || spd <= 0) return alert("Enter valid speed multiplier.");
            if (!chkFadeIn.value && !chkFadeOut.value) return alert("Select at least Fade In or Fade Out.");
            applyFadeTools(dur, spd, easeIdx, chkFadeIn.value, chkFadeOut.value, chkMarkers.value);
        };

        var btnDeleteFade = fActionsRow.add("button", undefined, "❌ Clear");
        btnDeleteFade.size = [60, 24];
        btnDeleteFade.helpTip = "Remove LazyMotion fades and their fade in / fade out markers (other expressions and markers stay)";
        btnDeleteFade.onClick = deleteFadeTools;

        // ---- 4. 9-Point Anchor Point Alignment ----
        var anchorPnl = win.add("panel", undefined, "Anchor Point & Align");
        anchorPnl.orientation = "column";
        anchorPnl.alignChildren = ["center", "center"];
        anchorPnl.spacing = 4;
        anchorPnl.margins = [8, 10, 8, 8];

        var aRow1 = anchorPnl.add("group");
        aRow1.spacing = 4;
        var btnTL = aRow1.add("button", undefined, "◤"); btnTL.size = [30, 22]; btnTL.onClick = function () { alignAnchorPoint(0, 0); };
        var btnTC = aRow1.add("button", undefined, "▲"); btnTC.size = [30, 22]; btnTC.onClick = function () { alignAnchorPoint(0.5, 0); };
        var btnTR = aRow1.add("button", undefined, "◥"); btnTR.size = [30, 22]; btnTR.onClick = function () { alignAnchorPoint(1, 0); };

        var aRow2 = anchorPnl.add("group");
        aRow2.spacing = 4;
        var btnML = aRow2.add("button", undefined, "◀"); btnML.size = [30, 22]; btnML.onClick = function () { alignAnchorPoint(0, 0.5); };
        var btnMC = aRow2.add("button", undefined, "●"); btnMC.size = [30, 22]; btnMC.onClick = function () { alignAnchorPoint(0.5, 0.5); };
        var btnMR = aRow2.add("button", undefined, "▶"); btnMR.size = [30, 22]; btnMR.onClick = function () { alignAnchorPoint(1, 0.5); };

        var aRow3 = anchorPnl.add("group");
        aRow3.spacing = 4;
        var btnBL = aRow3.add("button", undefined, "◣"); btnBL.size = [30, 22]; btnBL.onClick = function () { alignAnchorPoint(0, 1); };
        var btnBC = aRow3.add("button", undefined, "▼"); btnBC.size = [30, 22]; btnBC.onClick = function () { alignAnchorPoint(0.5, 1); };
        var btnBR = aRow3.add("button", undefined, "◢"); btnBR.size = [30, 22]; btnBR.onClick = function () { alignAnchorPoint(1, 1); };

        var btnCenterComp = anchorPnl.add("button", undefined, "Center in Comp");
        btnCenterComp.size = [98, 22];
        btnCenterComp.onClick = centerInComp;

        // ---- 5. Live Color Swatches ----
        var swatchPnl = win.add("panel", undefined, "Quick Swatch");
        swatchPnl.orientation = "column";
        swatchPnl.alignChildren = ["fill", "top"];
        swatchPnl.spacing = 6;
        swatchPnl.margins = [8, 10, 8, 8];

        var swCtrlRow = swatchPnl.add("group");
        swCtrlRow.orientation = "row";
        swCtrlRow.alignChildren = ["center", "center"];
        swCtrlRow.spacing = 10;

        swCtrlRow.add("statictext", undefined, "Total:");
        var swTotalDrop = swCtrlRow.add("dropdownlist", undefined, ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]);
        swTotalDrop.selection = Math.min(fillColors.length - 1, 9);

        swCtrlRow.add("statictext", undefined, "Cols:");
        var swColDrop = swCtrlRow.add("dropdownlist", undefined, ["1", "2", "3", "4", "5", "6"]);
        swColDrop.selection = Math.min(savedColIndex, 5);

        var swContainer = swatchPnl.add("group");
        swContainer.orientation = "column";
        swContainer.alignChildren = ["center", "top"];
        swContainer.spacing = 6;

        function renderSwatches() {
            while (swContainer.children.length > 0) {
                swContainer.remove(swContainer.children[0]);
            }

            var currentCols = parseInt(swColDrop.selection.text) || 5;
            var curRowGrp = null;

            for (var i = 0; i < fillColors.length; i++) {
                if (i % currentCols === 0) {
                    curRowGrp = swContainer.add("group");
                    curRowGrp.orientation = "row";
                    curRowGrp.alignChildren = ["left", "top"];
                    curRowGrp.spacing = 6;
                }

                var colBox = curRowGrp.add("group");
                colBox.orientation = "column";
                colBox.alignChildren = ["center", "top"];
                colBox.spacing = 3;

                // Fill color block
                var fillIcn = colBox.add("iconbutton", undefined, undefined);
                fillIcn.size = [38, 28];
                fillIcn.onDraw = (function (idx) {
                    return function () {
                        var br = this.graphics.newBrush(this.graphics.BrushType.SOLID_COLOR, hexToAeColor(fillColors[idx]));
                        this.graphics.rectPath(0, 0, this.size[0], this.size[1]);
                        this.graphics.fillPath(br);
                        var pen = this.graphics.newPen(this.graphics.PenType.SOLID_COLOR, [0.35, 0.35, 0.35, 1], 1);
                        this.graphics.strokePath(pen);
                    };
                })(i);

                fillIcn.onClick = (function (idx) {
                    return function () {
                        var picked = $.colorPicker(hexToDec(fillColors[idx]));
                        if (picked !== -1) {
                            fillColors[idx] = decToHex(picked);
                            saveSwatchSettings();
                            renderSwatches();
                        }
                    };
                })(i);

                var btnF = colBox.add("button", undefined, "Fill");
                btnF.size = [38, 18];
                btnF.onClick = (function (idx) {
                    return function () { applySwatchColor(fillColors[idx], "Fill"); };
                })(i);

                // Stroke color block
                var strkIcn = colBox.add("iconbutton", undefined, undefined);
                strkIcn.size = [38, 18];
                strkIcn.onDraw = (function (idx) {
                    return function () {
                        var pen = this.graphics.newPen(this.graphics.PenType.SOLID_COLOR, hexToAeColor(strokeColors[idx]), 4);
                        this.graphics.rectPath(0, 0, this.size[0], this.size[1]);
                        this.graphics.strokePath(pen);
                    };
                })(i);

                strkIcn.onClick = (function (idx) {
                    return function () {
                        var picked = $.colorPicker(hexToDec(strokeColors[idx]));
                        if (picked !== -1) {
                            strokeColors[idx] = decToHex(picked);
                            saveSwatchSettings();
                            renderSwatches();
                        }
                    };
                })(i);

                var btnS = colBox.add("button", undefined, "Strk");
                btnS.size = [38, 18];
                btnS.onClick = (function (idx) {
                    return function () { applySwatchColor(strokeColors[idx], "Stroke"); };
                })(i);
            }

            win.layout.layout(true);
        }

        swTotalDrop.onChange = function () {
            var newLen = parseInt(this.selection.text);
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

        // ---- Footer / Credits ----
        var footer = win.add("statictext", undefined, "v" + _buildVersion.replace(/\.0$/, "") + " • Developed By RaisulSohan • raisulsohan.com");
        footer.graphics.font = ScriptUI.newFont("sans", "ITALIC", 9);
        footer.alignment = ["center", "bottom"];

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
            computeGrid: computeGrid
        };
        return null;
    }

    return buildToolkitUI(thisObj);
})(this);
