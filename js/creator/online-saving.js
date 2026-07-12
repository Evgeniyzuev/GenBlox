import { createClient } from "@supabase/supabase-js";
import { parseGenBloxFile } from "./genblox-format.js";

const PROJECTS_KEY = "genblox:creator-online-projects:v1";
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

function readProjects() { try { return JSON.parse(localStorage.getItem(PROJECTS_KEY) || "{}"); } catch { return {}; } }
function saveProject(templateId, gameId) { const projects=readProjects();projects[templateId]=gameId;localStorage.setItem(PROJECTS_KEY,JSON.stringify(projects)); }

export function initOnlineSaving({ getSource, setCreatorStatus }) {
  const panel=document.querySelector('#creator-online');
  const authForm=document.querySelector('#creator-auth-form');
  const email=document.querySelector('#creator-parent-email');
  const account=document.querySelector('#creator-account');
  const accountLabel=document.querySelector('#creator-account-label');
  const saveButton=document.querySelector('#creator-save-online');
  const signOut=document.querySelector('#creator-sign-out');
  const onlineStatus=document.querySelector('#creator-online-status');
  if(!panel)return;
  if(!url||!anonKey){panel.dataset.state='unconfigured';onlineStatus.textContent='Online saving is not configured yet.';authForm.hidden=true;saveButton.hidden=true;return;}

  const supabase=createClient(url,anonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  const renderSession=(session)=>{const signedIn=Boolean(session?.user);authForm.hidden=signedIn;account.hidden=!signedIn;saveButton.hidden=!signedIn;accountLabel.textContent=signedIn?'Parent email connected':'';onlineStatus.textContent=signedIn?'Your online copies are private.':'';};
  supabase.auth.getSession().then(({data})=>renderSession(data.session));
  supabase.auth.onAuthStateChange((_event,session)=>renderSession(session));

  authForm.onsubmit=async event=>{event.preventDefault();const address=email.value.trim();if(!address)return;onlineStatus.textContent='Sending a safe sign-in link…';const redirectTo=`${location.origin}${location.pathname}`;const {error}=await supabase.auth.signInWithOtp({email:address,options:{emailRedirectTo:redirectTo,shouldCreateUser:true}});onlineStatus.textContent=error?error.message:'Check the parent email and open the GenBlox sign-in link.';};
  signOut.onclick=async()=>{await supabase.auth.signOut();onlineStatus.textContent='Signed out. Local versions stay on this device.';};
  saveButton.onclick=async()=>{saveButton.disabled=true;onlineStatus.textContent='Saving a private online version…';try{const source=getSource();const game=parseGenBloxFile(source);const projects=readProjects();const {data,error}=await supabase.rpc('save_creator_version',{p_game_id:projects[game.manifest.templateId]??null,p_manifest:game.manifest,p_source_text:source});if(error)throw error;const saved=Array.isArray(data)?data[0]:data;saveProject(game.manifest.templateId,saved.game_id);onlineStatus.textContent=`Private online version ${saved.version_number} saved.`;setCreatorStatus(`Private online version ${saved.version_number} saved. Only your account can open it.`);}catch(error){onlineStatus.textContent=error.message;setCreatorStatus('Online save did not work. Open Details for help.','error',error.message);}finally{saveButton.disabled=false;}};
}
