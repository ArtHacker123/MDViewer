Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$outDir = Join-Path $root 'icons'
New-Item -ItemType Directory -Path $outDir -Force | Out-Null

function New-RoundedPath {
    param([float]$x, [float]$y, [float]$w, [float]$h, [float]$r)
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = [float]($r * 2)
    $path.AddArc($x, $y, $d, $d, 180, 90)
    $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
    $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
    $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
    $path.CloseFigure()
    return $path
}

$sizes = @(16, 32, 48, 128)
foreach ($s in $sizes) {
    $bmp = New-Object System.Drawing.Bitmap($s, $s, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $g.Clear([System.Drawing.Color]::Transparent)

    $radius = [Math]::Max(2, [int]($s * 0.2))
    $path = New-RoundedPath 0 0 $s $s $radius
    $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        (New-Object System.Drawing.Point(0, 0)),
        (New-Object System.Drawing.Point($s, $s)),
        [System.Drawing.Color]::FromArgb(37, 99, 235),
        [System.Drawing.Color]::FromArgb(29, 78, 216)
    )
    $g.FillPath($brush, $path)

    $fontSize = [float][Math]::Max(7, [int]($s * 0.40))
    $font = New-Object System.Drawing.Font(
        'Segoe UI',
        $fontSize,
        [System.Drawing.FontStyle]::Bold,
        [System.Drawing.GraphicsUnit]::Pixel
    )
    $fmt = New-Object System.Drawing.StringFormat
    $fmt.Alignment = [System.Drawing.StringAlignment]::Center
    $fmt.LineAlignment = [System.Drawing.StringAlignment]::Center
    $rect = New-Object System.Drawing.RectangleF(0, 0, $s, $s)
    $g.DrawString('MD', $font, [System.Drawing.Brushes]::White, $rect, $fmt)

    $out = Join-Path $outDir ("icon{0}.png" -f $s)
    $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)

    $fmt.Dispose()
    $font.Dispose()
    $brush.Dispose()
    $path.Dispose()
    $g.Dispose()
    $bmp.Dispose()
    Write-Output "wrote $out"
}
