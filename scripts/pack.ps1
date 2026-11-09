$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $root 'mdviewer-extension.zip'
$temp = Join-Path $env:TEMP ('mdviewer-pack-' + [guid]::NewGuid().ToString('N'))

if (Test-Path -LiteralPath $out) {
    Remove-Item -LiteralPath $out -Force
}

New-Item -ItemType Directory -Path $temp | Out-Null
Copy-Item -LiteralPath (Join-Path $root 'manifest.json') -Destination $temp
Copy-Item -LiteralPath (Join-Path $root 'README.md') -Destination $temp
Copy-Item -LiteralPath (Join-Path $root 'icons') -Destination $temp -Recurse
Copy-Item -LiteralPath (Join-Path $root 'vendor') -Destination $temp -Recurse
Copy-Item -LiteralPath (Join-Path $root 'src') -Destination $temp -Recurse

Compress-Archive -Path (Join-Path $temp '*') -DestinationPath $out
Remove-Item -LiteralPath $temp -Recurse -Force

Write-Output "Created $out"
