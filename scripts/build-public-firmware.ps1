 $ErrorActionPreference='Stop'
 $root=Split-Path -Parent $PSScriptRoot
 & (Join-Path $PSScriptRoot 'build-firmware.ps1') -Environment esp32-s3-public
 if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
 $python=Join-Path $root '.local/pio-venv/Scripts/python.exe'
 $build=Join-Path $root 'firmware/.pio/build/esp32-s3-public'
 $esptool=Join-Path $root '.local/platformio/packages/tool-esptoolpy/esptool.py'
 $bootApp=Join-Path $root '.local/platformio/packages/framework-arduinoespressif32/tools/partitions/boot_app0.bin'
 $output=Join-Path $root '.local/public-firmware'
 [IO.Directory]::CreateDirectory($output)|Out-Null
 & $python $esptool --chip esp32s3 merge_bin -o (Join-Path $output 'firmware.bin') --flash_mode dio --flash_freq 80m --flash_size 8MB 0x0 (Join-Path $build 'bootloader.bin') 0x8000 (Join-Path $build 'partitions.bin') 0xe000 $bootApp 0x10000 (Join-Path $build 'firmware.bin')
 exit $LASTEXITCODE
