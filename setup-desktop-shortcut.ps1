Add-Type -AssemblyName System.Drawing

$Dir      = $PSScriptRoot
$PngPath  = Join-Path $Dir 'waterway-icon.png'
$IconPath = Join-Path $Dir 'waterway.ico'
$BatPath  = Join-Path $Dir 'launch-waterway.bat'
$LinkName = 'Impossible Waterway.lnk'
$LinkPath = Join-Path ([Environment]::GetFolderPath('Desktop')) $LinkName

# -- Icon: a 256x256 render of the scene (waterway-icon.png), wrapped as PNG-in-ICO --
$bmp = New-Object System.Drawing.Bitmap $PngPath
$ms  = New-Object System.IO.MemoryStream
$bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
$png = $ms.ToArray(); $ms.Close(); $bmp.Dispose()

if (Test-Path $IconPath) { Remove-Item $IconPath -Force }
$fs = New-Object System.IO.FileStream $IconPath, 'Create'
$bw = New-Object System.IO.BinaryWriter $fs
$bw.Write([uint16]0); $bw.Write([uint16]1); $bw.Write([uint16]1)
$bw.Write([byte]0); $bw.Write([byte]0); $bw.Write([byte]0); $bw.Write([byte]0)
$bw.Write([uint16]1); $bw.Write([uint16]32)
$bw.Write([uint32]$png.Length); $bw.Write([uint32]22)
$bw.Write($png); $bw.Close(); $fs.Close()

# -- Shortcut --
$ws  = New-Object -ComObject WScript.Shell
$lnk = $ws.CreateShortcut($LinkPath)
$lnk.TargetPath       = $BatPath
$lnk.WorkingDirectory = $Dir
$lnk.IconLocation     = "$IconPath,0"
$lnk.Description      = 'Impossible Waterway - isometric Escher loop'
$lnk.WindowStyle      = 7
$lnk.Save()

Write-Host "[ok] Shortcut placed on Desktop: $LinkName"
