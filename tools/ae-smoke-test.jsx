/*
 * LazyMotionToolkit — smoke test inside the real After Effects (developer tool).
 *
 *   Close After Effects, then run (Windows):
 *   "C:\Program Files\Adobe\Adobe After Effects 2026\Support Files\AfterFX.com" -noui -r "<repo>\tools\ae-smoke-test.jsx"
 *
 * Needs Preferences > Scripting & Expressions > "Allow Scripts to Write Files".
 * It builds a throwaway project, runs the toolkit's engine on real layers,
 * measures where pixels land with After Effects' own expression engine
 * (toComp), writes the results to %TEMP%\lazymotion-smoke-results.txt, closes
 * the project WITHOUT saving and quits After Effects. It never opens or saves
 * any of your projects.
 */
(function () {
    var lines = [];
    var failures = 0;
    var out = new File(Folder.temp.fsName + "/lazymotion-smoke-results.txt");

    function flush(done) {
        out.encoding = "UTF-8";
        out.open("w");
        out.write(lines.join("\n") + "\n" + (done ? "DONE " + (failures ? "FAILED " + failures : "ALL PASSED") : "RUNNING") + "\n");
        out.close();
    }
    function check(name, ok, detail) {
        if (!ok) failures++;
        lines.push((ok ? "PASS " : "FAIL ") + name + (detail !== undefined ? "  [" + detail + "]" : ""));
        flush(false);
    }
    function near(a, b, tol) { return Math.abs(a - b) <= (tol === undefined ? 0.01 : tol); }
    function section(name, fn) {
        lines.push("step: " + name);
        flush(false);
        try { fn(); } catch (e) { check(name + " threw", false, e.toString() + " (line " + e.line + ")"); }
    }

    // A probe: a Point Control whose expression asks After Effects where a
    // layer-space point lands in the comp.
    var probeLayer = null;
    function probe(comp, layer, point, time) {
        var ctrl = probeLayer.property("ADBE Effect Parade").property(1).property(1);
        ctrl.expression = "thisComp.layer(" + layer.index + ").toComp([" + point[0] + "," + point[1] + "])";
        var v = ctrl.valueAtTime(time, false);
        if (ctrl.expressionError) throw new Error("probe expression: " + ctrl.expressionError);
        return v;
    }

    try {
        app.beginSuppressDialogs();
        lines.push("After Effects " + app.version);
        flush(false);

        $.global.LazyMotionToolkitTest = {};
        $.evalFile(new File(new File($.fileName).parent.parent.fsName + "/LazyMotionToolkit.jsx"));
        var api = $.global.LazyMotionToolkitTest.api;
        check("toolkit loaded (engine returned, no panel)", !!api, api ? api.version : "");

        // A fresh After Effects starts with an empty untitled project; closing
        // it without a UI ends the app, so it is used as it is.
        lines.push("step: project (" + (app.project ? app.project.numItems + " items" : "none") + ")");
        flush(false);
        if (!app.project || app.project.numItems > 0 || app.project.file) {
            check("an empty untitled project to work in", false, "After Effects opened a project; not touching it");
            throw new Error("not an empty project");
        }
        var comp = app.project.items.addComp("Smoke", 1920, 1080, 1, 10, 25);
        lines.push("step: comp made");
        flush(false);
        comp.time = 2;
        probeLayer = comp.layers.addNull(10);
        probeLayer.name = "Probe";
        probeLayer.property("ADBE Effect Parade").addProperty("ADBE Point Control");

        section("mask bounds", function () {
            var solid = comp.layers.addSolid([0.2, 0.4, 0.6], "Masked", 1000, 800, 1, 10);
            var mask = solid.property("ADBE Mask Parade").addProperty("ADBE Mask Atom");
            var shape = new Shape();
            shape.vertices = [[100, 100], [300, 100], [300, 400], [100, 400]];
            shape.inTangents = [[0, 0], [0, 0], [0, 0], [0, 0]];
            shape.outTangents = [[0, -60], [0, 0], [0, 0], [0, 0]];
            shape.closed = true;
            mask.property("ADBE Mask Shape").setValue(shape);
            mask.property("ADBE Mask Feather").setValue([10, 10]);
            var b = api.getMaskBounds(solid);
            check("mask bounds: handle, feather counted", b && b.x === 90 && b.y === 30 && b.width === 220 && b.height === 380,
                b ? [b.x, b.y, b.width, b.height].join(",") : "null");
            mask.inverted = true;
            check("mask bounds: inverted is no crop", api.getMaskBounds(solid) === null);
            solid.remove();
        });

        section("precomp leave attributes + crop", function () {
            var solid = comp.layers.addSolid([0.8, 0.3, 0.1], "Clip", 1000, 800, 1, 10);
            var t = solid.property("ADBE Transform Group");
            t.property("ADBE Scale").setValue([80, 120, 100]);
            t.property("ADBE Rotate Z").setValue(25);
            t.property("ADBE Anchor Point").setValueAtTime(0, [500, 400, 0]);
            t.property("ADBE Anchor Point").setValueAtTime(4, [540, 420, 0]);
            t.property("ADBE Position").setValueAtTime(0, [700, 400, 0]);
            t.property("ADBE Position").setValueAtTime(4, [900, 600, 0]);
            var mask = solid.property("ADBE Mask Parade").addProperty("ADBE Mask Atom");
            var s1 = new Shape();
            s1.vertices = [[200, 150], [700, 150], [700, 550], [200, 550]];
            s1.closed = true;
            var s2 = new Shape();
            s2.vertices = [[220, 170], [680, 170], [680, 530], [220, 530]];
            s2.closed = true;
            mask.property("ADBE Mask Shape").setValueAtTime(0, s1);
            mask.property("ADBE Mask Shape").setValueAtTime(3, s2);
            var ramp = solid.property("ADBE Effect Parade").addProperty("ADBE Ramp");
            ramp.property("ADBE Ramp-0001").setValue([450, 350]);

            var pts = [[250, 200], [650, 500]];
            var times = [0, 1.3, 4];
            var before = [];
            for (var p = 0; p < pts.length; p++) for (var q = 0; q < times.length; q++) before.push(probe(comp, solid, pts[p], times[q]));

            var skipped = api.precomposeEach(comp, [solid]);
            check("leave attributes: nothing skipped", skipped.length === 0, skipped.join(" / "));
            var pc = solid.source;
            check("leave attributes: same layer now shows a precomp", pc instanceof CompItem, pc ? pc.typeName : "");
            check("crop: precomp sized to the mask over time", pc.width === 500 && pc.height === 400, pc.width + "x" + pc.height);
            var rampPoint = ramp.property("ADBE Ramp-0001").value;
            check("crop: effect point moved with the crop", near(rampPoint[0], 250) && near(rampPoint[1], 200), rampPoint.join(","));
            check("crop: layer still keyframed", t.property("ADBE Anchor Point").numKeys === 2 && t.property("ADBE Position").numKeys === 2);

            var worst = 0, i = 0;
            for (var p2 = 0; p2 < pts.length; p2++) {
                for (var q2 = 0; q2 < times.length; q2++) {
                    var a = probe(comp, solid, [pts[p2][0] - 200, pts[p2][1] - 150], times[q2]);
                    worst = Math.max(worst, Math.abs(a[0] - before[i][0]), Math.abs(a[1] - before[i][1]));
                    i++;
                }
            }
            check("crop: no pixel moves on screen at any time", worst < 0.01, "off by " + worst);
            solid.remove();
        });

        section("precomp shape/text move attributes", function () {
            var text = comp.layers.addText("Title");
            text.inPoint = 1.5;
            text.outPoint = 6;
            var shape = comp.layers.addShape();
            shape.name = "Kid";
            shape.parent = text;
            var skipped = api.precomposeEach(comp, [text, shape]);
            var outer = null;
            for (var i = 1; i <= comp.numLayers; i++) if (comp.layer(i).name === "Title_PC") outer = comp.layer(i);
            check("text precomp: made", !!outer);
            check("text precomp: keeps in/out", outer && near(outer.inPoint, 1.5) && near(outer.outPoint, 6),
                outer ? outer.inPoint + "-" + outer.outPoint : "");
            check("parented shape: skipped with a reason", skipped.length === 1 && skipped[0].indexOf("Kid (parented") === 0, skipped.join(" / "));
            if (outer) outer.remove();
            for (var j = comp.numLayers; j >= 1; j--) if (comp.layer(j).name === "Kid") comp.layer(j).remove();
        });

        section("group precomp 3D", function () {
            var a = comp.layers.addSolid([1, 1, 1], "A3D", 200, 200, 1, 10);
            var b = comp.layers.addSolid([1, 1, 1], "B2D", 200, 200, 1, 10);
            a.threeDLayer = true;
            var problem = api.precomposeGroup(comp, [a, b]);
            check("group: no problem reported", problem === "", problem);
            var outer = comp.layer(1).name === "A3D_Group_PC" ? comp.layer(1) : comp.layer(2);
            check("group: 3D inside collapses", outer.collapseTransformation === true, outer.name);
            outer.remove();
        });

        section("fade", function () {
            var solid = comp.layers.addSolid([1, 1, 1], "Fader", 100, 100, 1, 4);
            solid.startTime = 0;
            solid.inPoint = 0;
            solid.outPoint = 4; // a new solid spans the comp, whatever duration it was made with
            var op = solid.property("ADBE Transform Group").property("ADBE Opacity");
            op.setValue(60);
            for (var e = 0; e < api.easingFuncs.length; e++) {
                api.fadeLayers([solid], 10, 1, e, true, true, false);
                var lo = 1e9, hi = -1e9;
                for (var f = 0; f < 100; f++) {
                    var v = op.valueAtTime(f / 25, false);
                    lo = Math.min(lo, v); hi = Math.max(hi, v);
                }
                check("fade ease " + e + ": expression runs, stays 0..60", !op.expressionError && lo >= -0.001 && hi <= 60.001,
                    (op.expressionError || "") + " " + lo + ".." + hi);
            }
            var skipped = api.fadeLayers([solid], 10, 1, 0, true, true, true);
            check("fade: applied", skipped.length === 0, skipped.join(" / "));
            check("fade: first frame 0", near(op.valueAtTime(0, false), 0));
            check("fade: half way in", near(op.valueAtTime(0.2, false), 30), op.valueAtTime(0.2, false));
            check("fade: own opacity kept", near(op.valueAtTime(2, false), 60));
            check("fade: last frame 0", near(op.valueAtTime(4 - 1 / 25, false), 0), op.valueAtTime(4 - 1 / 25, false));
            api.fadeLayers([solid], 10, 2, 0, true, true, true);
            check("fade speed 2: full after 5 frames", near(op.valueAtTime(0.2, false), 60), op.valueAtTime(0.2, false));
            var markers = solid.property("ADBE Marker");
            check("fade markers: not duplicated", markers.numKeys === 2, markers.numKeys);
            markers.setValueAtTime(1, new MarkerValue("intro"));
            var kept = api.clearFades([solid]);
            check("clear: expression removed", op.expression === "" && kept.length === 0);
            check("clear: only fade markers removed", markers.numKeys === 1 && markers.keyValue(1).comment === "intro", markers.numKeys);
            solid.remove();
        });

        section("anchor + center", function () {
            var text = comp.layers.addText("Anchor me");
            var t = text.property("ADBE Transform Group");
            t.property("ADBE Scale").setValue([50, 200, 100]);
            t.property("ADBE Rotate Z").setValue(30);
            t.property("ADBE Position").setValue([500, 300, 0]);
            var before = probe(comp, text, [37, -12], 2);
            var skipped = api.alignAnchors(comp, [text], 0, 0);
            var r = text.sourceRectAtTime(2, false);
            var anchor = t.property("ADBE Anchor Point").value;
            check("anchor: at content top-left", skipped.length === 0 && near(anchor[0], r.left) && near(anchor[1], r.top), anchor.join(","));
            var after = probe(comp, text, [37, -12], 2);
            check("anchor: text did not move", near(after[0], before[0]) && near(after[1], before[1]), before.join(",") + " -> " + after.join(","));

            var split = comp.layers.addSolid([1, 0, 0], "Split", 50, 80, 1, 10);
            split.property("ADBE Transform Group").property("ADBE Position").dimensionsSeparated = true;
            var sBefore = probe(comp, split, [5, 5], 2);
            api.alignAnchors(comp, [split], 1, 1);
            var sAfter = probe(comp, split, [5, 5], 2);
            check("anchor, split position: did not move", near(sAfter[0], sBefore[0]) && near(sAfter[1], sBefore[1]), sBefore.join(",") + " -> " + sAfter.join(","));

            var card = comp.layers.addSolid([0, 1, 0], "Card", 400, 200, 1, 10);
            var ct = card.property("ADBE Transform Group");
            ct.property("ADBE Position").setValue([100, 100, 0]);
            ct.property("ADBE Scale").setValue([150, 150, 100]);
            ct.property("ADBE Rotate Z").setValue(10);
            api.centerLayers(comp, [card]);
            var centre = probe(comp, card, [200, 100], 2);
            check("center: content centre at comp centre", near(centre[0], 960) && near(centre[1], 540), centre.join(","));
            text.remove(); split.remove(); card.remove();
        });

        section("swatches", function () {
            var shape = comp.layers.addShape();
            var group = shape.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group");
            group.property("ADBE Vectors Group").addProperty("ADBE Vector Shape - Rect");
            var fill = group.property("ADBE Vectors Group").addProperty("ADBE Vector Graphic - Fill");
            var text = comp.layers.addText("Colour me");
            var st = text.property("ADBE Text Properties").property("ADBE Text Document");
            st.setValueAtTime(0, st.value);
            var solid = comp.layers.addSolid([0, 0, 0], "BG", 100, 100, 1, 10);
            var nul = comp.layers.addNull(10);

            var skipped = api.colorLayers(comp, [shape, text, solid, nul], "#FF8000", "Fill");
            var c = fill.property("ADBE Vector Fill Color").value;
            check("swatch: shape fill", near(c[0], 1) && near(c[1], 128 / 255, 0.002) && near(c[2], 0), c.join(","));
            check("swatch: keyframed text got a keyframe", st.numKeys === 2, st.numKeys);
            check("swatch: text fill colour", near(st.keyValue(2).fillColor[0], 1), st.keyValue(2).fillColor.join(","));
            var fx = solid.property("ADBE Effect Parade").property("ADBE Fill");
            check("swatch: solid got a Fill effect", !!fx && near(fx.property("ADBE Fill-0002").value[1], 128 / 255, 0.002));
            check("swatch: null skipped with a reason", skipped.length === 1 && skipped[0].indexOf(nul.name) === 0, skipped.join(" / "));

            var skipped2 = api.colorLayers(comp, [text], "#00FF00", "Stroke");
            var doc = st.valueAtTime(comp.time, false);
            check("swatch: text stroke on and visible", skipped2.length === 0 && doc.applyStroke && doc.strokeWidth > 0 && near(doc.strokeColor[1], 1),
                doc.applyStroke + " " + doc.strokeWidth);
        });
    } catch (fatal) {
        check("smoke test stopped", false, fatal.toString() + " (line " + fatal.line + ")");
    }

    flush(true);
    // Nothing was saved; the untitled project is thrown away with the app.
    try { app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES); } catch (eClose) {}
    try { app.quit(); } catch (eQuit) {}
})();
