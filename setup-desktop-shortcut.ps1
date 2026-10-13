$Dir      = $PSScriptRoot
$IconPath = Join-Path $Dir 'favicon.ico'
$BatPath  = Join-Path $Dir 'launch-site.bat'
$LinkName = 'lucylu.org.lnk'
$LinkPath = Join-Path ([Environment]::GetFolderPath('Desktop')) $LinkName

# -- Shortcut (icon: the LL favicon) --
$ws  = New-Object -ComObject WScript.Shell
$lnk = $ws.CreateShortcut($LinkPath)
$lnk.TargetPath       = $BatPath
$lnk.WorkingDirectory = $Dir
$lnk.IconLocation     = "$IconPath,0"
$lnk.Description      = 'lucylu.org - run the site locally'
$lnk.WindowStyle      = 7
$lnk.Save()

Write-Host "[ok] Shortcut placed on Desktop: $LinkName"
