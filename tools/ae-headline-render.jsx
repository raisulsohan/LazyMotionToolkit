/*
 * LazyMotionToolkit - render a contact sheet of every Head to Line shape.
 *
 *   Close After Effects, then run (Windows, needs the UI for saveFrameToPng):
 *   "C:\Program Files\Adobe\Adobe After Effects 2026\Support Files\AfterFX.com" -r "<repo>\tools\ae-headline-render.jsx"
 *
 * Numbers said the heads were fine while every triangle was a three-pointed
 * star turned inside out. This draws them, so the shapes can be looked at.
 * Writes %TEMP%\lazymotion-heads.png and a note beside it. Nothing is saved.
 */
(function () {
    var lines = [];
    var out = new File(Folder.temp.fsName + "/lazymotion-heads.txt");
    function say(s) {
        lines.push(s);
        out.encoding = "UTF-8"; out.open("w"); out.write(lines.join("\n") + "\n"); out.close();
    }

    // Clear last run's sheets, or the "has it appeared yet" wait below sees the
    // old file straight away and the script moves on before the new one lands.
    function clear(name) {
        var f = new File(Folder.temp.fsName + "/" + name);
        if (f.exists) { try { f.remove(); } catch (e) {} }
        return f;
    }
    var png = clear("lazymotion-heads.png");
    var png2 = clear("lazymotion-heads-round.png");

    try {
        app.beginSuppressDialogs();
        say("After Effects " + app.version);

        $.global.LazyMotionToolkitTest = {};
        $.evalFile(new File(new File($.fileName).parent.parent.fsName + "/LazyMotionToolkit.jsx"));
        var api = $.global.LazyMotionToolkitTest.api;
        say("toolkit " + api.version);

        if (app.project && app.project.file) { say("a saved project is open; stopping"); throw new Error("stop"); }
        if (app.project && app.project.numItems > 0) app.newProject();

        var TYPES = ["Triangle", "Circle", "Star", "Rectangle", "Pentagon", "Hexagon", "Heptagon", "Octagon"];
        var ROW = 90, LEFT = 40, LEN = 330;
        var comp = app.project.items.addComp("Heads", 900, ROW * TYPES.length + 60, 1, 5, 25);
        comp.bgColor = [0, 0, 0];

        /* saveFrameToPng writes the comp background out as transparent, so a
           white arrow on the comp's own black lands as white on nothing and
           cannot be seen. A real solid at the bottom gives it something to sit
           on -- which is the whole point of rendering this at all. */
        function backdrop() {
            var bg = comp.layers.addSolid([0.05, 0.05, 0.06], "Backdrop", comp.width, comp.height, 1, comp.duration);
            bg.moveToEnd();
            return bg;
        }
        backdrop();

        function label(text, y) {
            var t = comp.layers.addText(text);
            var d = t.property("ADBE Text Properties").property("ADBE Text Document").value;
            d.resetCharStyle();
            d.fontSize = 22;
            d.fillColor = [0.6, 0.6, 0.65];
            d.applyFill = true;
            t.property("ADBE Text Properties").property("ADBE Text Document").setValue(d);
            t.property("ADBE Transform Group").property("ADBE Position").setValue([LEFT + LEN + 120, y + 8]);
            return t;
        }

        function line(name, y) {
            var L = comp.layers.addShape();
            L.name = name;
            var grp = L.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group");
            grp.name = "Line";
            var items = grp.property("ADBE Vectors Group");
            var sh = new Shape();
            sh.vertices = [[0, 0], [LEN, 0]];
            sh.inTangents = [[0, 0], [0, 0]];
            sh.outTangents = [[0, 0], [0, 0]];
            sh.closed = false;
            items.addProperty("ADBE Vector Shape - Group").property("ADBE Vector Shape").setValue(sh);
            var stroke = items.addProperty("ADBE Vector Graphic - Stroke");
            stroke.property("ADBE Vector Stroke Width").setValue(8);
            stroke.property("ADBE Vector Stroke Color").setValue([1, 1, 1, 1]);
            L.property("ADBE Transform Group").property("ADBE Position").setValue([LEFT, y]);
            return L;
        }

        for (var i = 0; i < TYPES.length; i++) {
            var y = 40 + i * ROW;
            var L = line("L" + i, y);
            var res = api.headToLineLayers(comp, [L], TYPES[i], false, false, false, false, 30);
            say(TYPES[i] + ": " + (res.made.length ? "built" : "FAILED " + res.skipped.join(" | ")));
            label(TYPES[i], y);
        }

        comp.saveFrameToPng(1, png);
        for (var w = 0; w < 60 && !png.exists; w++) $.sleep(500);
        say("");
        say(png.exists ? ("wrote " + png.fsName + " (" + png.length + " bytes)") : "the png never appeared");

        // A second sheet with Round ticked, which is where the old code wrote
        // 15 into the inner radius and mangled the shape a different way.
        while (comp.numLayers > 0) comp.layer(1).remove();
        backdrop();
        for (var j = 0; j < TYPES.length; j++) {
            var y2 = 40 + j * ROW;
            var L2 = line("R" + j, y2);
            api.headToLineLayers(comp, [L2], TYPES[j], true, false, false, false, 30);
            label(TYPES[j] + " (round)", y2);
        }
        comp.saveFrameToPng(1, png2);
        for (var w2 = 0; w2 < 60 && !png2.exists; w2++) $.sleep(500);
        say(png2.exists ? ("wrote " + png2.fsName + " (" + png2.length + " bytes)") : "the round png never appeared");

    } catch (err) {
        say("stopped: " + err.toString() + " (line " + err.line + ")");
    }

    say("DONE");
    try { app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES); } catch (e1) {}
    try { app.scheduleTask("app.quit()", 1500, false); } catch (e2) {}
})();
