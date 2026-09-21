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
        // A previous headless run can leave After Effects reopening a recovered
        // untitled project. That is never saved work, so it is thrown away and a
        // fresh one started. Anything with a file on disk is left alone.
        if (!app.project) {
            check("a project to work in", false, "no project");
            throw new Error("no project");
        }
        if (app.project.file) {
            check("no saved project of yours is open", false, app.project.file.fsName + " is open; not touching it");
            throw new Error("a saved project is open");
        }
        if (app.project.numItems > 0) {
            lines.push("note: discarding a recovered untitled project (" + app.project.numItems + " items)");
            flush(false);
            app.newProject();
        }
        check("an empty untitled project to work in", app.project.numItems === 0, app.project.numItems);
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

        section("stagger", function () {
            var made = [];
            for (var s = 0; s < 4; s++) {
                var L = comp.layers.addSolid([0.3, 0.3, 0.3], "Step " + s, 100, 100, 1, 4);
                L.startTime = 1;
                made.push(L);
            }
            // Handed over in the wrong order on purpose: the engine sorts by
            // where the layers sit in the timeline, not by how they were picked.
            var res = api.staggerLayers(comp, [made[2], made[0], made[3], made[1]], 5, false);
            check("stagger: every layer moved", res.moved.length === 4, res.moved.join(","));
            check("stagger: nothing skipped", res.skipped.length === 0, res.skipped.join(" | "));
            var fd = 1 / comp.frameRate;
            var starts = [];
            for (var m = 0; m < made.length; m++) starts.push(Math.round((made[m].startTime - 1) / fd));
            // made[0] is the topmost layer: each addSolid went in above the last.
            check("stagger: top layer stayed put, the rest stepped 5 frames each",
                starts[0] === 15 && starts[1] === 10 && starts[2] === 5 && starts[3] === 0, starts.join(","));

            var res2 = api.staggerLayers(comp, made, -5, false);
            var back = [];
            for (var b = 0; b < made.length; b++) back.push(Math.round((made[b].startTime - 1) / fd));
            check("stagger: a negative step closes it up again", back.join(",") === "0,0,0,0", back.join(","));

            api.staggerLayers(comp, made, 5, true);
            var rev = [];
            for (var r = 0; r < made.length; r++) rev.push(Math.round((made[r].startTime - 1) / fd));
            check("stagger: reverse starts from the bottom layer", rev.join(",") === "0,5,10,15", rev.join(","));

            made[1].locked = true;
            var res3 = api.staggerLayers(comp, made, 5, false);
            check("stagger: a locked layer is skipped with a reason", res3.skipped.length === 1, res3.skipped.join(" | "));
            made[1].locked = false;
            for (var d = 0; d < made.length; d++) made[d].remove();
        });

        section("stagger: layers vs keyframes", function () {
            function keyed(name) {
                var L = comp.layers.addSolid([0.4, 0.2, 0.6], name, 100, 100, 1, 10);
                var op = L.property("ADBE Transform Group").property("ADBE Opacity");
                op.setValueAtTime(1, 0);
                op.setValueAtTime(2, 100);
                op.setTemporalEaseAtKey(2, [new KeyframeEase(0, 66)], [new KeyframeEase(0, 66)]);
                return L;
            }
            var fd = 1 / comp.frameRate;

            // Layer mode: the bar moves and the keys ride along with it, because
            // a keyframe's time is stored against the layer's own start.
            var a1 = keyed("K1"), a2 = keyed("K2");
            api.staggerLayers(comp, [a1, a2], 10, false);
            var top = (a1.index < a2.index) ? a1 : a2;
            var low = (a1.index < a2.index) ? a2 : a1;
            check("stagger layer mode: the lower layer's bar moved 10 frames",
                Math.round((low.startTime) / fd) === 10, Math.round(low.startTime / fd));
            check("stagger layer mode: its keyframes went with it",
                Math.round(low.property("ADBE Transform Group").property("ADBE Opacity").keyTime(1) / fd) === 35,
                Math.round(low.property("ADBE Transform Group").property("ADBE Opacity").keyTime(1) / fd));
            check("stagger layer mode: the top layer did not move",
                top.startTime === 0 &&
                Math.round(top.property("ADBE Transform Group").property("ADBE Opacity").keyTime(1) / fd) === 25);
            a1.remove(); a2.remove();

            // Keys-only mode: the bars stay put and only the animation cascades.
            var b1 = keyed("K3"), b2 = keyed("K4");
            var res = api.staggerLayers(comp, [b1, b2], 10, false, true);
            check("stagger keys mode: nothing skipped", res.skipped.length === 0, res.skipped.join(" | "));
            var topB = (b1.index < b2.index) ? b1 : b2;
            var lowB = (b1.index < b2.index) ? b2 : b1;
            var lowOp = lowB.property("ADBE Transform Group").property("ADBE Opacity");
            check("stagger keys mode: the bar stayed where it was", lowB.startTime === 0, lowB.startTime);
            check("stagger keys mode: both keys moved 10 frames",
                Math.round(lowOp.keyTime(1) / fd) === 35 && Math.round(lowOp.keyTime(2) / fd) === 60,
                Math.round(lowOp.keyTime(1) / fd) + "," + Math.round(lowOp.keyTime(2) / fd));
            check("stagger keys mode: the values came through",
                lowOp.keyValue(1) === 0 && lowOp.keyValue(2) === 100,
                lowOp.keyValue(1) + "," + lowOp.keyValue(2));
            check("stagger keys mode: the easing survived the move",
                Math.round(lowOp.keyInTemporalEase(2)[0].influence) === 66,
                lowOp.keyInTemporalEase(2)[0].influence);
            check("stagger keys mode: the top layer was left alone",
                Math.round(topB.property("ADBE Transform Group").property("ADBE Opacity").keyTime(1) / fd) === 25);

            // And a layer with no keyframes at all says so rather than pretending.
            // It has to sit below another layer: the topmost one sets the beat
            // and is never moved, so it would never be reported either way.
            var plain = comp.layers.addSolid([0.2, 0.2, 0.2], "NoKeys", 100, 100, 1, 10);
            var onTop = keyed("K5");
            check("stagger keys mode: the keyless layer really is the lower one",
                onTop.index < plain.index, onTop.index + " / " + plain.index);
            var res2 = api.staggerLayers(comp, [onTop, plain], 10, false, true);
            check("stagger keys mode: a layer without keyframes is reported",
                res2.skipped.length === 1, res2.skipped.join(" | "));
            onTop.remove(); plain.remove(); b1.remove(); b2.remove();
        });

        section("null + parent", function () {
            var a = comp.layers.addSolid([0.2, 0.5, 0.8], "A", 100, 100, 1, 5);
            a.property("ADBE Transform Group").property("ADBE Position").setValue([400, 300]);
            var b = comp.layers.addSolid([0.8, 0.5, 0.2], "B", 100, 100, 1, 5);
            b.property("ADBE Transform Group").property("ADBE Position").setValue([600, 500]);
            var res = api.nullParentLayers(comp, [a, b]);
            check("null: made and named", res.nullName !== "", res.nullName);
            check("null: both layers parented", res.parented.length === 2, res.parented.join(","));
            var nul = null;
            for (var i = 1; i <= comp.numLayers; i++) {
                if (comp.layer(i).name === res.nullName) nul = comp.layer(i);
            }
            check("null: it exists", !!nul);
            if (nul) {
                check("null: on top of the stack", nul.index === 1, nul.index);
                var p = nul.property("ADBE Transform Group").property("ADBE Position").value;
                check("null: centred on the selection", near(p[0], 500) && near(p[1], 400), p.join(","));
                check("null: both layers hang off it",
                    a.parent !== null && a.parent.index === nul.index &&
                    b.parent !== null && b.parent.index === nul.index);
                check("null: the layers did not move",
                    near(probe(comp, a, [50, 50], 2)[0], 400) && near(probe(comp, b, [50, 50], 2)[0], 600));
            }

            // A layer already hanging off another selected layer keeps its parent.
            var c = comp.layers.addSolid([0.5, 0.5, 0.5], "C", 100, 100, 1, 5);
            c.parent = b;
            var res2 = api.nullParentLayers(comp, [b, c]);
            check("null: a layer that already follows a selected parent is left alone",
                res2.parented.length === 1 && res2.skipped.length === 1, res2.parented.join(",") + " | " + res2.skipped.join(" | "));
            check("null: it still follows its own parent", c.parent !== null && c.parent.index === b.index);
            check("null: the second null got its own name", res2.nullName !== res.nullName,
                res.nullName + " / " + res2.nullName);

            for (var k = comp.numLayers; k >= 1; k--) {
                var L = comp.layer(k);
                if (L.name === "A" || L.name === "B" || L.name === "C" ||
                    L.name === res.nullName || L.name === res2.nullName) L.remove();
            }
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
        section("LazyStrike FX", function () {
            var sc = app.project.items.addComp("Storm", 1280, 720, 1, 6, 25);
            sc.workAreaStart = 1;
            sc.workAreaDuration = 2;
            var opts = {
                duration: 10, strikes: 3, gap: 12, flickers: 3, boltColor: [0.75, 0.88, 1], flashColor: [1, 1, 1],
                boltInt: 0.75, flashInt: 0.8, random: 0.5, threshold: 10, gain: 12, decayFr: 0, minGapFr: 5,
                makeBolt: true, makeFlash: true, makeSky: true, makeAudio: false, fillWA: true, atTime: false, preComp: false
            };
            var r = api.generateLightning(sc, opts);
            check("lightning: made without error", !r.error && r.layers.length === 3 && sc.numLayers === 3, r.error || r.layers.length);
            var bolt = null;
            for (var i = 1; i <= sc.numLayers; i++) if (sc.layer(i).name === "LazyStrike Bolt") bolt = sc.layer(i);
            check("lightning: bolt layer in Add mode", bolt && bolt.blendingMode === BlendingMode.ADD);
            var fx = bolt.property("ADBE Effect Parade").property(api.LIGHTNING.effect);
            var forking = fx.property(api.LIGHTNING.forking).value;
            check("lightning: forking 40-80%", forking >= 0.4 && forking <= 0.8, forking);
            var core = fx.property(api.LIGHTNING.coreColor).value;
            check("lightning: core colour set", near(core[0], 0.75, 0.01) && near(core[2], 1, 0.01), core.join(","));
            var op = bolt.property("ADBE Transform Group").property("ADBE Opacity");
            check("lightning: opacity keyframed", op.numKeys > 10, op.numKeys);
            check("lightning: conductivity keyframed", fx.property(api.LIGHTNING.conductivity).numKeys >= 4);
            check("lightning: direction keyframed", fx.property(api.LIGHTNING.direction).numKeys >= 1);

            opts.preComp = true;
            opts.makeBolt = false;
            opts.makeFlash = false;
            var r2 = api.generateLightning(sc, opts);
            check("lightning: pre-compose leaves one layer", !r2.error && r2.layers.length === 1 && r2.layers[0].source instanceof CompItem, r2.error);

            // A 2 s mono WAV: silence with loud bursts at 0.5 s and 1.3 s.
            var rate = 22050;
            var n = rate * 2;
            function u16(v) { return String.fromCharCode(v & 255, (v >> 8) & 255); }
            function u32(v) { return String.fromCharCode(v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255); }
            var chunks = ["RIFF", u32(36 + n * 2), "WAVE", "fmt ", u32(16), u16(1), u16(1), u32(rate), u32(rate * 2), u16(2), u16(16), "data", u32(n * 2)];
            var block = [];
            for (var sIdx = 0; sIdx < n; sIdx++) {
                var t = sIdx / rate;
                var loud = (t > 0.5 && t < 0.62) || (t > 1.3 && t < 1.42);
                var sample = loud ? Math.round(Math.sin(2 * Math.PI * 440 * t) * 29000) : 0;
                if (sample < 0) sample += 65536;
                block.push(u16(sample));
                if (block.length === 4096) { chunks.push(block.join("")); block = []; }
            }
            chunks.push(block.join(""));
            var wav = new File(Folder.temp.fsName + "/lazystrike-thunder.wav");
            wav.encoding = "BINARY";
            wav.open("w");
            wav.write(chunks.join(""));
            wav.close();

            var ac = app.project.items.addComp("Thunder", 640, 360, 1, 3, 25);
            var audio = ac.layers.add(app.project.importFile(new ImportOptions(wav)));
            check("audio: WAV imported as audio", audio.hasAudio && !audio.hasVideo);
            // Audio-Driven runs the Convert Audio to Keyframes menu command, which
            // stops a UI-less (-noui) After Effects. It is covered by
            // tools/ae-ui-test-audio.jsx, run with the normal window.
            lines.push("note: audio-driven flash is tested by tools/ae-ui-test-audio.jsx (needs the After Effects UI)");
        });

        section("LazyPreview Render", function () {
            // A saved project in a folder with spaces and non-ASCII letters, a comp
            // name with % and &: the awkward cases for batch files.
            var dir = new Folder(Folder.temp.fsName + "/lazymotion smoke " + "পরীক্ষা");
            if (!dir.exists) dir.create();
            app.project.save(new File(dir.fsName + "/smoke.aep"));
            check("preview: project saved", !!app.project.file, dir.fsName);

            var pc = app.project.items.addComp("Preview 50% & Test", 320, 180, 1, 2, 25);
            pc.layers.addSolid([0.1, 0.5, 0.9], "BG", 320, 180, 1, 2);
            pc.workAreaStart = 0.4;
            pc.workAreaDuration = 0.8;
            app.project.save(); // aerender renders the saved file, as the panel's Render button does

            var aer = api.getAerenderPath();
            check("preview: aerender found", !!aer, aer);
            var template = api.findH264Template(api.outputTemplatesFor(pc));
            check("preview: H.264 template found", !!template, template);
            check("preview: render queue left empty", app.project.renderQueue.numItems === 0);

            var folder = new Folder(dir.fsName + "/AE_Previews");
            if (!folder.exists) folder.create();
            function job(token, comp, start, end) {
                return api.buildRenderJob({
                    windows: $.os.indexOf("Windows") !== -1, powershell: api.powershellPath(), dir: folder.fsName, token: token, aerender: aer,
                    project: app.project.file.fsName, compName: comp.name, template: template,
                    output: folder.fsName + "\\" + token + ".mp4", log: folder.fsName + "\\" + token + "-log.txt",
                    marker: folder.fsName + "\\" + token + ".done", startFrame: start, endFrame: end
                });
            }

            var token = api.previewStamp(new Date(), 0.1);
            var j = job(token, pc, 10, 29);
            api.writeTextFile(j.runFile, j.runBody, j.bom, j.lineFeed);
            // (The BOM itself can't be checked from here: ExtendScript skips it
            // when reading, in any mode. Checked from outside: EF BB BF.)
            var raw = new File(j.runFile);
            raw.encoding = "BINARY";
            var text = new File(j.runFile);
            text.encoding = "UTF-8";
            text.open("r");
            var content = text.read();
            text.close();
            check("preview script: Bengali folder name written intact", content.indexOf("পরীক্ষা") !== -1);
            raw.open("r");
            var allBytes = raw.read();
            raw.close();
            check("preview script: CRLF line endings", allBytes.indexOf("\r\n") !== -1 && allBytes.replace(/\r\n/g, "").indexOf("\n") === -1);
            var t0 = new Date().getTime();
            system.callSystem(j.runAndWait);
            var secs = Math.round((new Date().getTime() - t0) / 1000);
            var marker = new File(folder.fsName + "/" + token + ".done");
            var code = "";
            if (marker.exists) { marker.open("r"); code = marker.read().replace(/\s+/g, ""); marker.close(); }
            var mp4 = new File(folder.fsName + "/" + token + ".mp4");
            var logTail = "";
            if (!mp4.exists) {
                var lf = new File(folder.fsName + "/" + token + "-log.txt");
                if (lf.exists) { lf.encoding = "UTF-8"; lf.open("r"); logTail = lf.read(); lf.close(); logTail = logTail.substring(Math.max(0, logTail.length - 600)); }
            }
            check("preview: aerender rendered the work area (" + secs + " s)", code === "0" && mp4.exists && mp4.length > 0, "exit " + code + " " + logTail);

            if (mp4.exists) {
                var layer = api.placePreview(pc, mp4, pc.workAreaStart, pc.workAreaDuration);
                check("preview layer: on top, solo, named", pc.layer(1) === layer && layer.solo && layer.name === "[PREVIEW] preview");
                check("preview layer: spans the work area", near(layer.inPoint, 0.4) && near(layer.outPoint, 1.2), layer.inPoint + "-" + layer.outPoint);
                check("preview layer: footage in Lazy Preview Files", layer.source.parentFolder.name === "Lazy Preview Files", layer.source.parentFolder.name);
                check("preview layer: toggle off", api.togglePreviewLayer(pc) === false && !layer.enabled);
                api.togglePreviewLayer(pc);
                var footageId = layer.source.id;
                var removed = api.removePreviewLayer(pc);
                check("preview remove: layer gone", removed && !api.findPreviewLayer(pc));
                var footageLeft = false;
                for (var fi = 1; fi <= app.project.numItems; fi++) if (app.project.item(fi).id === footageId) footageLeft = true;
                check("preview remove: footage item gone", !footageLeft);
                var leftover = new File(folder.fsName + "/" + token + ".mp4");
                if (leftover.exists) {
                    // After Effects still holds the file it imported: it must be queued, not lost.
                    var queued = api.pendingPreviewDeletes().join("\n").indexOf(token + ".mp4") !== -1;
                    check("preview remove: file After Effects still holds is queued for deletion", queued);
                    app.purge(PurgeTarget.IMAGE_CACHES); // stands in for "later" (e.g. After Effects restarting)
                    check("preview remove: queued file deleted on the next try", api.deletePreviewFiles(null) === 0 && !leftover.exists);
                } else {
                    check("preview remove: rendered file deleted", true);
                }
            }

            // Cancel stops only this render: a long one, launched in the background.
            var big = app.project.items.addComp("Long render", 1920, 1080, 1, 30, 25);
            var heavy = big.layers.addSolid([0.5, 0.5, 0.5], "Noise", 1920, 1080, 1, 30);
            heavy.property("ADBE Effect Parade").addProperty("ADBE Fractal Noise");
            app.project.save();
            var token2 = api.previewStamp(new Date(), 0.9);
            var j2 = job(token2, big, 0, 749);
            api.writeTextFile(j2.runFile, j2.runBody, j2.bom, j2.lineFeed);
            var l0 = new Date().getTime();
            system.callSystem(j2.launch);
            var launchSecs = (new Date().getTime() - l0) / 1000;
            check("cancel test: launch returns while the render keeps going", launchSecs < 15, launchSecs + " s");
            var running = false;
            for (var w = 0; w < 60 && !running; w++) {
                $.sleep(1000);
                running = system.callSystem("tasklist /FI \"IMAGENAME eq aerender.exe\" /NH").indexOf("aerender.exe") !== -1;
            }
            check("cancel test: background aerender running", running);
            $.sleep(3000);
            system.callSystem(j2.cancel);
            var stopped = false;
            for (var w2 = 0; w2 < 20 && !stopped; w2++) {
                $.sleep(1000);
                stopped = system.callSystem("tasklist /FI \"IMAGENAME eq aerender.exe\" /NH").indexOf("aerender.exe") === -1;
            }
            check("cancel: aerender stopped", stopped);
            var marker2 = new File(folder.fsName + "/" + token2 + ".done");
            for (var w3 = 0; w3 < 15 && !marker2.exists; w3++) $.sleep(1000);
            var code2 = "";
            if (marker2.exists) { marker2.open("r"); code2 = marker2.read().replace(/\s+/g, ""); marker2.close(); }
            check("cancel: batch file still reported an exit code", marker2.exists && code2 !== "0", code2);
        });
    } catch (fatal) {
        check("smoke test stopped", false, fatal.toString() + " (line " + fatal.line + ")");
    }

    flush(true);
    // Nothing was saved; the untitled project is thrown away with the app.
    try { app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES); } catch (eClose) {}
    try { app.quit(); } catch (eQuit) {}
})();
