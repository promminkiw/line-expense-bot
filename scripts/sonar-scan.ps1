# สแกน repo นี้ด้วย SonarQube ในเครื่อง โดยรัน scanner ใน Docker
# วิธีใช้ (รันจาก root ของ repo):  powershell -ExecutionPolicy Bypass -File .\scripts\sonar-scan.ps1
# อ่าน token จาก $env:SONAR_TOKEN ถ้าว่างจะถามให้วาง (ซ่อนตัวอักษร)
# ตั้ง $env:SONAR_HOST_URL ถ้า SonarQube ไม่ได้อยู่ที่ http://localhost:9000 (ใช้ URL ที่เปิดจากเครื่องนี้ได้)
# -ReuseCoverage ใช้ coverage/lcov.info ที่มีอยู่แทนการรัน test ใหม่ (เร็วกว่า แต่ coverage อาจไม่ตรงกับโค้ดล่าสุด)

param([switch]$ReuseCoverage)

$repo = Split-Path $PSScriptRoot -Parent
$serverUrl = if ($env:SONAR_HOST_URL) { $env:SONAR_HOST_URL.TrimEnd('/') } else { 'http://localhost:9000' }
# container เข้า localhost ของเครื่องนี้ไม่ได้ จึงเปลี่ยนเป็น host.docker.internal เฉพาะฝั่ง container
$containerUrl = $serverUrl -replace '//(localhost|127\.0\.0\.1)(?=[:/]|$)', '//host.docker.internal'
# pin image ด้วย digest ให้สแกนซ้ำได้ผลเหมือนเดิม อัปเดตด้วย docker pull sonarsource/sonar-scanner-cli แล้ว docker inspect --format '{{index .RepoDigests 0}}' sonarsource/sonar-scanner-cli
$scannerImage = 'sonarsource/sonar-scanner-cli@sha256:6e6eca4d552695a98fb7dab84f0c1bd0885ebbfe272654d1552e24bd7f452d51'

$token = $env:SONAR_TOKEN
if (-not $token) {
    Write-Host 'Paste with RIGHT-CLICK (Ctrl+V does not paste into this hidden prompt in Windows PowerShell).' -ForegroundColor Yellow
    $secure = Read-Host 'Paste your SonarQube token' -AsSecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

# ตัดช่องว่างและอักขระควบคุมออก เพราะกด Ctrl+V ในช่องซ่อนจะได้อักขระที่มองไม่เห็นมาหนึ่งตัวแทน token
$token = $token -replace '[\s\p{Cc}]', ''
if ($token.Length -lt 20) {
    Write-Host "Token looks empty or incomplete ($($token.Length) characters). Generate one at $serverUrl/account/security and paste it with right-click." -ForegroundColor Red
    exit 1
}

# เช็ค token กับ server ก่อน จะได้ไม่ต้องรอ container ของ scanner เริ่มแล้วค่อยพัง
$auth = 'Basic ' + [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("${token}:"))
try {
    $check = Invoke-RestMethod "$serverUrl/api/authentication/validate" -Headers @{ Authorization = $auth } -TimeoutSec 10
} catch {
    Write-Host "Cannot reach SonarQube at $serverUrl. Is the container running?" -ForegroundColor Red
    exit 1
}
if (-not $check.valid) {
    Write-Host "SonarQube rejected this token. Generate a new one at $serverUrl/account/security." -ForegroundColor Red
    exit 1
}
$env:SONAR_TOKEN = $token

$lcov = Join-Path $repo 'coverage\lcov.info'
if ($ReuseCoverage) {
    if (Test-Path $lcov) { Write-Host 'Reusing the existing coverage/lcov.info without running the tests.' -ForegroundColor Yellow }
    else { Write-Host 'No coverage/lcov.info found, so SonarQube will report 0% coverage.' -ForegroundColor Yellow }
} else {
    # รัน test พร้อมเก็บ coverage ก่อนสแกน ไม่งั้น SonarQube นับ coverage ของโค้ดใหม่เป็น 0% แล้ว Quality Gate ไม่ผ่าน
    Push-Location $repo
    try { npm run test:coverage } finally { Pop-Location }
    if ($LASTEXITCODE -ne 0) {
        Write-Host 'Tests failed, scan stopped. Fix the tests, or pass -ReuseCoverage to scan with the last coverage report.' -ForegroundColor Red
        exit 1
    }
}

# lcov จาก Windows ใช้ \ ในชื่อไฟล์ แต่ scanner รันใน Linux จึงแปลงเป็น / ไม่งั้นหาไฟล์ไม่เจอและ coverage เป็น 0%
if (Test-Path $lcov) {
    $lines = Get-Content $lcov -Encoding UTF8 | ForEach-Object { if ($_.StartsWith('SF:')) { $_.Replace('\', '/') } else { $_ } }
    [IO.File]::WriteAllText($lcov, (($lines -join "`n") + "`n"), [Text.UTF8Encoding]::new($false))
}

docker run --rm `
    -e SONAR_HOST_URL=$containerUrl `
    -e SONAR_TOKEN `
    -v "${repo}:/usr/src" `
    $scannerImage

if ($LASTEXITCODE -eq 0) {
    Write-Host "`nDone. Results: $serverUrl/dashboard?id=line-expense-bot" -ForegroundColor Green
}
