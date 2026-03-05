# fix-landing.ps1
# Fixes the landing page routing in server.js
# Run from your project root: C:\Users\Xero\invoice-tool\

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

# ── Paths ────────────────────────────────────────────────────────
$serverPath  = Join-Path $PSScriptRoot 'server.js'
$landingPath = Join-Path $PSScriptRoot 'public\landing.html'
$backupPath  = Join-Path $PSScriptRoot 'server-backup-routing.js'

Write-Host ""
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host "    InvoiceKit - Fix Landing Page Routing" -ForegroundColor Cyan
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host ""

# ── Guard ────────────────────────────────────────────────────────
if (-not (Test-Path $serverPath)) {
    Write-Host "  ERROR: server.js not found at $serverPath" -ForegroundColor Red
    exit 1
}

# ── Step 1: Backup ───────────────────────────────────────────────
Write-Host "  [1/4] Backing up server.js..." -ForegroundColor Yellow
Copy-Item $serverPath $backupPath -Force
Write-Host "        Saved to server-backup-routing.js" -ForegroundColor Green

# ── Step 2: Read server.js ───────────────────────────────────────
Write-Host ""
Write-Host "  [2/4] Reading server.js..." -ForegroundColor Yellow
$src = Get-Content $serverPath -Raw -Encoding UTF8

# ── Step 3: Patch routes ─────────────────────────────────────────
Write-Host ""
Write-Host "  [3/4] Patching routes..." -ForegroundColor Yellow

$landingRoute = @"
app.get('/', (req, res) => res.sendFile(require('path').join(__dirname, 'public/landing.html')));
"@

$appRoute = @"
app.get('/app', (req, res) => res.sendFile(require('path').join(__dirname, 'public/index.html')));
"@

# PATCH A: Replace or insert root route
# Match patterns like: app.get('/', ...) or app.get("/", ...)
$rootRoutePattern = 'app\.get\s*\(\s*[''"][/][''"]'

if ($src -match $rootRoutePattern) {
    # Find the full route block and replace it
    # Handles arrow functions with braces:  (req, res) => { ... res.sendFile ... }
    # And inline:  (req, res) => res.sendFile(...)
    $fullPattern = 'app\.get\s*\(\s*[''"][/][''"]\s*,\s*(?:async\s*)?\(?\s*\w+\s*,?\s*\w*\s*\)?\s*=>\s*(?:\{[^}]*\}|[^;]+;)'
    
    if ($src -match $fullPattern) {
        $src = [regex]::Replace($src, $fullPattern, $landingRoute.Trim())
        Write-Host "        + Replaced root route -> landing.html" -ForegroundColor Green
    } else {
        # Simpler fallback: just find app.get('/', and replace to end of statement
        $src = [regex]::Replace(
            $src,
            'app\.get\s*\(\s*[''"][/][''"]\s*,[^\)]+\)',
            $landingRoute.Trim()
        )
        Write-Host "        + Replaced root route (simple match) -> landing.html" -ForegroundColor Green
    }
} else {
    # No root route exists at all — inject before app.listen
    $src = $src -replace '(app\.listen)', ($landingRoute.Trim() + "`r`n`r`n" + '$1')
    Write-Host "        + Inserted root route -> landing.html" -ForegroundColor Green
}

# PATCH B: Add /app route if missing
if ($src -notmatch "app\.get\s*\(\s*['""]\/app['""]") {
    $src = $src -replace '(app\.listen)', ($appRoute.Trim() + "`r`n`r`n" + '$1')
    Write-Host "        + Added /app route -> index.html (invoice form)" -ForegroundColor Green
} else {
    Write-Host "        . /app route already exists" -ForegroundColor Gray
}

# PATCH C: Ensure express.static('public') is present
if ($src -notmatch "express\.static") {
    $staticLine = "app.use(require('express').static(require('path').join(__dirname, 'public')));"
    $src = $src -replace '(const app = express\(\))', ('$1' + "`r`n" + $staticLine)
    Write-Host "        + Added express.static('public') middleware" -ForegroundColor Green
} else {
    Write-Host "        . express.static already present" -ForegroundColor Gray
}

# Write patched server.js
Set-Content $serverPath $src -Encoding UTF8
Write-Host "        server.js saved." -ForegroundColor Green

# ── Step 4: Fix links in landing.html ────────────────────────────
Write-Host ""
Write-Host "  [4/4] Updating CTA links in landing.html..." -ForegroundColor Yellow

if (Test-Path $landingPath) {
    $html = Get-Content $landingPath -Raw -Encoding UTF8
    $before = $html

    $html = $html -replace 'href="/index\.html"', 'href="/app"'
    $html = $html -replace "href='/index\.html'", "href='/app'"
    $html = $html -replace 'href="index\.html"',  'href="/app"'

    if ($html -ne $before) {
        Set-Content $landingPath $html -Encoding UTF8
        Write-Host "        + CTA links updated: /index.html -> /app" -ForegroundColor Green
    } else {
        Write-Host "        . No /index.html links found (may already be correct)" -ForegroundColor Gray
    }
} else {
    Write-Host "        ! landing.html not found at $landingPath" -ForegroundColor Red
    Write-Host "          Skipping link update." -ForegroundColor Red
}

# ── Git commit and push ───────────────────────────────────────────
Write-Host ""
Write-Host "  Committing changes to GitHub..." -ForegroundColor Yellow
git add .
git commit -m "fix: route / to landing page, /app to invoice form"
git push

# ── Summary ───────────────────────────────────────────────────────
Write-Host ""
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host "   All done! Your routes are now:" -ForegroundColor Cyan
Write-Host ""
Write-Host "     /        ->  public/landing.html" -ForegroundColor White
Write-Host "     /app     ->  public/index.html  (invoice form)" -ForegroundColor White
Write-Host "     /api/*   ->  backend endpoints" -ForegroundColor White
Write-Host ""
Write-Host "   Visit your app URL to see the landing page." -ForegroundColor Green
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host ""
