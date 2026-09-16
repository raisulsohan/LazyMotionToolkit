/*
 * LazyMotionToolkit — LazyStrike FX Audio-Driven test in the real After Effects,
 * with its normal window (developer tool).
 *
 *   Close After Effects, then run (Windows):
 *   "C:\Program Files\Adobe\Adobe After Effects 2026\Support Files\AfterFX.exe" -r "<repo>\tools\ae-ui-test-audio.jsx"
 *
 * Audio-Driven runs the Convert Audio to Keyframes menu command, which a
 * UI-less (-noui) After Effects can't run, so this lives apart from
 * ae-smoke-test.jsx. It writes a WAV with two loud bursts, lets LazyStrike find
 * them, writes %TEMP%\lazystrike-audio-results.txt, and quits without saving.
 */
(function () {
    var lines = [];
    var failures = 0;
    var out = new File(Folder.temp.fsName + "/lazystrike-audio-results.txt");
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

    try {
        app.beginSuppressDialogs();
        lines.push("After Effects " + app.version + " (with UI)");
        $.global.LazyMotionToolkitTest = {};
        $.evalFile(new File(new File($.fileName).parent.parent.fsName + "/LazyMotionToolkit.jsx"));
        var api = $.global.LazyMotionToolkitTest.api;
        check("toolkit loaded", !!api);

        // 3 s mono WAV at 22.05 kHz: silence, loud 440 Hz bursts at 0.5 s and 1.8 s.
        var rate = 22050;
        var n = rate * 3;
        function u16(v) { return String.fromCharCode(v & 255, (v >> 8) & 255); }
        function u32(v) { return String.fromCharCode(v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255); }
        var chunks = ["RIFF", u32(36 + n * 2), "WAVE", "fmt ", u32(16), u16(1), u16(1), u32(rate), u32(rate * 2), u16(2), u16(16), "data", u32(n * 2)];
        var block = [];
        for (var s = 0; s < n; s++) {
            var t = s / rate;
            var loud = (t > 0.5 && t < 0.62) || (t > 1.8 && t < 1.92);
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

        var comp = app.project.items.addComp("Thunder", 640, 360, 1, 3, 25);
        var audio = comp.layers.add(app.project.importFile(new ImportOptions(wav)));
        // Duration first: start + duration may never pass the end of the comp.
        comp.workAreaDuration = 1;
        comp.workAreaStart = 0.2;
        var waStart = comp.workAreaStart;
        var waDuration = comp.workAreaDuration;
        comp.openInViewer();
        check("audio layer ready, work area set", audio.hasAudio && !audio.hasVideo && Math.abs(waStart - 0.2) < 0.001, waStart + " + " + waDuration);

        var r = api.generateLightning(comp, {
            makeAudio: true, flashColor: [1, 1, 1], flashInt: 0.8, threshold: 10, gain: 12,
            decayFr: 2, minGapFr: 5, preComp: false
        });
        check("audio-driven: no error", !r.error, r.error);
        if (!r.error) {
            check("audio-driven: one flash per burst", r.strikes === 2, r.strikes);
            var op = r.layers[0].property("ADBE Transform Group").property("ADBE Opacity");
            var atBurst = Math.max(op.valueAtTime(0.52, false), op.valueAtTime(0.56, false), op.valueAtTime(0.6, false));
            check("audio-driven: bright at the first burst", atBurst > 10, atBurst);
            check("audio-driven: dark between bursts", op.valueAtTime(1.2, false) < 1, op.valueAtTime(1.2, false));
            var sliders = 0;
            for (var i = 1; i <= comp.numLayers; i++) {
                var fx = comp.layer(i).property("ADBE Effect Parade");
                if (fx && fx.numProperties >= 3 && fx.property(3).matchName === "ADBE Slider Control") sliders++;
            }
            check("audio-driven: temporary Audio Amplitude layer removed", sliders === 0, sliders);
            check("audio-driven: work area put back", Math.abs(comp.workAreaStart - waStart) < 0.001 && Math.abs(comp.workAreaDuration - waDuration) < 0.001,
                comp.workAreaStart + " + " + comp.workAreaDuration);
            check("audio-driven: layers are the flash and the audio", comp.numLayers === 2 && r.layers[0].name === "LazyStrike Audio Flash", comp.numLayers);
        }
    } catch (fatal) {
        check("test stopped", false, fatal.toString() + " (line " + fatal.line + ")");
    }

    flush(true);
    try { app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES); } catch (eClose) {}
    try { app.quit(); } catch (eQuit) {}
})();
