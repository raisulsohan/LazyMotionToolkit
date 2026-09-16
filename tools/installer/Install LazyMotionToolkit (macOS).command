#!/bin/bash
# LazyMotionToolkit - installs the panel into every After Effects on this Mac.
# Double-click this file. If macOS refuses, right-click it and choose Open.
# After Effects lists a script as a dockable panel when it sits in the
# "Scripts/ScriptUI Panels" folder next to the app.
set -u

cd "$(dirname "$0")"
PANEL="LazyMotionToolkit.jsx"
# Only for testing this installer against a folder that is not the real one.
APPS="${LAZYMOTION_APPS:-/Applications}"
PREFS="$HOME/Library/Preferences/Adobe/After Effects"

wait_for_return() {
  [ -n "${LAZYMOTION_NO_PAUSE:-}" ] || read -r -p "$1" _
}

echo "============================================================"
echo "  LazyMotionToolkit - install"
echo "  After Effects ScriptUI panel"
echo "============================================================"
echo

if [ ! -f "${PANEL}" ]; then
  echo "[!] LazyMotionToolkit.jsx is not next to this file."
  echo "    Unzip the whole download first, then run this from inside that folder."
  wait_for_return "Press return to close. "
  exit 1
fi

found=0
installed=0
old_tools=""
other_copy=""
asked_password=""

for app in "${APPS}"/Adobe\ After\ Effects\ *; do
  ls -d "${app}"/Adobe\ After\ Effects*.app >/dev/null 2>&1 || continue
  found=$((found + 1))
  name="$(basename "${app}")"
  panels="${app}/Scripts/ScriptUI Panels"

  if ! { mkdir -p "${panels}" && cp -f "${PANEL}" "${panels}/${PANEL}"; } 2>/dev/null ||
     ! cmp -s "${PANEL}" "${panels}/${PANEL}"; then
    # The After Effects folder can belong to the system account.
    if [ -z "${asked_password}" ]; then
      echo "  ${name} needs an administrator. Type your Mac login password"
      echo "  and press return (nothing shows while you type)."
      asked_password=1
    fi
    if ! { sudo mkdir -p "${panels}" && sudo cp -f "${PANEL}" "${panels}/${PANEL}"; } ||
       ! cmp -s "${PANEL}" "${panels}/${PANEL}"; then
      echo "  [!] could not copy into ${name}"
      continue
    fi
  fi
  installed=$((installed + 1))
  echo "  [ok] ${name}"

  for old in "${panels}/QuickStrike FX.jsx" "${panels}/QuickPreviewRender.jsx" \
             "${app}/Scripts/QuickStrike FX.jsx" "${app}/Scripts/QuickPreviewRender.jsx"; do
    if [ -e "${old}" ]; then old_tools=1; fi
  done
  for other in "${panels}"/LazyMotion*.jsx*; do
    if [ -e "${other}" ] && [ "$(basename "${other}")" != "${PANEL}" ]; then other_copy="${panels}"; fi
  done
done

# A copy someone put in their own Library folder would still show the old
# version, so one that is already there is brought up to date too.
for version in "${PREFS}"/*; do
  copy="${version}/Scripts/ScriptUI Panels/${PANEL}"
  [ -f "${copy}" ] || continue
  if cp -f "${PANEL}" "${copy}" 2>/dev/null; then
    echo "  [ok] also updated your own copy for After Effects $(basename "${version}")"
  else
    echo "  [!] could not update ${copy}"
  fi
done

echo
if [ "${found}" -eq 0 ]; then
  echo "[!] No After Effects was found in ${APPS}."
  echo "    Copy LazyMotionToolkit.jsx by hand into the Scripts/ScriptUI Panels"
  echo "    folder of your After Effects - see \"Read me first.txt\"."
elif [ "${installed}" -eq 0 ]; then
  echo "[!] Nothing was installed. Run this again, or copy LazyMotionToolkit.jsx"
  echo "    by hand - see \"Read me first.txt\"."
else
  echo "============================================================"
  echo "  Installed into ${installed} After Effects version(s)."
  echo "============================================================"
  echo
  echo "  1. Restart After Effects."
  echo "  2. Open  Window > LazyMotionToolkit.jsx  and dock it anywhere."
  echo
  echo "  LazyPreview Render also needs this After Effects setting:"
  echo "    After Effects > Settings (or Preferences) > Scripting & Expressions >"
  echo "    \"Allow Scripts to Write Files and Access Network\""
  echo
  if [ -n "${old_tools}" ]; then
    echo "  QuickStrike FX and QuickPreviewRender are now part of the panel"
    echo "  as LazyStrike FX and LazyPreview Render. Their old script files"
    echo "  were left in place: delete them from the Scripts folder."
    echo
  fi
  if [ -n "${other_copy}" ]; then
    echo "  [!] Another LazyMotion script file is in"
    echo "      ${other_copy}"
    echo "      It would show up twice in the Window menu. Delete the older one."
    echo
  fi
fi
wait_for_return "Press return to close. "
