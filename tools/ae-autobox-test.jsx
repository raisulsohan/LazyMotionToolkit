/*
 * LazyMotionToolkit - Auto Box / LazyType rig test inside the real After Effects.
 *
 *   Close After Effects, then run (Windows):
 *   "C:\Program Files\Adobe\Adobe After Effects 2026\Support Files\AfterFX.com" -noui -r "<repo>\tools\ae-autobox-test.jsx"
 *
 * The Auto Box engine is the one part of the toolkit the mocked suite cannot
 * reach: it depends on real text measurement (sourceRectAtTime), on real
 * parenting, and on After Effects actually evaluating the expressions. This
 * builds the rig on real text layers and checks where the box lands, that no
 * expression was disabled, and that re-running replaces instead of stacking.
 * Results go to %TEMP%\lazymotion-autobox-results.txt. Nothing is saved.
 */
(function () {
    var lines = [];
    var failures = 0;
    var out = new File(Folder.temp.fsName + "/lazymotion-autobox-results.txt");

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
    function near(a, b, tol) { return Math.abs(a - b) <= (tol === undefined ? 1 : tol); }
    function section(name, fn) {
        lines.push("step: " + name);
        flush(false);
        try { fn(); } catch (e) { check(name + " threw", false, e.toString() + " (line " + e.line + ")"); }
    }

    // Walk every property of a layer, force each expression to evaluate, and
    // report the ones After Effects rejected or switched off.
    function expressionErrors(group, time, path, bag) {
        for (var i = 1; i <= group.numProperties; i++) {
            var p;
            try { p = group.property(i); } catch (eGet) { continue; }
            var here = path + " / " + p.name;
            if (p.propertyType !== PropertyType.PROPERTY) {
                expressionErrors(p, time, here, bag);
                continue;
            }
            try {
                if (!p.canSetExpression || p.expression === "") continue;
                try { p.valueAtTime(time, false); } catch (eEval) {}
                if (p.expressionError !== "") bag.push(here + ": " + p.expressionError);
                else if (!p.expressionEnabled) bag.push(here + ": expression disabled");
            } catch (eProp) {}
        }
        return bag;
    }

    function layerByName(comp, name) {
        for (var i = 1; i <= comp.numLayers; i++) {
            if (comp.layer(i).name === name) return comp.layer(i);
        }
        return null;
    }

    try {
        app.beginSuppressDialogs();
        lines.push("After Effects " + app.version);
        flush(false);

        $.global.LazyMotionToolkitTest = {};
        $.evalFile(new File(new File($.fileName).parent.parent.fsName + "/LazyMotionToolkit.jsx"));
        var api = $.global.LazyMotionToolkitTest.api;
        check("toolkit loaded (engine returned, no panel)", !!api, api ? api.version : "");
        check("Auto Box engine exported for testing", !!(api && api.autoBoxLayers));
        if (!api || !api.autoBoxLayers) throw new Error("no Auto Box engine");

        var BOX = api.BOX_TAG, MEAS = api.MEASURE_TAG;

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
        var comp = app.project.items.addComp("AutoBox", 1920, 1080, 1, 10, 25);
        comp.time = 0;

        function makeText(name, body, size) {
            var t = comp.layers.addText(body);
            t.name = name;
            var d = t.property("ADBE Text Properties").property("ADBE Text Document").value;
            d.resetCharStyle();
            d.fontSize = size || 80;
            t.property("ADBE Text Properties").property("ADBE Text Document").setValue(d);
            t.property("ADBE Transform Group").property("ADBE Position").setValue([500, 540]);
            return t;
        }

        section("rig on one text layer", function () {
            var txt = makeText("Headline", "Hello LazyType", 80);
            var res = api.autoBoxLayers(comp, [txt], {});
            check("engine reported one box made", res.made.length === 1, res.made.join(","));
            check("engine skipped nothing", res.skipped.length === 0, res.skipped.join(" | "));

            var box = layerByName(comp, "Headline" + BOX);
            var meas = layerByName(comp, "Headline" + MEAS);
            var text = layerByName(comp, "Headline");
            check("text layer kept its original name", !!text);
            check("box layer created", !!box);
            check("measure layer created", !!meas);
            if (!box || !meas || !text) return;

            check("box parented to the text layer", box.parent !== null && box.parent.index === text.index,
                box.parent ? box.parent.name : "none");
            check("measure parented to the text layer", meas.parent !== null && meas.parent.index === text.index,
                meas.parent ? meas.parent.name : "none");
            check("box sits directly below the text", box.index === text.index + 1,
                "text " + text.index + ", box " + box.index);
            check("measure layer is invisible (guide + opacity 0)",
                meas.guideLayer === true &&
                meas.property("ADBE Transform Group").property("ADBE Opacity").valueAtTime(5, false) === 0);

            var tr = box.property("ADBE Transform Group");
            var pos = tr.property("ADBE Position").value;
            var anc = tr.property("ADBE Anchor Point").value;
            check("box position is the parent origin", near(pos[0], 0, 0.01) && near(pos[1], 0, 0.01), pos.join(","));
            check("box anchor is zero", near(anc[0], 0, 0.01) && near(anc[1], 0, 0.01), anc.join(","));

            var reveal = text.property("ADBE Effect Parade").property(api.FX_REVEAL).property(1);
            check("reveal slider has a start and an end keyframe", reveal.numKeys === 2, reveal.numKeys);
            check("reveal starts at 0", near(reveal.keyValue(1), 0, 0.01), reveal.keyValue(1));
            check("reveal ends at 100", near(reveal.keyValue(2), 100, 0.01), reveal.keyValue(2));
            var endT = reveal.keyTime(2);

            var t = endT + 1;   // a second after the typing finished

            var bad = [];
            expressionErrors(box.property("ADBE Effect Parade"), t, "box effects", bad);
            expressionErrors(box.property("ADBE Root Vectors Group"), t, "box contents", bad);
            expressionErrors(box.property("ADBE Transform Group"), t, "box transform", bad);
            expressionErrors(meas.property("ADBE Text Properties"), t, "measure text", bad);
            expressionErrors(text.property("ADBE Text Properties"), t, "text animators", bad);
            check("no expression was rejected or switched off", bad.length === 0, bad.join(" | "));

            // Where the box actually lands, measured against the real text.
            var r = text.sourceRectAtTime(t, false);
            var rect = box.property("ADBE Effect Parade").property("Box Rect").property(1).valueAtTime(t, false);
            check("measured width matches the finished text", near(rect[0], r.width, 3), rect[0] + " vs " + r.width);
            check("measured height matches the finished text", near(rect[1], r.height, 3), rect[1] + " vs " + r.height);

            var aRect = box.property("ADBE Root Vectors Group").property("Auto Box")
                           .property("ADBE Vectors Group").property("ADBE Vector Shape - Rect");
            var size = aRect.property("ADBE Vector Rect Size").valueAtTime(t, false);
            var d = api.AUTOBOX_DEFAULTS;
            check("box is the text plus padding X", near(size[0], r.width + d.padX * 2, 3), size[0] + " vs " + (r.width + d.padX * 2));
            check("box is the text plus padding Y", near(size[1], r.height + d.padY * 2, 3), size[1] + " vs " + (r.height + d.padY * 2));

            var rpos = aRect.property("ADBE Vector Rect Position").valueAtTime(t, false);
            check("box is centred on the text horizontally", near(rpos[0], r.left + r.width / 2, 3),
                rpos[0] + " vs " + (r.left + r.width / 2));
            check("box is centred on the text vertically", near(rpos[1], r.top + r.height / 2, 3),
                rpos[1] + " vs " + (r.top + r.height / 2));

            var op = tr.property("ADBE Opacity");
            check("box is visible once the text is there", op.valueAtTime(t, false) > 99, op.valueAtTime(t, false));

            // Before the reveal starts the measure layer is empty, so the box must vanish.
            var before = reveal.keyTime(1) - 0.2;
            check("box is hidden before the typing starts", op.valueAtTime(before, false) < 1, op.valueAtTime(before, false));

            // The text really types on. The text layer itself always measures
            // full width (opacity and blur do not shrink sourceRectAtTime), which
            // is the whole reason for the measure layer: it holds only the part
            // typed so far, so its width is what grows.
            var hide = text.property("ADBE Text Properties").property("ADBE Text Animators").property(api.TYPE_HIDE);
            check("hide animator added", !!hide);
            var mStart = meas.sourceRectAtTime(reveal.keyTime(1), false).width;
            var mMid = meas.sourceRectAtTime((reveal.keyTime(1) + endT) / 2, false).width;
            var mEnd = meas.sourceRectAtTime(t, false).width;
            check("nothing measured at the first frame", mStart < 2, mStart);
            check("half measured half way through", mMid > mStart + 10 && mMid < mEnd - 10,
                mStart + " -> " + mMid + " -> " + mEnd);
            check("the whole text measured at the end", near(mEnd, r.width, 3), mEnd + " vs " + r.width);

            // Deleting the text leaves the box and measure layers behind: After
            // Effects orphans children, it does not delete them. They must at
            // least fail quietly instead of filling the comp with red.
            text.remove();
            var orphanBox = layerByName(comp, "Headline" + BOX);
            check("box is left behind when the text is deleted (AE orphans children)", !!orphanBox);
            if (orphanBox) {
                check("orphaned box has no parent", orphanBox.parent === null);
                var orphanBad = [];
                expressionErrors(orphanBox.property("ADBE Root Vectors Group"), t, "orphan contents", orphanBad);
                expressionErrors(orphanBox.property("ADBE Effect Parade"), t, "orphan effects", orphanBad);
                expressionErrors(orphanBox.property("ADBE Transform Group"), t, "orphan transform", orphanBad);
                check("orphaned box throws no expression errors", orphanBad.length === 0, orphanBad.join(" | "));
                orphanBox.remove();
            }
            var orphanMeas = layerByName(comp, "Headline" + MEAS);
            if (orphanMeas) orphanMeas.remove();
        });

        section("re-running replaces instead of stacking", function () {
            var txt = makeText("Twice", "Again and again", 70);
            api.autoBoxLayers(comp, [txt], {});
            var first = comp.numLayers;
            var again = layerByName(comp, "Twice");
            var res = api.autoBoxLayers(comp, [again], {});
            check("second run reported no failure", res.skipped.length === 0, res.skipped.join(" | "));
            check("layer count did not grow", comp.numLayers === first, first + " -> " + comp.numLayers);
            var animators = layerByName(comp, "Twice").property("ADBE Text Properties").property("ADBE Text Animators");
            var hides = 0;
            for (var a = 1; a <= animators.numProperties; a++) {
                if (animators.property(a).name === api.TYPE_HIDE) hides++;
            }
            check("only one hide animator after two runs", hides === 1, hides);
            var fx = layerByName(comp, "Twice").property("ADBE Effect Parade");
            var reveals = 0;
            for (var f = 1; f <= fx.numProperties; f++) {
                if (fx.property(f).name === api.FX_REVEAL) reveals++;
            }
            check("only one reveal control after two runs", reveals === 1, reveals);
            layerByName(comp, "Twice").remove();
        });

        section("every style builds a working rig", function () {
            for (var s = 0; s < api.AUTOBOX_STYLES.length; s++) {
                var label = api.AUTOBOX_STYLES[s].label;
                var name = "Style" + s;
                var txt = makeText(name, "One two three\nfour five six", 60);
                var res = api.autoBoxLayers(comp, [txt], { style: s });
                check("style " + s + " (" + label + "): built", res.made.length === 1 && res.skipped.length === 0,
                    res.skipped.join(" | "));
                var box = layerByName(comp, name + BOX);
                var text = layerByName(comp, name);
                if (!box || !text) { if (text) text.remove(); continue; }
                var noReveal = !!api.AUTOBOX_STYLES[s].noReveal;
                var t = 4;
                if (!noReveal) {
                    var rv = text.property("ADBE Effect Parade").property(api.FX_REVEAL).property(1);
                    t = rv.keyTime(2) + 1;
                }
                var bad = [];
                expressionErrors(box.property("ADBE Effect Parade"), t, "box effects", bad);
                expressionErrors(box.property("ADBE Root Vectors Group"), t, "box contents", bad);
                expressionErrors(box.property("ADBE Transform Group"), t, "box transform", bad);
                expressionErrors(text.property("ADBE Text Properties"), t, "text", bad);
                var meas = layerByName(comp, name + MEAS);
                if (meas) expressionErrors(meas.property("ADBE Text Properties"), t, "measure", bad);
                check("style " + s + ": no expression rejected", bad.length === 0, bad.join(" | "));
                check("style " + s + ": measure layer " + (noReveal ? "not needed" : "present"),
                    noReveal ? meas === null : meas !== null);
                var r = text.sourceRectAtTime(t, false);
                var size = box.property("ADBE Root Vectors Group").property("Auto Box")
                              .property("ADBE Vectors Group").property("ADBE Vector Shape - Rect")
                              .property("ADBE Vector Rect Size").valueAtTime(t, false);
                var d = api.AUTOBOX_DEFAULTS;
                check("style " + s + ": box wraps the finished text",
                    near(size[0], r.width + d.padX * 2, 4) && near(size[1], r.height + d.padY * 2, 4),
                    size.join(",") + " vs " + (r.width + d.padX * 2) + "," + (r.height + d.padY * 2));
                check("style " + s + ": box sits directly below the text", box.index === text.index + 1,
                    text.index + " / " + box.index);
                text.remove();
            }
        });

        section("two text layers at once", function () {
            var a = makeText("First", "Layer one", 60);
            var b = makeText("Second", "Layer two is longer", 60);
            b.property("ADBE Transform Group").property("ADBE Position").setValue([500, 800]);
            var res = api.autoBoxLayers(comp, [a, b], {});
            check("both boxes made", res.made.length === 2, res.made.join(","));
            check("nothing skipped", res.skipped.length === 0, res.skipped.join(" | "));
            var t1 = layerByName(comp, "First"), t2 = layerByName(comp, "Second");
            var b1 = layerByName(comp, "First" + BOX), b2 = layerByName(comp, "Second" + BOX);
            check("both names restored", !!t1 && !!t2);
            check("both boxes exist", !!b1 && !!b2);
            if (b1 && b2 && t1 && t2) {
                check("each box under its own text", b1.index === t1.index + 1 && b2.index === t2.index + 1,
                    t1.index + "/" + b1.index + "  " + t2.index + "/" + b2.index);
                check("each box parented to its own text",
                    b1.parent.index === t1.index && b2.parent.index === t2.index);
                var rv = t2.property("ADBE Effect Parade").property(api.FX_REVEAL).property(1);
                var t = rv.keyTime(2) + 1;
                var bad = [];
                expressionErrors(b1.property("ADBE Root Vectors Group"), t, "box1", bad);
                expressionErrors(b2.property("ADBE Root Vectors Group"), t, "box2", bad);
                check("no expression rejected on either box", bad.length === 0, bad.join(" | "));
                var r2 = t2.sourceRectAtTime(t, false);
                var s2 = b2.property("ADBE Root Vectors Group").property("Auto Box")
                           .property("ADBE Vectors Group").property("ADBE Vector Shape - Rect")
                           .property("ADBE Vector Rect Size").valueAtTime(t, false);
                var d = api.AUTOBOX_DEFAULTS;
                check("the second box measures its own text, not the first",
                    near(s2[0], r2.width + d.padX * 2, 4), s2[0] + " vs " + (r2.width + d.padX * 2));
            }
            if (t1) t1.remove();
            if (t2) t2.remove();
        });

        section("a non-text layer is skipped, not crashed on", function () {
            var solid = comp.layers.addSolid([0.5, 0.5, 0.5], "Plain", 400, 200, 1, 5);
            var txt = makeText("Mixed", "With a solid", 60);
            var res = api.autoBoxLayers(comp, [solid, txt], {});
            check("box still made for the text", res.made.length === 1, res.made.join(","));
            check("solid reported as skipped", res.skipped.length === 1, res.skipped.join(" | "));
            var t = layerByName(comp, "Mixed");
            if (t) t.remove();
            solid.remove();
        });

        section("caret rides the typing", function () {
            var txt = makeText("Caret", "Typing away", 80);
            api.autoBoxLayers(comp, [txt], { caret: true });
            var box = layerByName(comp, "Caret" + BOX);
            var text = layerByName(comp, "Caret");
            var rv = text.property("ADBE Effect Parade").property(api.FX_REVEAL).property(1);
            var caret = box.property("ADBE Root Vectors Group").property("Caret")
                           .property("ADBE Vectors Group").property("ADBE Vector Shape - Rect");
            var early = rv.keyTime(1) + (rv.keyTime(2) - rv.keyTime(1)) * 0.25;
            var late = rv.keyTime(1) + (rv.keyTime(2) - rv.keyTime(1)) * 0.9;
            var xEarly = caret.property("ADBE Vector Rect Position").valueAtTime(early, false)[0];
            var xLate = caret.property("ADBE Vector Rect Position").valueAtTime(late, false)[0];
            check("caret moves right as the text types on", xLate > xEarly + 5, xEarly + " -> " + xLate);
            var w = caret.property("ADBE Vector Rect Size").valueAtTime(early, false);
            check("caret has a real width and height", w[0] > 0 && w[1] > 0, w.join(","));
            text.remove();
        });

    } catch (fatal) {
        check("auto box test stopped", false, fatal.toString() + " (line " + fatal.line + ")");
    }

    flush(true);
    try { app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES); } catch (eClose) {}
    try { app.quit(); } catch (eQuit) {}
})();
