#!/bin/bash
# LazyMotionToolkit - removes the panel from every After Effects on this Mac.
# Your projects, and the preview videos in their AE_Previews folders, are not
# touched.
set -u

PANEL="LazyMotionToolkit.jsx"
# Only for testing this uninstaller against a folder that is not the real one.
APPS="${LAZYMOTION_APPS:-/Applications}"
PREFS="$HOME/Library/Preferences/Adobe/After Effects"

wait_for_return() {
  [ -n "${LAZYMOTION_NO_PAUSE:-}" ] || read -r -p "$1" _
}

echo "============================================================"
echo "  LazyMotionToolkit - uninstall"
echo "============================================================"
echo
wait_for_return "Press return to remove LazyMotionToolkit, or close this window to cancel. "

removed=0
asked_password=""
for target in "${APPS}"/Adobe\ After\ Effects\ */Scripts/ScriptUI\ Panels/"${PANEL}" \
              "${PREFS}"/*/Scripts/ScriptUI\ Panels/"${PANEL}"; do
  [ -f "${target}" ] || continue
  if ! rm -f "${target}" 2>/dev/null || [ -e "${target}" ]; then
    if [ -z "${asked_password}" ]; then
      echo "  This needs an administrator. Type your Mac login password and"
      echo "  press return (nothing shows while you type)."
      asked_password=1
    fi
    if ! sudo rm -f "${target}" || [ -e "${target}" ]; then
      echo "  [!] could not remove ${target}"
      continue
    fi
  fi
  removed=$((removed + 1))
  echo "  [ok] removed ${target}"
done

echo
if [ "${removed}" -eq 0 ]; then
  echo "LazyMotionToolkit was not installed."
else
  echo "Removed. Restart After Effects to take it out of the Window menu."
  echo
  echo "Your projects and the preview videos in their AE_Previews folders"
  echo "were not touched."
fi
echo
wait_for_return "Press return to close. "
