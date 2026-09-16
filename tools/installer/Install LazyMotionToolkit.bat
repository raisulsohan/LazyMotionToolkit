@echo off
rem LazyMotionToolkit - installs the panel into every After Effects on this
rem computer. After Effects lists a script as a dockable panel when it sits in
rem its "Support Files\Scripts\ScriptUI Panels" folder. That folder is inside
rem Program Files, so Windows asks for administrator rights once.

setlocal EnableExtensions
title Install LazyMotionToolkit
cd /d "%~dp0"

set "PANEL=LazyMotionToolkit.jsx"
set "AE_PARENT=%ProgramFiles%\Adobe"
rem Only for testing this installer against a folder that is not the real one.
if defined LAZYMOTION_AE_ROOT set "AE_PARENT=%LAZYMOTION_AE_ROOT%"
if not defined LAZYMOTION_VERB set "LAZYMOTION_VERB=RunAs"
set "LMT_ELEVATED="
if /i "%~1"=="/elevated" set "LMT_ELEVATED=1"

echo ============================================================
echo   LazyMotionToolkit - install
echo   After Effects ScriptUI panel
echo ============================================================
echo.

if not exist "%PANEL%" goto :no_panel

set /a FOUND=0
set /a DONE=0
set /a FAILED=0
set "OLD_TOOLS="
set "OTHER_COPY="
for /d %%a in ("%AE_PARENT%\Adobe After Effects *") do call :install_into "%%~fa"

if %FOUND% equ 0 goto :no_ae
if %FAILED% equ 0 goto :user_copies
if defined LMT_ELEVATED goto :still_failed
goto :elevate

:user_copies
rem A copy someone put in their own AppData folder would still show the old
rem version, so one that is already there is brought up to date too.
for /d %%v in ("%APPDATA%\Adobe\After Effects\*") do call :update_user_copy "%%~fv"

echo.
echo ============================================================
echo   Installed into %DONE% After Effects version(s).
echo ============================================================
echo.
echo   1. Restart After Effects.
echo   2. Open  Window - LazyMotionToolkit.jsx  and dock it anywhere.
echo.
echo   LazyPreview Render also needs this After Effects setting:
echo     Edit - Preferences - Scripting and Expressions -
echo     "Allow Scripts to Write Files and Access Network"
echo.
if defined OLD_TOOLS (
  echo   QuickStrike FX and QuickPreviewRender are now part of the panel
  echo   as LazyStrike FX and LazyPreview Render. Their old script files
  echo   were left in place: delete them from the Scripts folder.
  echo.
)
if not defined OTHER_COPY goto :end
echo   [!] Another LazyMotion script file is in
echo       "%OTHER_COPY%"
echo       It would show up twice in the Window menu. Delete the older one.
echo.
goto :end

rem ================================================================ helpers

:install_into
if not exist "%~1\Support Files\AfterFX.exe" exit /b 0
set /a FOUND+=1
set "PANELS=%~1\Support Files\Scripts\ScriptUI Panels"
if not exist "%PANELS%" mkdir "%PANELS%" >nul 2>&1
copy /y "%PANEL%" "%PANELS%\%PANEL%" >nul 2>&1
fc /b "%PANEL%" "%PANELS%\%PANEL%" >nul 2>&1
if errorlevel 1 goto :install_failed
set /a DONE+=1
echo   [ok] %~nx1
if exist "%PANELS%\QuickStrike FX.jsx" set "OLD_TOOLS=1"
if exist "%PANELS%\QuickPreviewRender.jsx" set "OLD_TOOLS=1"
if exist "%PANELS%\..\QuickStrike FX.jsx" set "OLD_TOOLS=1"
if exist "%PANELS%\..\QuickPreviewRender.jsx" set "OLD_TOOLS=1"
dir /b "%PANELS%\LazyMotion*.jsx*" 2>nul | findstr /v /i /x /c:"%PANEL%" >nul
if not errorlevel 1 set "OTHER_COPY=%PANELS%"
exit /b 0

:install_failed
set /a FAILED+=1
if defined LMT_ELEVATED echo   [!] could not copy into %~nx1
exit /b 0

:update_user_copy
set "USER_PANEL=%~1\Scripts\ScriptUI Panels\%PANEL%"
if not exist "%USER_PANEL%" exit /b 0
copy /y "%PANEL%" "%USER_PANEL%" >nul 2>&1
fc /b "%PANEL%" "%USER_PANEL%" >nul 2>&1
if errorlevel 1 goto :user_copy_failed
echo   [ok] also updated your own copy for After Effects %~nx1
exit /b 0

:user_copy_failed
echo   [!] could not update your own copy in
echo       "%~1\Scripts\ScriptUI Panels"
exit /b 0

rem ============================================================== outcomes

:elevate
echo.
echo Windows will now ask for administrator rights, because After Effects
echo keeps its panels inside Program Files. Click Yes: the installer goes
echo on in a new window.
set "LAZYMOTION_SELF=%~f0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Start-Process -FilePath $env:LAZYMOTION_SELF -ArgumentList '/elevated' -Verb $env:LAZYMOTION_VERB -ErrorAction Stop } catch { exit 1 }"
if errorlevel 1 goto :declined
exit /b 0

:declined
echo.
echo [!] Administrator rights were not given, so nothing was installed.
echo     Run this again and click Yes, or copy LazyMotionToolkit.jsx by
echo     hand - see "Read me first.txt".
goto :end

:still_failed
echo.
echo [!] The panel could not be copied into %FAILED% of %FOUND% After Effects
echo     folder(s). Close After Effects, allow the copy if your antivirus
echo     asks, and run this again.
goto :end

:no_panel
echo [!] LazyMotionToolkit.jsx is not next to this file.
echo     Unzip the whole download first, then run this from inside that folder.
goto :end

:no_ae
echo [!] No After Effects was found in
echo     "%AE_PARENT%"
echo     Copy LazyMotionToolkit.jsx by hand into the "Scripts\ScriptUI Panels"
echo     folder of your After Effects - see "Read me first.txt".
goto :end

:end
echo.
if not defined LAZYMOTION_NO_PAUSE pause
