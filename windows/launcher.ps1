param(
  [ValidateSet('Start','Stop','Uninstall')][string]$Action='Start',
  [string]$DataDirectory=(Join-Path $env:LOCALAPPDATA 'TemperatureEmotionBox'),
  [switch]$Worker,[switch]$NoOpen,[switch]$ValidateGui
)
$ErrorActionPreference='Stop'
$DataDirectory=[IO.Path]::GetFullPath($DataDirectory)
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$PackageRoot=$PSScriptRoot
. (Join-Path $PackageRoot 'managed-downloads.ps1')
. (Join-Path $PackageRoot 'find-node.ps1')
function Quote-Arg([string]$v) { '"' + ($v -replace '(\\*)"', '$1$1\"' -replace '(\\+)$', '$1$1') + '"' }
function Read-State {
  $p=Join-Path $DataDirectory 'run.json'
  if(Test-Path -LiteralPath $p){try{return Get-Content -LiteralPath $p -Encoding UTF8 -Raw|ConvertFrom-Json}catch{}}
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
function Ensure-DownloadDirectory([string]$relative) {
  $target=Assert-OwnedRelative $relative
  $receipt=Read-DownloadReceipt
  if((Test-Path -LiteralPath $target) -and $relative -notin $receipt.paths){throw ('An unrecognized directory already exists: '+$relative+'. No files were removed.')}
  Register-Download $relative
  [IO.Directory]::CreateDirectory($target)|Out-Null
  return $target
}
function Import-LegacyDownloads {
  if(Test-Path -LiteralPath (Join-Path $DataDirectory 'managed-downloads.json')){return}
  # Migrate only directories carrying the previous launcher installation markers.
  if(-not (Test-Path -LiteralPath (Join-Path $DataDirectory 'installed-version.txt'))){return}
  $legacyHost=Join-Path $DataDirectory 'host'
  if((Test-Path -LiteralPath (Join-Path $legacyHost 'ready.txt')) -and (Test-Path -LiteralPath (Join-Path $legacyHost 'package.json'))){
    $legacy=Get-Content (Join-Path $legacyHost 'package.json') -Raw|ConvertFrom-Json
    if($legacy.dependencies.'@deepseek-ai/dsh' -eq '0.2.2-rc.1'){
      Register-Download 'host'
      if(Test-Path -LiteralPath (Join-Path $DataDirectory 'runtime/node-v24.11.1-win-x64/node.exe')){Register-Download 'runtime'}
      if(Test-Path -LiteralPath (Join-Path $DataDirectory 'dsh/profiles/web/node_modules/dsh-temperature-emotion-box/package.json')){Register-Download 'dsh/profiles/web/node_modules'}
      foreach($backup in Get-ChildItem -LiteralPath (Join-Path $DataDirectory 'dsh/profiles') -Directory -ErrorAction SilentlyContinue){
        if($backup.Name -match '^web\.(backup|failed)-[a-fA-F0-9]+$' -and (Test-Path -LiteralPath (Join-Path $backup.FullName 'node_modules/dsh-temperature-emotion-box/package.json'))){Register-Download ('dsh/profiles/'+$backup.Name+'/node_modules')}
      }
    }
  }
}
function Discover-ExistingTools([string]$node,$previous) {
  $request=Join-Path $DataDirectory 'tool-discovery.json'
  Write-JsonFile $request @{dataDirectory=$DataDirectory;commandDirectories=@(Get-ToolDirectories $node);previous=$previous;node=$node}
  $json=Invoke-ToolProbe $node @((Join-Path $PackageRoot 'discover-tools.mjs'),$request) 40000
  if(-not $json){throw 'Unable to inspect installed tools. See probe logs; nothing was reinstalled.'}
  return $json|ConvertFrom-Json
}
function Start-Companion {
  if(-not [Environment]::Is64BitOperatingSystem -or $env:PROCESSOR_ARCHITECTURE -eq 'ARM64'){throw 'This package supports Windows x64.'}
  $manifest=Get-Content (Join-Path $PackageRoot 'manifest.json') -Raw|ConvertFrom-Json
  $sources=Get-Content (Join-Path $PackageRoot 'download-sources.json') -Raw|ConvertFrom-Json
  foreach($address in @($sources.registry,$sources.nodeDistributionUrl)){
    $uri=[Uri]$address
    if(-not $uri.IsAbsoluteUri -or $uri.Scheme -ne 'https'){throw 'Download mirrors must use absolute HTTPS URLs.'}
  }
  if($sources.nodeVersion -ne '24.11.1' -or $sources.nodeZipSha256 -notmatch '^[0-9a-f]{64}$'){throw 'Invalid runtime download configuration.'}
  # Only this launcher and its child npm/pnpm/dsh processes use these settings.
  # A private userconfig prevents a user's global registry or scope override leaking in.
  $npmrc=Join-Path $DataDirectory 'npmrc'
  $npmConfig="registry=$($sources.registry)"+[char]10+"@deepseek-ai:registry=$($sources.registry)"+[char]10+"disturl=$($sources.nodeDistributionUrl)"+[char]10+"node_mirror=$($sources.nodeDistributionUrl)"+[char]10
  [IO.File]::WriteAllText($npmrc,$npmConfig,[Text.UTF8Encoding]::new($false))
  $env:npm_config_userconfig=$npmrc
  $env:npm_config_registry=$sources.registry
  $env:npm_config_disturl=$sources.nodeDistributionUrl
  $env:npm_config_node_mirror=$sources.nodeDistributionUrl
  $env:NODEJS_ORG_MIRROR=$sources.nodeDistributionUrl
  Write-Output ('安装下载使用国内镜像：'+$sources.registry)
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
  Import-LegacyDownloads
  $previous=$null
  if(Test-Path -LiteralPath (Join-Path $DataDirectory 'execution-tools.json')){try{$previous=Get-Content (Join-Path $DataDirectory 'execution-tools.json') -Encoding UTF8 -Raw|ConvertFrom-Json}catch{}}
  Write-Output '正在检查已有 Node、pnpm 和 dsh；兼容的组件将直接复用。'
  $nodeInfo=Find-CompatibleNode $previous
  $runtime=Join-Path $DataDirectory 'runtime/node-v24.11.1-win-x64'
  $node=if($nodeInfo){$nodeInfo.bin}else{Join-Path $runtime 'node.exe'}
  if(-not $nodeInfo){
    $null=Ensure-DownloadDirectory 'runtime'
    Write-Output '首次准备：从国内镜像下载并校验独立 Node 24.11.1…'
    [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
    $base=$sources.nodeDistributionUrl.TrimEnd('/')+'/v'+$sources.nodeVersion+'/'
    $nodeName='node-v24.11.1-win-x64.zip'
    $zip=Join-Path $DataDirectory ('runtime/'+$nodeName)
    $downloaded=(Test-Path -LiteralPath $zip) -and (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash -eq $sources.nodeZipSha256
    if($downloaded){Write-Output '已找到校验通过的 Node 下载缓存，直接解压，不重复下载。'}
    $previousProgress=$ProgressPreference
    try{
      $ProgressPreference='SilentlyContinue'
      for($attempt=1;(-not $downloaded) -and $attempt -le 3;$attempt++){
        try{
          Write-Output ('Node 下载 '+$attempt+'/3：'+$base+$nodeName)
          Invoke-WebRequest ($base+$nodeName) -OutFile $zip -UseBasicParsing -TimeoutSec 360
          # This pinned digest was verified against the official v24.11.1 release.
          if((Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash -ne $sources.nodeZipSha256){throw 'Runtime checksum mismatch.'}
          $downloaded=$true;break
        }catch{Write-Output ('镜像下载或校验失败：'+$_.Exception.Message)}
      }
    }finally{$ProgressPreference=$previousProgress}
    if(-not $downloaded){throw '国内 Node 镜像下载失败。请检查网络后重试；不会自动改用官方源。'}
    Expand-Archive -LiteralPath $zip -DestinationPath (Join-Path $DataDirectory 'runtime') -Force
    $nodeInfo=Find-CompatibleNode $previous
    if(-not $nodeInfo){throw 'Downloaded Node runtime did not pass its version check.'}
    $node=$nodeInfo.bin
  }
  Write-Output ('Node '+$nodeInfo.version+' ['+$nodeInfo.source+'] '+$node)
  $runtime=Split-Path -Parent $node
  $env:PATH=$runtime+';'+$env:PATH
  $tools=Discover-ExistingTools $node $previous
  $hostDir=Join-Path $DataDirectory 'host'
  if(-not $env:npm_config_cache -or -not $env:npm_config_store_dir){
    $null=Ensure-DownloadDirectory 'cache'
    if(-not $env:npm_config_cache){$env:npm_config_cache=Join-Path $DataDirectory 'cache/npm'}
    if(-not $env:npm_config_store_dir){$env:npm_config_store_dir=Join-Path $DataDirectory 'cache/pnpm'}
  }
  if(-not $tools.dsh -or -not $tools.pnpm){
    $null=Ensure-DownloadDirectory 'host'
    $dependencies=@{}
    if(Test-Path -LiteralPath (Join-Path $hostDir 'package.json')){
      $old=Get-Content (Join-Path $hostDir 'package.json') -Raw|ConvertFrom-Json
      foreach($property in $old.dependencies.PSObject.Properties){$dependencies[$property.Name]=$property.Value}
    }
    if(-not $tools.dsh){$dependencies['@deepseek-ai/dsh']='0.2.2-rc.1'}
    if(-not $tools.pnpm){$dependencies['pnpm']='10.25.0'}
    Write-JsonFile (Join-Path $hostDir 'package.json') @{private=$true;dependencies=$dependencies}
    $npmCli=$null
    foreach($dir in Get-ToolDirectories $node){$candidate=Join-Path $dir 'node_modules/npm/bin/npm-cli.js';if(Test-Path -LiteralPath $candidate){$npmCli=$candidate;break}}
    if(-not $npmCli){throw 'npm was not found beside an installed Node/npm command. Install Node with npm, then retry; existing tools were preserved.'}
    Run-Native $node @($npmCli,'install','--no-audit','--no-fund',('--registry='+$sources.registry)) '仅从国内镜像补齐缺少或不兼容的组件' $hostDir
    $tools=Discover-ExistingTools $node $previous
    if(-not $tools.dsh -or -not $tools.pnpm){throw 'Installed tools failed compatibility checks.'}
  }
  Write-Output ('dsh '+$tools.dsh.version+' ['+$tools.dsh.source+'] '+$tools.dsh.bin)
  Write-Output ('pnpm '+$tools.pnpm.version+' ['+$tools.pnpm.source+'] '+$tools.pnpm.bin)
  $tools|Add-Member -NotePropertyName node -NotePropertyValue $nodeInfo -Force
  Write-JsonFile (Join-Path $DataDirectory 'execution-tools.json') $tools
  $toolBin=Join-Path $DataDirectory 'tools-bin'
  [IO.Directory]::CreateDirectory($toolBin)|Out-Null
  # Keep the CMD shim ASCII; Windows expands Unicode environment paths without a code-page round trip.
  $env:TEMPERATURE_NODE_BIN=$node
  $env:TEMPERATURE_PNPM_BIN=$tools.pnpm.bin
  $shim='@echo off'+[char]13+[char]10+'"%TEMPERATURE_NODE_BIN%" "%TEMPERATURE_PNPM_BIN%" %*'+[char]13+[char]10
  [IO.File]::WriteAllText((Join-Path $toolBin 'pnpm.cmd'),$shim,[Text.Encoding]::ASCII)
  $env:PATH=$toolBin+';'+$env:PATH
  $env:DSH_HOME=Join-Path $DataDirectory 'dsh'
  $dsh=$tools.dsh.bin
  $profile=Join-Path $env:DSH_HOME 'profiles/web'
  $installedPlugin=$null
  try{$installedPlugin=Get-Content (Join-Path $profile 'node_modules/dsh-temperature-emotion-box/package.json') -Raw|ConvertFrom-Json}catch{}
  $pluginVersion=if($manifest.pluginVersion){$manifest.pluginVersion}else{$manifest.version}
  $needsPlugin=-not ($installedPlugin -and $installedPlugin.version -eq $pluginVersion -and (Test-Path -LiteralPath (Join-Path $profile 'node_modules/dsh-temperature-emotion-box/runtime-plugin.mjs')))
  if($needsPlugin){
    $backup=$null
    if(Test-Path -LiteralPath $profile){
      if((Test-Path -LiteralPath (Join-Path $profile 'node_modules')) -and 'dsh/profiles/web/node_modules' -notin (Read-DownloadReceipt).paths){throw 'Existing profile dependencies are not owned by this launcher; leaving them unchanged.'}
      $resolved=(Resolve-Path -LiteralPath $profile).Path
      if($resolved -ne [IO.Path]::GetFullPath($profile)){throw 'Unexpected profile path.'}
      $backup=$profile+'.backup-'+[Guid]::NewGuid().ToString('N')
      Move-Item -LiteralPath $resolved -Destination $backup
      if(Test-Path -LiteralPath (Join-Path $backup 'node_modules')){Register-Download ('dsh/profiles/'+(Split-Path -Leaf $backup)+'/node_modules')}
    }
    try{
      Run-Native $node @($dsh,'plugin','--profile','web','add',$archive,('--registry='+$sources.registry)) '从国内镜像安装温度插件依赖' $DataDirectory
      Register-Download 'dsh/profiles/web/node_modules'
      if($backup -and (Test-Path (Join-Path $backup 'cordis.patch.yml'))){Copy-Item -LiteralPath (Join-Path $backup 'cordis.patch.yml') -Destination (Join-Path $profile 'cordis.patch.yml')}
    }catch{
      if(Test-Path -LiteralPath $profile){
        $failed=$profile+'.failed-'+[Guid]::NewGuid().ToString('N')
        Move-Item -LiteralPath $profile -Destination $failed
        if(Test-Path -LiteralPath (Join-Path $failed 'node_modules')){Register-Download ('dsh/profiles/'+(Split-Path -Leaf $failed)+'/node_modules')}
      }
      if($backup){Move-Item -LiteralPath $backup -Destination $profile}
      throw ($_.Exception.Message+' 旧 profile 已恢复，个人设置和聊天仍保留。')
    }
  }else{Write-Output ('温度插件 '+$pluginVersion+' 已安装，跳过重复安装。')}
  [IO.File]::WriteAllText($versionFile,$manifest.version)
  Copy-Item -LiteralPath (Join-Path $PackageRoot 'runner.mjs') -Destination (Join-Path $DataDirectory 'runner.mjs') -Force
  # Keep uninstall/stop available from the data directory if the extracted ZIP is moved.
  $manager=Join-Path $DataDirectory 'manager'
  [IO.Directory]::CreateDirectory($manager)|Out-Null
  foreach($file in @('launcher.ps1','managed-downloads.ps1','find-node.ps1','Stop.cmd','Uninstall.cmd')){
    $source=Join-Path $PackageRoot $file
    $target=Join-Path $manager $file
    if([IO.Path]::GetFullPath($source) -ne [IO.Path]::GetFullPath($target)){Copy-Item -LiteralPath $source -Destination $target -Force}
  }
  foreach($managerAction in @('Stop','Uninstall')){
    $entry='@echo off'+[char]13+[char]10+'start "" powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0launcher.ps1" -Action '+$managerAction+' -DataDirectory "%~dp0.."'+[char]13+[char]10
    [IO.File]::WriteAllText((Join-Path $manager ($managerAction+'.cmd')),$entry,[Text.Encoding]::ASCII)
  }
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
      foreach($sub in @('logs','workspace')){[IO.Directory]::CreateDirectory((Join-Path $DataDirectory $sub))|Out-Null}
      if($Action -eq 'Uninstall'){
        Stop-Owned;Import-LegacyDownloads;Remove-OwnedDownloads
        Write-Output '卸载完成：只移除了本项目下载的组件和依赖。复用的软件、聊天、密钥和个人偏好已保留。'
      }elseif($Action -eq 'Stop'){Stop-Owned;Write-Output 'DONE'}else{Start-Companion}
    }finally{$mutex.ReleaseMutex();$mutex.Dispose()}
    exit 0
  }catch{
    try{Write-JsonFile (Join-Path $DataDirectory 'logs/last-error.json') @{message=$_.Exception.Message;position=$_.InvocationInfo.PositionMessage;stack=$_.ScriptStackTrace}}catch{}
    Write-Output ('ERROR '+$_.Exception.Message);exit 1
  }
}
Add-Type -AssemblyName PresentationFramework
if($Action -eq 'Uninstall'){
  $choice=[Windows.MessageBox]::Show('将停止本项目服务，并移除本项目下载的运行环境、依赖和私有缓存。复用的 Node、pnpm、dsh 不会删除；聊天、密钥和个人偏好保留。是否继续？','温度表情箱 · 卸载下载组件',[Windows.MessageBoxButton]::YesNo,[Windows.MessageBoxImage]::Question)
  if($choice -ne [Windows.MessageBoxResult]::Yes){exit 0}
}
[xml]$xaml=@'
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation" Title="温度表情箱 · 安装与启动" Width="640" Height="440" WindowStartupLocation="CenterScreen" Background="#F5F7F3">
<StackPanel Margin="24"><TextBlock FontSize="23" Foreground="#294C40" Text="让温度接上对话" Margin="0,0,0,12"/><TextBlock TextWrapping="Wrap" Text="先检查并复用已有兼容组件，缺少时才从国内镜像下载。关闭本窗口不会停止服务。Uninstall 仅移除本项目下载的组件，保留复用软件与个人数据。" Margin="0,0,0,12"/><TextBox Name="Progress" Height="220" IsReadOnly="True" TextWrapping="Wrap" VerticalScrollBarVisibility="Auto"/><StackPanel Orientation="Horizontal" Margin="0,14,0,0"><Button Name="Open" Content="打开面板" Padding="12,7" IsEnabled="False"/><Button Name="Logs" Content="数据与日志" Padding="12,7" Margin="8,0,0,0"/><Button Name="Uninstall" Content="卸载本项目组件" Padding="12,7" Margin="8,0,0,0" IsEnabled="False"/></StackPanel></StackPanel></Window>
'@
$window=[Windows.Markup.XamlReader]::Load([Xml.XmlNodeReader]::new($xaml))
if($ValidateGui){
  foreach($name in @('Progress','Open','Logs','Uninstall')){if(-not $window.FindName($name)){throw "Missing GUI element: $name"}}
  Write-Output 'GUI parsed and required controls exist.'
  exit 0
}
$box=$window.FindName('Progress');$open=$window.FindName('Open')
$window.FindName('Logs').Add_Click({[IO.Directory]::CreateDirectory($DataDirectory)|Out-Null;Start-Process explorer.exe -ArgumentList (Quote-Arg $DataDirectory) -WindowStyle Hidden})
$open.Add_Click({$s=Read-State;if($s -and $s.status -eq 'ready'){Start-Process $s.dashboardUrl}})
$uninstallButton=$window.FindName('Uninstall')
$uninstallButton.Add_Click({
  $uninstallArgs=@('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $PackageRoot 'launcher.ps1'),'-Action','Uninstall','-DataDirectory',$DataDirectory)
  Start-Process powershell.exe -ArgumentList (($uninstallArgs|ForEach-Object{Quote-Arg $_}) -join ' ') -WindowStyle Hidden
})
$script:job=$null;$script:guiStarted=$false
$timer=[Windows.Threading.DispatcherTimer]::new();$timer.Interval=[TimeSpan]::FromMilliseconds(500)
$timer.Add_Tick({
  if($script:job){
    $lines=Get-Content -LiteralPath $script:guiLog -Encoding UTF8 -Raw -ErrorAction SilentlyContinue
    if($lines){$box.Text=$lines;$box.ScrollToEnd()}
    if($script:job.HasExited){$timer.Stop();$s=Read-State;$open.IsEnabled=($s -and $s.status -eq 'ready');$uninstallButton.IsEnabled=$true}
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
