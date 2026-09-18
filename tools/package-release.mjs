/*
 * Package LazyMotionToolkit as a zip a user can unzip and install with one
 * double-click (Windows or macOS).
 *
 *   node tools/package-release.mjs
 *
 * The panel is a plain ScriptUI script, so there is nothing to sign: the zip
 * holds LazyMotionToolkit.jsx, the installers from tools/installer, and the
 * licence. It goes to the shared "00 Install from here" folder, like the
 * other LazySuite tools; the half-built folder goes to the system temp folder
 * and is swept up at the end.
 */
import { createHash } from "node:crypto";
import {
  cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { walk, writeZip } from "./zip.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PANEL = "LazyMotionToolkit.jsx";
const DOWNLOAD_FOLDER_NAME = "00 Install from here";

/* The script's own _buildVersion is the version; the panel footer reads it too. */
const match = /var _buildVersion\s*=\s*"(\d+\.\d+\.\d+)"/.exec(readFileSync(join(root, PANEL), "utf8"));
if (!match) fail(`no _buildVersion in ${PANEL}.`);
const VERSION = match[1];
/* 1.6.0 reads as 1.6 in the zip name and the panel footer; 1.6.1 stays 1.6.1. */
const SHORT = VERSION.replace(/\.0$/, "");
const zipName = `LazyMotionToolkit-v${SHORT}.zip`;

function log(step, message) {
  console.log(`${step}  ${message}`);
}

function fail(message) {
  console.error(`\n[!] ${message}\n`);
  process.exit(1);
}

/*
 * The finished zip goes to "00 Install from here" — the nearest one found
 * beside the repository or beside any folder above it (D:\GitHub\00 Install
 * from here for D:\GitHub\LazySuite\LazyMotionToolkit), which keeps only the
 * newest LazyMotionToolkit zip. LAZYMOTION_DOWNLOAD_DIR overrides it.
 */
function downloadsFolder() {
  if (process.env.LAZYMOTION_DOWNLOAD_DIR) return process.env.LAZYMOTION_DOWNLOAD_DIR;
  for (let dir = dirname(root); ; dir = dirname(dir)) {
    const candidateDot = join(dir, "00. Install from here");
    if (existsSync(candidateDot)) return candidateDot;
    const candidate = join(dir, DOWNLOAD_FOLDER_NAME);
    if (existsSync(candidate)) return candidate;
    if (dirname(dir) === dir) break;
  }
  return join(dirname(root), DOWNLOAD_FOLDER_NAME);
}

/*
 * The README and the changelog each carry the version. A release whose notes
 * describe another version is a mistake worth stopping for, so they are
 * checked rather than rewritten.
 */
function checkVersion() {
  const readme = readFileSync(join(root, "README.md"), "utf8");
  const changelog = readFileSync(join(root, "CHANGELOG.md"), "utf8");
  if (!readme.includes(`**Version ${SHORT}**`)) fail(`README.md does not say **Version ${SHORT}**.`);
  if (!new RegExp(`^## ${VERSION.replace(/\./g, "\\.")}$`, "m").test(changelog)) {
    fail(`CHANGELOG.md has no "## ${VERSION}" entry.`);
  }
  log("[1/3]", `version ${VERSION}`);
}

function assemble(payload) {
  rmSync(payload, { recursive: true, force: true });
  mkdirSync(payload, { recursive: true });
  cpSync(join(root, PANEL), join(payload, PANEL));
  cpSync(join(root, "LICENSE"), join(payload, "LICENSE.txt"));

  /* cmd.exe misreads a .bat with Unix line endings, and bash misreads a
     .command with Windows ones, so each is rewritten with the endings its
     shell needs rather than copied as it is. */
  const installers = readdirSync(join(root, "tools", "installer"));
  for (const name of installers) {
    const from = join(root, "tools", "installer", name);
    const to = join(payload, name);
    if (/\.(bat|cmd|txt)$/i.test(name)) {
      writeFileSync(to, readFileSync(from, "utf8").replace(/\r?\n/g, "\r\n"));
    } else if (/\.(command|sh)$/i.test(name)) {
      writeFileSync(to, readFileSync(from, "utf8").replace(/\r\n/g, "\n"));
    } else {
      cpSync(from, to);
    }
  }
  for (const needed of [
    "Install LazyMotionToolkit.bat", "Uninstall LazyMotionToolkit.bat",
    "Install LazyMotionToolkit (macOS).command", "Uninstall LazyMotionToolkit (macOS).command",
    "Read me first.txt",
  ]) {
    if (!installers.includes(needed)) fail(`tools/installer/${needed} is missing.`);
  }
  log("[2/3]", `assembled the download folder (${installers.length + 2} files)`);
}

function zip(payload) {
  const downloads = downloadsFolder();
  mkdirSync(downloads, { recursive: true });
  // One LazyMotionToolkit zip there at a time; older versions stay on GitHub's releases page.
  // Anything else in the folder (the other tools' zips) is left alone.
  for (const old of readdirSync(downloads)) {
    if (/^LazyMotionToolkit-v[\d.]+\.zip$/.test(old)) rmSync(join(downloads, old), { force: true });
  }
  const out = join(downloads, zipName);
  /* Built here rather than with Compress-Archive, which writes nested paths
     with backslashes — see tools/zip.mjs. */
  const bytes = writeZip(out, walk(payload, "LazyMotionToolkit/"));
  log("[3/3]", `${out} (${(bytes / 1024).toFixed(1)} KB)`);
  return out;
}

/* ------------------------------------------------------------------- main */

checkVersion();
const work = join(tmpdir(), `lazymotion-build-${VERSION}`);
const payload = join(work, "LazyMotionToolkit");
assemble(payload);
const out = zip(payload);
/* Leave one file behind, not a folder of half-built pieces. */
rmSync(work, { recursive: true, force: true });

const sha256 = createHash("sha256").update(readFileSync(out)).digest("hex");
console.log(`
Done. One file to give people:

  ${out}
  SHA-256 ${sha256}

They unzip it and double-click "Install LazyMotionToolkit.bat" (Windows) or
"Install LazyMotionToolkit (macOS).command".
`);
