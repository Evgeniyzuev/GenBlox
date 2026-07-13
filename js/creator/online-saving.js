import { parseGenBloxFile } from "./genblox-format.js";

const PROJECTS_KEY = "genblox:creator-online-projects:v1";
// `import.meta.env` exists after a Vite build. Keep the rest of GenBlox usable
// when the source files are served directly by a simple static server.
const url = import.meta.env?.VITE_SUPABASE_URL ?? "";
const anonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY ?? "";

function readProjects() { try { return JSON.parse(localStorage.getItem(PROJECTS_KEY) || "{}"); } catch { return {}; } }
function saveProject(templateId, gameId) { const projects=readProjects();projects[templateId]=gameId;localStorage.setItem(PROJECTS_KEY,JSON.stringify(projects)); }
function forgetProject(gameId) { const projects=readProjects();for(const [templateId,id] of Object.entries(projects))if(id===gameId)delete projects[templateId];localStorage.setItem(PROJECTS_KEY,JSON.stringify(projects)); }

export async function initOnlineSaving({ getSource, loadSource, setCreatorStatus }) {
  const panel=document.querySelector('#creator-online');
  const authForm=document.querySelector('#creator-auth-form');
  const email=document.querySelector('#creator-email');
  const account=document.querySelector('#creator-account');
  const accountLabel=document.querySelector('#creator-account-label');
  const saveButton=document.querySelector('#creator-save-online');
  const signOut=document.querySelector('#creator-sign-out');
  const onlineStatus=document.querySelector('#creator-online-status');
  const cloud=document.querySelector('#creator-cloud-games');
  const cloudList=document.querySelector('#creator-cloud-list');
  const cloudEmpty=document.querySelector('#creator-cloud-empty');
  const refreshButton=document.querySelector('#creator-refresh-online');
  if(!panel)return;
  if(!url||!anonKey){panel.dataset.state='unconfigured';onlineStatus.textContent='Online saving is not configured yet.';authForm.hidden=true;saveButton.hidden=true;return;}

  let createClient;
  try {
    ({ createClient } = await import("@supabase/supabase-js"));
  } catch {
    panel.dataset.state='unconfigured';onlineStatus.textContent='Online saving could not load. Local games still work.';authForm.hidden=true;saveButton.hidden=true;return;
  }
  const supabase=createClient(url,anonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  const renderCloud=(games)=>{cloudList.replaceChildren(...games.map(game=>{const card=document.createElement('article');card.className='creator-cloud-card';const header=document.createElement('header');const title=document.createElement('h5');title.textContent=game.title;const remove=document.createElement('button');remove.type='button';remove.textContent='Delete game';remove.onclick=async()=>{if(!confirm(`Delete "${game.title}" and all its online versions?`))return;remove.disabled=true;const {data,error}=await supabase.rpc('delete_creator_game',{p_game_id:game.id});if(error||!data){onlineStatus.textContent=error?.message||'Game could not be deleted.';remove.disabled=false;return;}forgetProject(game.id);onlineStatus.textContent='Online game deleted. Local versions stay on this device.';await loadGames();};header.append(title,remove);const versions=document.createElement('div');versions.className='creator-cloud-versions';const ordered=[...(game.creator_game_versions??[])].sort((a,b)=>b.version_number-a.version_number);for(const version of ordered){const open=document.createElement('button');open.type='button';open.className='creator-cloud-version';const label=document.createElement('strong');label.textContent=`Version ${version.version_number}`;const date=document.createElement('small');date.textContent=new Date(version.created_at).toLocaleString();open.append(label,date);open.onclick=()=>{loadSource(version.source_text);setCreatorStatus(`Online version ${version.version_number} opened. Test it before making changes.`);};versions.append(open);}card.append(header,versions);return card;}));cloudEmpty.hidden=games.length>0;};
  const loadGames=async()=>{refreshButton.disabled=true;onlineStatus.textContent='Loading My Games…';const {data,error}=await supabase.from('creator_games').select('id,title,description,template_id,updated_at,creator_game_versions(id,version_number,status,created_at,source_text)').order('updated_at',{ascending:false});refreshButton.disabled=false;if(error){onlineStatus.textContent=error.message;return;}renderCloud(data??[]);onlineStatus.textContent=data?.length?'Choose a version to open it in Creator.':'No online games yet. Save one from the editor.';};
  const renderSession=(session)=>{const signedIn=Boolean(session?.user);authForm.hidden=signedIn;account.hidden=!signedIn;saveButton.hidden=!signedIn;cloud.hidden=!signedIn;accountLabel.textContent=signedIn?'Email connected':'';onlineStatus.textContent=signedIn?'Your online copies are private and not published.':'';if(signedIn)loadGames();else{cloudList.replaceChildren();cloud.hidden=true;}};
  supabase.auth.getSession().then(({data})=>renderSession(data.session));
  supabase.auth.onAuthStateChange((_event,session)=>renderSession(session));

  authForm.onsubmit=async event=>{event.preventDefault();const address=email.value.trim();if(!address)return;onlineStatus.textContent='Sending a secure sign-in link…';const redirectTo=`${location.origin}${location.pathname}`;const {error}=await supabase.auth.signInWithOtp({email:address,options:{emailRedirectTo:redirectTo,shouldCreateUser:true}});onlineStatus.textContent=error?error.message:'Check your email and open the GenBlox sign-in link.';};
  signOut.onclick=async()=>{await supabase.auth.signOut();onlineStatus.textContent='Signed out. Local versions stay on this device.';};
  refreshButton.onclick=loadGames;
  saveButton.onclick=async()=>{saveButton.disabled=true;onlineStatus.textContent='Saving a private online version…';try{const source=getSource();const game=parseGenBloxFile(source);const projects=readProjects();const {data,error}=await supabase.rpc('save_creator_version',{p_game_id:projects[game.manifest.templateId]??null,p_manifest:game.manifest,p_source_text:source});if(error)throw error;const saved=Array.isArray(data)?data[0]:data;saveProject(game.manifest.templateId,saved.game_id);onlineStatus.textContent=`Private online version ${saved.version_number} saved. It is not published yet.`;setCreatorStatus(`Private online version ${saved.version_number} saved. Only your account can open it.`);await loadGames();}catch(error){onlineStatus.textContent=error.message;setCreatorStatus('Online save did not work. Open Details for help.','error',error.message);}finally{saveButton.disabled=false;}};
}
