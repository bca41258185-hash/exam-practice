; 解除安裝時一併拿掉「開機自動啟動」，免得開機時找不到程式。設定與修為（%APPDATA%\desk-pet）保留，重裝後接著修煉。
!macro customUnInstall
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "electron.app.DeskPet"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "local.deskpet.app"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "DeskPet"
!macroend
