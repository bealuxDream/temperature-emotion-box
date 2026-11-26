param(
  [string]$PackageDirectory=(Join-Path $PSScriptRoot ('../.local/release/temperature-emotion-box-windows-v'+(Get-Content (Join-Path $PSScriptRoot '../windows/download-sources.json') -Raw|ConvertFrom-Json).version)),
  [string]$DataDirectory=(Join-Path $PSScriptRoot ('../.local/mirror-install-'+[Guid]::NewGuid().ToString('N')))
)
$ErrorActionPreference='Stop'
$PackageDirectory=[IO.Path]::GetFullPath($PackageDirectory)
$DataDirectory=[IO.Path]::GetFullPath($DataDirectory)
if(Test-Path -LiteralPath $DataDirectory){throw 'Use a new isolated data directory; this test does not reuse caches.'}
[IO.Directory]::CreateDirectory($DataDirectory)|Out-Null
$launcher=Join-Path $PackageDirectory 'launcher.ps1'
$sources=Get-Content (Join-Path $PackageDirectory 'download-sources.json') -Raw|ConvertFrom-Json
$env:npm_config_cache=Join-Path $DataDirectory 'npm-cache'
$env:npm_config_store_dir=Join-Path $DataDirectory 'pnpm-store'
$env:npm_config_loglevel='http'
# Deliberately hostile inherited defaults: the launcher must replace them locally.
$fakeUserConfig=Join-Path $DataDirectory 'parent.npmrc'
[IO.File]::WriteAllText($fakeUserConfig,('registry=https://registry.npmjs.org/'+[char]10+'@deepseek-ai:registry=https://registry.npmjs.org/'+[char]10))
$parentHash=(Get-FileHash -LiteralPath $fakeUserConfig).Hash
$env:npm_config_userconfig=$fakeUserConfig
$env:npm_config_registry='https://registry.npmjs.org/'
Write-Output ('ISOLATED_DATA '+$DataDirectory)
try{
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $launcher -Worker -NoOpen -DataDirectory $DataDirectory
  if($LASTEXITCODE -ne 0){throw 'Mirror-only first install did not complete.'}
  $state=Get-Content (Join-Path $DataDirectory 'run.json') -Raw|ConvertFrom-Json
  $health=Invoke-RestMethod ($state.dashboardUrl+'health')
  if($state.status -ne 'ready' -or $health.service -ne 'temperature-emotion-box'){throw 'Installed runtime is not ready.'}
  $zip=Join-Path $DataDirectory 'runtime/node-v24.11.1-win-x64.zip'
  $tools=Get-Content (Join-Path $DataDirectory 'execution-tools.json') -Encoding UTF8 -Raw|ConvertFrom-Json
  if($tools.node.source -eq 'managed' -and (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash -ne $sources.nodeZipSha256){throw 'Mirrored Node digest differs.'}
  $lockFile=Join-Path $DataDirectory 'host/package-lock.json'
  $lock=if(Test-Path -LiteralPath $lockFile){Get-Content -LiteralPath $lockFile -Raw}else{''}
  $resolved=[regex]::Matches($lock,'"resolved"\s*:\s*"(https://[^"]+)"')
  if($tools.dsh.source -eq 'managed' -and $resolved.Count -eq 0){throw 'No resolved package evidence.'}
  foreach($entry in $resolved){
    if(([Uri]$entry.Groups[1].Value).Host -notmatch '(^|\.)npmmirror\.com$'){throw 'Host dependency resolved outside the mirror.'}
  }
  $requests=@(Get-ChildItem -LiteralPath (Join-Path $DataDirectory 'logs') -File | ForEach-Object{Get-Content -LiteralPath $_.FullName -Raw}) -join ([char]10)
  if($tools.dsh.source -eq 'managed' -and $requests -notmatch 'https://registry.npmmirror.com'){throw 'No actual mirror HTTP requests in install logs.'}
  if($requests -match 'https://(?:registry\.npmjs\.org|nodejs\.org)'){throw 'Install log shows an official upstream request.'}
  # Verify the exact pnpm executable used by DSH sees the private mirror and empty store.
  $env:npm_config_userconfig=Join-Path $DataDirectory 'npmrc'
  $env:npm_config_registry=$sources.registry
  $node=$tools.node.bin
  $pnpm=$tools.pnpm.bin
  $registry=(& $node $pnpm config get registry | Out-String).Trim()
  if($registry.TrimEnd('/') -ne $sources.registry.TrimEnd('/')){throw 'Child pnpm did not inherit the mirror.'}
  $store=(& $node $pnpm store path | Out-String).Trim()
  if(-not $store.StartsWith($DataDirectory,[StringComparison]::OrdinalIgnoreCase)){throw 'pnpm borrowed a shared package store.'}
  if((Get-FileHash -LiteralPath $fakeUserConfig).Hash -ne $parentHash){throw 'Parent npm configuration was modified.'}
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $launcher -Worker -NoOpen -DataDirectory $DataDirectory
  if($LASTEXITCODE -ne 0){throw 'Repeated start failed.'}
  $again=Get-Content (Join-Path $DataDirectory 'run.json') -Raw|ConvertFrom-Json
  if($again.runnerPid -ne $state.runnerPid){throw 'Repeated start duplicated the service.'}
  Write-Output ('PASS mirror-only first install; '+$resolved.Count+' mirrored host packages; isolated npm/pnpm caches; live dashboard; repeated start; parent config unchanged.')
}finally{
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $launcher -Worker -Action Stop -DataDirectory $DataDirectory
}
