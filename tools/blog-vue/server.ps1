# ============================================================================
#  server-vue.ps1 -- tiny local server for the Vue refactored blog
# ============================================================================
#  Why not reuse tools\server.ps1 ?
#    The refactored version lives in tools\vue-重构版\, so the web root differs.
#
#  Why http instead of double-clicking the .html ?
#    Under file:// the browser blocks JS from reading data/notes.json.
#
#  Port 8099 by default, so it can run at the same time as the original (8080)
#  for side-by-side comparison.
#
#  NOTE: this file is intentionally pure ASCII. Windows PowerShell 5.1 reads
#  .ps1 using the system ANSI code page, so non-ASCII comments would be decoded
#  wrongly and could break parsing. Same reason tools\server.ps1 is ASCII.
# ============================================================================

param(
    [int]$Port = 8099
)

$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot      # this script's folder = vue-重构版

Write-Host ""
Write-Host "  ==================================================" -ForegroundColor Cyan
Write-Host "   Vue refactored blog - local server" -ForegroundColor Cyan
Write-Host "  ==================================================" -ForegroundColor Cyan
Write-Host "   root : $Root"
Write-Host "   url  : http://127.0.0.1:$Port/"
Write-Host "   stop : close this window, or press Ctrl+C"
Write-Host "  ==================================================" -ForegroundColor Cyan
Write-Host ""

# ---- find a free port ----
$listener = $null
for ($p = $Port; $p -lt $Port + 40; $p++) {
    try {
        $l = New-Object System.Net.HttpListener
        $l.Prefixes.Add("http://127.0.0.1:$p/")
        $l.Start()
        $listener = $l
        $Port = $p
        break
    } catch {
        Write-Host "  port $p busy, trying next ..." -ForegroundColor DarkYellow
    }
}
if ($null -eq $listener) {
    Write-Host "ERROR: no free port found in range starting at $Port" -ForegroundColor Red
    exit 1
}
Write-Host "  listening on http://127.0.0.1:$Port/" -ForegroundColor Green
Write-Host ""

# ---- mime types ----
$mime = @{
    '.html' = 'text/html; charset=utf-8'
    '.js'   = 'application/javascript; charset=utf-8'
    '.css'  = 'text/css; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'
    '.svg'  = 'image/svg+xml'
    '.png'  = 'image/png'
    '.ico'  = 'image/x-icon'
}

try {
    while ($listener.IsListening) {
        $ctx = $listener.GetContext()
        $req = $ctx.Request
        $res = $ctx.Response

        try {
            $rel = $req.Url.LocalPath
            if ($rel -eq '/' -or $rel -eq '') { $rel = '/index.html' }

            $rel = [System.Uri]::UnescapeDataString($rel).TrimStart('/')

            # safety: block path traversal
            if ($rel -match '\.\.') {
                $res.StatusCode = 403
                $body = [System.Text.Encoding]::UTF8.GetBytes('403 forbidden')
                $res.OutputStream.Write($body, 0, $body.Length)
                Write-Host "  403  $($req.Url.LocalPath)" -ForegroundColor DarkYellow
                continue
            }

            $full = Join-Path $Root ($rel -replace '/', '\')

            if (-not (Test-Path $full) -or (Get-Item $full).PSIsContainer) {
                $res.StatusCode = 404
                $body = [System.Text.Encoding]::UTF8.GetBytes("404 not found: $rel")
                $res.OutputStream.Write($body, 0, $body.Length)
                Write-Host "  404  $($req.Url.LocalPath)" -ForegroundColor DarkYellow
                continue
            }

            $ext = [System.IO.Path]::GetExtension($full).ToLower()
            if ($mime.ContainsKey($ext)) { $res.ContentType = $mime[$ext] }
            else { $res.ContentType = 'application/octet-stream' }

            $res.Headers.Add('Cache-Control', 'no-cache')

            $bytes = [System.IO.File]::ReadAllBytes($full)
            $res.ContentLength64 = $bytes.Length
            $res.OutputStream.Write($bytes, 0, $bytes.Length)
            Write-Host "  200  $($req.Url.LocalPath)"
        } catch {
            Write-Host "  request error: $_" -ForegroundColor Red
        } finally {
            $res.OutputStream.Close()
        }
    }
} finally {
    $listener.Stop()
    $listener.Close()
    Write-Host ""
    Write-Host "  server stopped." -ForegroundColor Yellow
}
