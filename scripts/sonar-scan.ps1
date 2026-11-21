# สแกน repo นี้ด้วย SonarQube ในเครื่อง (ค่าเริ่มต้น http://localhost:9000) โดยรัน scanner ใน Docker
# วิธีใช้ (รันจาก root ของ repo):  powershell -ExecutionPolicy Bypass -File .\scripts\sonar-scan.ps1
# อ่าน token จาก $env:SONAR_TOKEN ถ้าว่างจะถามให้วาง (ซ่อนตัวอักษร)

$repo = Split-Path $PSScriptRoot -Parent
$hostUrl = if ($env:SONAR_HOST_URL) { $env:SONAR_HOST_URL } else { 'http://host.docker.internal:9000' }

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
    Write-Host "Token looks empty or incomplete ($($token.Length) characters). Generate one at http://localhost:9000/account/security and paste it with right-click." -ForegroundColor Red
    exit 1
}

# เช็ค token กับ server ก่อน จะได้ไม่ต้องรอ container ของ scanner เริ่มแล้วค่อยพัง
$auth = 'Basic ' + [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("${token}:"))
try {
    $check = Invoke-RestMethod 'http://localhost:9000/api/authentication/validate' -Headers @{ Authorization = $auth } -TimeoutSec 10
} catch {
    Write-Host "Cannot reach SonarQube at http://localhost:9000. Is the container running?" -ForegroundColor Red
    exit 1
}
if (-not $check.valid) {
    Write-Host 'SonarQube rejected this token. Generate a new one at http://localhost:9000/account/security.' -ForegroundColor Red
    exit 1
}
$env:SONAR_TOKEN = $token

docker run --rm `
    -e SONAR_HOST_URL=$hostUrl `
    -e SONAR_TOKEN `
    -v "${repo}:/usr/src" `
    sonarsource/sonar-scanner-cli

if ($LASTEXITCODE -eq 0) {
    Write-Host "`nDone. Results: http://localhost:9000/dashboard?id=line-expense-bot" -ForegroundColor Green
}
