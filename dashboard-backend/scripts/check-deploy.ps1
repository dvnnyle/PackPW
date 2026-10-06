# Checks a deployed backend end to end. Asks for the API key (hidden) and prints only status and counts,
# never customer details. Usage (PowerShell):
#   .\dashboard-backend\scripts\check-deploy.ps1 https://playworld-backend-knjy.onrender.com
param([Parameter(Mandatory = $true)][string]$BaseUrl)

$BaseUrl = $BaseUrl.TrimEnd('/')
$secure = Read-Host -Prompt 'API_KEY' -AsSecureString
$key = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
$headers = @{ 'x-api-key' = $key }
$today = (Get-Date).ToString('yyyy-MM-dd')

function Check($name, $path, $summary) {
  $started = Get-Date
  try {
    $r = Invoke-RestMethod -Uri "$BaseUrl$path" -Headers $headers -TimeoutSec 120
    $ms = [int]((Get-Date) - $started).TotalMilliseconds
    Write-Host ("OK    {0,-14} {1,6} ms  {2}" -f $name, $ms, (& $summary $r)) -ForegroundColor Green
  } catch {
    Write-Host ("FAIL  {0,-14} {1}" -f $name, $_.Exception.Message) -ForegroundColor Red
  }
}

Check 'Dashboard'   "/api/dashboard?date=$today"     { param($r) "Extanda Go: $($r.serviceA.revenueToday) kr, NordPay: $($r.serviceB.salesToday) kr, errors: $($r.errors -join '; ')" }
Check 'Timesalg'    "/api/sales/hourly?date=$today"  { param($r) "$($r.hours.Count) timer, errors: $($r.errors -join '; ')" }
Check 'Bookinger'   "/api/bookings/upcoming?from=$today&count=10" { param($r) "$($r.days.Count) dager med bookinger" }
Check 'Vaktplan'    "/api/staff?date=$today"         { param($r) "$($r.shifts.Count) vakter" }
Check 'Vaer'        '/api/weather'                   { param($r) "$($r.now.temperature) grader, $($r.hours.Count) varselsteg" }
Check 'App-versjon' '/api/app-version'               { param($r) "versjon $($r.version) ($($r.versionCode))" }
