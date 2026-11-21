# ดึงผลสแกนล่าสุดของ line-expense-bot จาก SonarQube ไปเก็บที่ .scannerwork/sonar-report.json (git ignore ไว้แล้ว)
# วิธีใช้ (รันจาก root ของ repo):  powershell -ExecutionPolicy Bypass -File .\scripts\sonar-report.ps1
# อ่าน token จาก $env:SONAR_TOKEN ถ้าว่างจะถามให้วาง (ซ่อนตัวอักษร วางด้วยคลิกขวา)
# ตั้ง $env:SONAR_HOST_URL ถ้า SonarQube ไม่ได้อยู่ที่ http://localhost:9000

$server = if ($env:SONAR_HOST_URL) { $env:SONAR_HOST_URL.TrimEnd('/') } else { 'http://localhost:9000' }
$project = 'line-expense-bot'
$outDir = Join-Path (Split-Path $PSScriptRoot -Parent) '.scannerwork'
$outFile = Join-Path $outDir 'sonar-report.json'

$token = $env:SONAR_TOKEN
if (-not $token) {
    Write-Host 'Paste with RIGHT-CLICK (Ctrl+V does not paste into this hidden prompt in Windows PowerShell).' -ForegroundColor Yellow
    $secure = Read-Host 'Paste your SonarQube token' -AsSecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}
$token = $token -replace '[\s\p{Cc}]', ''
$headers = @{ Authorization = 'Basic ' + [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("${token}:")) }

function Get-Sonar($path) { Invoke-RestMethod "$server$path" -Headers $headers -TimeoutSec 30 }

try {
    $metrics = 'ncloc,files,bugs,vulnerabilities,code_smells,security_hotspots,coverage,duplicated_lines_density,' +
               'reliability_rating,security_rating,sqale_rating,sqale_index,cognitive_complexity'
    $measures = (Get-Sonar "/api/measures/component?component=$project&metricKeys=$metrics").component.measures
    $gate = (Get-Sonar "/api/qualitygates/project_status?projectKey=$project").projectStatus

    $issues = @(); $page = 1
    do {
        $r = Get-Sonar "/api/issues/search?componentKeys=$project&resolved=false&ps=500&p=$page"
        $issues += $r.issues; $page++
    } while ($issues.Count -lt $r.paging.total -and $page -le 20)

    $hotspots = @(); $page = 1
    do {
        $r = Get-Sonar "/api/hotspots/search?project=$project&ps=500&p=$page"
        $hotspots += $r.hotspots; $page++
    } while ($hotspots.Count -lt $r.paging.total -and $page -le 20)
} catch {
    Write-Host "Request failed: $($_.Exception.Message). Check the token and that SonarQube is running." -ForegroundColor Red
    exit 1
}

$report = [ordered]@{
    generated   = (Get-Date).ToString('s')
    qualityGate = $gate
    measures    = $measures
    issues      = $issues | Select-Object key, rule, severity, impacts, cleanCodeAttribute, type, component, line, message, effort, tags
    hotspots    = $hotspots | Select-Object key, component, line, message, vulnerabilityProbability, securityCategory, ruleKey, status
}
New-Item -ItemType Directory -Force $outDir | Out-Null
$report | ConvertTo-Json -Depth 8 | Out-File $outFile -Encoding utf8
Write-Host "Saved $($issues.Count) issues and $($hotspots.Count) hotspots to $outFile" -ForegroundColor Green
