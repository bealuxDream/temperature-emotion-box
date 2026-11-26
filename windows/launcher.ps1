param(
  [ValidateSet('Start','Stop')][string]$Action='Start',
  [string]$DataDirectory=(Join-Path $env:LOCALAPPDATA 'TemperatureEmotionBox'),
  [switch]$Worker,[switch]$NoOpen,[switch]$ValidateGui
)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$PackageRoot=$PSScriptRoot
function Quote-Arg([string]$v) { '"' + ($v -replace '(\\*)"', '$1$1\"' -replace '(\\+)$', '$1$1') + '"' }
function Read-State {
  $p=Join-Path $DataDirectory 'run.json'
  if(Test-Path -LiteralPath $p){try{return Get-Content -LiteralPath $p -Raw|ConvertFrom-Json}catch{}}
  return $null
}
function Get-OwnedProcess($idValue,[string]$needle) {
  if(-not $idValue){return $null}
  $p=Get-CimInstance Win32_Process -Filter ("ProcessId = "+[int]$idValue)
  if($p -and $p.Name -eq 'node.exe' -and $p.CommandLine.IndexOf($needle,[StringComparison]::OrdinalIgnoreCase) -ge 0){return $p}
  return $null
}
function Stop-Owned {
  $s=Read-State
  if(-not $s){return}
  $runner=Get-OwnedProcess $s.runnerPid (Join-Path $DataDirectory 'runner.mjs')
  $service=Get-OwnedProcess $s.dshPid (Join-Path $DataDirectory 'launcher.patch.yml')
  if($service){Stop-Process -Id $service.ProcessId -ErrorAction SilentlyContinue}
  if($runner){Stop-Process -Id $runner.ProcessId -ErrorAction SilentlyContinue}
  if($runner -or $service){Write-Output 'Stopped this companion. Chat and preferences are preserved.';Start-Sleep -Milliseconds 600}
  $s.status='stopped'
  [IO.File]::WriteAllText((Join-Path $DataDirectory 'run.json'),($s|ConvertTo-Json -Depth 5),[Text.UTF8Encoding]::new($false))
}
function Run-Native([string]$exe,[string[]]$arguments,[string]$label,[string]$cwd) {
  Write-Output $label
  $id=[Guid]::NewGuid().ToString('N')
  $outFile=Join-Path $DataDirectory ("logs/"+$id+".out.log")
  $errFile=Join-Path $DataDirectory ("logs/"+$id+".err.log")
  $p=Start-Process -FilePath $exe -ArgumentList (($arguments|ForEach-Object{Quote-Arg $_}) -join ' ') -WorkingDirectory $cwd -WindowStyle Hidden -PassThru -RedirectStandardOutput $outFile -RedirectStandardError $errFile
  # Keep the process handle open before it exits (Windows PowerShell 5.1).
  $null=$p.Handle
  while(-not $p.WaitForExit(15000)){
    Write-Output '仍在安装，请保持网络连接；详情可在数据目录的 logs 中查看。'
  }
  $p.Refresh()
  if($p.ExitCode -ne 0){throw ($label+"失败（退出码 "+$p.ExitCode+"）。详细原因保存在数据目录 logs 中。")}
}
function Start-Companion {
  if(-not [Environment]::Is64BitOperatingSystem -or $env:PROCESSOR_ARCHITECTURE -eq 'ARM64'){throw 'This package supports Windows x64.'}
  $manifest=Get-Content (Join-Path $PackageRoot 'manifest.json') -Raw|ConvertFrom-Json
  $archive=Join-Path $PackageRoot $manifest.pluginFile
  if(-not (Test-Path -LiteralPath $archive)){throw 'Plugin missing. Extract the whole ZIP first.'}
  if((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne $manifest.pluginSha256){throw 'Plugin checksum mismatch. Download a fresh ZIP.'}
  $state=Read-State
  $versionFile=Join-Path $DataDirectory 'installed-version.txt'
  $version=if(Test-Path $versionFile){(Get-Content $versionFile -Raw).Trim()}else{''}
  if($state -and (Get-OwnedProcess $state.runnerPid (Join-Path $DataDirectory 'runner.mjs')) -and $state.status -eq 'ready' -and $version -eq $manifest.version){
    if(-not $NoOpen){Start-Process $state.dashboardUrl}
    Write-Output ('READY '+$state.dashboardUrl);return
  }
  Stop-Owned
  $runtime=Join-Path $DataDirectory 'runtime/node-v24.11.1-win-x64'
  $node=Join-Path $runtime 'node.exe'
  if(-not (Test-Path -LiteralPath $node)){
    Write-Output '首次准备：从 nodejs.org 下载并校验独立 Node 24.11.1…'
    [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
    $base='https://nodejs.org/dist/v24.11.1/'
    $nodeName='node-v24.11.1-win-x64.zip'
    $zip=Join-Path $DataDirectory ('runtime/'+$nodeName)
    $sums=(Invoke-WebRequest ($base+'SHASUMS256.txt') -UseBasicParsing).Content
    $lines=@($sums -split ([char]10)|Where-Object{$_ -match ('\s'+[regex]::Escape($nodeName)+'\s*$')})
    if($lines.Count -ne 1){throw 'Official runtime checksum unavailable.'}
    $expected=($lines[0].Trim() -split '\s+')[0]
    Invoke-WebRequest ($base+$nodeName) -OutFile $zip -UseBasicParsing
    if((Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash -ne $expected){throw 'Runtime checksum mismatch.'}
    Expand-Archive -LiteralPath $zip -DestinationPath (Join-Path $DataDirectory 'runtime') -Force
  }
  $env:PATH=$runtime+';'+(Join-Path $DataDirectory 'host/node_modules/.bin')+';'+$env:PATH
  $hostDir=Join-Path $DataDirectory 'host'
  $marker=Join-Path $hostDir 'ready.txt'
  if(-not (Test-Path $marker)){
    Write-Output '正在准备独立的 DeepSeek Harness，不更改现有全局安装。'
    $hostManifest='{"private":true,"dependencies":{"@deepseek-ai/dsh":"0.2.2-rc.1","pnpm":"10.25.0"}}'
    [IO.File]::WriteAllText((Join-Path $hostDir 'package.json'),$hostManifest,[Text.UTF8Encoding]::new($false))
    Run-Native $node @((Join-Path $runtime 'node_modules/npm/bin/npm-cli.js'),'install','--no-audit','--no-fund','--registry=https://registry.npmjs.org') '安装 Harness（首次需要联网）' $hostDir
    [IO.File]::WriteAllText($marker,'dsh-0.2.2-rc.1')
  }
  $env:DSH_HOME=Join-Path $DataDirectory 'dsh'
  $dsh=Join-Path $hostDir 'node_modules/@deepseek-ai/dsh/lib/bin.js'
  $profile=Join-Path $env:DSH_HOME 'profiles/web'
  if($version -ne $manifest.version){
    $backup=$null
    if(Test-Path -LiteralPath $profile){
      $resolved=(Resolve-Path -LiteralPath $profile).Path
      if($resolved -ne [IO.Path]::GetFullPath($profile)){throw 'Unexpected profile path.'}
      $backup=$profile+'.backup-'+[Guid]::NewGuid().ToString('N')
      Move-Item -LiteralPath $resolved -Destination $backup
    }
    try{
      Run-Native $node @($dsh,'plugin','--profile','web','add',$archive) '安装温度插件' $DataDirectory
      if($backup -and (Test-Path (Join-Path $backup 'cordis.patch.yml'))){Copy-Item -LiteralPath (Join-Path $backup 'cordis.patch.yml') -Destination (Join-Path $profile 'cordis.patch.yml')}
      [IO.File]::WriteAllText($versionFile,$manifest.version)
    }catch{
      if(Test-Path -LiteralPath $profile){Move-Item -LiteralPath $profile -Destination ($profile+'.failed-'+[Guid]::NewGuid().ToString('N'))}
      if($backup){Move-Item -LiteralPath $backup -Destination $profile}
      throw ($_.Exception.Message+' 旧 profile 已恢复，个人设置和聊天仍保留。')
    }
  }
  Copy-Item -LiteralPath (Join-Path $PackageRoot 'runner.mjs') -Destination (Join-Path $DataDirectory 'runner.mjs') -Force
  $overlay=Join-Path $DataDirectory 'launcher.patch.yml'
  [IO.File]::WriteAllText($overlay,("- id: temperature-emotion-box-runtime"+[char]10+"  config:"+[char]10+"    autoOpenDashboardOnFirstRun: false"+[char]10),[Text.UTF8Encoding]::new($false))
  $listener=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0)
  $listener.Start();$chatPort=$listener.LocalEndpoint.Port;$listener.Stop()
  $env:TEMPERATURE_LAUNCH_ROOT=$DataDirectory
  $env:TEMPERATURE_CHAT_PORT=[string]$chatPort
  Write-Output '正在启动温度表情箱，首次启动可能需要几分钟…'
  $run=Start-Process -FilePath $node -ArgumentList (Quote-Arg (Join-Path $DataDirectory 'runner.mjs')) -WorkingDirectory (Join-Path $DataDirectory 'workspace') -WindowStyle Hidden -PassThru
  $null=$run.Handle
  $deadline=[DateTime]::UtcNow.AddMinutes(4)
  do{
    Start-Sleep -Milliseconds 700
    $state=Read-State
    if($state -and $state.runnerPid -eq $run.Id -and $state.status -eq 'ready'){
      if(-not $NoOpen){Start-Process $state.dashboardUrl}
      Write-Output ('READY '+$state.dashboardUrl);return
    }
    if($run.HasExited){throw 'Service stopped during startup. See service.log in the data directory.'}
  }while([DateTime]::UtcNow -lt $deadline)
  throw 'Startup is taking too long. Press Start again to check; see service.log for diagnostics.'
}
if($Worker){
  try{
    [IO.Directory]::CreateDirectory($DataDirectory)|Out-Null
    $hash=[Security.Cryptography.SHA256]::Create()
    $key=[BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes([IO.Path]::GetFullPath($DataDirectory).ToLowerInvariant()))).Replace('-','').Substring(0,16)
    $mutex=[Threading.Mutex]::new($false,('Local\TemperatureEmotionBox-'+$key))
    if(-not $mutex.WaitOne(0)){throw 'Another operation is already running.'}
    try{
      foreach($sub in @('runtime','host','logs','workspace')){[IO.Directory]::CreateDirectory((Join-Path $DataDirectory $sub))|Out-Null}
      if($Action -eq 'Stop'){Stop-Owned;Write-Output 'DONE'}else{Start-Companion}
    }finally{$mutex.ReleaseMutex();$mutex.Dispose()}
    exit 0
  }catch{Write-Output ('ERROR '+$_.Exception.Message);exit 1}
}
Add-Type -AssemblyName PresentationFramework
[xml]$xaml=@'
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation" Title="温度表情箱 · 安装与启动" Width="640" Height="440" WindowStartupLocation="CenterScreen" Background="#F5F7F3">
<StackPanel Margin="24"><TextBlock FontSize="23" Foreground="#294C40" Text="让温度接上对话" Margin="0,0,0,12"/><TextBlock TextWrapping="Wrap" Text="首次启动需要联网准备环境。之后双击 Start 即可打开。关闭本窗口不会停止后台服务；停止前请等待正在进行的回复结束。" Margin="0,0,0,12"/><TextBox Name="Progress" Height="220" IsReadOnly="True" TextWrapping="Wrap" VerticalScrollBarVisibility="Auto"/><StackPanel Orientation="Horizontal" Margin="0,14,0,0"><Button Name="Open" Content="打开面板" Padding="15,7" IsEnabled="False"/><Button Name="Logs" Content="打开数据与日志目录" Padding="15,7" Margin="12,0,0,0"/></StackPanel></StackPanel></Window>
'@
$window=[Windows.Markup.XamlReader]::Load([Xml.XmlNodeReader]::new($xaml))
if($ValidateGui){
  foreach($name in @('Progress','Open','Logs')){if(-not $window.FindName($name)){throw "Missing GUI element: $name"}}
  Write-Output 'GUI parsed and required controls exist.'
  exit 0
}
$box=$window.FindName('Progress');$open=$window.FindName('Open')
$window.FindName('Logs').Add_Click({[IO.Directory]::CreateDirectory($DataDirectory)|Out-Null;Start-Process explorer.exe -ArgumentList (Quote-Arg $DataDirectory) -WindowStyle Hidden})
$open.Add_Click({$s=Read-State;if($s -and $s.status -eq 'ready'){Start-Process $s.dashboardUrl}})
$script:job=$null;$script:guiStarted=$false
$timer=[Windows.Threading.DispatcherTimer]::new();$timer.Interval=[TimeSpan]::FromMilliseconds(500)
$timer.Add_Tick({
  if($script:job){
    $lines=Get-Content -LiteralPath $script:guiLog -Encoding UTF8 -Raw -ErrorAction SilentlyContinue
    if($lines){$box.Text=$lines;$box.ScrollToEnd()}
    if($script:job.HasExited){$timer.Stop();$s=Read-State;$open.IsEnabled=($s -and $s.status -eq 'ready')}
  }
})
$window.Add_ContentRendered({
  if($script:guiStarted){return};$script:guiStarted=$true
  [IO.Directory]::CreateDirectory($DataDirectory)|Out-Null
  $script:guiLog=Join-Path $DataDirectory ('launcher-'+[Guid]::NewGuid().ToString('N')+'.log')
  $workerArgs=@('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $PackageRoot 'launcher.ps1'),'-Worker','-Action',$Action,'-DataDirectory',$DataDirectory)
  $script:job=Start-Process powershell.exe -ArgumentList (($workerArgs|ForEach-Object{Quote-Arg $_})-join ' ') -WindowStyle Hidden -PassThru -RedirectStandardOutput $script:guiLog -RedirectStandardError ($script:guiLog+'.err')
  $timer.Start()
})
$window.ShowDialog()|Out-Null
