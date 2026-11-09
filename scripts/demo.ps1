# Plays the README demo in a fresh folder, typing each command at a readable pace, for screen recording.
#
#   pwsh -File scripts/demo.ps1            # uses the latest tag in this repo's package.json
#   pwsh -File scripts/demo.ps1 -Pin v0.3.0
#
# Before recording: a terminal about 100 x 28 characters, font 16-18 pt, dark theme.
# Start the recorder when the screen clears; stop it after the last line.
param(
  [string]$Pin = 'v' + (Get-Content (Join-Path $PSScriptRoot '..\package.json') -Raw | ConvertFrom-Json).version,
  [int]$TypeMs = 45,   # per character
  [int]$PauseMs = 1600, # after each command's output
  [switch]$NoWait     # skip the Enter prompt (for a dry run)
)
$ErrorActionPreference = 'Continue'
# Compass prints UTF-8 (em dashes, arrows). Without this, PowerShell decodes it with the console's
# legacy code page and "—" shows as "ΓÇö".
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$OutputEncoding = [Text.UTF8Encoding]::new($false)
$spec = "github:EdwardBatt/Compass#$Pin"

# Fetch Compass once before recording, so npx does not stall on camera.
Write-Host "Warming the npx cache for $spec ..."
npx --yes $spec version 2>$null | Out-Null

$dir = Join-Path ([IO.Path]::GetTempPath()) ("compass-demo-" + [guid]::NewGuid().ToString('N').Substring(0, 6))
New-Item -ItemType Directory $dir | Out-Null
Set-Location $dir
git init -q 2>$null
git config user.name 'Sam'

# A named parameter, not @args: splatting $args into a native command loses it in some PowerShell versions.
function compass { param([Parameter(ValueFromRemainingArguments)]$rest) npx --yes $spec @rest 2>&1 | Paint }

# Prints output as plain text (stderr included, where the lint writes errors), coloured as a terminal would.
function Paint {
  process {
    $line = "$_"
    if ($line -match '^npm (warn|notice)') { return }
    $color = if ($line -match '^\s*ERROR|error\(s\)') { 'Red' } elseif ($line -match '^\s*warn') { 'Yellow' } elseif ($line -match 'clean|ready') { 'Green' } else { 'Gray' }
    Write-Host $line -ForegroundColor $color
  }
}

function Show([string]$text, [switch]$Comment) {
  Write-Host -NoNewline 'demo> ' -ForegroundColor Green
  foreach ($c in $text.ToCharArray()) {
    Write-Host -NoNewline $c -ForegroundColor ($(if ($Comment) { 'DarkGray' } else { 'White' }))
    Start-Sleep -Milliseconds $TypeMs
  }
  Start-Sleep -Milliseconds 350
  Write-Host ''
}

function Run([string]$shown, [scriptblock]$action) {
  Show $shown
  & $action
  Start-Sleep -Milliseconds $PauseMs
  Write-Host ''
}

if (-not $NoWait) { Read-Host 'Ready. Press Enter, then start recording' | Out-Null }
Clear-Host
Start-Sleep -Milliseconds 800

Show '# a new project: one command sets up memory for every AI tool' -Comment
Run "npx github:EdwardBatt/Compass#$Pin init --tools claude,cursor,agents --ci --hook" {
  npx --yes $spec init --tools claude,cursor,agents --ci --hook 2>&1 | Paint
}

Show "# (from here, compass = npx github:EdwardBatt/Compass#$Pin)" -Comment
Run 'compass lint' { compass lint }

Show '# someone hand-edits the generated rules in CLAUDE.md...' -Comment
(Get-Content CLAUDE.md -Raw).Replace('Most sessions write nothing', 'Always update every note') | Set-Content CLAUDE.md -NoNewline
Start-Sleep -Milliseconds 600
Run 'compass lint' { compass lint }

Show '# the copies can never drift apart: regenerate them from the config' -Comment
Run 'compass sync' { compass sync }
Run 'compass lint' { compass lint }

Start-Sleep -Milliseconds 1500
Set-Location $HOME
Remove-Item -Recurse -Force $dir
