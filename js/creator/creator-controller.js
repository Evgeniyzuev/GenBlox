import { GenBloxFormatError, parseGenBloxFile, serializeGenBloxFile } from "./genblox-format.js";
import { AI_PROMPT, CREATOR_TEMPLATES, TIC_TAC_TOE_FILE } from "./templates.js";
import { buildPreviewDocument } from "./preview.js";
import { initOnlineSaving } from "./online-saving.js";
import { validateCreatorStateWrite } from "./multiplayer.js";
import { HtmlImportError, convertStandaloneHtml } from "./html-import.js";

const DRAFT_KEY = "genblox:creator-drafts:v1";
const TOUR_KEY = "genblox:creator-tour:v1";
const steps = ["Choose a game template", "Download the text file", "Open your AI chat", "Attach the file and describe your idea", "Ask AI to return the complete GenBlox file", "Upload it here", "Test, fix, and share with friends"];

function download(name, text) { const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([text],{type:'text/plain'}));link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000); }
function readDrafts() { try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || "[]"); } catch { return []; } }
function writeDrafts(drafts) { localStorage.setItem(DRAFT_KEY, JSON.stringify(drafts)); }

export function initCreator({
  profile = () => ({ name: "Player", avatar: "🙂" }),
  multiplayer = null,
} = {}) {
  const dialog=document.querySelector('#creator-dialog'); if(!dialog) return;
  const text=document.querySelector('#creator-source'), file=document.querySelector('#creator-file'), htmlFile=document.querySelector('#creator-html-file'), frame=document.querySelector('#creator-preview');
  const templateSelect=document.querySelector('#creator-template');
  const status=document.querySelector('#creator-status'), details=document.querySelector('#creator-details'), versions=document.querySelector('#creator-versions');
  const previewMode=document.querySelector('#creator-preview-mode');
  const launchRoom=document.querySelector('#creator-launch-room');
  const tour=document.querySelector('#creator-tour'), tourText=document.querySelector('#creator-tour-text'), tourCount=document.querySelector('#creator-tour-count');
  let current=null, currentFilename='tic-tac-toe-remix.genblox.txt', tourIndex=0;
  const localSharedStates=new Map();
  const activeTemplateId=()=>current?.manifest?.templateId??'custom';
  const localSnapshot=()=>{const player=profile();const playerId='local';return{connected:false,isHost:true,playerId,players:[{id:playerId,name:player.name||'Player',avatar:player.avatar||'🙂',isLocal:true}],state:localSharedStates.get(activeTemplateId())??{}};};
  const multiplayerSnapshot=()=>multiplayer?.getSnapshot?.(activeTemplateId())??localSnapshot();
  const syncPreview=()=>{if(!dialog.open||!frame.contentWindow)return;const snapshot=multiplayerSnapshot();previewMode.textContent=snapshot.connected?`Room ${snapshot.roomCode||''} · ${snapshot.players.length} player${snapshot.players.length===1?'':'s'}`:'Local preview';launchRoom.hidden=!snapshot.connected;frame.contentWindow.postMessage({source:'genblox-host',type:'sync',payload:snapshot},'*');};
  const sendMultiplayerError=(message)=>frame.contentWindow?.postMessage({source:'genblox-host',type:'multiplayer-error',payload:{message}},'*');
  const writeSharedState=(key,value)=>{try{const snapshot=multiplayerSnapshot();const write=validateCreatorStateWrite(key,value,snapshot.state);if(snapshot.connected&&multiplayer?.setState)multiplayer.setState(activeTemplateId(),write.key,write.value);else localSharedStates.set(activeTemplateId(),write.state);syncPreview();}catch(error){sendMultiplayerError(error.message);setStatus('Multiplayer state was not saved.','error',error.message);}};
  const syncTemplateIdentity=(game)=>{const entry=Object.entries(CREATOR_TEMPLATES).find(([,item])=>parseGenBloxFile(item.file).manifest.templateId===game.manifest.templateId);if(entry){templateSelect.value=entry[0];currentFilename=entry[1].filename;}};
  const setStatus=(message,kind='ok',detail='')=>{status.textContent=message;status.dataset.kind=kind;details.hidden=!detail;details.replaceChildren();if(detail){const summary=document.createElement('summary');summary.textContent='Details';const copy=document.createElement('p');copy.textContent=detail;details.append(summary,copy);}};
  const renderVersions=()=>{const drafts=readDrafts();versions.replaceChildren(...drafts.map((draft,index)=>{const row=document.createElement('div');row.className='creator-version-row';const openButton=document.createElement('button');openButton.type='button';openButton.className='creator-version';openButton.textContent=`Version ${drafts.length-index} · ${new Date(draft.savedAt).toLocaleString()}`;openButton.onclick=()=>{text.value=draft.source;run(draft.source,false)};const removeButton=document.createElement('button');removeButton.type='button';removeButton.className='creator-version-delete';removeButton.setAttribute('aria-label',`Delete version ${drafts.length-index}`);removeButton.textContent='×';removeButton.onclick=()=>{if(!confirm('Delete this saved version?'))return;const next=readDrafts();next.splice(index,1);writeDrafts(next);renderVersions();setStatus('Saved version deleted.');};row.append(openButton,removeButton);return row;}));document.querySelector('#creator-delete-all').hidden=drafts.length===0;};
  const saveVersion=(source)=>{const drafts=readDrafts();if(drafts[0]?.source===source)return;drafts.unshift({source,savedAt:Date.now()});localStorage.setItem(DRAFT_KEY,JSON.stringify(drafts.slice(0,10)));renderVersions();};
  const run=(source=text.value,save=true)=>{try{current=parseGenBloxFile(source);syncTemplateIdentity(current);text.value=serializeGenBloxFile(current);frame.srcdoc=buildPreviewDocument(current,multiplayerSnapshot());setStatus('Your game is ready! Try it in the preview.');if(save)saveVersion(text.value);return current;}catch(error){current=null;frame.removeAttribute('srcdoc');const e=error instanceof GenBloxFormatError?error:new GenBloxFormatError(error.message);setStatus(e.message,'error',`${e.line?`Line ${e.line}. `:''}${e.hint}`);return null;}};
  const open=(template=null,filename='tic-tac-toe-remix.genblox.txt',templateId='tic-tac-toe')=>{const source=template??readDrafts()[0]?.source??TIC_TAC_TOE_FILE;currentFilename=filename;templateSelect.value=templateId;text.value=source;dialog.showModal();run(source,false);if(!localStorage.getItem(TOUR_KEY))showTour(0);};
  const showTour=(index)=>{tourIndex=Math.max(0,Math.min(steps.length-1,index));tour.hidden=false;tourText.textContent=steps[tourIndex];tourCount.textContent=`${tourIndex+1} / ${steps.length}`;};
  document.querySelector('#open-creator').onclick=()=>open();
  document.querySelectorAll('.space-card .card-actions').forEach(actions=>{const gameId=actions.querySelector('[data-game]')?.dataset.game;const templateId=gameId==='wave-runners'?'runner':(CREATOR_TEMPLATES[gameId]?gameId:'clicker');const template=CREATOR_TEMPLATES[templateId];const b=document.createElement('button');b.className='remix-button';b.type='button';b.textContent='Make your own version';b.onclick=()=>open(template.file,template.filename,templateId);actions.append(b);});
  document.querySelector('#close-creator').onclick=()=>dialog.close(); dialog.addEventListener('cancel',e=>{e.preventDefault();dialog.close()});
  document.querySelector('#creator-download').onclick=()=>download(currentFilename,text.value||TIC_TAC_TOE_FILE);
  document.querySelector('#creator-copy').onclick=async()=>{try{await navigator.clipboard.writeText(text.value);setStatus('Game code copied. Attach or paste it into your AI chat.');}catch{text.select();setStatus('The code is selected. Copy it now.');}};
  document.querySelector('#creator-copy-prompt').onclick=async()=>{await navigator.clipboard.writeText(AI_PROMPT);setStatus('AI prompt copied.');};
  templateSelect.onchange=()=>{const template=CREATOR_TEMPLATES[templateSelect.value];if(!template)return;if(!confirm(`Open the ${template.label} template? Your saved versions will stay safe.`)){const active=Object.entries(CREATOR_TEMPLATES).find(([,item])=>item.filename===currentFilename)?.[0]??'tic-tac-toe';templateSelect.value=active;return;}currentFilename=template.filename;text.value=template.file;run(template.file,false);setStatus(`${template.label} template opened. Download it or start changing it.`);};
  document.querySelector('#creator-delete-all').onclick=()=>{if(!confirm('Delete all saved versions on this device? This cannot be undone.'))return;writeDrafts([]);renderVersions();setStatus('All saved versions were deleted.');};
  document.querySelector('#creator-run').onclick=()=>run(); document.querySelector('#creator-restart').onclick=()=>current&&run(serializeGenBloxFile(current),false);
  launchRoom.onclick=async()=>{if(launchRoom.disabled)return;const originalLabel=launchRoom.textContent;try{const game=run(text.value);if(!game)return;const snapshot=multiplayerSnapshot();if(!snapshot.connected)throw new Error('Join or create a room first.');if(game.manifest.mode!=='multiplayer'&&!confirm('This file says mode: solo. Launch it for the room anyway?'))return;if(typeof multiplayer?.launch!=='function')throw new Error('Room launching is not available.');launchRoom.disabled=true;launchRoom.textContent='Sending…';setStatus('Sending and checking the game for every room player…');await multiplayer.launch({source:text.value,game});setStatus('Room game uploaded. Opening it for everyone…');dialog.close();}catch(error){setStatus('The room game could not start.','error',error.message||String(error));}finally{launchRoom.disabled=false;launchRoom.textContent=originalLabel;}};
  document.querySelector('#creator-help').onclick=()=>showTour(0); document.querySelector('#creator-tour-prev').onclick=()=>showTour(tourIndex-1); document.querySelector('#creator-tour-next').onclick=()=>tourIndex===steps.length-1?closeTour():showTour(tourIndex+1);
  const closeTour=()=>{tour.hidden=true;localStorage.setItem(TOUR_KEY,'done')}; document.querySelector('#creator-tour-skip').onclick=closeTour;
  file.onchange=async()=>{const picked=file.files?.[0];if(!picked)return;if(picked.size>240000){setStatus('This game file is too big.','error','Ask AI to make it smaller than 240 KB.');return;}text.value=await picked.text();run();file.value='';};
  htmlFile.onchange=async()=>{const picked=htmlFile.files?.[0];if(!picked)return;try{if(picked.size>240000)throw new HtmlImportError('The HTML file is too big.','Keep the complete standalone HTML file smaller than 240 KB.');const imported=convertStandaloneHtml(await picked.text(),{filename:picked.name});currentFilename=picked.name.replace(/\.html?$/i,'')+'.genblox.txt';text.value=imported.source;if(run(imported.source))setStatus('HTML imported! It is now a safe GenBlox game. Test it, then download the converted TXT.');}catch(error){const detail=error instanceof HtmlImportError?error.hint:error.message;setStatus(error.message||'The HTML file could not be imported.','error',detail);}finally{htmlFile.value='';}};
  window.addEventListener('message',event=>{if(event.source!==frame.contentWindow||event.data?.source!=='genblox-game')return;const {type,payload}=event.data;if(type==='ready'){syncPreview();setStatus('Your game is running. Have fun testing it!');}if(type==='set-state')writeSharedState(payload?.key,payload?.value);if(type==='finish')setStatus(`Game finished${Number.isFinite(payload?.score)?` — score: ${payload.score}`:''}. Change it or share the text with AI.`);if(type==='restart')run(text.value,false);if(type==='error')setStatus('The game stopped because of a code error.','error',`${payload?.message||'Unknown error'}${payload?.line?` (line ${payload.line})`:''}`);});
  frame.addEventListener('load',()=>{syncPreview();setTimeout(()=>{if(frame.srcdoc&&status.textContent.startsWith('Your game is ready'))setStatus('The preview loaded. If nothing moves, open Details.','ok','The game did not call GenBlox.ready() within the expected time.');},3000)});
  setInterval(syncPreview,150);
  initOnlineSaving({getSource:()=>text.value,loadSource:(source)=>{text.value=source;run(source,false);},setCreatorStatus:setStatus});
  renderVersions();
}
