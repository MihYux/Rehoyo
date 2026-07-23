param(
  [string]$OutputPath = "D:\Admin\Documents\Rehoyo\ReHoYo_Roadshow_Poster_Light.png"
)

Add-Type -AssemblyName System.Drawing

$canvasW = 1600
$canvasH = 3600
$bmp = New-Object System.Drawing.Bitmap($canvasW, $canvasH)
$bmp.SetResolution(144, 144)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

$white = [System.Drawing.Color]::FromArgb(255, 255, 255)
$ink = [System.Drawing.Color]::FromArgb(16, 35, 52)
$muted = [System.Drawing.Color]::FromArgb(79, 101, 119)
$soft = [System.Drawing.Color]::FromArgb(234, 244, 252)
$soft2 = [System.Drawing.Color]::FromArgb(246, 250, 253)
$line = [System.Drawing.Color]::FromArgb(197, 215, 228)
$blue = [System.Drawing.Color]::FromArgb(36, 141, 227)

$g.Clear($white)

function New-Font {
  param([string]$Family, [float]$Size, [System.Drawing.FontStyle]$Style = [System.Drawing.FontStyle]::Regular)
  return New-Object System.Drawing.Font($Family, $Size, $Style, [System.Drawing.GraphicsUnit]::Pixel)
}

function Draw-Text {
  param(
    [string]$Text,
    [System.Drawing.Font]$Font,
    [System.Drawing.Color]$Color,
    [float]$X,
    [float]$Y,
    [float]$W,
    [float]$H,
    [System.Drawing.StringAlignment]$Align = [System.Drawing.StringAlignment]::Near
  )
  $brush = New-Object System.Drawing.SolidBrush($Color)
  $format = New-Object System.Drawing.StringFormat
  $format.Alignment = $Align
  $format.LineAlignment = [System.Drawing.StringAlignment]::Near
  $format.Trimming = [System.Drawing.StringTrimming]::Word
  $rect = New-Object System.Drawing.RectangleF($X, $Y, $W, $H)
  $g.DrawString($Text, $Font, $brush, $rect, $format)
  $format.Dispose()
  $brush.Dispose()
}

function Draw-RoundedRect {
  param(
    [float]$X, [float]$Y, [float]$W, [float]$H, [float]$Radius,
    [System.Drawing.Color]$Fill,
    [System.Drawing.Color]$Stroke = [System.Drawing.Color]::Transparent,
    [float]$StrokeWidth = 0
  )
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $Radius * 2
  $path.AddArc($X, $Y, $d, $d, 180, 90)
  $path.AddArc($X + $W - $d, $Y, $d, $d, 270, 90)
  $path.AddArc($X + $W - $d, $Y + $H - $d, $d, $d, 0, 90)
  $path.AddArc($X, $Y + $H - $d, $d, $d, 90, 90)
  $path.CloseFigure()
  $fillBrush = New-Object System.Drawing.SolidBrush($Fill)
  $g.FillPath($fillBrush, $path)
  $fillBrush.Dispose()
  if ($StrokeWidth -gt 0) {
    $pen = New-Object System.Drawing.Pen($Stroke, $StrokeWidth)
    $g.DrawPath($pen, $path)
    $pen.Dispose()
  }
  $path.Dispose()
}

function Draw-ImageFit {
  param([System.Drawing.Image]$Image, [float]$X, [float]$Y, [float]$W, [float]$H)
  $scale = [Math]::Min($W / $Image.Width, $H / $Image.Height)
  $dw = $Image.Width * $scale
  $dh = $Image.Height * $scale
  $dx = $X + (($W - $dw) / 2)
  $dy = $Y + (($H - $dh) / 2)
  $dest = New-Object System.Drawing.RectangleF($dx, $dy, $dw, $dh)
  $g.DrawImage($Image, $dest)
}

function Draw-AgentBlock {
  param(
    [float]$X, [float]$Y, [float]$W, [float]$H,
    [string]$Label, [string]$Title, [string]$Body,
    [bool]$Primary = $false
  )
  $fillColor = if ($Primary) { $blue } else { $soft }
  $titleColor = if ($Primary) { $white } else { $ink }
  $bodyColor = if ($Primary) { $white } else { $muted }
  Draw-RoundedRect $X $Y $W $H 32 $fillColor $(if ($Primary) { $blue } else { $line }) 2
  $circleBrush = New-Object System.Drawing.SolidBrush($(if ($Primary) { $white } else { $blue }))
  $g.FillEllipse($circleBrush, $X + 42, $Y + 42, 54, 54)
  $circleBrush.Dispose()
  $agentGlyph = New-Font "Space Grotesk" 28 ([System.Drawing.FontStyle]::Bold)
  Draw-Text $Label $agentGlyph $(if ($Primary) { $blue } else { $white }) ($X + 42) ($Y + 51) 54 42 ([System.Drawing.StringAlignment]::Center)
  $agentGlyph.Dispose()
  $agentTitle = New-Font "Space Grotesk" 34 ([System.Drawing.FontStyle]::Bold)
  Draw-Text $Title $agentTitle $titleColor ($X + 122) ($Y + 42) ($W - 164) 54
  $agentTitle.Dispose()
  $agentBody = New-Font "Noto Sans SC" 25 ([System.Drawing.FontStyle]::Regular)
  Draw-Text $Body $agentBody $bodyColor ($X + 42) ($Y + 120) ($W - 84) ($H - 150)
  $agentBody.Dispose()
}

$logoPath = "D:\Admin\Documents\Rehoyo\ReHoYo_Logo.png"
$heroPath = "D:\Admin\Documents\Rehoyo\ReHoYo_AI_Agent_Illustration.png"
$logo = [System.Drawing.Image]::FromFile($logoPath)
$hero = [System.Drawing.Image]::FromFile($heroPath)

$fontMonoSmall = New-Font "IBM Plex Mono" 23 ([System.Drawing.FontStyle]::Regular)
$fontDisplay = New-Font "Noto Sans SC" 86 ([System.Drawing.FontStyle]::Bold)
$fontBody = New-Font "Noto Sans SC" 30 ([System.Drawing.FontStyle]::Regular)
$fontSection = New-Font "Noto Sans SC" 52 ([System.Drawing.FontStyle]::Bold)
$fontSectionBody = New-Font "Noto Sans SC" 26 ([System.Drawing.FontStyle]::Regular)
$fontRegion = New-Font "Noto Sans SC" 46 ([System.Drawing.FontStyle]::Bold)
$fontRegionBody = New-Font "Noto Sans SC" 30 ([System.Drawing.FontStyle]::Regular)
$fontFooter = New-Font "Noto Sans SC" 54 ([System.Drawing.FontStyle]::Bold)

# Header
Draw-ImageFit $logo 92 54 520 200
Draw-Text "AI × GAME INTELLIGENCE" $fontMonoSmall $blue 1015 105 490 42 ([System.Drawing.StringAlignment]::Far)
Draw-Text "GLOBAL PLAYER RESEARCH TEAM" $fontMonoSmall $muted 955 154 550 42 ([System.Drawing.StringAlignment]::Far)
$blueBrush = New-Object System.Drawing.SolidBrush($blue)
$g.FillRectangle($blueBrush, 92, 274, 1416, 6)

# Hero
Draw-Text "GLOBAL PLAYER INTELLIGENCE" $fontMonoSmall $blue 92 360 650 42
Draw-Text "在版本发布前`n听见全球玩家" $fontDisplay $ink 92 420 700 250
Draw-Text "多 Agent 实时研究全球社区反馈，比较地区差异，并给出下一版本建议。" $fontBody $muted 92 700 650 150
Draw-RoundedRect 92 880 620 82 28 $blue $blue 0
$heroLabel = New-Font "Space Grotesk" 18 ([System.Drawing.FontStyle]::Bold)
Draw-Text "GLOBAL PLAYER INSIGHT COMMAND CENTER" $heroLabel $white 122 903 560 38 ([System.Drawing.StringAlignment]::Center)
Draw-ImageFit $hero 715 300 820 720

# Agent team
Draw-Text "一支由 AI Agent 组成的全球游戏研究团队" $fontSection $ink 92 1115 1416 74
Draw-Text "从公开讨论中收集证据，理解情绪，比较市场，再生成下一版本建议。" $fontSectionBody $muted 92 1195 1320 60
Draw-Text "REDDIT / YOUTUBE / BILIBILI / 米游社 / HOYOLAB / APP REVIEWS" $fontMonoSmall $blue 92 1270 1416 44

Draw-AgentBlock 92 1350 650 360 "C" "COMMUNITY RESEARCH" "搜索全球公开玩家讨论，识别最早出现的问题来源与快速传播的话题。" $false
Draw-AgentBlock 770 1350 738 170 "S" "SENTIMENT" "识别正负情绪，并解释玩家为什么产生这种反应。" $false
Draw-AgentBlock 770 1540 738 170 "R" "REGIONAL" "比较中国、日本、欧美玩家的关注重点与文化差异。" $false
Draw-AgentBlock 92 1740 1416 220 "A" "STRATEGY" "把证据转化为下一版本的产品、运营、宣传与本地化建议。" $true

# Regional insight composition
Draw-Text "同一版本，三个市场，三种关注点" $fontSection $ink 92 2075 1416 74
Draw-Text "ReHoYo 让团队看到评价不同的原因，而不只是情绪分数。" $fontSectionBody $muted 92 2155 1250 60

Draw-RoundedRect 92 2260 650 500 32 $blue $blue 0
Draw-Text "中国玩家" $fontRegion $white 142 2320 520 70
Draw-Text "更关注角色强度、抽卡价值与奖励设计" $fontRegionBody $white 142 2420 520 160
Draw-Text "VALUE / POWER / REWARD" $fontMonoSmall $white 142 2650 520 44

Draw-RoundedRect 770 2260 738 235 32 $soft $line 2
Draw-Text "日本玩家" $fontRegion $ink 820 2310 620 70
Draw-Text "角色人格、声优表现与情感连接" $fontRegionBody $muted 820 2395 620 70

Draw-RoundedRect 770 2525 738 235 32 $white $line 2
Draw-Text "欧美玩家" $fontRegion $ink 820 2575 620 70
Draw-Text "剧情深度、世界观与整体体验" $fontRegionBody $muted 820 2660 620 70

# Visible agent workflow
Draw-Text "AI 的工作过程，每一步都可追踪" $fontSection $ink 92 2860 1416 74
Draw-Text "用户看到证据、状态与中间结论，而不是只等待一份最终摘要。" $fontSectionBody $muted 92 2940 1320 60
Draw-RoundedRect 92 3030 1416 250 32 $soft2 $line 2
$timelineY = 3130
$timelinePen = New-Object System.Drawing.Pen($line, 4)
$g.DrawLine($timelinePen, 240, $timelineY, 1360, $timelineY)
$timelinePen.Dispose()
$timelineTitles = @("发现争议源头", "理解情绪原因", "比较地区差异", "生成版本建议")
$timelineX = @(240, 613, 986, 1360)
$timelineFont = New-Font "Noto Sans SC" 25 ([System.Drawing.FontStyle]::Regular)
for ($i = 0; $i -lt 4; $i++) {
  $g.FillRectangle($blueBrush, $timelineX[$i] - 10, $timelineY - 10, 20, 20)
  Draw-Text $timelineTitles[$i] $timelineFont $ink ($timelineX[$i] - 145) ($timelineY + 35) 290 50 ([System.Drawing.StringAlignment]::Center)
}

# Closing statement
Draw-RoundedRect 92 3340 1416 205 32 $blue $blue 0
Draw-Text "让下一次更新，先经过全球玩家的真实反馈。" $fontFooter $white 142 3390 1316 72
Draw-Text "ReHoYo 把全球公开讨论转化为可验证的产品、发行与运营决策依据。" $fontSectionBody $white 142 3472 1280 48

$logo.Dispose()
$hero.Dispose()
$fontMonoSmall.Dispose()
$fontDisplay.Dispose()
$fontBody.Dispose()
$fontSection.Dispose()
$fontSectionBody.Dispose()
$fontRegion.Dispose()
$fontRegionBody.Dispose()
$fontFooter.Dispose()
$heroLabel.Dispose()
$timelineFont.Dispose()
$blueBrush.Dispose()

$bmp.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$bmp.Dispose()

Write-Output $OutputPath
