import { ESPLoader, Transport } from 'esptool-js';
const $=id=>document.getElementById(id);
const local=/^(127\.0\.0\.1|localhost|\[::1\])$/.test(location.hostname);
let loader,transport,manifest,firmware,busy=false,paused=false,connected=false;
const log=text=>{ $('log').textContent=($('log').textContent+text+'\n').slice(-12000); $('log').scrollTop=$('log').scrollHeight; };
function buttons(){ $('flash').disabled=busy||!connected||!$('confirm').checked; $('connect').disabled=busy||connected||!firmware||(local&&!paused); $('disconnect').disabled=busy||(!transport&&!paused); $('pause').disabled=busy||paused; }
async function control(action){
  const response=await fetch('/api/v1/serial-control',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action})});
  if(!response.ok)throw new Error('无法暂停/恢复本机采集。请返回面板重试。');
}
$('pause').hidden=!local;
$('pause').addEventListener('click',async()=>{try{await control('pause');paused=true;$('status').textContent='采集已暂停，可以选择串口。';}catch(e){$('status').textContent=e.message;}buttons();});
$('confirm').addEventListener('change',buttons);
$('connect').addEventListener('click',async()=>{
  busy=true;buttons();
  try{
    const port=await navigator.serial.requestPort();
    busy=true;buttons();$('status').textContent='正在识别芯片…';
    transport=new Transport(port,true);
    loader=new ESPLoader({transport,baudrate:115200,romBaudrate:115200,terminal:{clean(){},write:log,writeLine:log}});
    await loader.main();
    if(loader.chip.CHIP_NAME!=='ESP32-S3')throw new Error('不是 ESP32-S3，已禁止刷写。请断开并选择正确开发板。');
    const flashSize=await loader.detectFlashSize();
    if(!flashSize||!/^\d+MB$/.test(flashSize)||parseInt(flashSize,10)<manifest.minFlashMB)throw new Error('Flash 容量无法确认或不足 8MB，已禁止刷写。');
    connected=true;$('chip').textContent='已识别 ESP32-S3。请再次确认板型和接线。';$('status').textContent='连接成功；勾选确认后才会开始写入。';
  }catch(e){$('status').textContent=e.name==='NotFoundError'?'已取消设备选择。':e.message;log(e.message);}
  finally{busy=false;buttons();}
});
$('flash').addEventListener('click',async()=>{
  if(busy||!connected||!$('confirm').checked)return;
  busy=true;buttons();$('status').textContent='正在刷写，请勿断开电源…';
  try{
    await loader.writeFlash({fileArray:[{data:firmware,address:0}],flashMode:'keep',flashFreq:'keep',flashSize:'keep',eraseAll:false,compress:true,calculateMD5Hash:()=>manifest.md5,reportProgress:(_index,written,total)=>{$('progress').value=written/total*100;}});
    await loader.after('hard_reset');
    $('status').textContent='刷写及 MD5 校验通过。点击“断开并恢复采集”，必要时重新插拔 USB。';$('progress').value=100;
  }catch(e){$('status').textContent='刷写未完成：'+e.message+'。请检查连接，重新进入 BOOT 模式后再试。';log(e.message);}
  finally{busy=false;buttons();}
});
$('disconnect').addEventListener('click',async()=>{
  busy=true;buttons();
  try{
    if(transport)await transport.disconnect();
    transport=undefined;loader=undefined;connected=false;
    if(local&&paused){await control('resume');paused=false;}
    $('status').textContent='已释放浏览器串口。返回温度面板等待真实测温。';
  }catch(e){$('status').textContent=e.message+'；关闭本页后可在面板点击恢复采集。';}
  finally{busy=false;buttons();}
});
async function init(){
  if(!window.isSecureContext||!('serial' in navigator)){ $('support').textContent='当前浏览器不支持串口刷写，请用 Edge/Chrome 打开 HTTPS 或本机页面。';return; }
  try{
    const meta=await fetch('./manifest.json',{cache:'no-store'});
    const image=await fetch('./firmware.bin',{cache:'no-store'});
    if(!meta.ok||!image.ok)throw new Error('无法读取配套固件，请重新打开刷写页。');
    manifest=await meta.json();
    firmware=new Uint8Array(await image.arrayBuffer());
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',firmware)),x=>x.toString(16).padStart(2,'0')).join('');
    if(hash!==manifest.sha256||firmware.length!==manifest.size)throw new Error('固件校验失败，请重新下载安装包。');
    $('support').textContent='浏览器支持，公开固件完整性检查通过。'+(local?'先暂停本机采集，再选择设备。':'请先停止电脑端串口采集，再选择设备。');
  }catch(e){firmware=undefined;$('support').textContent=e.message;}
  buttons();
}
void init();
