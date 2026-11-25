param([string]$UploadPort)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$python = Join-Path $projectRoot '.local/pio-venv/Scripts/python.exe'
if (-not (Test-Path -LiteralPath $python)) {
    throw 'First install PlatformIO in .local/pio-venv (see README).'
}
$mappedDrive = $null
$oldCore = $env:PLATFORMIO_CORE_DIR
$oldLocation = Get-Location
try {
    # Xtensa GCC on Windows cannot reliably open Unicode paths. Map only this checkout.
    foreach ($letter in @('Z','Y','X','W','V','U','T','S','R','Q','P')) {
        $candidate = "${letter}:"
        if (-not (Test-Path "${candidate}\") -and -not (Get-PSDrive -Name $letter -ErrorAction SilentlyContinue)) {
            & subst.exe $candidate $projectRoot
            if ($LASTEXITCODE -ne 0) { throw 'Could not create temporary ASCII drive mapping.' }
            $mappedDrive = $candidate
            break
        }
    }
    if (-not $mappedDrive) { throw 'No free drive letter for the firmware toolchain.' }
    $env:PLATFORMIO_CORE_DIR = "${mappedDrive}\.local\platformio"
    Set-Location "${mappedDrive}\"
    $pioArgs = @('-m', 'platformio', 'run', '-d', "${mappedDrive}\firmware")
    if ($UploadPort) { $pioArgs += @('-t', 'upload', '--upload-port', $UploadPort) }
    & "${mappedDrive}\.local\pio-venv\Scripts\python.exe" @pioArgs
    $buildExit = $LASTEXITCODE
} finally {
    Set-Location $oldLocation
    $env:PLATFORMIO_CORE_DIR = $oldCore
    if ($mappedDrive) { & subst.exe $mappedDrive /D }
}
exit $buildExit
