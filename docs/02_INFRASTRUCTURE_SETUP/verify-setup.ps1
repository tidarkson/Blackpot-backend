#!/usr/bin/env pwsh

# BlackPot Backend - Complete Verification Script
# This script verifies that Docker, Node.js, and the Redis setup are all working correctly

Write-Host "╔════════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║     BlackPot Backend - Complete Setup Verification Script         ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Counter for passed/failed checks
$passed = 0
$failed = 0

function Test-Requirement {
    param(
        [string]$Name,
        [scriptblock]$Test,
        [string]$SuccessMessage,
        [string]$FailureMessage
    )
    
    Write-Host "⏳ Checking: $Name..." -ForegroundColor Yellow
    
    try {
        $result = & $Test
        if ($result) {
            Write-Host "✅ $SuccessMessage" -ForegroundColor Green
            $script:passed++
            return $true
        } else {
            Write-Host "❌ $FailureMessage" -ForegroundColor Red
            $script:failed++
            return $false
        }
    } catch {
        Write-Host "❌ $FailureMessage" -ForegroundColor Red
        Write-Host "   Error: $_" -ForegroundColor Red
        $script:failed++
        return $false
    }
}

Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "STEP 1: Checking System Requirements" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host ""

# Check Node.js
Test-Requirement `
    -Name "Node.js Installation" `
    -Test { (node --version) -match "v\d+" } `
    -SuccessMessage "Node.js $(node --version) installed" `
    -FailureMessage "Node.js not found - install from https://nodejs.org"

# Check npm
Test-Requirement `
    -Name "npm Installation" `
    -Test { (npm --version) -match "\d+\.\d+" } `
    -SuccessMessage "npm $(npm --version) installed" `
    -FailureMessage "npm not found - should be installed with Node.js"

# Check Docker
Test-Requirement `
    -Name "Docker Installation" `
    -Test { (docker --version) -match "Docker version" } `
    -SuccessMessage "Docker $(docker --version) installed" `
    -FailureMessage "Docker not found - install Docker Desktop from https://www.docker.com/products/docker-desktop"

# Check Docker Compose
Test-Requirement `
    -Name "Docker Compose Installation" `
    -Test { (docker-compose --version) -match "\d+\.\d+" } `
    -SuccessMessage "Docker Compose $(docker-compose --version) installed" `
    -FailureMessage "Docker Compose not found - should be included with Docker Desktop"

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "STEP 2: Checking Docker Daemon" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host ""

# Check if Docker is running
Test-Requirement `
    -Name "Docker Daemon Running" `
    -Test { 
        $output = docker ps 2>$null
        $? -and $output -match "CONTAINER ID"
    } `
    -SuccessMessage "Docker daemon is running and responsive" `
    -FailureMessage "Docker daemon not running - start Docker Desktop application"

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "STEP 3: Checking Project Files" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host ""

$projectPath = Get-Location
$requiredFiles = @(
    "package.json",
    "tsconfig.json",
    "docker-compose.yml",
    ".env.example",
    "backend\src\index.ts",
    "backend\src\utils\redisClient.ts",
    "backend\src\services\CacheService.ts",
    "backend\src\middleware\cache.middleware.ts",
    "backend\src\utils\cacheTestUtils.ts",
    "REDIS_QUICK_START.md",
    "REDIS_SETUP_GUIDE.md",
    "DOCKER_INSTALLATION_GUIDE.md"
)

foreach ($file in $requiredFiles) {
    Test-Requirement `
        -Name "File: $file" `
        -Test { Test-Path $file } `
        -SuccessMessage "$file exists" `
        -FailureMessage "$file not found"
}

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "STEP 4: Checking Node Dependencies" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host ""

# Check if node_modules exists
Test-Requirement `
    -Name "Node modules installed" `
    -Test { Test-Path "node_modules" -PathType Container } `
    -SuccessMessage "node_modules directory exists" `
    -FailureMessage "node_modules not found - run 'npm install'"

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "STEP 5: Checking TypeScript Compilation" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host ""

Test-Requirement `
    -Name "TypeScript Build" `
    -Test { 
        $output = npm run build 2>&1
        $output -match "Successfully" -or ($output -notmatch "error")
    } `
    -SuccessMessage "TypeScript compiles successfully" `
    -FailureMessage "TypeScript compilation failed"

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "STEP 6: Checking Docker Compose" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host ""

Test-Requirement `
    -Name "Docker Compose Configuration" `
    -Test { 
        $output = docker-compose config 2>$null
        $output -match "services:" 
    } `
    -SuccessMessage "docker-compose.yml is valid" `
    -FailureMessage "docker-compose.yml has errors"

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "SUMMARY" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host ""

$total = $passed + $failed
$percentage = if ($total -gt 0) { [math]::Round(($passed / $total) * 100) } else { 0 }

Write-Host "✅ Passed: $passed / $total ($percentage`%)" -ForegroundColor Green
if ($failed -gt 0) {
    Write-Host "❌ Failed: $failed / $total" -ForegroundColor Red
} else {
    Write-Host "❌ Failed: 0 / $total" -ForegroundColor Green
}

Write-Host ""

if ($failed -eq 0) {
    Write-Host "╔════════════════════════════════════════════════════════════════════╗" -ForegroundColor Green
    Write-Host "║                     ✅ ALL CHECKS PASSED! ✅                         ║" -ForegroundColor Green
    Write-Host "║                                                                    ║" -ForegroundColor Green
    Write-Host "║  Your system is ready for development!                            ║" -ForegroundColor Green
    Write-Host "╚════════════════════════════════════════════════════════════════════╝" -ForegroundColor Green
    
    Write-Host ""
    Write-Host "🚀 NEXT STEPS:" -ForegroundColor Cyan
    Write-Host "1. Start services:      docker-compose up -d" -ForegroundColor White
    Write-Host "2. Run migrations:      npx prisma migrate deploy" -ForegroundColor White
    Write-Host "3. Start app:          npm run dev" -ForegroundColor White
    Write-Host "4. Check health:       http://localhost:3000/health" -ForegroundColor White
    Write-Host "5. View Redis:         http://localhost:8081" -ForegroundColor White
    
    Write-Host ""
    Write-Host "📚 DOCUMENTATION:" -ForegroundColor Cyan
    Write-Host "- REDIS_QUICK_START.md:       Quick reference guide" -ForegroundColor White
    Write-Host "- REDIS_SETUP_GUIDE.md:        Comprehensive documentation" -ForegroundColor White
    Write-Host "- DOCKER_INSTALLATION_GUIDE.md: Docker setup details" -ForegroundColor White
    
    exit 0
} else {
    Write-Host "╔════════════════════════════════════════════════════════════════════╗" -ForegroundColor Red
    Write-Host "║                    ❌ SOME CHECKS FAILED ❌                          ║" -ForegroundColor Red
    Write-Host "║                                                                    ║" -ForegroundColor Red
    Write-Host "║  Please address the failures above before proceeding.            ║" -ForegroundColor Red
    Write-Host "╚════════════════════════════════════════════════════════════════════╝" -ForegroundColor Red
    
    Write-Host ""
    Write-Host "💡 TROUBLESHOOTING:" -ForegroundColor Yellow
    Write-Host "- Docker not installed?     Read DOCKER_INSTALLATION_GUIDE.md" -ForegroundColor White
    Write-Host "- Docker not running?       Start Docker Desktop application" -ForegroundColor White
    Write-Host "- npm modules missing?      Run: npm install" -ForegroundColor White
    Write-Host "- Compilation errors?       Check backend/src for TypeScript errors" -ForegroundColor White
    
    exit 1
}
