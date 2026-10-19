# ============================================================================
#  publish-to-pages.ps1 —— 把本地 MySQL 里的知识库同步到静态站（GitHub Pages）
# ============================================================================
#  这就是 C 方案的核心脚本，做四件事：
#    1. 调后端 GET /api/export，拿到 49 篇笔记的 JSON
#    2. 和现有的 data/notes.json 做「语义比较」（按 id 排序后比内容，避免只是顺序不同就产生提交）
#    3. 有变化才覆盖 data/notes.json（UTF-8 无 BOM、2 空格缩进，diff 好看）
#    4. git add / commit / push → GitHub Pages 1~2 分钟后自动更新
#
#  参数：
#    -DryRun   只导出+比较，不提交不推送（用来预演）
#
#  注意：这个文件必须存成 UTF-8 with BOM。
#        Windows PowerShell 5.1 读无 BOM 的 .ps1 会按 ANSI 解码，中文会乱掉甚至报语法错。
# ============================================================================

param(
    [switch]$DryRun,
    [switch]$NoPush
)

$ErrorActionPreference = 'Stop'

# tools/ 的上一级 = 博客根目录
$BlogRoot = Split-Path $PSScriptRoot -Parent
$Target   = Join-Path $BlogRoot 'data\notes.json'
$ApiUrl   = 'http://127.0.0.1:8080/api/export'

Write-Host ''
Write-Host '==================================================' -ForegroundColor Cyan
Write-Host '  同步本地知识库 -> 静态站（GitHub Pages）' -ForegroundColor Cyan
Write-Host '==================================================' -ForegroundColor Cyan
Write-Host "  博客目录 : $BlogRoot"

# ---------------------------------------------------------------------------
# 1) 从后端拿导出数据
# ---------------------------------------------------------------------------
try {
    $resp = Invoke-WebRequest -Uri $ApiUrl -UseBasicParsing -TimeoutSec 30
} catch {
    Write-Host ''
    Write-Host '[错误] 连不上后端（' + $ApiUrl + '）' -ForegroundColor Red
    Write-Host '       请先双击「启动全栈知识库.bat」把服务跑起来，再执行本脚本。' -ForegroundColor Yellow
    exit 1
}

# 保险起见按 UTF-8 字节解码，避免中文被错误解码
$bytes = $resp.RawContentStream.ToArray()
$json  = [System.Text.Encoding]::UTF8.GetString($bytes)

# ⚠ PowerShell 5.1 的坑：`$json | ConvertFrom-Json` 在**管道里**会把整个数组
#   当成一个对象抛出来，@() 再包一层就变成"1 个元素"（里面才是 49 条）。
#   先赋值给变量再 @()，拿到的才是真正的 49 个元素。
try {
    $parsedNew = $json | ConvertFrom-Json
    $newNotes  = @($parsedNew)
} catch {
    Write-Host '[错误] 后端返回的不是合法 JSON：' + $_.Exception.Message -ForegroundColor Red
    exit 1
}

if ($newNotes.Count -eq 0) {
    Write-Host '[警告] 后端返回 0 篇笔记，为防误删线上数据，本次不发布。' -ForegroundColor Yellow
    exit 1
}
Write-Host "  后端笔记数 : $($newNotes.Count) 篇"

# ---------------------------------------------------------------------------
# 2) 与现有文件做语义比较
# ---------------------------------------------------------------------------
function Get-Canonical {
    param($notes)
    # 按 id 排序 + 只取 6 个字段 + 压缩成一行，用于稳定比较
    $sorted = @($notes) | Sort-Object { [long]$_.id }
    $projected = foreach ($n in $sorted) {
        [pscustomobject]@{
            id       = [long]$n.id
            date     = [string]$n.date
            created  = [string]$n.created
            title    = [string]$n.title
            category = [string]$n.category
            content  = [string]$n.content
        }
    }
    return ($projected | ConvertTo-Json -Depth 6 -Compress)
}

$oldNotes = @()
if (Test-Path -LiteralPath $Target) {
    $oldRaw = [System.IO.File]::ReadAllText($Target, [System.Text.Encoding]::UTF8)
    try {
        $parsedOld = $oldRaw | ConvertFrom-Json
        $oldNotes  = @($parsedOld)
    } catch { $oldNotes = @() }
}

$oldCanon = Get-Canonical $oldNotes
$newCanon = Get-Canonical $newNotes

if ($oldCanon -eq $newCanon) {
    Write-Host ''
    Write-Host '[跳过] 数据和线上一致，没有需要发布的变化。' -ForegroundColor Green
    exit 0
}

Write-Host '  检测到变化：' -ForegroundColor Yellow
Write-Host "    线上文件 : $($oldNotes.Count) 篇"
Write-Host "    本地数据库: $($newNotes.Count) 篇"

# ---------------------------------------------------------------------------
# 3) 写文件
# ---------------------------------------------------------------------------
if ($DryRun) {
    Write-Host ''
    Write-Host '[DryRun] 已检测到差异，但 -DryRun 模式不会写文件、不会提交、不会推送。' -ForegroundColor Cyan
    exit 0
}

$text = $json.TrimEnd() + "`n"
[System.IO.File]::WriteAllText($Target, $text, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "  已写入 : $Target"

# ---------------------------------------------------------------------------
# 4) git 提交 + 推送
# ---------------------------------------------------------------------------
Push-Location $BlogRoot
try {
    $status = git status --porcelain -- data/notes.json
    if ([string]::IsNullOrWhiteSpace($status)) {
        Write-Host '[跳过] git 没检测到 notes.json 变化。' -ForegroundColor Green
        exit 0
    }

    git add -- data/notes.json
    $msg = "content: 从本地知识库同步（$($newNotes.Count) 篇）"
    git commit -m $msg
    if ($LASTEXITCODE -ne 0) {
        Write-Host '[错误] git commit 失败。' -ForegroundColor Red
        exit 1
    }

    if ($NoPush) {
        Write-Host ''
        Write-Host '[NoPush] 已本地提交，但没有推送（用于测试/预演）。' -ForegroundColor Cyan
        exit 0
    }

    Write-Host '  正在推送到 GitHub ...'
    git push origin main
    if ($LASTEXITCODE -ne 0) {
        Write-Host '[错误] git push 失败。检查网络/代理，或先手动 git push。' -ForegroundColor Red
        exit 1
    }

    Write-Host ''
    Write-Host '[完成] 已推送。GitHub Pages 一般 1~2 分钟后自动更新：' -ForegroundColor Green
    Write-Host '       https://castoricelover777.github.io/blog/'
} finally {
    Pop-Location
}
