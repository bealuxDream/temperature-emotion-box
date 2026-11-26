// Catalog availability is configuration evidence, never proof of a successful model reply.
export async function checkChatModels(llm, timeoutMs = 2500) {
  if (!llm) return { status:'unknown', modelCount:0 };
  let timer;
  try {
    return await Promise.race([
      (async () => {
        const providers=llm.listProviders();
        const catalogs=await Promise.all(providers.map(p=>llm.listModels(p.id)));
        const modelCount=catalogs.reduce((sum,models)=>sum+models.length,0);
        return { status:modelCount ? 'configured' : 'unconfigured', modelCount };
      })(),
      new Promise(resolve=>{timer=setTimeout(()=>resolve({status:'unknown',modelCount:0}),timeoutMs);}),
    ]);
  } catch { return { status:'unknown', modelCount:0 }; }
  finally { clearTimeout(timer); }
}
