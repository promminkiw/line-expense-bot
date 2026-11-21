# SonarQube Minors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ปิด follow-up เล็กๆ ที่ review รอบสุดท้ายเสนอไว้ให้การสแกนวัด coverage ตรงขึ้นและสคริปต์สแกนเชื่อถือได้ขึ้น โดยไม่เปลี่ยนโค้ดของบอทหรือหน้าเว็บ

**Architecture:** Task 1 แก้ไฟล์ตั้งค่า 2 ไฟล์ (ไม่นับตัวช่วย test เป็นโค้ดจริงใน SonarQube, ESLint ไม่ไล่ `coverage/`) Task 2 แก้สคริปต์ PowerShell 2 ไฟล์ (สวิตช์ `-ReuseCoverage` ที่ชื่อตรงกับสิ่งที่ทำ, ใช้ URL เดียวกันทั้งเช็ก token และแสดงลิงก์, pin image ของ scanner ด้วย digest, อ่าน lcov ด้วย UTF-8 ชัดเจน)

**Tech Stack:** ESLint 9 flat config, SonarQube properties, Windows PowerShell 5.1, Docker Desktop

**ที่มา:** review รอบสุดท้าย (b1cbb23..31876c4) ข้อ Minor 2, 3, 4, 5 และ 6 (ข้อ 6 ทำเฉพาะ URL กับ pin image; ไม่ทำ `:ro` เพราะทดสอบกับ scanner จริงไม่ได้โดยไม่มี token) ข้อ Minor 1 (อักขระ U+2028 ในไฟล์แผน) controller แก้เอง

## Global Constraints

- คอมเมนต์ในโค้ดบรรทัดเดียว ภาษาไทย อธิบาย "ทำไม" ศัพท์เทคนิคคงเป็นอังกฤษ; ชื่อตัวแปร/function/log เป็นอังกฤษ; ห้าม emoji ในโค้ด คอมเมนต์ log commit
- ห้ามเปลี่ยนโค้ดของบอทและหน้าเว็บ (`src/**`, `public/**`) แตะเฉพาะไฟล์ที่ task ระบุ
- ไฟล์ `scripts/*.ps1` ต้องบันทึกเป็น UTF-8 **มี BOM** (มีคอมเมนต์ภาษาไทย Windows PowerShell 5.1 อ่านไม่มี BOM เป็น ANSI แล้วภาษาไทยเพี้ยน) และตรวจว่า parse ผ่านหลังแก้
- ห้ามใส่อักขระ U+2028/U+2029 หรือ `\u2028` ในไฟล์
- ห้ามพิมพ์ token ลงในผลลัพธ์หรือไฟล์ใดๆ ใช้ค่าปลอมเท่านั้นตอนทดสอบ
- ทำงานต่อบน branch `fix/sonarqube-issues` (ไม่สร้าง branch ใหม่)
- commit message ลงท้ายด้วย:
  ```

  Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
  ```

---

### Task 1: ตัวช่วย test ไม่นับเป็นโค้ดจริง และ ESLint ไม่ไล่ coverage/

**Depends on:** none

**Files:**
- Modify: `sonar-project.properties` (บรรทัดคอมเมนต์และ `sonar.coverage.exclusions` ท้ายไฟล์)
- Modify: `eslint.config.js:5` (รายการ `ignores`)

**Interfaces:**
- Consumes: ไฟล์ตัวช่วย test 2 ไฟล์ที่ vitest ไม่นับ coverage: `public/liff/dom-harness.mjs` (อยู่ใน `exclude` ของ `vitest.config.mjs`) และ `src/db/test-helpers.mjs` (อยู่นอก `include` ของ vitest)
- Produces: ไม่มี

- [ ] **Step 1: ยืนยันว่าตอนนี้ ESLint ไล่ไฟล์ใน coverage/ (RED)**

ถ้ายังไม่มีโฟลเดอร์ `coverage/lcov-report` ให้รัน `npm run test:coverage` ก่อน (ใช้เวลาราว 1 นาที) แล้วรัน:
Run: `npx eslint coverage/lcov-report/prettify.js`
Expected: ไม่มีข้อความ "File ignored" (ESLint ตรวจไฟล์นี้จริง) และ exit 0 ให้จดผลไว้ในรายงาน

- [ ] **Step 2: แก้ eslint.config.js**

ข้อความ "ก่อน" ต้องตรงเป๊ะ (`eslint.config.js` บรรทัด 5):

ก่อน:
```js
  { ignores: ['node_modules/**', 'work-memory/**', '.superpowers/**', 'docs/**', 'public/liff/vendor/**'] },
```
หลัง:
```js
  { ignores: ['node_modules/**', 'work-memory/**', '.superpowers/**', 'docs/**', 'public/liff/vendor/**', 'coverage/**', '.scannerwork/**'] },
```

- [ ] **Step 3: แก้ sonar-project.properties**

ข้อความ "ก่อน" ต้องตรงเป๊ะ (สองบรรทัดท้ายไฟล์):

ก่อน:
```properties
# ไฟล์ตั้งค่าและสคริปต์ dev ไม่ได้เขียน unit test ครอบ ถ้านับจะทำให้ coverage ของโค้ดใหม่ต่ำเกินจริง
sonar.coverage.exclusions=**/*.config.*,scripts/**,public/liff/vendor/**
```
หลัง:
```properties
# ไฟล์ตั้งค่า สคริปต์ dev และตัวช่วยเทสต์ไม่ได้เขียน unit test ครอบ ถ้านับจะทำให้ coverage ต่ำเกินจริง (vitest ก็ไม่นับสองตัวหลัง)
sonar.coverage.exclusions=**/*.config.*,scripts/**,public/liff/vendor/**,public/liff/dom-harness.mjs,src/db/test-helpers.mjs
```
ห้ามเพิ่ม `index.js` ที่ root (เป็นโค้ดจริงที่ยังไม่มี test ครอบ ให้ SonarQube นับต่อไป)

- [ ] **Step 4: ตรวจผล (GREEN)**

Run: `npx eslint coverage/lcov-report/prettify.js`
Expected: ขึ้นคำเตือนว่าไฟล์ถูก ignore ("File ignored because of a matching ignore pattern")

Run: `npm run lint`
Expected: ผ่าน exit 0

Run: `node -e "const fs=require('fs');for (const f of ['public/liff/dom-harness.mjs','src/db/test-helpers.mjs']) console.log(f, fs.existsSync(f))"`
Expected: ทั้งสองไฟล์ `true` (ยืนยันว่า path ใน exclusions ตรงกับไฟล์จริง)

- [ ] **Step 5: Commit**

```bash
git add sonar-project.properties eslint.config.js
git commit -m "chore(sonar): leave test helpers and coverage output out of the checks" -m "ตัวช่วยเทสต์ 2 ไฟล์ที่ vitest ไม่นับ coverage ก็ไม่ควรถูก SonarQube นับเป็นโค้ดจริง และ ESLint ไม่ควรไล่ไฟล์ที่ coverage สร้าง" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

### Task 2: สคริปต์สแกนใช้ URL เดียวกัน pin image และสวิตช์ที่ชื่อตรง

**Depends on:** none

**Files:**
- Modify: `scripts/sonar-scan.ps1` (แทนทั้งไฟล์ด้วยเนื้อหาใน Step 2)
- Modify: `scripts/sonar-report.ps1:1-5` (ส่วนหัวและบรรทัด `$server`)

**Interfaces:**
- Consumes: `npm run test:coverage` (สร้าง `coverage/lcov.info`), `$env:SONAR_TOKEN`, `$env:SONAR_HOST_URL` (ไม่บังคับ)
- Produces: สวิตช์ `-ReuseCoverage` แทน `-SkipCoverage` (ชื่อเก่ายังไม่เคยถูกใช้นอก branch นี้ และไม่มีเอกสารอื่นอ้างถึง; ตรวจด้วย `grep -rn SkipCoverage . --include=*.md --include=*.ps1 --include=*.json --exclude-dir=node_modules --exclude-dir=.git` ก่อนแก้ ถ้าเจอที่อื่นนอกจาก `scripts/sonar-scan.ps1` และไฟล์ `.superpowers/` และเอกสารในโฟลเดอร์ `docs/superpowers/plans/` ให้รายงานแทนการแก้)

- [ ] **Step 1: ตรวจสภาพก่อนแก้ (baseline)**

Run: `powershell -NoProfile -Command "$e=$null; [System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path scripts\sonar-scan.ps1).Path,[ref]$null,[ref]$e)|Out-Null; $e.Count"`
Expected: `0`

- [ ] **Step 2: เขียน scripts/sonar-scan.ps1 ใหม่ทั้งไฟล์**

เนื้อหาใหม่ทั้งไฟล์ (ใช้ตามนี้เป๊ะ แล้วบันทึกเป็น UTF-8 มี BOM):

```powershell
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
```

- [ ] **Step 3: แก้ scripts/sonar-report.ps1**

ข้อความ "ก่อน" ต้องตรงเป๊ะ (บรรทัด 3 และ 5 ของไฟล์ ส่วนบรรทัดอื่นห้ามแตะ):

ก่อน (บรรทัด 3):
```powershell
# อ่าน token จาก $env:SONAR_TOKEN ถ้าว่างจะถามให้วาง (ซ่อนตัวอักษร วางด้วยคลิกขวา)
```
หลัง:
```powershell
# อ่าน token จาก $env:SONAR_TOKEN ถ้าว่างจะถามให้วาง (ซ่อนตัวอักษร วางด้วยคลิกขวา)
# ตั้ง $env:SONAR_HOST_URL ถ้า SonarQube ไม่ได้อยู่ที่ http://localhost:9000
```
ก่อน (บรรทัด 5):
```powershell
$server = 'http://localhost:9000'
```
หลัง:
```powershell
$server = if ($env:SONAR_HOST_URL) { $env:SONAR_HOST_URL.TrimEnd('/') } else { 'http://localhost:9000' }
```

- [ ] **Step 4: ตรวจ BOM และ parse ทั้งสองไฟล์**

Run (PowerShell):
```powershell
foreach ($f in 'scripts\sonar-scan.ps1','scripts\sonar-report.ps1') { $p=(Resolve-Path $f).Path; $b=[IO.File]::ReadAllBytes($p); $bom=$b.Length -ge 3 -and $b[0] -eq 0xEF -and $b[1] -eq 0xBB -and $b[2] -eq 0xBF; $e=$null; [System.Management.Automation.Language.Parser]::ParseFile($p,[ref]$null,[ref]$e)|Out-Null; "$f bom=$bom parse-errors=$($e.Count)" }
```
Expected: ทั้งสองไฟล์ `bom=True parse-errors=0` ถ้า bom เป็น False ให้เขียนไฟล์ใหม่ด้วย `[IO.File]::WriteAllText($p, [IO.File]::ReadAllText($p, [Text.UTF8Encoding]::new($false)), [Text.UTF8Encoding]::new($true))`

- [ ] **Step 5: ทดสอบด้วย SonarQube ปลอม (ไม่ใช้ token จริง)**

สร้างไฟล์ stub นอก repo ที่ `C:/Users/Kariwqq/AppData/Local/Temp/claude/af9ad7efbbccd6ce/34c843b9-46e3-4f64-9d98-6ddf58dd3074/scratchpad/stub-sonar.js`:

```js
const http = require('http');
http.createServer((req, res) => {
  if (req.url === '/api/authentication/validate') {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ valid: process.env.STUB_VALID !== 'false' }));
    return;
  }
  res.statusCode = 404;
  res.end();
}).listen(9001, '127.0.0.1');
```

รัน stub ในพื้นหลัง (จด PID ของ process นี้เท่านั้น) แล้วทดสอบสามกรณีด้วย `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\sonar-scan.ps1` จาก root ของ repo โดยตั้ง `$env:SONAR_HOST_URL='http://localhost:9001'` และ `$env:SONAR_TOKEN` เป็นสตริงปลอมยาว 44 ตัว (`squ_` ตามด้วย `a` 40 ตัว):

1. **token ถูกปฏิเสธ:** รัน stub ด้วย `STUB_VALID=false` Expected: ข้อความ `SonarQube rejected this token. Generate a new one at http://localhost:9001/account/security.` และ exit 1 (ยืนยันว่าใช้ `$serverUrl` ไม่ใช่ `localhost:9000`)
2. **เข้าถึง server ไม่ได้:** ปิด stub แล้วรัน Expected: `Cannot reach SonarQube at http://localhost:9001. Is the container running?` และ exit 1
3. **ผ่านด่านตรวจ token พร้อม -ReuseCoverage:** รัน stub ปกติ (valid) แล้วรันสคริปต์ด้วย `-ReuseCoverage` Expected: ขึ้น `Reusing the existing coverage/lcov.info without running the tests.` ไม่รัน `npm run test:coverage` ไฟล์ `coverage/lcov.info` มี path ที่ขึ้นต้น `SF:` ไม่มี `\` เหลือ (นับด้วย `grep '^SF:' coverage/lcov.info | grep -c '\\'` ต้องได้ 0) จากนั้น container ของ scanner (pin ด้วย digest) เริ่มรันและล้มเพราะ stub ไม่ใช่ SonarQube จริง ซึ่งคาดไว้ สคริปต์ต้อง**ไม่**พิมพ์ `Done.` และ `docker run` ต้องได้ `SONAR_HOST_URL=http://host.docker.internal:9001` (ยืนยันจากข้อความ error ของ scanner ที่อ้างถึง host.docker.internal:9001 ถ้าเห็น)

ถ้ากรณี 3 ต้องใช้ lcov ที่มี path แบบ Windows ให้รัน `npm run test:coverage` ก่อน 1 ครั้งเพื่อให้มีไฟล์ (ถ้ายังไม่มี) แล้วค่อยทดสอบ

หลังทดสอบ: ปิด stub (เฉพาะ process ที่คุณเริ่มเอง) ล้างตัวแปร `$env:SONAR_HOST_URL` และ `$env:SONAR_TOKEN` และห้าม commit ไฟล์ stub หรือโฟลเดอร์ `.scannerwork` (ถูก git ignore อยู่แล้ว)

- [ ] **Step 6: Commit**

```bash
git add scripts/sonar-scan.ps1 scripts/sonar-report.ps1
git commit -m "chore(sonar): use one server URL, pin the scanner image and name the coverage switch" -m "เช็ค token และลิงก์ผลลัพธ์ใช้ URL เดียวกับที่ตั้งไว้ใน SONAR_HOST_URL, pin image ของ scanner ด้วย digest, -SkipCoverage เปลี่ยนเป็น -ReuseCoverage เพราะทำแค่ใช้ lcov เดิม และอ่านไฟล์ lcov ด้วย UTF-8 ชัดเจน" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
