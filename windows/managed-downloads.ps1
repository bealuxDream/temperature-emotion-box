# Deletion authority is limited to an explicit receipt under this application's data root.
function Write-JsonFile([string]$path,$value) {
  [IO.File]::WriteAllText($path,($value|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
}
function Read-DownloadReceipt {
  $file=Join-Path $DataDirectory 'managed-downloads.json'
  if(Test-Path -LiteralPath $file){return Get-Content -LiteralPath $file -Encoding UTF8 -Raw|ConvertFrom-Json}
  return [PSCustomObject]@{schema=1;root=[IO.Path]::GetFullPath($DataDirectory);paths=@()}
}
function Assert-OwnedRelative([string]$relative) {
  if($relative -notmatch '^(runtime|host|cache|dsh/profiles/web(?:\.(?:backup|failed)-[a-fA-F0-9]+)?/node_modules)$'){throw 'Unrecognized managed download path.'}
  $rootPath=[IO.Path]::GetFullPath($DataDirectory).TrimEnd('\')
  $target=[IO.Path]::GetFullPath((Join-Path $rootPath $relative))
  if(-not $target.StartsWith($rootPath+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Download path escapes application data.'}
  # Reject junctions on the root and every ancestor before touching or traversing it.
  $cursor=$target
  while($cursor){
    if(Test-Path -LiteralPath $cursor){if((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Refusing a linked managed directory.'}}
    $parent=[IO.Path]::GetDirectoryName($cursor)
    if($parent -eq $cursor){break};$cursor=$parent
  }
  return $target
}
function Register-Download([string]$relative) {
  $null=Assert-OwnedRelative $relative
  $receipt=Read-DownloadReceipt
  if([IO.Path]::GetFullPath($receipt.root) -ne [IO.Path]::GetFullPath($DataDirectory)){throw 'Download receipt belongs to another directory.'}
  $receipt.paths=@(@($receipt.paths)+$relative|Select-Object -Unique)
  Write-JsonFile (Join-Path $DataDirectory 'managed-downloads.json') $receipt
}
function Remove-OwnedDownloads {
  $receipt=Read-DownloadReceipt
  if([IO.Path]::GetFullPath($receipt.root) -ne [IO.Path]::GetFullPath($DataDirectory)){throw 'Download receipt belongs to another directory.'}
  # Validate all roots first. Package-manager links below a root are unlinked, never followed.
  $targets=@(foreach($entry in $receipt.paths){
    $target=Assert-OwnedRelative $entry
    if(Test-Path -LiteralPath $target){
      $target
    }
  })
  foreach($target in $targets){Remove-DownloadTree $target;Write-Output ('Removed project download: '+$target)}
  $receipt.paths=@();Write-JsonFile (Join-Path $DataDirectory 'managed-downloads.json') $receipt
  foreach($name in @('installed-version.txt','plugin-install.json','execution-tools.json')){
    $file=Join-Path $DataDirectory $name
    if(Test-Path -LiteralPath $file){Remove-Item -LiteralPath $file -Force}
  }
}
function Remove-DownloadTree([string]$directory) {
  foreach($item in Get-ChildItem -LiteralPath $directory -Force -ErrorAction Stop){
    if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){
      if($item.PSIsContainer){[IO.Directory]::Delete($item.FullName)}else{[IO.File]::Delete($item.FullName)}
    }elseif($item.PSIsContainer){Remove-DownloadTree $item.FullName}
    else{Remove-Item -LiteralPath $item.FullName -Force -ErrorAction Stop}
  }
  [IO.Directory]::Delete($directory)
}
