/*
 * LazyMotionToolkit — builds the real panel and the LazyStrike FX window inside
 * After Effects with its UI, to catch ScriptUI mistakes (developer tool).
 *
 *   Close After Effects, then run (Windows):
 *   "C:\Program Files\Adobe\Adobe After Effects 2026\Support Files\AfterFX.com" -r "<repo>\tools\ae-ui-test-panel.jsx"
 *
 * Writes %TEMP%\lazymotion-panel-results.txt, closes the windows and quits.
 */
(function () {
    var lines = [];
    var failures = 0;
    var out = new File(Folder.temp.fsName + "/lazymotion-panel-results.txt");
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
    function findText(container, text) {
        if (container.text === text) return container;
        if (!container.children) return null;
        for (var i = 0; i < container.children.length; i++) {
            var hit = findText(container.children[i], text);
            if (hit) return hit;
        }
        return null;
    }

    try {
        lines.push("After Effects " + app.version + " (with UI)");
        $.global.LazyMotionToolkitTest = {};
        $.evalFile(new File(new File($.fileName).parent.parent.fsName + "/LazyMotionToolkit.jsx"));
        var api = $.global.LazyMotionToolkitTest.api;
        check("toolkit loaded", !!api, api && api.version);

        var win = null;
        try {
            win = api.buildToolkitUI(undefined);
            check("panel built as a floating window", win instanceof Window);
        } catch (eUI) {
            check("panel built", false, eUI.toString() + " (line " + eUI.line + ")");
        }
        if (win) {
            check("panel: LazyStrike FX button", !!findText(win, "⚡ LazyStrike FX"));
            check("panel: LazyPreview Render section", !!findText(win, "🎬 LazyPreview Render"));
            check("panel: Render button", !!findText(win, "▶ Render In→Out"));
            check("panel: version in footer", !!findText(win, "v1.6 • Developed By RaisulSohan • raisulsohan.com"));
        }

        try {
            api.showLazyStrikeDialog();
            api.showLazyStrikeDialog(); // a second click re-shows the same window
            check("LazyStrike FX window opens", true);
        } catch (eStrike) {
            check("LazyStrike FX window opens", false, eStrike.toString() + " (line " + eStrike.line + ")");
        }
        try { api.closeLazyStrikeDialog(); } catch (eClose1) {}
        try { if (win) win.close(); } catch (eClose2) {}
    } catch (fatal) {
        check("test stopped", false, fatal.toString() + " (line " + fatal.line + ")");
    }

    flush(true);
    try { app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES); } catch (eP) {}
    try { app.quit(); } catch (eQ) {}
})();
