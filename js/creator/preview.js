function safeScript(text) { return text.replace(/<\/script/gi, "<\\/script"); }
function safeStyle(text) { return text.replace(/<\/style/gi, "<\\/style"); }

export function buildPreviewDocument(game) {
  const sdk = `(()=>{const send=(type,payload={})=>parent.postMessage({source:'genblox-game',type,payload},'*');window.GenBlox=Object.freeze({ready:()=>send('ready'),getPlayer:()=>({name:'Player',avatar:'🙂'}),finish:(result={})=>send('finish',result),restart:()=>send('restart')});window.addEventListener('error',e=>send('error',{message:e.message,line:e.lineno}));window.addEventListener('unhandledrejection',e=>send('error',{message:String(e.reason||'Unknown error')}));})();`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; font-src data:; media-src data:"><style>${safeStyle(game.css)}</style></head><body>${game.html}<script>${safeScript(sdk)}<\/script><script>${safeScript(game.javascript)}<\/script></body></html>`;
}
