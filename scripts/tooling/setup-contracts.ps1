$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$tools = Join-Path $root '.tools\foundry'
$lib = Join-Path $root 'packages\contracts\lib'
New-Item -ItemType Directory -Path $tools,$lib -Force | Out-Null
$items = @(
  @{ Url='https://github.com/foundry-rs/foundry/releases/download/v1.9.0/foundry_v1.9.0_win32_amd64.zip'; Zip=(Join-Path $tools 'foundry_v1.9.0_win32_amd64.zip'); Hash='2b02444d46c9218fe2e6be66015265ce131fe6b7c384e33e630b00f9a0bff072'; Target=$tools; Expected=(Join-Path $tools 'forge.exe'); Folder=$null },
  @{ Url='https://codeload.github.com/OpenZeppelin/openzeppelin-contracts/zip/refs/tags/v5.0.2'; Zip=(Join-Path $lib 'openzeppelin-contracts.zip'); Hash='ca49e0776066328da0087977864dfaef0d5e54a0ea9859236a7cd9ad02abb9e5'; Target=$lib; Expected=(Join-Path $lib 'openzeppelin-contracts'); Folder='openzeppelin-contracts-5.0.2' },
  @{ Url='https://codeload.github.com/foundry-rs/forge-std/zip/refs/tags/v1.9.7'; Zip=(Join-Path $lib 'forge-std.zip'); Hash='6437626a67008dca2e06e3783a37c65772c145df2da901943a894b9c0b770531'; Target=$lib; Expected=(Join-Path $lib 'forge-std'); Folder='forge-std-1.9.7' }
)
foreach($item in $items) {
  if(Test-Path -LiteralPath $item.Expected) { Write-Output ('Preserved existing target: '+$item.Expected); continue }
  if(-not (Test-Path -LiteralPath $item.Zip)) { Invoke-WebRequest -UseBasicParsing -Uri $item.Url -OutFile $item.Zip }
  $hash=(Get-FileHash -LiteralPath $item.Zip -Algorithm SHA256).Hash.ToLowerInvariant()
  if($hash -ne $item.Hash) { throw ('Checksum mismatch; refusing extraction: '+$item.Zip) }
  Expand-Archive -LiteralPath $item.Zip -DestinationPath $item.Target
  if($item.Folder) {
    $source=Join-Path $item.Target $item.Folder
    $destination=$item.Expected
    Write-Output ('Checked intended source and destination: '+$source+' -> '+$destination)
    if(-not (Test-Path -LiteralPath $source -PathType Container) -or (Test-Path -LiteralPath $destination)) { throw 'Unexpected extraction layout' }
    Move-Item -LiteralPath $source -Destination $destination
  }
}
& (Join-Path $tools 'forge.exe') --version
if($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Output 'Pinned project-local contract tooling is ready. No global PATH or wallet configuration changed.'
