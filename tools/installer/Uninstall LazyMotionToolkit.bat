@echo off
rem LazyMotionToolkit - removes the panel from every After Effects on this
rem computer. Your projects, and the preview videos in their AE_Previews
rem folders, are not touched.

setlocal EnableExtensions
title Uninstall LazyMotionToolkit

set "PANEL=LazyMotionToolkit.jsx"
set "AE_PARENT=%ProgramFiles%\Adobe"
rem Only for testing this uninstaller against a folder that is not the real one.
if defined LAZYMOTION_AE_ROOT set "AE_PARENT=%LAZYMOTION_AE_ROOT%"
if not defined LAZYMOTION_VERB set "LAZYMOTION_VERB=RunAs"
set "LMT_ELEVATED="
if /i "%~1"=="/elevated" set "LMT_ELEVATED=1"

echo ============================================================
echo   LazyMotionToolkit - uninstall
echo ============================================================
echo.
if defined LMT_ELEVATED goto :remove
echo This removes LazyMotionToolkit.jsx from every After Effects on this
echo computer. Close this window now to cancel.
echo.
if not defined LAZYMOTION_NO_PAUSE pause
echo.

:remove
set /a REMOVED=0
set /a FAILED=0
for /d %%a in ("%AE_PARENT%\Adobe After Effects *") do call :remove_from "%%~fa"
if %FAILED% equ 0 goto :user_copies
if defined LMT_ELEVATED goto :still_failed
goto :elevate

:user_copies
for /d %%v in ("%APPDATA%\Adobe\After Effects\*") do call :remove_user_copy "%%~fv"
echo.
if %REMOVED% equ 0 goto :not_installed
echo Removed. Restart After Effects to take it out of the Window menu.
echo.
echo Your projects and the preview videos in their AE_Previews folders
echo were not touched.
goto :end

:not_installed
echo LazyMotionToolkit was not installed.
goto :end

rem ================================================================ helpers

:remove_from
set "TARGET=%~1\Support Files\Scripts\ScriptUI Panels\%PANEL%"
if not exist "%TARGET%" exit /b 0
del /f /q "%TARGET%" >nul 2>&1
if exist "%TARGET%" goto :remove_failed
set /a REMOVED+=1
echo   [ok] removed from %~nx1
exit /b 0

:remove_failed
set /a FAILED+=1
if defined LMT_ELEVATED echo   [!] could not remove it from %~nx1
exit /b 0

:remove_user_copy
set "TARGET=%~1\Scripts\ScriptUI Panels\%PANEL%"
if not exist "%TARGET%" exit /b 0
del /f /q "%TARGET%" >nul 2>&1
if exist "%TARGET%" goto :user_copy_failed
set /a REMOVED+=1
echo   [ok] removed your own copy for After Effects %~nx1
exit /b 0

:user_copy_failed
echo   [!] could not remove
echo       "%TARGET%"
exit /b 0

rem ============================================================== outcomes

:elevate
echo.
echo Windows will now ask for administrator rights, because After Effects
echo keeps its panels inside Program Files. Click Yes: the uninstaller goes
echo on in a new window.
set "LAZYMOTION_SELF=%~f0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Start-Process -FilePath $env:LAZYMOTION_SELF -ArgumentList '/elevated' -Verb $env:LAZYMOTION_VERB -ErrorAction Stop } catch { exit 1 }"
if errorlevel 1 goto :declined
exit /b 0

:declined
echo.
echo [!] Administrator rights were not given, so nothing was removed.
goto :end

:still_failed
echo.
echo [!] LazyMotionToolkit.jsx could not be removed from %FAILED% After Effects
echo     folder(s). Close After Effects and run this again.
goto :end

:end
echo.
if not defined LAZYMOTION_NO_PAUSE pause
