; ============================================================
;  Custom NSIS script for Billing System Installer
;  Handles:
;    1. Visual C++ Redistributable 2022 (needed by better-sqlite3)
;    2. Ollama (needed for offline AI — optional)
; ============================================================

; ─── Check & Install prerequisites BEFORE main install ───────────────────────
!macro customInstall
  ; ── 1. Visual C++ Redistributable 2022 x64 ─────────────────────────────────
  ReadRegDword $0 HKLM "SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64" "Installed"
  
  ${If} $0 != 1
    ReadRegDword $0 HKLM "SOFTWARE\WOW6432Node\Microsoft\VisualStudio\14.0\VC\Runtimes\x64" "Installed"
  ${EndIf}

  ${If} $0 != 1
    MessageBox MB_ICONINFORMATION|MB_OK \
      "Billing System requires Microsoft Visual C++ 2022 Runtime.$\n$\nIt will be installed automatically. This is a one-time setup."
    
    SetOutPath "$TEMP\BillingSetup"
    File "${BUILD_RESOURCES_DIR}\VC_redist.x64.exe"
    
    DetailPrint "Installing Visual C++ 2022 Redistributable..."
    ExecWait '"$TEMP\BillingSetup\VC_redist.x64.exe" /install /quiet /norestart' $1
    
    ${If} $1 != 0
    ${AndIf} $1 != 3010
      MessageBox MB_ICONSTOP|MB_OK \
        "Failed to install Visual C++ 2022 Runtime (error $1).$\n$\nPlease download it manually from:$\nhttps://aka.ms/vs/17/release/vc_redist.x64.exe$\n$\nThen re-run the installer."
      Abort
    ${EndIf}
    
    ${If} $1 == 3010
      MessageBox MB_ICONINFORMATION|MB_OK \
        "Visual C++ Redistributable installed.$\n$\nA system restart may be required after installation."
    ${EndIf}
    
    Delete "$TEMP\BillingSetup\VC_redist.x64.exe"
  ${Else}
    DetailPrint "Visual C++ 2022 Runtime: Already installed."
  ${EndIf}

  ; ── 2. Ollama (optional — for AI Analyst feature) ──────────────────────────
  IfFileExists "$LOCALAPPDATA\Programs\Ollama\ollama.exe" ollama_found ollama_check2
  
  ollama_check2:
  IfFileExists "$PROGRAMFILES64\Ollama\ollama.exe" ollama_found ollama_ask
  
  ollama_found:
    DetailPrint "Ollama: Already installed."
    Goto ollama_done
    
  ollama_ask:
    MessageBox MB_ICONQUESTION|MB_YESNO \
      "Ollama (Offline AI Engine) is not installed.$\n$\nOllama enables the AI Business Analyst feature.$\n$\nDo you want to open the Ollama download page after installation?$\n$\n(You can install it later from https://ollama.com)" \
      IDNO ollama_done
    
    ; Open browser to Ollama download page after install completes
    WriteRegStr HKCU "Software\BillingSystem" "PendingOllamaInstall" "1"
    DetailPrint "Ollama: Will open download page after installation."
    
  ollama_done:
  
  RMDir "$TEMP\BillingSetup"
!macroend

; ─── Run AFTER install completes ─────────────────────────────────────────────
!macro customInstallMode
!macroend

; ─── Uninstaller ─────────────────────────────────────────────────────────────
!macro customUnInstall
  MessageBox MB_ICONQUESTION|MB_YESNO \
    "Do you want to remove all Billing System data and backups?$\n$\n(Select NO to keep your data for reinstallation)" \
    IDNO keep_data
    
  RMDir /r "$APPDATA\BillingSystem"
  keep_data:
  
  DeleteRegKey HKCU "Software\BillingSystem"
!macroend
