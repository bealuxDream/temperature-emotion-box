$ErrorActionPreference='Stop'
$testRoot=Join-Path ([IO.Path]::GetTempPath()) ('temperature-uninstall-'+[Guid]::NewGuid().ToString('N'))
$DataDirectory=Join-Path $testRoot 'owned'
$external=Join-Path $testRoot 'external'
[IO.Directory]::CreateDirectory($DataDirectory)|Out-Null
[IO.Directory]::CreateDirectory($external)|Out-Null
. (Join-Path $PSScriptRoot '../windows/managed-downloads.ps1')
try{
  $hostPath=Join-Path $DataDirectory 'host'
  [IO.Directory]::CreateDirectory($hostPath)|Out-Null
  [IO.File]::WriteAllText((Join-Path $hostPath 'download.bin'),'project download')
  [IO.File]::WriteAllText((Join-Path $external 'keep.txt'),'preinstalled external tool')
  [IO.Directory]::CreateDirectory((Join-Path $DataDirectory 'dsh/plugins'))|Out-Null
  [IO.File]::WriteAllText((Join-Path $DataDirectory 'dsh/plugins/settings.json'),'personal preference')
  $junction=Join-Path $hostPath 'linked-package'
  New-Item -ItemType Junction -Path $junction -Target $external|Out-Null
  Register-Download 'host'
  # A forged receipt must fail before deleting an otherwise valid target.
  $receipt=Read-DownloadReceipt;$receipt.paths=@('host','../external')
  Write-JsonFile (Join-Path $DataDirectory 'managed-downloads.json') $receipt
  $blocked=$false
  try{Remove-OwnedDownloads}catch{$blocked=$true}
  if(-not $blocked -or -not (Test-Path -LiteralPath $hostPath)){throw 'Unsafe receipt was not rejected atomically.'}
  $receipt.paths=@('host');Write-JsonFile (Join-Path $DataDirectory 'managed-downloads.json') $receipt
  Remove-OwnedDownloads
  if(Test-Path -LiteralPath $hostPath){throw 'Project download was not removed.'}
  if((Get-Content (Join-Path $external 'keep.txt') -Raw) -ne 'preinstalled external tool'){throw 'External tool was touched.'}
  if(-not (Test-Path -LiteralPath (Join-Path $DataDirectory 'dsh/plugins/settings.json'))){throw 'Personal data was removed.'}
  Remove-OwnedDownloads
  'PASS scoped uninstall, external junction target preserved, preferences kept, forged path rejected, repeat uninstall harmless.'
}finally{
  # Clean only this script's resolved temp fixture. Remove links without following their targets.
  if([IO.Path]::GetFullPath($testRoot).StartsWith([IO.Path]::GetFullPath([IO.Path]::GetTempPath()),[StringComparison]::OrdinalIgnoreCase)){
    if(Test-Path -LiteralPath $testRoot){Remove-DownloadTree $testRoot}
  }
}
