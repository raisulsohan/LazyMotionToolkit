/*
 * LazyMotionToolkit — engine tests against a mocked After Effects.
 *
 *   cscript //Nologo tools\test-toolkit.js
 *
 * Windows Script Host's JScript is ES3, like ExtendScript. The toolkit is
 * loaded with $.global.LazyMotionToolkitTest set, so it hands back its engine
 * functions instead of building a panel. The mocks model only what the toolkit
 * touches (properties, keyframes, masks, precompose); tools/ae-smoke-test.jsx
 * checks the same behaviour inside the real After Effects.
 */
var fso = new ActiveXObject("Scripting.FileSystemObject");
var scriptDir = fso.GetParentFolderName(WScript.ScriptFullName);
var repoRoot = fso.GetParentFolderName(scriptDir);

function read(path) {
    var st = new ActiveXObject("ADODB.Stream");
    st.Type = 2; st.Charset = "utf-8"; st.Open();
    st.LoadFromFile(path);
    var s = st.ReadText(-1);
    st.Close();
    return s;
}

// ------------------------------------------------------------------ harness
var passed = 0;
var failures = [];
function check(name, ok, detail) {
    if (ok) passed++;
    else failures.push(name + (detail !== undefined ? "  [" + detail + "]" : ""));
}
function eq(name, actual, expected) {
    check(name, actual === expected, "got " + actual + ", expected " + expected);
}
function near(name, actual, expected, tol) {
    check(name, Math.abs(actual - expected) <= (tol || 1e-6), "got " + actual + ", expected " + expected);
}
function section(name, fn) {
    try { fn(); } catch (e) { failures.push(name + ": threw " + (e.message || e)); }
}

// ------------------------------------------------------------ mock classes
var PropertyType = { PROPERTY: 6212, INDEXED_GROUP: 6213, NAMED_GROUP: 6214 };
var PropertyValueType = { NO_VALUE: 6412, ThreeD_SPATIAL: 6413, ThreeD: 6414, TwoD_SPATIAL: 6415, TwoD: 6416, OneD: 6417, COLOR: 6418, CUSTOM_VALUE: 6419, MARKER: 6420, LAYER_INDEX: 6421, MASK_INDEX: 6422, SHAPE: 6423, TEXT_DOCUMENT: 6424 };
var MaskMode = { NONE: 6812, ADD: 6813, SUBTRACT: 6814, INTERSECT: 6815, LIGHTEN: 6816, DARKEN: 6817, DIFFERENCE: 6818 };

function inherit(Child, Parent) { Child.prototype = new Parent(); Child.prototype.constructor = Child; }
function CompItem() {}
// As in After Effects: text and shape layers are NOT `instanceof AVLayer`
// (the real app proved that), so the layer classes only share a mock base.
function LayerBase() {}
function AVLayer() {}
function ShapeLayer() {}
function TextLayer() {}
function CameraLayer() {}
function LightLayer() {}
inherit(AVLayer, LayerBase);
inherit(ShapeLayer, LayerBase);
inherit(TextLayer, LayerBase);
inherit(CameraLayer, LayerBase);
inherit(LightLayer, LayerBase);
function SolidSource() {}
function MarkerValue(comment) { this.comment = comment; }

var alerts = [];
function alert(msg) { alerts.push(String(msg)); }

var undo = { depth: 0, groups: 0 };
var app = {
    settings: {
        store: {},
        haveSetting: function (s, k) { return this.store.hasOwnProperty(s + "/" + k); },
        getSetting: function (s, k) { return this.store[s + "/" + k]; },
        saveSetting: function (s, k, v) { this.store[s + "/" + k] = v; }
    },
    project: { activeItem: null },
    beginUndoGroup: function () { undo.depth++; undo.groups++; },
    endUndoGroup: function () { undo.depth--; }
};

function copy(v) {
    if (v && typeof v === "object" && v.length !== undefined) {
        var out = [];
        for (var i = 0; i < v.length; i++) out.push(copy(v[i]));
        return out;
    }
    return v;
}

// A property: static value or keyframes { time, value }.
function Prop(matchName, value, valueType) {
    this.matchName = matchName;
    this.name = matchName;
    this.propertyType = PropertyType.PROPERTY;
    this.propertyValueType = valueType || PropertyValueType.OneD;
    this.value = value;
    this.keys = [];
    this.numKeys = 0;
    this.expression = "";
    this.expressionEnabled = false;
    this.dimensionsSeparated = false;
}
Prop.prototype.setValue = function (v) {
    if (this.hook) this.hook();
    if (this.numKeys > 0) throw new Error("setValue on a keyframed property");
    this.value = v;
};
Prop.prototype.setValueAtTime = function (t, v) {
    for (var i = 0; i < this.keys.length; i++) {
        if (this.keys[i].time === t) { this.keys[i].value = v; return; }
    }
    this.keys.push({ time: t, value: v });
    this.keys.sort(function (a, b) { return a.time - b.time; });
    this.numKeys = this.keys.length;
};
Prop.prototype.setValueAtKey = function (k, v) { if (this.hook) this.hook(); this.keys[k - 1].value = v; };
Prop.prototype.keyValue = function (k) { if (this.hook) this.hook(); return this.keys[k - 1].value; };
Prop.prototype.keyTime = function (k) { return this.keys[k - 1].time; };
Prop.prototype.removeKey = function (k) { this.keys.splice(k - 1, 1); this.numKeys = this.keys.length; };
Prop.prototype.valueAtTime = function (t) {
    if (this.numKeys === 0) return this.value;
    if (t <= this.keys[0].time) return this.keys[0].value;
    var last = this.keys[this.numKeys - 1];
    if (t >= last.time) return last.value;
    for (var i = 0; i < this.numKeys - 1; i++) {
        var a = this.keys[i], b = this.keys[i + 1];
        if (t >= a.time && t <= b.time) {
            var f = (t - a.time) / (b.time - a.time);
            if (typeof a.value === "number") return a.value + (b.value - a.value) * f;
            var out = [];
            for (var j = 0; j < a.value.length; j++) out.push(a.value[j] + (b.value[j] - a.value[j]) * f);
            return out;
        }
    }
    return last.value;
};

function Group(matchName, children, type) {
    this.matchName = matchName;
    this.name = matchName;
    this.propertyType = type || PropertyType.NAMED_GROUP;
    this.children = children || [];
    this.numProperties = this.children.length;
}
Group.prototype.property = function (key) {
    if (typeof key === "number") return this.children[key - 1] || null;
    for (var i = 0; i < this.children.length; i++) {
        if (this.children[i].matchName === key || this.children[i].name === key) return this.children[i];
    }
    return null;
};
Group.prototype.add = function (child) {
    this.children.push(child);
    this.numProperties = this.children.length;
    return child;
};
Group.prototype.addProperty = function (matchName) {
    if (matchName === "ADBE Fill") {
        return this.add(new Group("ADBE Fill", [new Prop("ADBE Fill-0002", [1, 0, 0, 1], PropertyValueType.COLOR)]));
    }
    return this.add(new Group(matchName, []));
};

function Shape(vertices, inTangents, outTangents) {
    this.vertices = vertices;
    this.inTangents = inTangents || [];
    this.outTangents = outTangents || [];
}
function rectShape(x1, y1, x2, y2) { return new Shape([[x1, y1], [x2, y1], [x2, y2], [x1, y2]]); }

function makeMask(mode, shape, opts) {
    opts = opts || {};
    var m = new Group("ADBE Mask Atom", [
        new Prop("ADBE Mask Shape", shape, PropertyValueType.SHAPE),
        new Prop("ADBE Mask Feather", opts.feather || [0, 0], PropertyValueType.TwoD),
        new Prop("ADBE Mask Offset", opts.expansion || 0, PropertyValueType.OneD)
    ]);
    m.maskMode = mode;
    m.inverted = !!opts.inverted;
    return m;
}

var nextId = 1;
function makeLayer(Kind, opts) {
    var l = new Kind();
    l.name = opts.name || "Layer";
    l.width = opts.width || 1920;
    l.height = opts.height || 1080;
    l.inPoint = opts.inPoint || 0;
    l.outPoint = opts.outPoint || 10;
    l.parent = opts.parent || null;
    l.threeDLayer = !!opts.threeD;
    l.nullLayer = !!opts.nullLayer;
    l.source = opts.source || null;
    l.collapseTransformation = false;
    l.rect = opts.rect || { left: 0, top: 0, width: l.width, height: l.height };
    var pos = new Prop("ADBE Position", opts.position || [960, 540, 0], PropertyValueType.ThreeD_SPATIAL);
    var t = new Group("ADBE Transform Group", [
        new Prop("ADBE Anchor Point", opts.anchor || [0, 0, 0], PropertyValueType.ThreeD_SPATIAL),
        pos,
        new Prop("ADBE Position_0", (opts.position || [960])[0]),
        new Prop("ADBE Position_1", (opts.position || [0, 540])[1]),
        new Prop("ADBE Scale", opts.scale || [100, 100, 100], PropertyValueType.ThreeD),
        new Prop("ADBE Rotate Z", opts.rotation || 0),
        new Prop("ADBE Opacity", opts.opacity === undefined ? 100 : opts.opacity)
    ]);
    l.groups = {
        "ADBE Transform Group": t,
        "ADBE Mask Parade": new Group("ADBE Mask Parade", opts.masks || [], PropertyType.INDEXED_GROUP),
        "ADBE Effect Parade": new Group("ADBE Effect Parade", opts.effects || [], PropertyType.INDEXED_GROUP),
        "ADBE Marker": new Prop("ADBE Marker", null, PropertyValueType.MARKER),
        "ADBE Root Vectors Group": opts.contents || null,
        "ADBE Text Properties": opts.textDoc ? new Group("ADBE Text Properties", [new Prop("ADBE Text Document", opts.textDoc, PropertyValueType.TEXT_DOCUMENT)]) : null
    };
    return l;
}
LayerBase.prototype.property = function (matchName) { return this.groups[matchName] || null; };
LayerBase.prototype.sourceRectAtTime = function () { return this.rect; };

/**
 * What the real After Effects does when a precomp's size changes (seen in
 * tools/ae-smoke-test.jsx): layers inside are re-centred, and 2D effect points
 * on the layer showing it are rescaled to the new size. Applied the moment
 * anything touches those properties after the resize.
 */
function attachResizeBehaviour(pc, outer, inner) {
    pc.seenW = pc.width;
    pc.seenH = pc.height;
    pc.sync = function () {
        if (pc.width === pc.seenW && pc.height === pc.seenH) return;
        var dx = (pc.width - pc.seenW) / 2, dy = (pc.height - pc.seenH) / 2;
        var sx = pc.width / pc.seenW, sy = pc.height / pc.seenH;
        pc.seenW = pc.width;
        pc.seenH = pc.height;
        var ip = T(inner, "ADBE Position");
        ip.value = [ip.value[0] + dx, ip.value[1] + dy, ip.value[2]];
        (function scale(group) {
            for (var i = 1; i <= group.numProperties; i++) {
                var p = group.property(i);
                if (p.propertyType !== PropertyType.PROPERTY) { scale(p); continue; }
                if (p.propertyValueType !== PropertyValueType.TwoD_SPATIAL) continue;
                if (p.value) p.value = [p.value[0] * sx, p.value[1] * sy];
                for (var k = 0; k < p.keys.length; k++) p.keys[k].value = [p.keys[k].value[0] * sx, p.keys[k].value[1] * sy];
            }
        })(outer.property("ADBE Effect Parade"));
    };
    var hook = function () { pc.sync(); };
    T(inner, "ADBE Position").hook = hook;
    T(outer, "ADBE Anchor Point").hook = hook;
    (function attach(group) {
        for (var i = 1; i <= group.numProperties; i++) {
            var p = group.property(i);
            if (p.propertyType === PropertyType.PROPERTY) p.hook = hook; else attach(p);
        }
    })(outer.property("ADBE Effect Parade"));
    var masks = outer.property("ADBE Mask Parade");
    for (var m = 1; m <= masks.numProperties; m++) masks.property(m).property("ADBE Mask Shape").hook = hook;
}
function T(layer, matchName) { return layer.property("ADBE Transform Group").property(matchName); }

function makeComp(layers) {
    var comp = new CompItem();
    comp.id = nextId++;
    comp.width = 1920; comp.height = 1080; comp.time = 2; comp.frameRate = 25; comp.duration = 20;
    comp.list = layers;
    comp.precomposeCalls = [];
    comp.renumber = function () {
        for (var i = 0; i < this.list.length; i++) this.list[i].index = i + 1;
        this.numLayers = this.list.length;
    };
    comp.layer = function (i) { return this.list[i - 1]; };
    comp.selectedLayers = [];
    comp.renumber();
    comp.layers = {
        precompose: function (indices, name, moveAll) {
            comp.precomposeCalls.push({ indices: indices.join(","), name: name, moveAll: moveAll });
            var layer = comp.layer(indices[0]);
            var pc = new CompItem();
            pc.id = nextId++;
            pc.name = name;
            if (!moveAll) {
                if (indices.length !== 1 || !layer.source) throw new Error("Leave attributes needs one layer with a source");
                // Attributes stay on the outer layer: the same layer, new source.
                pc.width = layer.width; pc.height = layer.height;
                var inner = makeLayer(AVLayer, { name: layer.name, width: layer.width, height: layer.height, position: [layer.width / 2, layer.height / 2, 0], anchor: [layer.width / 2, layer.height / 2, 0] });
                pc.inner = inner;
                layer.source = pc;
                attachResizeBehaviour(pc, layer, inner);
                pc.layer = function () { pc.sync(); return inner; };
                return pc;
            }
            pc.width = comp.width; pc.height = comp.height;
            var moved = [];
            var keep = [];
            var at = 1e9;
            for (var i = 0; i < comp.list.length; i++) {
                var hit = false;
                for (var j = 0; j < indices.length; j++) if (comp.list[i].index === indices[j]) hit = true;
                if (hit) { moved.push(comp.list[i]); at = Math.min(at, i); } else keep.push(comp.list[i]);
            }
            var outer = makeLayer(AVLayer, { name: name, inPoint: 0, outPoint: comp.duration, source: pc, position: [960, 540, 0], anchor: [960, 540, 0] });
            keep.splice(at, 0, outer);
            comp.list = keep;
            comp.renumber();
            pc.moved = moved;
            return pc;
        }
    };
    return comp;
}

// A point in layer space as it lands in the parent's space.
function toParent(layer, p, time) {
    var t = layer.property("ADBE Transform Group");
    var pos = T(layer, "ADBE Position").valueAtTime(time || 0);
    var a = T(layer, "ADBE Anchor Point").valueAtTime(time || 0);
    var d = api.layerToParentDelta(p[0] - a[0], p[1] - a[1], T(layer, "ADBE Scale").value, T(layer, "ADBE Rotate Z").value);
    return [pos[0] + d[0], pos[1] + d[1]];
}

// ------------------------------------------------------------ load toolkit
var $ = { global: { LazyMotionToolkitTest: {} } };
try {
    eval(read(fso.BuildPath(repoRoot, "LazyMotionToolkit.jsx")));
} catch (eLoad) {
    failures.push("LazyMotionToolkit.jsx did not load: " + (eLoad.message || eLoad));
}
var api = $.global.LazyMotionToolkitTest.api;
check("toolkit returned its engine instead of a panel", !!api);
if (!api) {
    WScript.Echo("LazyMotionToolkit - engine tests\n");
    for (var lf = 0; lf < failures.length; lf++) WScript.Echo("  FAIL " + failures[lf]);
    WScript.Quit(1);
}

// ============================================================ palette & grid
section("palette", function () {
    var p = api.normalizePalette(["#ff0000", "oops", "#00FF00"], ["#000000"]);
    eq("palette: count follows the longer list", p.fills.length + "/" + p.strokes.length, "3/3");
    eq("palette: valid colour kept, upper-cased", p.fills[0], "#FF0000");
    eq("palette: invalid fill replaced", p.fills[1], "#CCCCCC");
    eq("palette: missing stroke filled", p.strokes[2], "#888888");
    eq("palette: never more than 10", api.normalizePalette(new Array(15), []).fills.length, 10);
    eq("palette: never empty", api.normalizePalette([""], []).fills.length, 1);
});

section("grid", function () {
    var g = api.computeGrid(1920, 1080, 3, 3, 20, 20, 40, 40);
    near("grid: cell width", g.cellW, (1920 - 80 - 40) / 3);
    near("grid: cell height", g.cellH, (1080 - 80 - 40) / 3);
    check("grid: margins too wide refused", !!api.computeGrid(1920, 1080, 3, 3, 20, 20, 1000, 40).error);
    check("grid: too many cells refused", !!api.computeGrid(1920, 1080, 100, 100, 0, 0, 0, 0).error);
    eq("grid: bad numbers fall back to 1x1", api.computeGrid(1920, 1080, NaN, 0, -5, NaN, NaN, NaN).cols, 1);
});

// ============================================================ fade expression
function runExpression(src, time, inPoint, outPoint, value) {
    var thisComp = { frameDuration: 1 / 25 };
    function framesToTime(n) { return n / 25; }
    return eval(src);
}

section("fade", function () {
    for (var e = 0; e < api.easingFuncs.length; e++) {
        var ease = null;
        eval(api.easingFuncs[e].replace("function ease", "ease = function"));
        near("ease " + e + " starts at 0", ease(0), 0, 1e-9);
        near("ease " + e + " ends at 1", ease(1), 1, 1e-9);
    }

    // Linear, 10 frames at speed 1, layer 0..4 s at 25 fps, own opacity 60.
    var x = api.buildFadeExpression(0, 10, 1, true, true);
    check("fade: tagged", api.isFadeExpression(x));
    near("fade: first frame transparent", runExpression(x, 0, 0, 4, 60), 0);
    near("fade: halfway through the fade in", runExpression(x, 0.2, 0, 4, 60), 30);
    near("fade: keeps the layer's own opacity", runExpression(x, 2, 0, 4, 60), 60);
    near("fade: last frame transparent", runExpression(x, 4 - 0.04, 0, 4, 60), 0);

    var fast = api.buildFadeExpression(0, 10, 2, true, false);
    near("fade speed 2: done in 5 frames", runExpression(fast, 0.2, 0, 4, 100), 100);
    near("fade speed 2: halfway at 2.5 frames", runExpression(fast, 0.1, 0, 4, 100), 50);
    var slow = api.buildFadeExpression(0, 10, 0.5, true, false);
    near("fade speed 0.5: 20 frames long", runExpression(slow, 0.4, 0, 4, 100), 50);

    var outOnly = api.buildFadeExpression(0, 10, 1, false, true);
    near("fade out only: start untouched", runExpression(outOnly, 0, 0, 4, 100), 100);

    // A 0.4 s layer with 10-frame fades: in and out meet without a jump.
    var shortLayer = api.buildFadeExpression(0, 10, 1, true, true);
    var prev = -1, jump = 0;
    for (var f = 0; f < 10; f++) {
        var v = runExpression(shortLayer, f / 25, 0, 0.4, 100);
        if (prev >= 0) jump = Math.max(jump, Math.abs(v - prev));
        prev = v;
    }
    check("fade short layer: no jump between frames", jump <= 25 + 1e-6, "largest step " + jump);

    var elastic = api.buildFadeExpression(6, 10, 1, true, true);
    var lo = 1e9, hi = -1e9;
    for (var g = 0; g <= 100; g++) {
        var ev = runExpression(elastic, g / 25, 0, 4, 100);
        lo = Math.min(lo, ev); hi = Math.max(hi, ev);
    }
    check("fade elastic: stays within 0..100", lo >= 0 && hi <= 100, lo + ".." + hi);

    check("fade: 1.4 expression recognised", api.isFadeExpression("ease = function(t){ return t; };\nfadeDuration = 20;\nt = time;"));
    check("fade: user expression not recognised", !api.isFadeExpression("wiggle(2, 20)"));
});

section("fade apply & clear", function () {
    var mine = makeLayer(AVLayer, { name: "Mine" });
    var theirs = makeLayer(AVLayer, { name: "Theirs" });
    var old = makeLayer(AVLayer, { name: "Old" });
    var cam = new CameraLayer(); cam.name = "Cam"; cam.property = function () { return null; };
    T(theirs, "ADBE Opacity").expression = "wiggle(2, 20)";
    T(old, "ADBE Opacity").expression = "ease = function(t){ return t; };\nfadeDuration = 20;\nt = time;";
    mine.property("ADBE Marker").setValueAtTime(1, new MarkerValue("intro"));
    var comp = makeComp([mine, theirs, old]);
    comp.selectedLayers = [mine, theirs, old, cam];
    app.project.activeItem = comp;

    alerts = [];
    api.applyFadeTools(20, 1, 0, true, true, true);
    api.applyFadeTools(20, 1, 0, true, true, true); // twice: markers must not pile up
    check("apply: tagged expression set", api.isFadeExpression(T(mine, "ADBE Opacity").expression));
    eq("apply: user's expression left alone", T(theirs, "ADBE Opacity").expression, "wiggle(2, 20)");
    check("apply: 1.4 fade replaced", T(old, "ADBE Opacity").expression.indexOf("// LazyMotion Fade") === 0);
    var markers = mine.property("ADBE Marker");
    var comments = [];
    for (var k = 1; k <= markers.numKeys; k++) comments.push(markers.keyValue(k).comment);
    // Markers sort by time: fade in (0 s), the user's intro (1 s), fade out (10 s).
    eq("apply twice: one fade in, one fade out, user marker kept", comments.join("|"), "fade in|intro|fade out");
    check("apply: skipped layers reported", alerts.length === 2 && alerts[0].indexOf("Theirs") !== -1 && alerts[0].indexOf("Cam") !== -1, alerts[0]);
    eq("apply: undo balanced", undo.depth, 0);

    alerts = [];
    api.deleteFadeTools();
    eq("clear: fade expression removed", T(mine, "ADBE Opacity").expression, "");
    eq("clear: user's expression kept", T(theirs, "ADBE Opacity").expression, "wiggle(2, 20)");
    eq("clear: only fade markers removed", markers.numKeys + ":" + markers.keyValue(1).comment, "1:intro");
    check("clear: reports what it left", alerts.length === 1 && alerts[0].indexOf("Theirs") !== -1, alerts.join(" / "));
});

// ============================================================ mask bounds
section("mask bounds", function () {
    function b(masks, w, h) {
        var l = makeLayer(AVLayer, { masks: masks, width: w || 1000, height: h || 1000, source: {} });
        var r = api.getMaskBounds(l);
        return r ? [r.x, r.y, r.width, r.height].join(",") : "none";
    }
    eq("mask: plain add", b([makeMask(MaskMode.ADD, rectShape(100, 200, 300, 400))]), "100,200,200,200");
    eq("mask: feather and expansion grow it", b([makeMask(MaskMode.ADD, rectShape(100, 200, 300, 400), { feather: [10, 4], expansion: 5 })]), "85,185,230,230");
    eq("mask: bezier handle bulges past the vertices",
        b([makeMask(MaskMode.ADD, new Shape([[100, 100], [300, 100]], [[0, 0], [0, 0]], [[0, -60], [0, 0]]))]), "100,40,200,60");
    eq("mask: inverted means no crop", b([makeMask(MaskMode.ADD, rectShape(100, 100, 200, 200), { inverted: true })]), "none");
    eq("mask: subtract only means no crop", b([makeMask(MaskMode.SUBTRACT, rectShape(100, 100, 200, 200))]), "none");
    eq("mask: subtract does not widen an add", b([makeMask(MaskMode.ADD, rectShape(100, 100, 200, 200)), makeMask(MaskMode.SUBTRACT, rectShape(0, 0, 900, 900))]), "100,100,100,100");
    eq("mask: lighten adds area", b([makeMask(MaskMode.ADD, rectShape(100, 100, 200, 200)), makeMask(MaskMode.LIGHTEN, rectShape(500, 500, 600, 600))]), "100,100,500,500");
    eq("mask: disabled (None) ignored", b([makeMask(MaskMode.NONE, rectShape(0, 0, 900, 900)), makeMask(MaskMode.ADD, rectShape(10, 10, 20, 20))]), "10,10,10,10");
    eq("mask: clipped to the layer", b([makeMask(MaskMode.ADD, rectShape(-50, -50, 400, 2000))], 1000, 1000), "0,0,400,1000");
    eq("mask: covering the whole layer is no crop", b([makeMask(MaskMode.ADD, rectShape(-10, -10, 2000, 2000))]), "none");
    eq("mask: entirely outside is no crop", b([makeMask(MaskMode.ADD, rectShape(2000, 2000, 2100, 2100))]), "none");

    var animated = makeMask(MaskMode.ADD, rectShape(0, 0, 1, 1));
    animated.property("ADBE Mask Shape").setValueAtTime(0, rectShape(100, 100, 200, 200));
    animated.property("ADBE Mask Shape").setValueAtTime(5, rectShape(600, 700, 800, 900));
    eq("mask: every keyframe of an animated path counted", b([animated]), "100,100,700,800");

    var driven = makeMask(MaskMode.ADD, rectShape(100, 100, 200, 200));
    driven.property("ADBE Mask Shape").expression = "createPath()";
    driven.property("ADBE Mask Shape").expressionEnabled = true;
    eq("mask: expression-driven path means no crop", b([driven]), "none");
});

// ============================================================ precompose
section("individual precomp", function () {
    var mask = makeMask(MaskMode.ADD, rectShape(400, 300, 900, 700));
    mask.property("ADBE Mask Shape").setValueAtTime(0, rectShape(400, 300, 900, 700));
    mask.property("ADBE Mask Shape").setValueAtTime(3, rectShape(420, 320, 880, 680));
    var point = new Prop("ADBE CC Light Burst-0001", [650, 500], PropertyValueType.TwoD_SPATIAL);
    var footage = makeLayer(AVLayer, {
        name: "Clip", width: 1920, height: 1080, source: { id: 999, name: "clip.mov" },
        anchor: [960, 540, 0], position: [700, 400, 0], scale: [80, 120, 100], rotation: 25,
        masks: [mask], effects: [new Group("ADBE CC Light Burst", [point])]
    });
    T(footage, "ADBE Anchor Point").setValueAtTime(0, [960, 540, 0]);
    T(footage, "ADBE Anchor Point").setValueAtTime(4, [1000, 560, 0]);

    var shapeKid = makeLayer(ShapeLayer, { name: "Kid", parent: footage });
    var shape3D = makeLayer(ShapeLayer, { name: "Deep", threeD: true });
    var nullL = makeLayer(AVLayer, { name: "Ctrl", nullLayer: true, source: { id: 5 } });
    var cam = makeLayer(CameraLayer, { name: "Camera 1" });
    var title = makeLayer(TextLayer, { name: "Title", inPoint: 1.5, outPoint: 6 });

    var comp = makeComp([title, footage, shapeKid, shape3D, nullL, cam]);
    comp.selectedLayers = [title, footage, shapeKid, shape3D, nullL, cam];
    app.project.activeItem = comp;

    // Where two source pixels land on screen before, at two times.
    var samples = [[450, 350], [880, 690]];
    var before = [];
    for (var s = 0; s < samples.length; s++) {
        before.push(toParent(footage, samples[s], 0));
        before.push(toParent(footage, samples[s], 4));
    }

    alerts = [];
    api.executeIndividualPrecomp();

    var calls = comp.precomposeCalls;
    eq("precomp: two layers precomposed", calls.length, 2);
    eq("precomp: bottom-up, footage keeps its attributes outside", calls[0].name + ":" + calls[0].moveAll, "Clip_PC:false");
    eq("precomp: text moves its attributes inside", calls[1].name + ":" + calls[1].moveAll, "Title_PC:true");

    var pc = footage.source;
    pc.sync(); // whatever After Effects would still adjust has happened by now
    eq("crop: precomp sized to the masks over time", pc.width + "x" + pc.height, "500x400");
    var innerPos = T(pc.inner, "ADBE Position").value;
    eq("crop: source moved inside the precomp", innerPos[0] + "," + innerPos[1], (960 - 400) + "," + (540 - 300));
    eq("crop: anchor keyframes shifted", T(footage, "ADBE Anchor Point").keyValue(2)[0] + "," + T(footage, "ADBE Anchor Point").keyValue(2)[1], "600,260");
    eq("crop: mask keyframes shifted", mask.property("ADBE Mask Shape").keyValue(2).vertices[0].join(","), "20,20");
    eq("crop: effect point shifted", point.value.join(","), "250,200");

    // The same source pixels, now at (pixel - crop) inside the precomp.
    var after = [];
    for (var a = 0; a < samples.length; a++) {
        var inPc = [samples[a][0] - 400, samples[a][1] - 300];
        after.push(toParent(footage, inPc, 0));
        after.push(toParent(footage, inPc, 4));
    }
    var worst = 0;
    for (var w = 0; w < before.length; w++) {
        worst = Math.max(worst, Math.abs(before[w][0] - after[w][0]), Math.abs(before[w][1] - after[w][1]));
    }
    check("crop: nothing moves on screen at any keyframe", worst < 1e-6, "off by " + worst);

    var titleOuter = null;
    for (var i = 1; i <= comp.numLayers; i++) if (comp.layer(i).name === "Title_PC") titleOuter = comp.layer(i);
    check("text precomp: keeps its in/out", titleOuter && titleOuter.inPoint === 1.5 && titleOuter.outPoint === 6,
        titleOuter ? titleOuter.inPoint + "-" + titleOuter.outPoint : "missing");

    var msg = alerts.join("\n");
    check("precomp: parented shape reported", msg.indexOf("Kid (parented") !== -1, msg);
    check("precomp: 3D shape reported", msg.indexOf("Deep (3D") !== -1, msg);
    check("precomp: null reported", msg.indexOf("Ctrl (null") !== -1, msg);
    check("precomp: camera reported", msg.indexOf("Camera 1 (null, camera or light)") !== -1, msg);
    eq("precomp: undo balanced", undo.depth, 0);
});

section("group precomp", function () {
    var parent = makeLayer(AVLayer, { name: "Rig", source: { id: 1 } });
    var a = makeLayer(ShapeLayer, { name: "A", parent: parent, inPoint: 1, outPoint: 5 });
    var b = makeLayer(ShapeLayer, { name: "B", inPoint: 3, outPoint: 9 });
    var comp = makeComp([a, b, parent]);
    comp.selectedLayers = [a, b];
    app.project.activeItem = comp;

    alerts = [];
    api.executeGroupPrecomp();
    eq("group: refused while a parent stays outside", comp.precomposeCalls.length, 0);
    check("group: says which layer and parent", alerts.length === 1 && alerts[0].indexOf("A (parent: Rig)") !== -1, alerts[0]);

    comp.selectedLayers = [a, b, parent];
    alerts = [];
    api.executeGroupPrecomp();
    eq("group: precomposed with its parent", comp.precomposeCalls.length, 1);
    var outer = comp.layer(1);
    eq("group: spans the layers' in/out", outer.inPoint + "-" + outer.outPoint, "0-10");
    eq("group: 2D stays uncollapsed", outer.collapseTransformation, false);

    var c3 = makeLayer(ShapeLayer, { name: "C", threeD: true });
    var d = makeLayer(ShapeLayer, { name: "D" });
    var comp2 = makeComp([c3, d]);
    comp2.selectedLayers = [c3, d];
    app.project.activeItem = comp2;
    api.executeGroupPrecomp();
    eq("group: 3D inside collapses to keep the camera", comp2.layer(1).collapseTransformation, true);
});

// ============================================================ anchor & center
section("anchor align", function () {
    var l = makeLayer(AVLayer, { name: "Logo", source: { id: 3 }, anchor: [0, 0, 0], position: [500, 300, 0], scale: [50, 200, 100], rotation: 30,
        rect: { left: -100, top: -50, width: 200, height: 100 } });
    var probe = [37, -12];
    var before = toParent(l, probe);
    var comp = makeComp([l]);
    comp.selectedLayers = [l];
    app.project.activeItem = comp;
    api.alignAnchorPoint(0, 0);
    eq("anchor: moved to top-left", T(l, "ADBE Anchor Point").value[0] + "," + T(l, "ADBE Anchor Point").value[1], "-100,-50");
    var after = toParent(l, probe);
    near("anchor: layer did not move (x)", after[0], before[0]);
    near("anchor: layer did not move (y)", after[1], before[1]);

    var moving = makeLayer(AVLayer, { name: "Moving", source: { id: 4 }, rect: { left: 0, top: 0, width: 100, height: 100 } });
    T(moving, "ADBE Position").setValueAtTime(0, [100, 100, 0]);
    T(moving, "ADBE Position").setValueAtTime(2, [800, 400, 0]);
    var p0 = toParent(moving, [10, 10], 0), p2 = toParent(moving, [10, 10], 2);
    var spinning = makeLayer(AVLayer, { name: "Spin", source: { id: 6 } });
    T(spinning, "ADBE Rotate Z").setValueAtTime(0, 0);
    T(spinning, "ADBE Rotate Z").setValueAtTime(1, 90);
    var split = makeLayer(AVLayer, { name: "Split", source: { id: 7 }, position: [300, 300, 0], rect: { left: 0, top: 0, width: 50, height: 80 } });
    T(split, "ADBE Position").dimensionsSeparated = true;
    var comp2 = makeComp([moving, spinning, split]);
    comp2.selectedLayers = [moving, spinning, split];
    app.project.activeItem = comp2;
    alerts = [];
    api.alignAnchorPoint(0.5, 0.5);
    near("anchor, animated position: still in place at key 1", toParent(moving, [10, 10], 0)[0], p0[0]);
    near("anchor, animated position: still in place at key 2", toParent(moving, [10, 10], 2)[1], p2[1]);
    eq("anchor, split position: X moved", T(split, "ADBE Position_0").value, 325);
    eq("anchor, split position: Y moved", T(split, "ADBE Position_1").value, 340);
    check("anchor: animated rotation skipped and reported", alerts.length === 1 && alerts[0].indexOf("Spin (animated rotation)") !== -1, alerts.join(" / "));
    eq("anchor: undo balanced", undo.depth, 0);
});

section("center in comp", function () {
    var l = makeLayer(AVLayer, { name: "Card", source: { id: 8 }, anchor: [0, 0, 0], position: [100, 100, 0], scale: [150, 150, 100], rotation: 10,
        rect: { left: 0, top: 0, width: 400, height: 200 } });
    var kid = makeLayer(AVLayer, { name: "Kid", source: { id: 9 }, parent: l });
    var comp = makeComp([l, kid]);
    comp.selectedLayers = [l, kid];
    app.project.activeItem = comp;
    alerts = [];
    api.centerInComp();
    var c = toParent(l, [200, 100]);
    near("center: content centre at comp centre (x)", c[0], 960);
    near("center: content centre at comp centre (y)", c[1], 540);
    check("center: parented layer skipped and reported", alerts.length === 1 && alerts[0].indexOf("Kid (parented") !== -1, alerts.join(" / "));
});

// ============================================================ swatches
section("swatch colours", function () {
    var fill = new Prop("ADBE Vector Fill Color", [0, 0, 0, 1], PropertyValueType.COLOR);
    var nestedFill = new Group("ADBE Vector Graphic - Fill", [fill]);
    var contents = new Group("ADBE Root Vectors Group", [new Group("ADBE Vector Group", [new Group("ADBE Vectors Group", [nestedFill], PropertyType.INDEXED_GROUP)])], PropertyType.INDEXED_GROUP);
    var shape = makeLayer(ShapeLayer, { name: "Blob", contents: contents });
    var noStroke = makeLayer(ShapeLayer, { name: "NoStroke", contents: new Group("ADBE Root Vectors Group", [], PropertyType.INDEXED_GROUP) });
    var doc = { fillColor: [0, 0, 0], strokeColor: [0, 0, 0], strokeWidth: 0, applyFill: false, applyStroke: false };
    var text = makeLayer(TextLayer, { name: "Headline", textDoc: doc });
    var textProp = text.property("ADBE Text Properties").property("ADBE Text Document");
    textProp.setValueAtTime(0, doc);
    var solid = makeLayer(AVLayer, { name: "BG", source: { id: 10, mainSource: new SolidSource() } });
    var nul = makeLayer(AVLayer, { name: "Null", nullLayer: true, source: { id: 11, mainSource: new SolidSource() } });

    var comp = makeComp([shape, noStroke, text, solid, nul]);
    comp.selectedLayers = [shape, text, solid, nul];
    app.project.activeItem = comp;
    alerts = [];
    api.applySwatchColor("#FF8000", "Fill");
    eq("swatch: nested shape fill", fill.value.slice(0, 3).join(","), "1," + (128 / 255) + ",0");
    eq("swatch: keyframed text gets a keyframe, not an error", textProp.numKeys, 2);
    eq("swatch: text fill", textProp.keyValue(2).fillColor[0] + ":" + textProp.keyValue(2).applyFill, "1:true");
    var fx = solid.property("ADBE Effect Parade").property("ADBE Fill");
    check("swatch: solid recognised (Fill effect added)", !!fx);
    eq("swatch: solid fill colour", fx && fx.property("ADBE Fill-0002").value[0], 1);
    check("swatch: null layer reported, not filled", alerts.length === 1 && alerts[0].indexOf("Null") !== -1 && !nul.property("ADBE Effect Parade").property("ADBE Fill"), alerts.join(" / "));

    comp.selectedLayers = [text, noStroke];
    alerts = [];
    api.applySwatchColor("#00FF00", "Stroke");
    var last = textProp.keyValue(textProp.numKeys);
    eq("swatch: text stroke turned on with a visible width", last.applyStroke + ":" + last.strokeWidth, "true:2");
    check("swatch: shape without a stroke reported", alerts.length === 1 && alerts[0].indexOf("NoStroke (no stroke") !== -1, alerts.join(" / "));
    eq("swatch: undo balanced", undo.depth, 0);
});

// ------------------------------------------------------------------ report
WScript.Echo("LazyMotionToolkit - engine tests");
WScript.Echo("");
for (var f = 0; f < failures.length; f++) WScript.Echo("  FAIL " + failures[f]);
WScript.Echo((failures.length ? "" : "  ") + passed + " passed, " + failures.length + " failed");
WScript.Quit(failures.length ? 1 : 0);
