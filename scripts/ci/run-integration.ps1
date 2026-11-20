$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$forge = Join-Path $root '.tools\foundry\forge.exe'
$anvil = Join-Path $root '.tools\foundry\anvil.exe'
$node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
$pnpmCmd = (Get-Command pnpm.cmd -ErrorAction SilentlyContinue).Source
$pnpmCli = if ($pnpmCmd) { Join-Path (Split-Path -Parent $pnpmCmd) 'node_modules\pnpm\bin\pnpm.mjs' }
$port = 18545
$rpc = "http://127.0.0.1:$port"
$anvilRun = $null
$testRun = $null
$oldRpc = $env:COMMITPOT_LOCAL_RPC
$failure = $null
$cleanupErrors = [System.Collections.Generic.List[string]]::new()

function Get-Listeners {
  $listeners = @(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)
  return ,$listeners
}

function Start-RedirectedProcess([string]$FileName, [string]$Arguments, [string]$WorkingDirectory, [string]$StdoutPath, [string]$StderrPath) {
  $start = [System.Diagnostics.ProcessStartInfo]::new()
  $start.FileName = $FileName
  $start.Arguments = $Arguments
  $start.WorkingDirectory = $WorkingDirectory
  $start.UseShellExecute = $false
  $start.CreateNoWindow = $true
  $start.RedirectStandardOutput = $true
  $start.RedirectStandardError = $true
  $child = [System.Diagnostics.Process]::new()
  $child.StartInfo = $start
  if (-not $child.Start()) { throw "Could not start native process: $FileName" }
  $stdoutTask = $child.StandardOutput.ReadToEndAsync()
  $stderrTask = $child.StandardError.ReadToEndAsync()
  return [pscustomobject]@{ Process = $child; Stdout = $stdoutTask; Stderr = $stderrTask; StdoutPath = $StdoutPath; StderrPath = $StderrPath }
}

function Save-ProcessOutput($Run) {
  if (-not $Run) { return }
  try { [System.IO.File]::WriteAllText($Run.StdoutPath, $Run.Stdout.GetAwaiter().GetResult()) } catch { $cleanupErrors.Add("Could not save stdout $($Run.StdoutPath): $($_.Exception.Message)") }
  try { [System.IO.File]::WriteAllText($Run.StderrPath, $Run.Stderr.GetAwaiter().GetResult()) } catch { $cleanupErrors.Add("Could not save stderr $($Run.StderrPath): $($_.Exception.Message)") }
}

function Stop-OwnedTree([System.Diagnostics.Process]$Owned, [string]$Name) {
  if (-not $Owned) { return }
  if (Get-Process -Id $Owned.Id -ErrorAction SilentlyContinue) {
    $output = & taskkill.exe /PID $Owned.Id /T /F 2>&1
    if ($LASTEXITCODE -ne 0 -and (Get-Process -Id $Owned.Id -ErrorAction SilentlyContinue)) {
      $cleanupErrors.Add("Could not stop owned $Name process tree PID $($Owned.Id): $($output -join ' ')")
    }
    try { $Owned.WaitForExit(10000) | Out-Null } catch { }
    if (Get-Process -Id $Owned.Id -ErrorAction SilentlyContinue) { $cleanupErrors.Add("Owned $Name process PID $($Owned.Id) remains alive.") }
  }
}

if (-not $node) { throw 'node.exe was not found on PATH.' }
if (-not $pnpmCmd -or -not (Test-Path -LiteralPath $pnpmCli -PathType Leaf)) { throw 'The pnpm.cmd launcher and adjacent pnpm.mjs were not found.' }
if (-not (Test-Path -LiteralPath $forge -PathType Leaf)) { throw 'Pinned project-local Forge is missing.' }
if (-not (Test-Path -LiteralPath $anvil -PathType Leaf)) { throw 'Pinned project-local Anvil is missing.' }

$forgeVersion = (& $forge --version) -join "`n"
if ($LASTEXITCODE -ne 0 -or $forgeVersion -notmatch 'forge Version: 1\.9\.0\s+Commit SHA: 6056c5845d34205a83cf7108042adb137325c9df') { throw 'Expected verified project-local Forge 1.9.0.' }
$anvilVersion = (& $anvil --version) -join "`n"
if ($LASTEXITCODE -ne 0 -or $anvilVersion -notmatch 'anvil Version: 1\.9\.0\s+Commit SHA: 6056c5845d34205a83cf7108042adb137325c9df') { throw 'Expected matching verified project-local Anvil 1.9.0.' }

$now = Get-Date
$week = [Globalization.CultureInfo]::InvariantCulture.Calendar.GetWeekOfYear($now, [Globalization.CalendarWeekRule]::FirstFourDayWeek, [DayOfWeek]::Monday)
$runId = [Guid]::NewGuid().ToString('N')
$output = Join-Path $root ("scratch\{0}-{1:D2}\week-{2:D2}\{3}_{4}_ci_integration" -f $now.Year, $now.Month, $week, $now.ToString('yyyy-MM-dd_HHmmss'), $runId)
New-Item -ItemType Directory -Path $output -Force | Out-Null
$anvilStdout = Join-Path $output 'anvil.stdout.log'
$anvilStderr = Join-Path $output 'anvil.stderr.log'
$testStdout = Join-Path $output 'vitest.stdout.log'
$testStderr = Join-Path $output 'vitest.stderr.log'

Push-Location $root
try {
  $existing = Get-Listeners
  if ($existing.Count -gt 0) {
    $owners = ($existing | ForEach-Object { "PID $($_.OwningProcess)" }) -join ', '
    throw "Refusing existing listener on $rpc ($owners). This runner never adopts a listener."
  }
  $reservation = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $port)
  try { $reservation.Start() }
  catch { throw "Refusing unavailable loopback port ${port}: $($_.Exception.Message)" }
  finally { $reservation.Stop() }

  & $forge build --root packages/contracts --force --offline
  if ($LASTEXITCODE -ne 0) { throw "Fresh offline Forge build failed with exit $LASTEXITCODE." }
  & node.exe (Join-Path $PSScriptRoot 'check-abi.mjs')
  if ($LASTEXITCODE -ne 0) { throw "Fresh compiler ABI comparison failed with exit $LASTEXITCODE." }

  $listing = & node.exe $pnpmCli --filter @commitpot/web exec vitest list --config vitest.integration.config.ts 2>&1
  if ($LASTEXITCODE -ne 0) { throw 'Vitest could not list the integration suite.' }
  $cases = @($listing | Select-String '^tests/integration/local-chain\.test\.ts > real isolated local chain: five deposits, four typed check-ins, exact claims and cross-core replay rejection$')
  if ($cases.Count -ne 1) { throw "Expected exactly one integration case; Vitest listed $($cases.Count)." }
  Write-Output 'Vitest discovered one isolated local-chain integration case.'

  $anvilRun = Start-RedirectedProcess $anvil '--host 127.0.0.1 --port 18545 --chain-id 31337 --accounts 10 --balance 1000 --silent' $root $anvilStdout $anvilStderr
  $deadline = (Get-Date).AddSeconds(30)
  $ready = $false
  while ((Get-Date) -lt $deadline) {
    if ($anvilRun.Process.HasExited) { throw "Owned Anvil exited early with code $($anvilRun.Process.ExitCode). See $anvilStderr" }
    $listeners = Get-Listeners
    if ($listeners.Count -gt 0) {
      $owned = @($listeners | Where-Object { $_.OwningProcess -eq $anvilRun.Process.Id })
      if ($owned.Count -ne $listeners.Count) { throw "Port $port has a listener not owned by this Anvil PID $($anvilRun.Process.Id)." }
      if ($owned.Count -gt 0) {
        $response = $null
        try { $response = Invoke-RestMethod -Method Post -Uri $rpc -ContentType 'application/json' -Body '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' -TimeoutSec 2 }
        catch { Start-Sleep -Milliseconds 250; continue }
        if ($response.result -ne '0x7a69') { throw "Owned Anvil reported unexpected chain ID $($response.result)." }
        $ready = $true
        break
      }
    }
    Start-Sleep -Milliseconds 250
  }
  if (-not $ready) { throw "Owned Anvil did not become ready at $rpc within 30 seconds." }

  $env:COMMITPOT_LOCAL_RPC = $rpc
  $testArguments = '"' + $pnpmCli + '" --filter @commitpot/web exec vitest run --config vitest.integration.config.ts'
  $testRun = Start-RedirectedProcess $node $testArguments $root $testStdout $testStderr
  if (-not $testRun.Process.WaitForExit(300000)) {
    Stop-OwnedTree $testRun.Process 'Vitest'
    throw "Integration command exceeded 300 seconds. See $testStdout and $testStderr"
  }
  if ($testRun.Process.ExitCode -ne 0) { throw "Integration suite exited $($testRun.Process.ExitCode). See $testStdout and $testStderr" }
  Write-Output "Owned loopback integration passed at $rpc. Output: $output"
}
catch {
  $failure = $_.Exception.Message
}
finally {
  if ($null -eq $oldRpc) { Remove-Item Env:\COMMITPOT_LOCAL_RPC -ErrorAction SilentlyContinue }
  else { $env:COMMITPOT_LOCAL_RPC = $oldRpc }
  if ($testRun) { Stop-OwnedTree $testRun.Process 'Vitest' }
  if ($anvilRun) { Stop-OwnedTree $anvilRun.Process 'Anvil' }
  Save-ProcessOutput $testRun
  Save-ProcessOutput $anvilRun
  $remaining = Get-Listeners
  if ($remaining.Count -gt 0) {
    $owners = ($remaining | ForEach-Object { "PID $($_.OwningProcess)" }) -join ', '
    $cleanupErrors.Add("Listener remains on $rpc after owned cleanup ($owners); it was not killed because ownership is unproven.")
  }
  Pop-Location
}

if ($failure) { throw $failure }
if ($cleanupErrors.Count -gt 0) { throw ($cleanupErrors -join ' ') }
Write-Output "Integration command exit: 0; owned Anvil PID: $($anvilRun.Process.Id); owned test PID: $($testRun.Process.Id); loopback listener cleanup verified."
