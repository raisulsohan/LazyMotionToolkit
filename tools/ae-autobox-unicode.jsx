/*
 * LazyMotionToolkit - Auto Box on Bengali text (developer probe).
 *
 *   "C:\Program Files\Adobe\Adobe After Effects 2026\Support Files\AfterFX.com" -noui -r "<repo>\tools\ae-autobox-unicode.jsx"
 *
 * The measure layer types the text on with substr, one UTF-16 code unit at a
 * time. Latin text survives that; Bengali does not necessarily, because a
 * cluster like ksha is three code points (ka, hasanta, ssa) and a vowel sign
 * follows its consonant. Cutting inside a cluster can render a wider, broken
 * glyph than the finished one, which would make the box jump. This measures
 * what actually happens and writes it to %TEMP%\lazymotion-autobox-unicode.txt.
 * The strings are built with fromCharCode so the file stays ASCII.
 */
(function () {
    var lines = [];
    var out = new File(Folder.temp.fsName + "/lazymotion-autobox-unicode.txt");
    function say(s) {
        lines.push(s);
        out.encoding = "UTF-8"; out.open("w"); out.write(lines.join("\n") + "\n"); out.close();
    }
    function u() {
        var s = "";
        for (var i = 0; i < arguments.length; i++) s += String.fromCharCode(arguments[i]);
        return s;
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

        var comp = app.project.items.addComp("Unicode", 1920, 1080, 1, 10, 25);
        comp.time = 0;

        // "amar nam Sohan" and "bangla kshamata" in Bengali.
        var PLAIN = u(0x0986, 0x09AE, 0x09BE, 0x09B0, 0x0020,
                      0x09A8, 0x09BE, 0x09AE, 0x0020,
                      0x09B8, 0x09CB, 0x09B9, 0x09BE, 0x09A8);
        var CLUSTER = u(0x09AC, 0x09BE, 0x0982, 0x09B2, 0x09BE, 0x0020,
                        0x0995, 0x09CD, 0x09B7, 0x09AE, 0x09A4, 0x09BE);

        function run(label, body, unit) {
            while (comp.numLayers > 0) comp.layer(1).remove();
            var t = comp.layers.addText(body);
            t.name = "T";
            var d = t.property("ADBE Text Properties").property("ADBE Text Document").value;
            d.resetCharStyle();
            d.fontSize = 72;
            t.property("ADBE Text Properties").property("ADBE Text Document").setValue(d);
            t.property("ADBE Transform Group").property("ADBE Position").setValue([300, 500]);

            var res = api.autoBoxLayers(comp, [t], { style: unit });
            if (res.made.length !== 1) { say(label + ": NOT BUILT (" + res.skipped.join(" | ") + ")"); return; }

            var text = null, meas = null;
            for (var i = 1; i <= comp.numLayers; i++) {
                var L = comp.layer(i);
                if (L.name.indexOf(api.MEASURE_TAG) >= 0) meas = L;
                else if (L.name === "T") text = L;
            }
            if (!meas) { say(label + ": no measure layer"); return; }

            var rv = text.property("ADBE Effect Parade").property(api.FX_REVEAL).property(1);
            var t0 = rv.keyTime(1), t1 = rv.keyTime(2);
            var full = text.sourceRectAtTime(t1 + 1, false).width;

            var widths = [], worst = 0, drops = 0, prev = -1;
            for (var s = 0; s <= 20; s++) {
                var tt = t0 + (t1 - t0) * (s / 20);
                var w = meas.sourceRectAtTime(tt, false).width;
                widths.push(Math.round(w));
                if (w > full + 1) worst = Math.max(worst, w - full);
                if (prev >= 0 && w < prev - 1) drops++;
                prev = w;
            }
            say(label + " (" + body.length + " code units, final width " + Math.round(full) + ")");
            say("  widths: " + widths.join(" "));
            say("  overshoot past the finished width: " + (worst ? worst.toFixed(1) + " px" : "none") +
                ",  backwards steps: " + drops);
        }

        run("Bengali, no cluster, chars", PLAIN, 0);
        run("Bengali with a ksha cluster, chars", CLUSTER, 0);
        run("Bengali with a ksha cluster, words", CLUSTER, 2);
        run("Latin control, chars", "Hello LazyType", 0);

    } catch (e) {
        say("stopped: " + e.toString() + " (line " + e.line + ")");
    }

    say("DONE");
    try { app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES); } catch (e1) {}
    try { app.quit(); } catch (e2) {}
})();
