/*
 * LazyMotionToolkit — ExtendScript syntax check (no Node required).
 *
 *   cscript //Nologo tools\check-extendscript.js
 *
 * Runs under Windows Script Host, whose JScript engine is ES3 — the same
 * language level ExtendScript targets. That makes it a good early warning for
 * the things ExtendScript rejects but modern editors happily accept, above all
 * trailing commas in object and array literals. Same check as LazyKick's and LazyLord's.
 */
var fso = new ActiveXObject("Scripting.FileSystemObject");

var scriptDir = fso.GetParentFolderName(WScript.ScriptFullName);
var repoRoot = fso.GetParentFolderName(scriptDir);

var targets = [
  "LazyMotionToolkit.jsx",
  // The developer scripts are ExtendScript too. After Effects refuses a file
  // with a reserved word in it without a word of explanation -- it simply does
  // nothing -- so they are worth the same check as the panel.
  "tools\\ae-smoke-test.jsx",
  "tools\\ae-autobox-test.jsx",
  "tools\\ae-autobox-perf.jsx",
  "tools\\ae-autobox-unicode.jsx",
  "tools\\ae-headline-test.jsx",
  "tools\\ae-ui-test-audio.jsx",
  "tools\\ae-ui-test-panel.jsx"
];

function read(path) {
  // ADODB.Stream so UTF-8 sources are not mangled into false syntax errors.
  var st = new ActiveXObject("ADODB.Stream");
  st.Type = 2;
  st.Charset = "utf-8";
  st.Open();
  st.LoadFromFile(path);
  var s = st.ReadText(-1);
  st.Close();
  return s;
}

WScript.Echo("LazyMotionToolkit - ExtendScript syntax check");
WScript.Echo("");

var failed = 0;
for (var i = 0; i < targets.length; i++) {
  var path = fso.BuildPath(repoRoot, targets[i]);
  var src;

  try {
    src = read(path);
  } catch (eRead) {
    WScript.Echo("  ??   " + targets[i] + " - cannot read");
    failed++;
    continue;
  }

  // Strip ExtendScript preprocessor directives (#target, #include): valid
  // there, but not JavaScript.
  src = src.replace(/^\s*#[a-zA-Z].*$/gm, "");

  try {
    new Function(src); // compiles without running
  } catch (e) {
    WScript.Echo("  FAIL " + targets[i] + " - " + e.message);
    failed++;
    continue;
  }

  var problems = lint(src);
  if (problems.length) {
    WScript.Echo("  FAIL " + targets[i]);
    for (var p = 0; p < problems.length; p++) WScript.Echo("         " + problems[p]);
    failed++;
  } else {
    WScript.Echo("  ok   " + targets[i]);
  }
}

/**
 * Load-time failures JScript does not catch but real hosts do:
 *  - an ES3 reserved word used as a property name ("Illegal use of reserved
 *    word 'native'"): x.native, { native: 1 };
 *  - a comment starting "//@" or "// @", which ExtendScript reads as a
 *    preprocessor directive (like //@include) and fails on ("Syntax error");
 *  - Array.prototype.indexOf, which ExtendScript's arrays do not have.
 */
function lint(source) {
  var words = ("break case catch continue default delete do else finally for function if in instanceof new " +
    "return switch this throw try typeof var void while with abstract boolean byte char class const debugger " +
    "double enum export extends final float goto implements import int interface long native package private " +
    "protected public short static super synchronized throws transient volatile null true false").split(" ");
  var reserved = new RegExp("(\\.\\s*(" + words.join("|") + ")\\b)|([{,]\\s*(" + words.join("|") + ")\\s*:)");
  /* A future reserved word as a plain variable or parameter name. JScript
     accepts `var short = 1`, ExtendScript does not -- and After Effects reacts
     by running nothing at all, with no error anywhere, which costs an hour to
     work out. Only the words no host allows as a name are listed. */
  var futureWords = ("abstract boolean byte char class const debugger double enum export extends final float goto " +
    "implements import int interface long native package private protected public short static super " +
    "synchronized throws transient volatile").split(" ");
  var declared = new RegExp("\\b(var|function)\\s+(" + futureWords.join("|") + ")\\b");
  var out = [];
  var lines = source.split("\n");
  for (var n = 0; n < lines.length; n++) {
    var line = lines[n];
    if (/\/\/\s*@/.test(line)) out.push("line " + (n + 1) + ": a '//@' comment is read as an ExtendScript directive");
    // Strings, regex-free line comments blanked, so words inside them do not count.
    var code = line.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""').replace(/\/\/.*$/, "");
    if (/^\s*\*/.test(code)) continue; // inside a block comment
    var m = reserved.exec(code);
    if (m) out.push("line " + (n + 1) + ": reserved word used as a name: " + m[0].replace(/^\s+|\s+$/g, ""));
    var d = declared.exec(code);
    if (d) out.push("line " + (n + 1) + ": reserved word declared as a name: " + d[0]);
    // An array literal's own .indexOf is the real mistake. `saved[i].indexOf(...)`
    // just reads an element, which is usually a string, so it is left alone.
    var literalIndexOf = /\]\s*\.indexOf\(/.test(code) && !/[\w\)]\s*\[[^\[\]]*\]\s*\.indexOf\(/.test(code);
    if (literalIndexOf || /(^|[^\w.$\]])(Paths|Files|parts|clean|list|array)\s*\.indexOf\(/.test(code)) {
      out.push("line " + (n + 1) + ": Array indexOf is not available in ExtendScript");
    }
  }
  return out;
}

WScript.Echo("");
if (failed === 0) {
  WScript.Echo("All " + targets.length + " files parse cleanly.");
} else {
  WScript.Echo(failed + " of " + targets.length + " failed.");
}
WScript.Quit(failed === 0 ? 0 : 1);
