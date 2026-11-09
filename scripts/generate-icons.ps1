# Genera los iconos PNG de la PWA a partir del glifo "M" de public/images/favicon.svg.
# Solo es necesario ejecutarlo si cambia la marca; los PNG ya están versionados.
# Uso: powershell -ExecutionPolicy Bypass -File scripts/generate-icons.ps1

#requires -Version 5.1

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
$outDir = Join-Path $projectRoot 'public\images\icons'

if (-not (Test-Path -LiteralPath $outDir)) {
  New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}

$brandColor = [System.Drawing.ColorTranslator]::FromHtml('#206bc4')
$white = [System.Drawing.Color]::White

# Contorno de la "M" tomado de public/images/favicon.svg (viewBox 0 0 64 64).
$glyphPoints = @(
  @(18, 46), @(18, 18), @(24, 18), @(32, 31), @(40, 18), @(46, 18),
  @(46, 46), @(40, 46), @(40, 28), @(32, 40), @(24, 28), @(24, 46)
)

function New-GlyphPath {
  param(
    [float]$OffsetX,
    [float]$OffsetY,
    [float]$Scale
  )

  $points = New-Object 'System.Drawing.PointF[]' $glyphPoints.Count
  for ($i = 0; $i -lt $glyphPoints.Count; $i++) {
    $x = [float]($OffsetX + $glyphPoints[$i][0] * $Scale)
    $y = [float]($OffsetY + $glyphPoints[$i][1] * $Scale)
    $points[$i] = New-Object System.Drawing.PointF($x, $y)
  }

  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.AddPolygon($points)
  return $path
}

function Save-Icon {
  param(
    [string]$FileName,
    [int]$Size,
    [double]$GlyphScale = 1.0
  )

  $bitmap = New-Object System.Drawing.Bitmap($Size, $Size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

  # Fondo a sangre (sin transparencia): evita bordes blancos en Android e iOS.
  $backgroundBrush = New-Object System.Drawing.SolidBrush($brandColor)
  $graphics.FillRectangle($backgroundBrush, 0, 0, $Size, $Size)
  $backgroundBrush.Dispose()

  $scale = ($Size / 64.0) * $GlyphScale
  $offset = (($Size / 64.0) - $scale) * 32.0

  $glyph = New-GlyphPath -OffsetX $offset -OffsetY $offset -Scale $scale
  $glyphBrush = New-Object System.Drawing.SolidBrush($white)
  $graphics.FillPath($glyphBrush, $glyph)
  $glyphBrush.Dispose()
  $glyph.Dispose()
  $graphics.Dispose()

  $target = Join-Path $outDir $FileName
  $bitmap.Save($target, [System.Drawing.Imaging.ImageFormat]::Png)
  $bitmap.Dispose()

  Write-Host ("[icons] {0} ({1}x{1})" -f $target, $Size)
}

Save-Icon -FileName 'icon-192.png' -Size 192
Save-Icon -FileName 'icon-512.png' -Size 512
Save-Icon -FileName 'icon-maskable-192.png' -Size 192 -GlyphScale 0.9
Save-Icon -FileName 'icon-maskable-512.png' -Size 512 -GlyphScale 0.9
Save-Icon -FileName 'apple-touch-icon.png' -Size 180

Write-Host '[icons] Iconos generados correctamente.'
