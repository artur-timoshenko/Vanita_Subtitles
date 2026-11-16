$ErrorActionPreference = 'Stop'
try {
    if (Get-Process 'Adobe Premiere Pro' -ErrorAction SilentlyContinue) { throw 'Close Premiere first.' }
    $destination = Join-Path $env:APPDATA 'Adobe\CEP\extensions\com.neura.subtitles'
    if (Test-Path $destination) { Remove-Item -LiteralPath $destination -Recurse -Force }
    $stateFile = Join-Path $env:LOCALAPPDATA 'NeuraSubtitles\cep-debug-before-install.json'
    if (Test-Path $stateFile) {
        $answer = Read-Host 'Restore previous CEP debug settings? This can hide OTHER unsigned panels installed later. Type YES to restore, or press Enter to keep them'
        if ($answer -eq 'YES') {
            $state = Get-Content -Raw $stateFile | ConvertFrom-Json
            foreach ($entry in $state) {
                $key = "HKCU:\Software\Adobe\CSXS.$($entry.Version)"
                if ($entry.HadValue) { New-ItemProperty -Path $key -Name PlayerDebugMode -Value $entry.Value -PropertyType String -Force | Out-Null }
                else { Remove-ItemProperty -Path $key -Name PlayerDebugMode -ErrorAction SilentlyContinue }
            }
            Remove-Item -LiteralPath $stateFile
        }
    }
    Write-Host 'Panel removed. Generated subtitle project files were kept.' -ForegroundColor Green
} catch { Write-Host $_.Exception.Message -ForegroundColor Red; exit 1 }
