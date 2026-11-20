$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$contracts = Join-Path $root 'packages\contracts'
$forge = Join-Path $root '.tools\foundry\forge.exe'
$node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
$abiCheck = Join-Path $PSScriptRoot 'check-abi.mjs'

if (-not $node) { throw 'node.exe was not found on PATH.' }

if (-not (Test-Path -LiteralPath $forge -PathType Leaf)) { throw 'Pinned project-local Foundry is missing; run scripts/tooling/setup-contracts.ps1 explicitly.' }
$versionText = (& $forge --version) -join "`n"
if ($LASTEXITCODE -ne 0) { throw 'forge --version failed.' }
if ($versionText -notmatch 'forge Version: 1\.9\.0\s+Commit SHA: 6056c5845d34205a83cf7108042adb137325c9df') {
  throw "Expected the verified Foundry 1.9.0 build, got: $versionText"
}

$testBuckets = @(
  @{ Name = 'unit'; Pattern = 'test/unit/**/*.t.sol'; SourcePattern = 'function\s+test\w*\s*\(' },
  @{ Name = 'failure'; Pattern = 'test/failure/**/*.t.sol'; SourcePattern = 'function\s+test\w*\s*\(' },
  @{ Name = 'invariant'; Pattern = 'test/invariant/**/*.t.sol'; SourcePattern = 'function\s+(test|invariant)\w*\s*\(' }
)
foreach ($bucket in $testBuckets) {
  $directory = Join-Path $contracts ("test\" + $bucket.Name)
  $sources = @(Get-ChildItem -LiteralPath $directory -Filter '*.t.sol' -File -Recurse -ErrorAction SilentlyContinue)
  if ($sources.Count -eq 0) { throw "Required Forge suite is missing: $($bucket.Name)" }
  $declared = @($sources | Select-String -Pattern $bucket.SourcePattern)
  if ($declared.Count -eq 0) { throw "Required Forge suite has no declared cases: $($bucket.Name)" }
}

Push-Location $root
try {
  Write-Output 'Freshly compiling contracts offline before comparing the committed ABI.'
  & $forge build --root packages/contracts --force --offline
  if ($LASTEXITCODE -ne 0) { throw "Fresh offline Forge build failed with exit $LASTEXITCODE." }

  & $node $abiCheck
  if ($LASTEXITCODE -ne 0) { throw "Fresh compiler ABI comparison failed with exit $LASTEXITCODE." }

  $oldInvariantRuns = $env:FOUNDRY_INVARIANT_RUNS
  $oldInvariantDepth = $env:FOUNDRY_INVARIANT_DEPTH
  $oldInvariantFailOnRevert = $env:FOUNDRY_INVARIANT_FAIL_ON_REVERT
  try {
    $env:FOUNDRY_INVARIANT_RUNS = '256'
    $env:FOUNDRY_INVARIANT_DEPTH = '64'
    $env:FOUNDRY_INVARIANT_FAIL_ON_REVERT = 'true'

    $effective = (& $forge config --root packages/contracts --json | ConvertFrom-Json)
    if ($LASTEXITCODE -ne 0) { throw 'Forge could not read effective invariant configuration.' }
    if ($effective.invariant.runs -ne 256 -or $effective.invariant.depth -ne 64 -or $effective.invariant.fail_on_revert -ne $true) {
      throw "Unexpected effective invariant settings: runs=$($effective.invariant.runs), depth=$($effective.invariant.depth), fail_on_revert=$($effective.invariant.fail_on_revert)."
    }

    foreach ($bucket in $testBuckets) {
      $listed = & $forge test --root packages/contracts --offline --match-path $bucket.Pattern --list
      if ($LASTEXITCODE -ne 0) { throw "Forge could not list the $($bucket.Name) suite." }
      $cases = @($listed | Select-String '^\s+(test|invariant)\w+\s*$')
      if ($cases.Count -eq 0) { throw "Forge discovered zero cases in the required $($bucket.Name) suite." }
      Write-Output "Running offline Forge $($bucket.Name) suite: $($bucket.Pattern) ($($cases.Count) discovered cases)"
      & $forge test --root packages/contracts --offline --match-path $bucket.Pattern --fuzz-seed 0x434f4d4d4954504f54 --fail-fast
      if ($LASTEXITCODE -ne 0) { throw "Forge $($bucket.Name) suite failed with exit $LASTEXITCODE." }
    }
  }
  finally {
    $env:FOUNDRY_INVARIANT_RUNS = $oldInvariantRuns
    $env:FOUNDRY_INVARIANT_DEPTH = $oldInvariantDepth
    $env:FOUNDRY_INVARIANT_FAIL_ON_REVERT = $oldInvariantFailOnRevert
  }
}
finally {
  Pop-Location
}
