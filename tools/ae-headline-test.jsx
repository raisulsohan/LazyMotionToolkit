/*
 * LazyMotionToolkit - Head to Line, tested inside the real After Effects.
 *
 *   Close After Effects, then run (Windows):
 *   "C:\Program Files\Adobe\Adobe After Effects 2026\Support Files\AfterFX.com" -noui -r "<repo>\tools\ae-headline-test.jsx"
 *
 * Head to Line had no test of any kind. Like Auto Box it lives or dies on
 * things only After Effects can answer: pointOnPath, tangentOnPath, parenting,
 * and shape match names that moved between versions. This builds a real stroked
 * path, runs the engine over every head type, and checks the head actually sits
 * on the end of the line and turns with it. Results go to
 * %TEMP%\lazymotion-headline-results.txt. Nothing is saved.
 */
(function () {
    var lines = [];
    var failures = 0;
    var out = new File(Folder.temp.fsName + "/lazymotion-headline-results.txt");

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

    var lastRes = null;
    function reportRes(r) { lastRes = r; return r; }
    function why() { return (lastRes && lastRes.skipped.length) ? lastRes.skipped.join(" | ") : "engine reported nothing"; }

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
        check("Head to Line engine exported for testing", !!(api && api.headToLineLayers));
        if (!api || !api.headToLineLayers) throw new Error("no Head to Line engine");

        if (!app.project) { check("a project to work in", false, "no project"); throw new Error("no project"); }
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

        var comp = app.project.items.addComp("HeadLine", 1920, 1080, 1, 10, 25);
        comp.time = 0;

        // A stroked open path from left to right, so the end tangent points +x.
        function makeLine(name, verts) {
            var L = comp.layers.addShape();
            L.name = name;
            var grp = L.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group");
            grp.name = "Line";
            var items = grp.property("ADBE Vectors Group");
            var pathProp = items.addProperty("ADBE Vector Shape - Group").property("ADBE Vector Shape");
            var sh = new Shape();
            sh.vertices = verts;
            sh.inTangents = [];
            sh.outTangents = [];
            for (var v = 0; v < verts.length; v++) { sh.inTangents.push([0, 0]); sh.outTangents.push([0, 0]); }
            sh.closed = false;
            pathProp.setValue(sh);
            var stroke = items.addProperty("ADBE Vector Graphic - Stroke");
            stroke.property("ADBE Vector Stroke Width").setValue(10);
            stroke.property("ADBE Vector Stroke Color").setValue([1, 0.4, 0.1, 1]);
            L.property("ADBE Transform Group").property("ADBE Position").setValue([200, 400]);
            return L;
        }

        section("the line is read before anything is built", function () {
            var L = makeLine("Read", [[0, 0], [400, 0]]);
            var info = api.getLineColorAndWidth(L);
            check("stroke width found", near(info.width, 10, 0.01), info.width);
            check("stroke colour found", near(info.color[0], 1, 0.01) && near(info.color[1], 0.4, 0.01),
                info.color.join(","));
            L.remove();
        });

        section("a straight line gets its head on the end", function () {
            var L = makeLine("Straight", [[0, 0], [400, 0]]);
            L.selected = true;
            reportRes(api.headToLineLayers(comp, [L], "Triangle", false, false, false, false, 30));

            var head = layerByName(comp, "Straight - Head");
            check("head layer made", !!head, head ? "" : why());
            if (!head) return;
            check("head parented to the line", head.parent !== null && head.parent.index === L.index,
                head.parent ? head.parent.name : "none");
            check("head sits above the line in the stack", head.index < L.index, head.index + " / " + L.index);

            var t = 1;
            var bad = [];
            expressionErrors(head.property("ADBE Transform Group"), t, "head transform", bad);
            expressionErrors(head.property("ADBE Root Vectors Group"), t, "head contents", bad);
            expressionErrors(head.property("ADBE Effect Parade"), t, "head effects", bad);
            check("no expression rejected or switched off", bad.length === 0, bad.join(" | "));

            // Parented to the line, so the head position is in the line's space:
            // the far end of the path is [400, 0].
            var pos = head.property("ADBE Transform Group").property("ADBE Position").valueAtTime(t, false);
            check("head is at the end of the path", near(pos[0], 400, 2) && near(pos[1], 0, 2), pos.join(","));

            var rot = head.property("ADBE Transform Group").property("ADBE Rotate Z").valueAtTime(t, false);
            check("head points along the line (0 degrees)", near(((rot % 360) + 360) % 360, 0, 2), rot);

            var size = head.property("ADBE Effect Parade").property("Head Size").property(1).value;
            check("head size follows the stroke width", near(size, 35, 0.5), size);

            L.remove();
        });

        section("a line turning downwards turns the head with it", function () {
            var L = makeLine("Turn", [[0, 0], [200, 0], [200, 300]]);
            L.selected = true;
            reportRes(api.headToLineLayers(comp, [L], "Triangle", false, false, false, false, 30));
            var head = layerByName(comp, "Turn - Head");
            check("head layer made", !!head, head ? "" : why());
            if (!head) { L.remove(); return; }
            var t = 1;
            var pos = head.property("ADBE Transform Group").property("ADBE Position").valueAtTime(t, false);
            check("head is at the far end", near(pos[0], 200, 3) && near(pos[1], 300, 3), pos.join(","));
            var rot = ((head.property("ADBE Transform Group").property("ADBE Rotate Z").valueAtTime(t, false) % 360) + 360) % 360;
            check("head turned to face down (90 degrees)", near(rot, 90, 5), rot);
            L.remove();
        });

        section("double sided puts a head on both ends", function () {
            var L = makeLine("Both", [[0, 0], [400, 0]]);
            L.selected = true;
            reportRes(api.headToLineLayers(comp, [L], "Triangle", false, true, false, false, 30));
            var end = layerByName(comp, "Both - Head");
            var start = layerByName(comp, "Both - Head Start");
            check("end head made", !!end, end ? "" : why());
            check("start head made", !!start);
            if (end && start) {
                var t = 1;
                var pe = end.property("ADBE Transform Group").property("ADBE Position").valueAtTime(t, false);
                var ps = start.property("ADBE Transform Group").property("ADBE Position").valueAtTime(t, false);
                check("the two heads are at opposite ends", near(pe[0], 400, 3) && near(ps[0], 0, 3),
                    ps.join(",") + "  ->  " + pe.join(","));
                var rs = ((start.property("ADBE Transform Group").property("ADBE Rotate Z").valueAtTime(t, false) % 360) + 360) % 360;
                check("the start head faces back down the line (180 degrees)", near(rs, 180, 5), rs);
            }
            L.remove();
        });

        section("animate adds Trim Paths and the head rides it", function () {
            var L = makeLine("Anim", [[0, 0], [400, 0]]);
            L.selected = true;
            reportRes(api.headToLineLayers(comp, [L], "Triangle", false, false, false, true, 25));
            var trim = L.property("ADBE Root Vectors Group").property("ADBE Vector Filter - Trim");
            check("Trim Paths added to the line", !!trim);
            if (trim) {
                var endProp = trim.property("ADBE Vector Trim End");
                check("trim end keyframed from 0 to 100", endProp.numKeys === 2 &&
                    near(endProp.keyValue(1), 0, 0.01) && near(endProp.keyValue(2), 100, 0.01),
                    endProp.numKeys + " keys");
            }
            var head = layerByName(comp, "Anim - Head");
            if (head && trim) {
                var pos = head.property("ADBE Transform Group").property("ADBE Position");
                var early = pos.valueAtTime(0.2, false)[0];
                var late = pos.valueAtTime(0.9, false)[0];
                check("head travels along the line as it draws on", late > early + 50,
                    Math.round(early) + " -> " + Math.round(late));
            }
            L.remove();
        });

        section("every head type builds cleanly", function () {
            var types = ["Triangle", "Circle", "Star", "Rectangle", "Pentagon", "Hexagon", "Heptagon", "Octagon"];
            for (var i = 0; i < types.length; i++) {
                var L = makeLine("T" + i, [[0, 0], [400, 0]]);
                L.selected = true;
                reportRes(api.headToLineLayers(comp, [L], types[i], true, false, false, false, 30));
                var head = layerByName(comp, "T" + i + " - Head");
                check(types[i] + ": head made", !!head, head ? "" : why());
                if (head) {
                    var t = 1;
                    var bad = [];
                    expressionErrors(head.property("ADBE Transform Group"), t, "transform", bad);
                    expressionErrors(head.property("ADBE Root Vectors Group"), t, "contents", bad);
                    check(types[i] + ": no expression rejected", bad.length === 0, bad.join(" | "));
                    var pos = head.property("ADBE Transform Group").property("ADBE Position").valueAtTime(t, false);
                    check(types[i] + ": head on the end of the path", near(pos[0], 400, 3), pos.join(","));
                    // A head that drew nothing would have no size at all.
                    var r = head.sourceRectAtTime(t, false);
                    check(types[i] + ": the shape actually drew something", r.width > 2 && r.height > 2,
                        Math.round(r.width) + "x" + Math.round(r.height));
                }
                L.remove();
            }
        });

        section("deleting the line does not poison the head", function () {
            var L = makeLine("Orphan", [[0, 0], [400, 0]]);
            L.selected = true;
            reportRes(api.headToLineLayers(comp, [L], "Triangle", false, false, false, false, 30));
            var head = layerByName(comp, "Orphan - Head");
            L.remove();
            check("head is left behind (After Effects orphans children)", !!head);
            if (head) {
                var bad = [];
                expressionErrors(head.property("ADBE Transform Group"), 1, "orphan transform", bad);
                expressionErrors(head.property("ADBE Root Vectors Group"), 1, "orphan contents", bad);
                check("orphaned head throws no expression errors", bad.length === 0, bad.join(" | "));
                head.remove();
            }
        });

        section("a non-shape layer is refused, not crashed on", function () {
            var solid = comp.layers.addSolid([0.4, 0.4, 0.4], "NotAShape", 200, 200, 1, 5);
            solid.selected = true;
            var before = comp.numLayers;
            var res = api.headToLineLayers(comp, [solid], "Triangle", false, false, false, false, 30);
            check("nothing was built for a solid", comp.numLayers === before, before + " -> " + comp.numLayers);
            check("the solid came back as skipped", res.skipped.length === 1, res.skipped.join(" | "));
            solid.remove();
        });

    } catch (fatal) {
        check("head to line test stopped", false, fatal.toString() + " (line " + fatal.line + ")");
    }

    flush(true);
    try { app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES); } catch (eClose) {}
    try { app.quit(); } catch (eQuit) {}
})();
