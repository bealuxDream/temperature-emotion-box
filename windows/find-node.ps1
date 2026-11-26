function Invoke-ToolProbe([string]$exe,[string[]]$arguments,[int]$timeoutMs=8000) {
  $probeId=[Guid]::NewGuid().ToString('N')
  $outFile=Join-Path $DataDirectory ('logs/probe-'+$probeId+'.out.log')
  $errFile=Join-Path $DataDirectory ('logs/probe-'+$probeId+'.err.log')
  try{
    $p=Start-Process -FilePath $exe -ArgumentList (($arguments|ForEach-Object{Quote-Arg $_}) -join ' ') -WindowStyle Hidden -PassThru -RedirectStandardOutput $outFile -RedirectStandardError $errFile
    $null=$p.Handle
    if(-not $p.WaitForExit($timeoutMs)){$p.Kill();return $null}
    $p.Refresh()
    if($p.ExitCode -eq 0){return (Get-Content -LiteralPath $outFile -Encoding UTF8 -Raw).Trim()}
  }catch{}
  return $null
}
function Find-CompatibleNode($previous) {
  $candidates=@((Join-Path $DataDirectory 'runtime/node-v24.11.1-win-x64/node.exe'))
  if($previous -and $previous.node){$candidates+= $previous.node.bin}
  $candidates+= @(Get-Command node.exe -All -CommandType Application -ErrorAction SilentlyContinue|ForEach-Object{$_.Source})
  foreach($candidate in ($candidates|Select-Object -Unique)){
    if(-not $candidate -or -not (Test-Path -LiteralPath $candidate)){continue}
    $value=Invoke-ToolProbe $candidate @('-p','JSON.stringify({version:process.versions.node,arch:process.arch})')
    if(-not $value){continue}
    try{$info=$value|ConvertFrom-Json}catch{continue}
    if($info.arch -eq 'x64' -and [version]$info.version -ge [version]'24.9.0'){
      $source=if([IO.Path]::GetFullPath($candidate).StartsWith([IO.Path]::GetFullPath($DataDirectory).TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase)){'managed'}else{'reused'}
      return [PSCustomObject]@{bin=[IO.Path]::GetFullPath($candidate);version=$info.version;source=$source}
    }
    Write-Output ('Skipping incompatible Node: '+$candidate+' ('+$info.version+')')|Out-Host
  }
  return $null
}
function Get-ToolDirectories([string]$node) {
  $directories=@((Split-Path -Parent $node))
  foreach($name in @('node.exe','npm.cmd','pnpm.cmd','dsh.cmd')){
    $directories+= @(Get-Command $name -All -CommandType Application -ErrorAction SilentlyContinue|ForEach-Object{Split-Path -Parent $_.Source})
  }
  return @($directories|Select-Object -Unique)
}
