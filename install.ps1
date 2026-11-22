<#
.SYNOPSIS
  dsh-shorekeeper-widget 安装助手（Windows）

.DESCRIPTION
  只做三件事：检查包是否完整 → 按当前 DSH 形态给出可执行步骤 → 提示如何验证。
  不会修改任何 profile 文件，也不会替你决定装到哪个 profile。

  两种 DSH 形态的安装方式完全不同：
    · 官方桌面客户端：desktop profile 由 Electron 独占管理，命令行装不进去，
      必须用客户端内的 Plugins 页（或用会话里的 plugin_manager）。
    · dsh web / CLI：用 `dsh plugin --profile web add …`。

.PARAMETER Mode
  auto（默认）| desktop | web

.PARAMETER Source
  web 模式下的安装来源：local（默认，用本目录 link 安装）| github | npm
  仓库默认是私有的，github: 直装需要本机 git 已保存对该仓库的凭据；不动网络时用 local 最稳。

.PARAMETER Path
  本地插件包目录（含 package.json 的那一层）。默认脚本所在目录。

.PARAMETER Repo
  GitHub 仓库，默认 XXTZ-fia/dsh-shorekeeper-widget。

.PARAMETER Profile
  web 模式的 profile 名，默认 web。

.PARAMETER DryRun
  只打印将执行的命令，不真正安装。

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\install.ps1

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\install.ps1 -Mode web -Source github -Profile web

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\install.ps1 -Mode desktop
#>
[CmdletBinding()]
param(
  [ValidateSet('auto', 'desktop', 'web')]
  [string]$Mode = 'auto',
  [ValidateSet('github', 'local', 'npm')]
  [string]$Source = 'local',
  [string]$Path = '',
  [string]$Repo = 'XXTZ-fia/dsh-shorekeeper-widget',
  [string]$Profile = 'web',
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$PackageName = 'dsh-shorekeeper-widget'
# $PSScriptRoot 在 param 默认值里不一定可用（-File 调用时可能为空），在函数体里兜底
if ([string]::IsNullOrWhiteSpace($Path)) {
  if ($PSScriptRoot) { $Path = $PSScriptRoot }
  else { $Path = (Get-Location).Path }
}

function Write-Step($text) { Write-Host "`n== $text" -ForegroundColor Cyan }
function Write-Ok($text) { Write-Host "  ok  $text" -ForegroundColor Green }
function Write-Warn2($text) { Write-Host "  !!  $text" -ForegroundColor Yellow }
function Write-Info($text) { Write-Host "      $text" -ForegroundColor DarkGray }

# ---------- 1. 检查包完整性 ----------
Write-Step "检查插件包"
$pkgPath = Join-Path $Path 'package.json'
if (-not (Test-Path $pkgPath)) {
  Write-Warn2 "找不到 $pkgPath"
  Write-Info "请把 -Path 指向「包含 package.json 的那一层」，不要多套一层同名目录。"
  exit 1
}
$pkg = Get-Content $pkgPath -Raw | ConvertFrom-Json
if ($pkg.name -ne $PackageName) {
  Write-Warn2 "这个目录是 $($pkg.name)，不是 $PackageName"
  exit 1
}
Write-Ok "$($pkg.name) v$($pkg.version)"

$required = @('lib\index.js', 'assets\shorekeeper-widget.js', 'cordis.patch.yml')
$missing = @()
foreach ($rel in $required) {
  if (-not (Test-Path (Join-Path $Path $rel))) { $missing += $rel }
}
if ($missing.Count -gt 0) {
  Write-Warn2 "缺少关键文件：$($missing -join ', ')"
  Write-Info "少了 assets/ 会没图没声；少了 cordis.patch.yml 则挂不进 DSH。请重新下载完整发布包。"
  exit 1
}
Write-Ok "关键文件齐全（lib / assets / cordis.patch.yml）"

# ---------- 2. 识别形态 ----------
$desktopExe = Join-Path $env:LOCALAPPDATA 'Programs\DeepSeek Harness\DeepSeek Harness.exe'
$desktopCli = Join-Path $env:LOCALAPPDATA 'Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd'
$desktopInstalled = Test-Path $desktopExe
$cliOnPath = $null -ne (Get-Command dsh -ErrorAction SilentlyContinue)

if ($Mode -eq 'auto') {
  if ($desktopInstalled) { $Mode = 'desktop' }
  elseif ($cliOnPath -or (Test-Path $desktopCli)) { $Mode = 'web' }
  else {
    Write-Step "没识别出 DSH 形态"
    Write-Info "未找到桌面客户端（$desktopExe），也没在 PATH 里找到 dsh。"
    Write-Info "请先安装 DSH，或手动指定：-Mode desktop / -Mode web。"
    exit 1
  }
}
Write-Step "安装形态：$Mode"

# ---------- 3A. 桌面端 ----------
if ($Mode -eq 'desktop') {
  Write-Host @"

桌面客户端的 desktop profile 由 Electron 应用独占管理，命令行会被拒绝执行
（profile "desktop" is managed exclusively by the Electron application）。

请任选一种方式安装：

【A1】客户端界面安装（推荐）
  1. 把插件包放在一个以后不会移动/删除的目录：
       $Path
  2. 打开 DSH 桌面客户端 → 左侧 Plugins（插件）→ Add plugin（添加插件）
  3. 选择上面这个目录（含 package.json 的那一层）
  4. 装完「完全退出」客户端（含系统托盘）再重新打开

【A2】让会话里的 AI 安装
  在 DSH 会话里说：
    「请用当前桌面端内置的 plugin_manager，把本地目录 $Path 安装到当前 profile，
      先核对当前 profile 与是否已有同名插件，完成后告诉我结果。」

提示：首装后如果右下角没出现，先完全退出再打开一次；
      菜单底部能看到 v$($pkg.version) 就说明客户端半区已加载。
"@ -ForegroundColor Gray

  if ($desktopInstalled -and -not $DryRun) {
    $answer = Read-Host "现在打开 DSH 桌面客户端？[y/N]"
    if ($answer -match '^[Yy]') { Start-Process $desktopExe }
  }
  exit 0
}

# ---------- 3B. Web / CLI ----------
$dsh = $null
if ($cliOnPath) { $dsh = (Get-Command dsh).Source }
elseif (Test-Path $desktopCli) { $dsh = $desktopCli }

if (-not $dsh) {
  Write-Warn2 "找不到 dsh 命令"
  Write-Info "请先安装 DSH CLI，或把 dsh 加入 PATH 后重试。"
  exit 1
}
Write-Ok "dsh: $dsh"

switch ($Source) {
  'github' { $spec = "github:$Repo" }
  'local' { $spec = "link:$((Resolve-Path $Path).Path)" }
  'npm' { $spec = $PackageName }
}

Write-Step "将执行"
Write-Host "  & `"$dsh`" plugin --profile $Profile add $spec" -ForegroundColor White

if ($DryRun) {
  Write-Info "（-DryRun：未真正执行）"
  exit 0
}

& $dsh plugin --profile $Profile add $spec
if ($LASTEXITCODE -ne 0) {
  Write-Warn2 "安装命令返回 $LASTEXITCODE"
  Write-Info "常见原因：网络/代理不通、没有 git、仓库不可访问、profile 名写错。"
  Write-Info "本机已有旧版本时可先 remove：dsh plugin --profile $Profile remove $PackageName"
  exit $LASTEXITCODE
}

Write-Step "安装完成，接下来"
Write-Host @"
  1. 重启 dsh（如果它正在运行）：关掉当前进程后重新执行 dsh $Profile
  2. 浏览器打开 DSH 页面后按 Ctrl+F5 强制刷新
  3. 验证：右键守岸人 → 菜单底部应显示 v$($pkg.version)
"@ -ForegroundColor Gray
