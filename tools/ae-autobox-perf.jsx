/*
 * LazyMotionToolkit - Auto Box cost probe (developer tool, not a pass/fail test).
 *
 *   "C:\Program Files\Adobe\Adobe After Effects 2026\Support Files\AfterFX.com" -noui -r "<repo>\tools\ae-autobox-perf.jsx"
 *
 * The box measures the text with sourceRectAtTime, once per smoothing frame,
 * twice over (size and centre). That is the one thing in the toolkit that
 * could make a comp crawl, so this times a frame sweep with a growing number
 * of boxes and with a long paragraph, and writes the numbers to
 * %TEMP%\lazymotion-autobox-perf.txt. Nothing is saved.
 */
(function () {
    var lines = [];
    var out = new File(Folder.temp.fsName + "/lazymotion-autobox-perf.txt");
    function say(s) {
        lines.push(s);
        out.encoding = "UTF-8"; out.open("w"); out.write(lines.join("\n") + "\n"); out.close();
    }

    try {
        app.beginSuppressDialogs();
        say("After Effects " + app.version);

        $.global.LazyMotionToolkitTest = {};
        $.evalFile(new File(new File($.fileName).parent.parent.fsName + "/LazyMotionToolkit.jsx"));
        var api = $.global.LazyMotionToolkitTest.api;
        say("toolkit " + api.version);

        if (app.project.file) { say("a saved project is open; stopping"); throw new Error("stop"); }
        if (app.project.numItems > 0) app.newProject();

        var comp = app.project.items.addComp("Perf", 1920, 1080, 1, 10, 25);
        comp.time = 0;

        function addText(name, body, size, y) {
            var t = comp.layers.addText(body);
            t.name = name;
            var d = t.property("ADBE Text Properties").property("ADBE Text Document").value;
            d.resetCharStyle();
            d.fontSize = size;
            t.property("ADBE Text Properties").property("ADBE Text Document").setValue(d);
            t.property("ADBE Transform Group").property("ADBE Position").setValue([200, y]);
            return t;
        }

        // Collect every property on the box that carries an expression. Reading
        // only one of them measures a fraction of the work: rendering a frame
        // evaluates the lot, and the two Point Controls are where the real cost
        // is, because each one measures the text.
        function collect(group, bag) {
            for (var i = 1; i <= group.numProperties; i++) {
                var p;
                try { p = group.property(i); } catch (eGet) { continue; }
                if (p.propertyType !== PropertyType.PROPERTY) { collect(p, bag); continue; }
                try { if (p.canSetExpression && p.expression !== "") bag.push(p); } catch (eP) {}
            }
            return bag;
        }

        // Sweep 100 frames the way the timeline would, by asking the box layers
        // for every value After Effects has to compute for each frame.
        function sweep(frames) {
            var probes = [];
            var boxes = 0;
            for (var i = 1; i <= comp.numLayers; i++) {
                var L = comp.layer(i);
                if (L.name.indexOf(api.BOX_TAG) < 0 || L.name.indexOf(api.MEASURE_TAG) >= 0) continue;
                boxes++;
                collect(L.property("ADBE Effect Parade"), probes);
                collect(L.property("ADBE Root Vectors Group"), probes);
                collect(L.property("ADBE Transform Group"), probes);
            }
            var t0 = new Date().getTime();
            for (var f = 0; f < frames; f++) {
                var t = f / comp.frameRate;
                for (var p = 0; p < probes.length; p++) probes[p].valueAtTime(t, false);
            }
            return { ms: new Date().getTime() - t0, boxes: boxes, props: probes.length };
        }

        var shortText = "Hello LazyType";
        var counts = [1, 3, 5, 10];
        for (var c = 0; c < counts.length; c++) {
            while (comp.numLayers > 0) comp.layer(1).remove();
            var made = [];
            for (var n = 0; n < counts[c]; n++) made.push(addText("T" + n, shortText, 60, 100 + n * 80));
            var t0 = new Date().getTime();
            api.autoBoxLayers(comp, made, {});
            var build = new Date().getTime() - t0;
            var r = sweep(100);
            say(counts[c] + " box(es), " + r.props + " live expressions: built in " + build + " ms, 100-frame sweep " + r.ms +
                " ms (" + (r.ms / 100 / Math.max(1, r.boxes)).toFixed(2) + " ms per box per frame)");
        }

        // A long paragraph: the measure layer re-cuts the string every frame.
        var para = "";
        for (var w = 0; w < 60; w++) para += "paragraph ";
        while (comp.numLayers > 0) comp.layer(1).remove();
        var big = addText("Long", para, 36, 300);
        big.property("ADBE Text Properties").property("ADBE Text Document").value;
        var tb = new Date().getTime();
        api.autoBoxLayers(comp, [big], {});
        var buildBig = new Date().getTime() - tb;
        var rb = sweep(100);
        say("1 box, " + para.length + " characters: built in " + buildBig + " ms, 100-frame sweep " +
            rb.ms + " ms (" + (rb.ms / 100).toFixed(2) + " ms per frame)");

        // Before and after the one-measurement centre. The old Box Center ran the
        // whole smoothing loop a second time; rebuilding that expression from the
        // Box Rect one (they share a prelude) measures exactly what it cost.
        while (comp.numLayers > 0) comp.layer(1).remove();
        var ab = addText("AB", shortText, 60, 300);
        api.autoBoxLayers(comp, [ab], {});
        var abBox = null;
        for (var bi = 1; bi <= comp.numLayers; bi++) {
            var BL = comp.layer(bi);
            if (BL.name.indexOf(api.BOX_TAG) >= 0 && BL.name.indexOf(api.MEASURE_TAG) < 0) abBox = BL;
        }
        if (abBox) {
            var nowMs = sweep(100).ms;
            var rectExpr = abBox.property("ADBE Effect Parade").property("Box Rect").property(1).expression;
            var centreProp = abBox.property("ADBE Effect Parade").property("Box Center").property(1);
            var oldCentre = rectExpr.replace("[r.width, r.height];", "[r.left + r.width / 2, r.top + r.height / 2];");
            if (oldCentre === rectExpr) {
                say("A/B: could not rebuild the old centre expression");
            } else {
                centreProp.expression = oldCentre;
                var thenMs = sweep(100).ms;
                say("centre measured twice (old): " + thenMs + " ms / 100 frames;  measured once (now): " +
                    nowMs + " ms  ->  " + Math.round((1 - nowMs / thenMs) * 100) + "% less");
            }
        }

        // Box Smooth is the multiplier: every step is another sourceRectAtTime.
        var smooths = [0, 3, 10, 20];
        for (var s = 0; s < smooths.length; s++) {
            while (comp.numLayers > 0) comp.layer(1).remove();
            var one = addText("S", shortText, 60, 300);
            api.autoBoxLayers(comp, [one], { smooth: smooths[s] });
            var rs = sweep(100);
            say("Box Smooth " + smooths[s] + ": 100-frame sweep " + rs.ms + " ms (" +
                (rs.ms / 100).toFixed(2) + " ms per frame)");
        }

    } catch (e) {
        say("stopped: " + e.toString() + " (line " + e.line + ")");
    }

    say("DONE");
    try { app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES); } catch (e1) {}
    try { app.quit(); } catch (e2) {}
})();
