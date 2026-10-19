# ============================================================================
#  server.ps1 —— 一个极小的本地静态文件服务器
# ============================================================================
#
#  【这个文件是干什么的】
#    它只做两件事：
#      1) 浏览器要什么文件（index.html、app.js、data/notes.json……），它就从项目
#         目录里读出来发过去；
#      2) 额外提供一个 POST /api/save 接口，把请求内容写回 data/notes.json
#         （这是当初"完整版"用来点一下保存的；现在这版网页用不到它，
#           但留着不影响任何东西，想启用随时可用）。
#
#  【为什么必须有它】（这是本项目最容易踩的坑）
#    如果直接双击 index.html，地址栏是 file:// 开头。浏览器出于安全策略，
#    不允许网页里的 JavaScript 去读本机文件，fetch('data/notes.json') 会被拦下来，
#    页面就一条数据都读不到。
#    只要换成一个 http://127.0.0.1:8080/ 这样的地址来打开，就没这个限制。
#    所以需要一个"本地小服务器"——就是这个文件。
#
#  【怎么用】
#    双击项目根目录的 .bat 启动器即可（它会调用本文件）。
#    想停止：关掉那个黑色命令行窗口，或者在里面按 Ctrl+C。
#
#  【几个安全设计】
#    · 只监听 127.0.0.1（本机回环地址），局域网和互联网都访问不到；
#    · 不需要管理员权限（用的是普通 TCP 套接字，不是 http.sys）；
#    · 读取文件时禁止跳出项目目录（防目录穿越）；
#    · 写入接口只认 data/notes.json 这一个路径。
#
#  【编码提醒（重要）】
#    本文件里写了中文注释，所以**必须保存成"UTF-8 带 BOM"**。
#    原因：Windows PowerShell 5.1 读没有 BOM 的 .ps1 时会按系统默认编码（中文系统是
#    GBK）去解码，中文注释会乱码，严重时还会破坏语法导致脚本报错。
#    如果你以后用别的编辑器改这个文件，请确认保存时保留了 UTF-8 BOM。
# ============================================================================

# param 是脚本的参数，启动时可以传，不传就用默认值。
# -Port 8080 表示默认监听 8080 端口；
# -NoBrowser 是一个开关，加上它就不会自动打开浏览器（我自己测试时用）。
param(
  [int]$Port = 8080,
  [switch]$NoBrowser
)

# 遇到错误就停下来，不要默默地继续跑（否则出错后行为很难猜）
$ErrorActionPreference = 'Stop'

# ---- 几个路径 ----
# $PSScriptRoot 是"本脚本所在目录"，也就是 <项目>\tools
# Split-Path -Parent 取它的上一层，得到项目根目录，所以 U 盘盘符变了也不受影响。
$Root        = [System.IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
# 站点源码放在 Maven 标准目录 src\main\webapp 下，浏览器只从这里取文件。
$WebRoot     = Join-Path $Root 'src\main\webapp'
$NotesPath   = Join-Path $WebRoot 'data\notes.json'     # 数据文件（站点要读，所以放 webapp 里）
$NotesBackup = Join-Path $Root 'notes\notes.json.bak'   # 写入前的自动备份（工作文件，不发布）
# 请求体大小上限：8 MB。一个纯文本知识库远远用不到这么大，超过就拒绝，防止有人乱发大文件。
$MaxBodyBytes = 8 * 1024 * 1024

# ---- 文件类型对照表（MIME）----
# 浏览器要靠这个"内容类型"才知道拿到的文件该怎么处理：
# 是当成网页渲染、当成样式、当成 JS 执行，还是当成图片显示。
# 如果类型给错了（比如把 .css 说成普通文本），页面样式就会失效。
$Mime = @{
  '.html'  = 'text/html; charset=utf-8'
  '.htm'   = 'text/html; charset=utf-8'
  '.css'   = 'text/css; charset=utf-8'
  '.js'    = 'application/javascript; charset=utf-8'
  '.mjs'   = 'application/javascript; charset=utf-8'
  '.json'  = 'application/json; charset=utf-8'
  '.md'    = 'text/plain; charset=utf-8'
  '.txt'   = 'text/plain; charset=utf-8'
  '.xml'   = 'application/xml; charset=utf-8'
  '.svg'   = 'image/svg+xml'
  '.png'   = 'image/png'
  '.jpg'   = 'image/jpeg'
  '.jpeg'  = 'image/jpeg'
  '.gif'   = 'image/gif'
  '.webp'  = 'image/webp'
  '.bmp'   = 'image/bmp'
  '.ico'   = 'image/x-icon'
  '.woff'  = 'font/woff'
  '.woff2' = 'font/woff2'
  '.ttf'   = 'font/ttf'
  '.pdf'   = 'application/pdf'
  '.zip'   = 'application/zip'
}

# ============================================================================
#  一、发送响应（HTTP 协议最基础的部分）
# ============================================================================

# 拼出完整响应：状态行 + 响应头 + 空行 + 响应体（正文）
# HTTP 响应的格式是固定的：
#     HTTP/1.1 200 OK           <- 状态行：协议版本 状态码 说明
#     Content-Type: ...         <- 响应头：告诉浏览器这是什么类型、有多长
#     Content-Length: ...
#                             <- 一个空行，表示"头结束了，下面是正文"
#     <正文二进制数据>
function Send-Raw {
  param(
    [System.IO.Stream]$Stream,   # 往哪个网络连接写
    [int]$StatusCode,            # 状态码：200 成功、404 找不到、403 禁止、400 请求有错
    [string]$StatusText,         # 状态说明文字
    [string]$ContentType,        # 内容类型，取自上面的 $Mime 表
    [byte[]]$Body                # 正文的字节数组
  )
  # 反引号 + n 是 PowerShell 里的换行符；HTTP 规定换行必须是 \r\n（回车+换行）
  $head = "HTTP/1.1 $StatusCode $StatusText`r`n" +
          "Content-Type: $ContentType`r`n" +
          "Content-Length: $($Body.Length)`r`n" +
          "Cache-Control: no-store`r`n" +      # 让浏览器不要缓存，改完刷新就能看到最新
          "Connection: close`r`n" +            # 发完就断开连接，省得处理长连接的复杂度
          "`r`n"
  # 响应头按 ASCII 编码成字节（HTTP 头不允许直接放中文）
  $headBytes = [System.Text.Encoding]::ASCII.GetBytes($head)
  $Stream.Write($headBytes, 0, $headBytes.Length)
  if ($Body.Length -gt 0) { $Stream.Write($Body, 0, $Body.Length) }
  $Stream.Flush()   # 冲刷缓冲区，数据才真正发出去
}

# 发送一段纯文本（出错时用它，例如 404）
function Send-Text {
  param([System.IO.Stream]$Stream, [int]$StatusCode, [string]$StatusText, [string]$Text)
  Send-Raw -Stream $Stream -StatusCode $StatusCode -StatusText $StatusText `
           -ContentType 'text/plain; charset=utf-8' `
           -Body ([System.Text.Encoding]::UTF8.GetBytes($Text))
}

# 发送一段 JSON（保存接口的返回值用它）
function Send-Json {
  param([System.IO.Stream]$Stream, [int]$StatusCode, [string]$StatusText, [string]$Json)
  Send-Raw -Stream $Stream -StatusCode $StatusCode -StatusText $StatusText `
           -ContentType 'application/json; charset=utf-8' `
           -Body ([System.Text.Encoding]::UTF8.GetBytes($Json))
}

# ============================================================================
#  二、读取浏览器发来的请求
# ============================================================================

function Read-Request {
  param([System.IO.Stream]$Stream)

  # 逐字节读，一直读到"空行"（也就是连续出现 \r\n\r\n）为止，这部分是请求头。
  #
  # 为什么这里要一个字节一个字节地读，而不用更方便的 StreamReader？
  # 因为 StreamReader 会一次性预读一大块数据到自己的缓冲区里，
  # 那样一来，POST 请求后面跟着的正文就可能被它提前吞掉一部分，
  # 我们再从流里读正文就会读不全。逐字节读虽然笨，但边界绝对准确。
  $head = New-Object System.Collections.Generic.List[byte]
  while ($true) {
    $b = $Stream.ReadByte()          # 读一个字节，返回 -1 表示连接结束了
    if ($b -lt 0) { break }
    $head.Add([byte]$b)

    # 检查最后四个字节是不是 \r\n\r\n（13 是 \r，10 是 \n）
    $n = $head.Count
    if ($n -ge 4 -and $head[$n-4] -eq 13 -and $head[$n-3] -eq 10 -and
        $head[$n-2] -eq 13 -and $head[$n-1] -eq 10) { break }

    if ($n -gt 65536) { break }      # 请求头长到离谱，不读了，防止被恶意占资源
  }

  # 把读到的字节按 ASCII 变成文字，再按换行拆成一行行
  $headerText = [System.Text.Encoding]::ASCII.GetString($head.ToArray())
  $lines = $headerText -split "`r`n"
  $requestLine = $lines[0]           # 第一行形如：GET /data/notes.json HTTP/1.1

  # 剩下的行是各个请求头，形如 "content-length: 123"，拆成 名字 -> 值 放进哈希表
  $headers = @{}
  for ($i = 1; $i -lt $lines.Length; $i++) {
    $line = $lines[$i]
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    $idx = $line.IndexOf(':')
    if ($idx -gt 0) {
      $name  = $line.Substring(0, $idx).Trim().ToLower()
      $value = $line.Substring($idx + 1).Trim()
      $headers[$name] = $value
    }
  }

  # 请求行拆开：$parts[0] 是方法（GET/POST），$parts[1] 是要的路径
  $parts  = $requestLine -split ' '
  $method = if ($parts.Length -ge 1) { $parts[0].ToUpper() } else { 'GET' }
  $target = if ($parts.Length -ge 2) { $parts[1] } else { '/' }

  # ---- 读正文（只有 POST 才有）----
  # 正文有多少字节，由请求头里的 Content-Length 决定。
  [byte[]]$body = @()
  if ($headers.ContainsKey('content-length')) {
    $len = 0
    if ([int]::TryParse($headers['content-length'], [ref]$len) -and $len -gt 0) {
      if ($len -gt $MaxBodyBytes) {
        # 太大，不读了，直接标记一下让上层去拒绝
        return [pscustomobject]@{ Method = $method; Target = $target; Headers = $headers; Body = $body; TooLarge = $true }
      }
      $buffer = New-Object byte[] $len
      $read = 0
      # 网络数据是一段一段到的，所以要循环读，直到读满 $len 个字节
      while ($read -lt $len) {
        $n = $Stream.Read($buffer, $read, $len - $read)
        if ($n -le 0) { break }
        $read += $n
      }
      # 万一对方发到一半断了，就只取实际读到的部分
      if ($read -lt $len) {
        $trimmed = New-Object byte[] $read
        [Array]::Copy($buffer, $trimmed, $read)
        $body = $trimmed
      } else {
        $body = $buffer
      }
    }
  }

  # 把解析结果打包成一个对象返回给调用者
  return [pscustomobject]@{
    Method = $method; Target = $target; Headers = $headers; Body = $body; TooLarge = $false
  }
}

# ============================================================================
#  三、POST /api/save —— 把内容写回 data/notes.json
#     现在这版网页不用它（改用"下载数据"按钮了），但保留着不影响任何功能。
# ============================================================================

function Save-Notes {
  param($Request, [System.IO.Stream]$Stream)

  # 请求体太大 -> 413
  if ($Request.TooLarge) {
    Send-Json -Stream $Stream -StatusCode 413 -StatusText 'Payload Too Large' `
              -Json '{"ok":false,"error":"body too large (limit 8 MB)"}'
    Write-Host '  413  POST /api/save (too large)' -ForegroundColor DarkYellow
    return
  }

  # 只接受 JSON 类型的请求。这一条同时也是个安全措施：
  # 别的网页想偷偷往这个接口发数据的话，浏览器会先发一个"预检请求"，
  # 而我们的服务器不回应预检，于是跨站写入会被浏览器拦下来。
  $ct = ''
  if ($Request.Headers.ContainsKey('content-type')) { $ct = $Request.Headers['content-type'] }
  if ($ct -notmatch 'application/json') {
    Send-Json -Stream $Stream -StatusCode 415 -StatusText 'Unsupported Media Type' `
              -Json '{"ok":false,"error":"Content-Type must be application/json"}'
    Write-Host '  415  POST /api/save (bad content type)' -ForegroundColor DarkYellow
    return
  }

  # 空内容直接拒绝
  if ($Request.Body.Length -eq 0) {
    Send-Json -Stream $Stream -StatusCode 400 -StatusText 'Bad Request' `
              -Json '{"ok":false,"error":"empty body"}'
    Write-Host '  400  POST /api/save (empty body)' -ForegroundColor DarkYellow
    return
  }

  # 有些工具写文件时会加一个 UTF-8 BOM（开头的三个字节 EF BB BF）。
  # 浏览器不会加，但别的工具可能会。这里先把它去掉，原因有两个：
  #   1) ConvertFrom-Json 解析带 BOM 的文本会报错；
  #   2) 我们也不希望 notes.json 里带 BOM。
  [byte[]]$body = $Request.Body
  if ($body.Length -ge 3 -and $body[0] -eq 0xEF -and $body[1] -eq 0xBB -and $body[2] -eq 0xBF) {
    $withoutBom = New-Object byte[] ($body.Length - 3)
    [Array]::Copy($body, 3, $withoutBom, 0, $body.Length - 3)
    $body = $withoutBom
    Write-Host '  note: stripped a UTF-8 BOM from the request body' -ForegroundColor DarkGray
  }

  # 校验：必须是合法 JSON，而且最外层必须是数组（以 [ 开头）
  $text = [System.Text.Encoding]::UTF8.GetString($body)
  if (-not $text.TrimStart().StartsWith('[')) {
    Send-Json -Stream $Stream -StatusCode 400 -StatusText 'Bad Request' `
              -Json '{"ok":false,"error":"notes.json must be a JSON array, starting with ["}'
    Write-Host '  400  POST /api/save (not an array)' -ForegroundColor DarkYellow
    return
  }
  try {
    $null = ConvertFrom-Json $text          # 只为检查语法，结果不用
  } catch {
    Send-Json -Stream $Stream -StatusCode 400 -StatusText 'Bad Request' `
              -Json '{"ok":false,"error":"invalid JSON"}'
    Write-Host '  400  POST /api/save (invalid JSON)' -ForegroundColor DarkYellow
    return
  }

  # 粗略数一下有几条记录，仅用于日志显示。
  # 真正记录里的 id 写成 "id": ，而正文里如果出现同样的字面内容，会被转义成 \"id\" ，
  # 所以这个正则不会把正文里的内容误算进去。
  $count = ([regex]::Matches($text, '"id"\s*:')).Count

  # 写入磁盘。顺序很重要：
  #   1) 先把当前文件备份成 .bak；
  #   2) 再写到临时文件；
  #   3) 最后把临时文件改名覆盖正式文件。
  # 这样做的好处：万一写到一半断电或出错，正式文件还是完整的旧版本，
  # 不会出现"半个坏文件"，也就是所谓的"原子替换"。
  try {
    $dataDir = Split-Path -Parent $NotesPath
    if (-not (Test-Path -LiteralPath $dataDir)) {
      New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
    }
    if (Test-Path -LiteralPath $NotesPath) {
      Copy-Item -LiteralPath $NotesPath -Destination $NotesBackup -Force
    }
    $tmp = $NotesPath + '.tmp'
    [System.IO.File]::WriteAllBytes($tmp, $body)      # 直接写原始字节，保留中文和格式
    Move-Item -LiteralPath $tmp -Destination $NotesPath -Force
  } catch {
    Send-Json -Stream $Stream -StatusCode 500 -StatusText 'Internal Server Error' `
              -Json ('{"ok":false,"error":"' + ($_.Exception.Message -replace '"', "'") + '"}')
    Write-Host ('  500  POST /api/save (' + $_.Exception.Message + ')') -ForegroundColor Red
    return
  }

  # 成功，返回写入了多少条、多少字节
  $json = '{"ok":true,"count":' + $count + ',"bytes":' + $body.Length + '}'
  Send-Json -Stream $Stream -StatusCode 200 -StatusText 'OK' -Json $json
  Write-Host ('  200  POST /api/save (' + $count + ' notes, ' + $body.Length + ' bytes)') -ForegroundColor Green
}

# ============================================================================
#  四、GET 请求：把文件发出去
# ============================================================================

function Serve-File {
  param($Request, [System.IO.Stream]$Stream)

  # 去掉网址里 ? 后面的查询参数，并对 %XX 这类转义还原（例如中文文件名）
  $pathPart = $Request.Target.Split('?')[0]
  try { $pathPart = [System.Uri]::UnescapeDataString($pathPart) } catch { }
  # 访问根目录时默认给 index.html
  if ([string]::IsNullOrEmpty($pathPart) -or $pathPart -eq '/') { $pathPart = '/index.html' }

  # 把网址路径拼成本机文件路径。
  # 网址里用 / 分隔，Windows 文件系统用 \ 分隔，所以要替换一下。
  $relative = $pathPart.TrimStart('/').Replace('/', [System.IO.Path]::DirectorySeparatorChar)
  $full = [System.IO.Path]::GetFullPath((Join-Path $WebRoot $relative))

  # 安全防线：拼出来的路径必须还在站点目录里面。
  # 否则别人可以用 http://127.0.0.1:8080/../../Windows/win.ini 这样的地址
  # 去读你电脑上的任意文件（这叫"目录穿越"）。GetFullPath 会把 .. 展开成真实路径，
  # 展开后如果不在站点目录里，就直接 403 拒绝。
  if (-not $full.StartsWith($WebRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    Send-Text -Stream $Stream -StatusCode 403 -StatusText 'Forbidden' -Text 'Forbidden.'
    Write-Host ('  403  ' + $pathPart) -ForegroundColor Red
    return
  }

  # 如果请求的是一个目录，就自动找它下面的 index.html
  if (Test-Path -LiteralPath $full -PathType Container) {
    $candidate = Join-Path $full 'index.html'
    if (Test-Path -LiteralPath $candidate -PathType Leaf) { $full = $candidate }
  }

  # 文件不存在 -> 404
  if (-not (Test-Path -LiteralPath $full -PathType Leaf)) {
    Send-Text -Stream $Stream -StatusCode 404 -StatusText 'Not Found' -Text ('404 Not Found: ' + $pathPart)
    Write-Host ('  404  ' + $pathPart) -ForegroundColor DarkYellow
    return
  }

  # 按扩展名查内容类型，查不到就用通用二进制类型
  $ext = [System.IO.Path]::GetExtension($full).ToLower()
  $contentType = if ($Mime.ContainsKey($ext)) { $Mime[$ext] } else { 'application/octet-stream' }
  # 一次性把整个文件读成字节数组发出去（本项目文件都很小，够用）
  $bytes = [System.IO.File]::ReadAllBytes($full)

  Send-Raw -Stream $Stream -StatusCode 200 -StatusText 'OK' -ContentType $contentType -Body $bytes
  Write-Host ('  200  ' + $pathPart) -ForegroundColor DarkGray
}

# ============================================================================
#  五、处理一个连接：决定这次请求该走哪条路
# ============================================================================

function Invoke-Request {
  param([System.Net.Sockets.TcpClient]$Client)

  $stream = $Client.GetStream()
  $request = Read-Request -Stream $stream

  # 路径是 /api/save 的，走保存接口
  if ($request.Target.Split('?')[0] -eq '/api/save') {
    if ($request.Method -eq 'POST') {
      Save-Notes -Request $request -Stream $stream
    } else {
      # 这个接口只接受 POST
      Send-Json -Stream $stream -StatusCode 405 -StatusText 'Method Not Allowed' `
                -Json '{"ok":false,"error":"POST only"}'
      Write-Host '  405  /api/save (GET)' -ForegroundColor DarkYellow
    }
    return
  }

  # 其它路径只允许 GET（也就是"要文件"），别的动作一律拒绝
  if ($request.Method -ne 'GET') {
    Send-Text -Stream $stream -StatusCode 405 -StatusText 'Method Not Allowed' -Text 'Only GET is supported here.'
    Write-Host ('  405  ' + $request.Method + ' ' + $request.Target) -ForegroundColor DarkYellow
    return
  }

  Serve-File -Request $request -Stream $stream
}

# ============================================================================
#  六、正式启动：找端口 -> 打印信息 -> 打开浏览器 -> 一直等请求
# ============================================================================

# 反复尝试绑定端口：8080 被别的程序占了就试 8081、8082……最多试 40 个。
# 只绑定 127.0.0.1（本机回环地址），所以局域网里的其他设备访问不到，更安全，
# 而且不会弹出"Windows 防火墙是否允许"的提示。
$listener = $null
$startPort = $Port
while ($Port -lt ($startPort + 40)) {
  try {
    $candidate = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
    $candidate.Start()
    $listener = $candidate
    break
  } catch {
    $Port++      # 这个端口被占了，换下一个
  }
}

if ($null -eq $listener) {
  Write-Host "ERROR: no free port found in range $startPort-$($startPort + 40)." -ForegroundColor Red
  exit 1
}

$Url = "http://127.0.0.1:$Port/"

# 在窗口里打印启动信息，方便你知道服务器跑在哪个地址
Write-Host ""
Write-Host "  ==================================================" -ForegroundColor Green
Write-Host "   Personal knowledge base - local server running" -ForegroundColor Green
Write-Host "  ==================================================" -ForegroundColor Green
Write-Host "   Web   : $WebRoot"
Write-Host "   Notes : $NotesPath"
Write-Host "   URL   : $Url"
Write-Host "   Stop  : close this window (or press Ctrl+C)"
Write-Host ""

# 用系统默认浏览器打开这个地址（加了 -NoBrowser 就跳过，测试时用）
if (-not $NoBrowser) {
  try { Start-Process $Url } catch { Write-Host "   Please open $Url manually." -ForegroundColor Yellow }
}

# 主循环：服务器永远不退出，一直等着浏览器来连接。
# AcceptTcpClient() 会"卡住"直到有连接进来，进来一个就处理一个，处理完关掉再等下一个。
try {
  while ($true) {
    $client = $listener.AcceptTcpClient()
    try {
      Invoke-Request -Client $client
    } catch {
      # 单个请求出错不能让整个服务器挂掉，所以这里把错误抓住、打印出来，继续跑
      Write-Host ('  request error: ' + $_.Exception.Message) -ForegroundColor DarkYellow
    } finally {
      $client.Close()   # 不管成功失败都要关掉连接
    }
  }
} finally {
  # 按 Ctrl+C 或窗口被关掉时，走到这里顺手把监听关掉
  $listener.Stop()
  Write-Host ""
  Write-Host "  Server stopped. Bye." -ForegroundColor Green
}
