/*
========================================================================
  Script Name: LazyMotionToolkit
  Author: Raisul Sohan (raisulsohan.com)
  Developed By: RaisulSohan
  Description: All-in-One Motion Graphics Toolkit for Adobe After Effects.
               Includes Smart Precomp (1:1 & Group), Auto Text Box,
               Fade Tools Pro (7 Easing Curves), Grid Designer,
               9-Point Anchor Aligner, and Live Color Swatches.
  Copyright (c) 2026 Raisul Sohan. All rights reserved.
========================================================================
*/

(function LazyMotionToolkit(thisObj) {
    "use strict";

    var _scriptName       = "LazyMotionToolkit";
    var _scriptAuthor     = "Raisul Sohan";
    var _authorWebsite    = "https://raisulsohan.com";
    var _buildVersion     = "1.3.0";
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

    if (app.settings.haveSetting(_settingsSection, "FillColors")) {
        fillColors = app.settings.getSetting(_settingsSection, "FillColors").split(",");
    }
    if (app.settings.haveSetting(_settingsSection, "StrokeColors")) {
        strokeColors = app.settings.getSetting(_settingsSection, "StrokeColors").split(",");
    }
    if (app.settings.haveSetting(_settingsSection, "ColIndex")) {
        savedColIndex = parseInt(app.settings.getSetting(_settingsSection, "ColIndex"));
    }

    function saveSwatchSettings() {
        app.settings.saveSetting(_settingsSection, "FillColors", fillColors.join(","));
        app.settings.saveSetting(_settingsSection, "StrokeColors", strokeColors.join(","));
        app.settings.saveSetting(_settingsSection, "ColIndex", savedColIndex.toString());
    }

    function changeShapeColorRecursive(propGroup, colorValue, targetType) {
        for (var i = 1; i <= propGroup.numProperties; i++) {
            var prop = propGroup.property(i);
            if (prop.propertyType === PropertyType.PROPERTY) continue;

            if (targetType === "Fill" && prop.matchName === "ADBE Vector Graphic - Fill") {
                prop.property("ADBE Vector Fill Color").setValue(colorValue);
            } else if (targetType === "Stroke" && prop.matchName === "ADBE Vector Graphic - Stroke") {
                prop.property("ADBE Vector Stroke Color").setValue(colorValue);
            } else if (prop.propertyType === PropertyType.INDEXED_GROUP || prop.propertyType === PropertyType.NAMED_GROUP) {
                changeShapeColorRecursive(prop, colorValue, targetType);
            }
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

        var colorValue = hexToAeColor(colorHex);
        app.beginUndoGroup("LazyMotion: Apply " + targetType + " Color");
        try {
            for (var i = 0; i < layers.length; i++) {
                var layer = layers[i];
                if (layer instanceof ShapeLayer) {
                    changeShapeColorRecursive(layer.property("ADBE Root Vectors Group"), colorValue, targetType);
                } else if (layer instanceof TextLayer && targetType === "Fill") {
                    var sourceText = layer.property("Source Text");
                    if (sourceText) {
                        var textDoc = sourceText.value;
                        textDoc.fillColor = [colorValue[0], colorValue[1], colorValue[2]];
                        sourceText.setValue(textDoc);
                    }
                } else if (layer instanceof SolidSource || (layer.source && layer.source instanceof SolidSource)) {
                    if (targetType === "Fill") {
                        var fillEffect = layer.property("ADBE Effect Parade").property("ADBE Fill");
                        if (!fillEffect) fillEffect = layer.property("ADBE Effect Parade").addProperty("ADBE Fill");
                        fillEffect.property("ADBE Fill-0002").setValue(colorValue);
                    }
                }
            }
        } catch (e) {
            alert("Color Apply Error: " + e.toString());
        } finally {
            app.endUndoGroup();
        }
    }

    // ============================================================
    // 3. Smart Precomp Engines (Individual & Group Combined)
    // ============================================================
    function getMaskBounds(layer) {
        var masks = layer.property("Masks");
        if (!masks || masks.numProperties === 0) return null;
        var minX = 999999999, minY = 999999999, maxX = -999999999, maxY = -999999999;
        var found = false;

        for (var i = 1; i <= masks.numProperties; i++) {
            var mask = masks.property(i);
            if (!mask.enabled || mask.maskMode === MaskMode.NONE) continue;
            try {
                var shape = mask.property("maskShape").value;
                var feather = mask.property("maskFeather").value;
                var verts = shape.vertices;
                for (var v = 0; v < verts.length; v++) {
                    minX = Math.min(minX, verts[v][0] - feather[0]);
                    minY = Math.min(minY, verts[v][1] - feather[1]);
                    maxX = Math.max(maxX, verts[v][0] + feather[0]);
                    maxY = Math.max(maxY, verts[v][1] + feather[1]);
                    found = true;
                }
            } catch (err) {}
        }
        return found ? { x: Math.floor(minX), y: Math.floor(minY), width: Math.ceil(maxX - minX), height: Math.ceil(maxY - minY) } : null;
    }

    function executeIndividualPrecomp() {
        var comp = app.project.activeItem;
        if (!(comp instanceof CompItem) || comp.selectedLayers.length === 0) {
            alert("Please select at least one layer to precompose.");
            return;
        }

        app.beginUndoGroup("LazyMotion: Individual Precomp");
        try {
            var layers = comp.selectedLayers;
            var anchorTime = comp.time;

            for (var i = layers.length - 1; i >= 0; i--) {
                var layer = layers[i];
                if (layer.threeDLayer) continue;

                var oldPos = layer.property("Position").value;
                var oldScale = layer.property("Scale").value;
                var oldRot = layer.property("Rotation").value;
                var oldAnchor = layer.property("Anchor Point").value;
                var oldIn = layer.inPoint;
                var oldOut = layer.outPoint;
                var oldStartTime = layer.startTime;

                var srcW = layer.source ? layer.source.width : layer.width;
                var srcH = layer.source ? layer.source.height : layer.height;
                var maskBounds = getMaskBounds(layer);

                var cropX = maskBounds ? maskBounds.x : 0;
                var cropY = maskBounds ? maskBounds.y : 0;
                var cropW = Math.max(4, maskBounds ? maskBounds.width : srcW);
                var cropH = Math.max(4, maskBounds ? maskBounds.height : srcH);

                var finalAnchorTime = (anchorTime >= oldOut) ? oldIn : anchorTime;
                var precompDuration = Math.max(oldOut - finalAnchorTime, 1 / comp.frameRate);

                var layerIndex = layer.index;
                var precomp = comp.layers.precompose([layerIndex], layer.name + "_PC", true);
                var preLayer = comp.layer(layerIndex);

                precomp.duration = precompDuration;
                precomp.width = cropW;
                precomp.height = cropH;

                var innerLayer = precomp.layer(1);

                while (innerLayer.property("Scale").numKeys > 0) innerLayer.property("Scale").removeKey(1);
                innerLayer.property("Scale").setValue([100, 100]);

                while (innerLayer.property("Rotation").numKeys > 0) innerLayer.property("Rotation").removeKey(1);
                innerLayer.property("Rotation").setValue(0);

                while (innerLayer.property("Position").numKeys > 0) innerLayer.property("Position").removeKey(1);
                innerLayer.property("Position").setValue([oldAnchor[0] - cropX, oldAnchor[1] - cropY]);

                innerLayer.startTime = oldStartTime - finalAnchorTime;
                innerLayer.inPoint = 0;

                preLayer.property("Position").setValue(oldPos);
                preLayer.property("Scale").setValue(oldScale);
                preLayer.property("Rotation").setValue(oldRot);
                preLayer.property("Anchor Point").setValue([oldAnchor[0] - cropX, oldAnchor[1] - cropY]);
                preLayer.startTime = finalAnchorTime;
                preLayer.inPoint = finalAnchorTime;
                preLayer.outPoint = oldOut;
            }
        } catch (err) {
            alert("Individual Precomp Error:\n" + err.toString());
        } finally {
            app.endUndoGroup();
        }
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

        app.beginUndoGroup("LazyMotion: Group Precomp");
        try {
            var layerIndices = [];
            var minIn = 99999999;
            var maxOut = -99999999;
            var topName = layers[0].name;

            for (var i = 0; i < layers.length; i++) {
                layerIndices.push(layers[i].index);
                if (layers[i].inPoint < minIn) minIn = layers[i].inPoint;
                if (layers[i].outPoint > maxOut) maxOut = layers[i].outPoint;
            }

            var precompName = topName + "_Group_PC";
            var precomp = comp.layers.precompose(layerIndices, precompName, true);
            
            var preLayer = comp.selectedLayers[0];
            if (preLayer) {
                preLayer.inPoint = minIn;
                preLayer.outPoint = maxOut;
            }
        } catch (err) {
            alert("Group Precomp Error:\n" + err.toString());
        } finally {
            app.endUndoGroup();
        }
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
        if (selectedLayers.length === 0 || !(selectedLayers[0] instanceof TextLayer)) {
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
        "ease = function(t){ return t; };",
        "ease = function(t){ return (t==0)?0:Math.pow(2, 10*(t-1)); };",
        "ease = function(t){ return Math.sin((t * Math.PI)/2); };",
        "ease = function(t){ return t<0.5 ? 2*t*t : -1+(4-2*t)*t; };",
        "ease = function(t){ return t<0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3)/2; };",
        "ease = function(t){ var s=7.5625, p=2.75, l; if(t<1/p){l=s*t*t;} else if(t<2/p){t-=1.5/p;l=s*t*t+0.75;} else if(t<2.5/p){t-=2.25/p;l=s*t*t+0.9375;} else{t-=2.625/p;l=s*t*t+0.984375;} return l; };",
        "ease = function(t){ var c4 = (2 * Math.PI) / 3; return t === 0 ? 0 : t === 1 ? 1 : -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * c4); };"
    ];

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

        app.beginUndoGroup("LazyMotion: Apply Fade Tools");
        try {
            for (var i = 0; i < selectedLayers.length; i++) {
                var layer = selectedLayers[i];
                var opacityProp = layer.property("ADBE Transform Group").property("ADBE Opacity");

                var expression =
                    easingFuncs[easeType] + "\n" +
                    "fadeDuration = " + (fadeDuration * fadeSpeed) + ";\n" +
                    "t = time;\n" +
                    "d = framesToTime(fadeDuration);\n" +
                    "fadeIn = ease((t - inPoint)/d)*100;\n" +
                    "fadeOut = ease((outPoint - t)/d)*100;\n" +
                    "if (t < inPoint + d) {\n" +
                    (applyFadeIn ? "fadeIn;\n" : "100;\n") +
                    "} else if (t > outPoint - d) {\n" +
                    (applyFadeOut ? "fadeOut;\n" : "100;\n") +
                    "} else { 100; }";

                opacityProp.expression = expression;

                if (addMarkers) {
                    if (applyFadeIn) layer.property("Marker").setValueAtTime(layer.inPoint, new MarkerValue("fade in"));
                    if (applyFadeOut) layer.property("Marker").setValueAtTime(layer.outPoint, new MarkerValue("fade out"));
                }
            }
        } catch (e) {
            alert("Fade Apply Error: " + e.toString());
        } finally {
            app.endUndoGroup();
        }
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

        app.beginUndoGroup("LazyMotion: Delete Fade Effects");
        try {
            for (var i = 0; i < selectedLayers.length; i++) {
                var layer = selectedLayers[i];
                var opacityProp = layer.property("ADBE Transform Group").property("ADBE Opacity");
                opacityProp.expression = "";

                var markers = layer.property("Marker");
                for (var j = markers.numKeys; j >= 1; j--) {
                    markers.removeKey(j);
                }
            }
        } finally {
            app.endUndoGroup();
        }
    }

    // ============================================================
    // 6. 9-Point Anchor Point Aligner
    // ============================================================
    function alignAnchorPoint(xRatio, yRatio) {
        var comp = app.project.activeItem;
        if (!comp || !(comp instanceof CompItem)) return;
        var layers = comp.selectedLayers;
        if (layers.length === 0) return;

        app.beginUndoGroup("LazyMotion: Align Anchor Point");
        try {
            for (var i = 0; i < layers.length; i++) {
                var layer = layers[i];
                if (layer.threeDLayer) continue;

                var r = layer.sourceRectAtTime(comp.time, false);
                var newAnchor = [r.left + r.width * xRatio, r.top + r.height * yRatio];
                var curAnchor = layer.property("Anchor Point").value;
                var curPos = layer.property("Position").value;
                var scale = layer.property("Scale").value;
                var rot = layer.property("Rotation").value;

                var diffX = (newAnchor[0] - curAnchor[0]) * (scale[0] / 100);
                var diffY = (newAnchor[1] - curAnchor[1]) * (scale[1] / 100);

                var rad = rot * Math.PI / 180;
                var compDiffX = diffX * Math.cos(rad) - diffY * Math.sin(rad);
                var compDiffY = diffX * Math.sin(rad) + diffY * Math.cos(rad);

                layer.property("Anchor Point").setValue(newAnchor);
                layer.property("Position").setValue([curPos[0] + compDiffX, curPos[1] + compDiffY, (curPos[2] || 0)]);
            }
        } catch (e) {
            alert("Anchor Align Error: " + e.toString());
        } finally {
            app.endUndoGroup();
        }
    }

    function centerInComp() {
        var comp = app.project.activeItem;
        if (!comp || !(comp instanceof CompItem)) return;
        var layers = comp.selectedLayers;
        if (layers.length === 0) return;

        app.beginUndoGroup("LazyMotion: Center In Comp");
        try {
            for (var i = 0; i < layers.length; i++) {
                layers[i].property("Position").setValue([comp.width / 2, comp.height / 2, 0]);
            }
        } finally {
            app.endUndoGroup();
        }
    }

    // ============================================================
    // 7. Grid Designer Dialog
    // ============================================================
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
            var cols = Math.max(1, parseInt(editCols.text) || 1);
            var rows = Math.max(1, parseInt(editRows.text) || 1);
            var gutX = Math.max(0, parseInt(editGutX.text) || 0);
            var gutY = Math.max(0, parseInt(editGutY.text) || 0);
            var marX = Math.max(0, parseInt(editMarX.text) || 0);
            var marY = Math.max(0, parseInt(editMarY.text) || 0);
            var outType = outDropdown.selection.index;

            var compW = comp.width;
            var compH = comp.height;

            var availW = compW - (marX * 2) - ((cols - 1) * gutX);
            var availH = compH - (marY * 2) - ((rows - 1) * gutY);
            var cellW = Math.max(1, availW / cols);
            var cellH = Math.max(1, availH / rows);

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
    // 8. Main ScriptUI Window / Panel Builder
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

        // ---- 2. Fade Tools Pro Panel ----
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
        btnDeleteFade.onClick = deleteFadeTools;

        // ---- 3. 9-Point Anchor Point Alignment ----
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

        // ---- 4. Live Color Swatches ----
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
        var footer = win.add("statictext", undefined, "Developed By RaisulSohan • raisulsohan.com");
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

    return buildToolkitUI(thisObj);
})(this);
