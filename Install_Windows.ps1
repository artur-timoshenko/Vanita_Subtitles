$ErrorActionPreference = 'Stop'
try {
    if (Get-Process 'Adobe Premiere Pro' -ErrorAction SilentlyContinue) {
        throw 'Close Adobe Premiere Pro before installing.'
    }
    $source = Join-Path $PSScriptRoot 'com.neura.subtitles'
    if (!(Test-Path (Join-Path $source 'CSXS\manifest.xml'))) {
        throw 'Extract the entire ZIP first. Do not run this installer inside the ZIP.'
    }
    $extensions = Join-Path $env:APPDATA 'Adobe\CEP\extensions'
    $destination = Join-Path $extensions 'com.neura.subtitles'
    $stateDirectory = Join-Path $env:LOCALAPPDATA 'NeuraSubtitles'
    New-Item -ItemType Directory -Force -Path $extensions, $stateDirectory | Out-Null
    $stateFile = Join-Path $stateDirectory 'cep-debug-before-install.json'
    if (!(Test-Path $stateFile)) {
        $state = @(foreach ($v in 11,12) {
            $key = "HKCU:\Software\Adobe\CSXS.$v"
            $value = Get-ItemProperty -Path $key -Name PlayerDebugMode -ErrorAction SilentlyContinue
            @{ Version=$v; HadValue=($null -ne $value); Value=if ($value) { $value.PlayerDebugMode } else { $null } }
        })
        ConvertTo-Json -InputObject $state | Set-Content -Encoding UTF8 $stateFile
    }
    foreach ($v in 11,12) {
        $key = "HKCU:\Software\Adobe\CSXS.$v"
        New-Item -Path $key -Force | Out-Null
        New-ItemProperty -Path $key -Name PlayerDebugMode -Value '1' -PropertyType String -Force | Out-Null
    }
    if (Test-Path $destination) {
        $backup = Join-Path $stateDirectory ('extension-backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
        Move-Item -LiteralPath $destination -Destination $backup
    }
    Copy-Item -LiteralPath $source -Destination $destination -Recurse
    # Native captions use the installed system fonts.
    $fontDirectory = Join-Path $env:LOCALAPPDATA 'Microsoft\Windows\Fonts'
    $fontKey = 'HKCU:\Software\Microsoft\Windows NT\CurrentVersion\Fonts'
    New-Item -ItemType Directory -Force -Path $fontDirectory | Out-Null
    New-Item -Path $fontKey -Force | Out-Null
    foreach ($style in 'Regular','Italic') {
        $fontName = "DMSerifDisplay-$style.ttf"
        $targetFont = Join-Path $fontDirectory $fontName
        if (!(Test-Path $targetFont)) { Copy-Item -LiteralPath (Join-Path $source "fonts\$fontName") -Destination $targetFont }
        $label = "DM Serif Display $style (TrueType)"
        $existing = Get-ItemProperty -Path $fontKey -Name $label -ErrorAction SilentlyContinue
        if (!$existing) { New-ItemProperty -Path $fontKey -Name $label -Value $targetFont -PropertyType String | Out-Null }
    }
    Write-Host 'DM Serif Display fonts installed for the current user. Restart Premiere before adding subtitles.'
    Write-Host 'Installed: Neura Subtitles 5.5.0' -ForegroundColor Green
    Write-Host 'Open Premiere > Window > Extensions > Neura Subtitles.'
    Write-Host 'Unsigned CEP panel: PlayerDebugMode enabled for CSXS.11 and CSXS.12.'
    Write-Host "Path: $destination"
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
