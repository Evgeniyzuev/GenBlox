import { serializeGenBloxFile } from "./genblox-format.js";

export const AI_PROMPT = `This is a GenBlox game file.
Change the game as I describe, but keep all section markers.
Return the complete file as plain text without Markdown fences.
For multiplayer, set manifest mode to "multiplayer" and maxPlayers to 2-4.
Use only GenBlox.getPlayer(), getPlayers(), isHost(), isMultiplayer(), getState(key), setState(key,value), onStateChange(callback), and onPlayersChange(callback).
The host should initialize small JSON-safe shared state, and every player should render new state received by onStateChange.
Do not use localStorage, external URLs, imports, fetch, or WebSocket.

My idea: make the player collect stars and add three difficulty levels.`;

export const CLICKER_GAME = Object.freeze({
  manifest: { formatVersion: 1, templateId: "clicker-1", title: "Star Clicker", description: "Catch stars before time runs out.", mode: "solo", maxPlayers: 1, orientation: "any", sdkVersion: 1 },
  html: `<main class="game"><h1>⭐ Star Clicker</h1><p>Catch as many stars as you can!</p><button id="star" aria-label="Catch the star">⭐</button><div class="hud"><strong id="score">Score: 0</strong><span id="time">Time: 20</span></div><button id="start">Start game</button></main>`,
  css: `*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:linear-gradient(145deg,#201d42,#121122);color:#fff;font-family:system-ui,sans-serif}.game{text-align:center;width:min(92vw,620px)}h1{color:#b7f34a}#star{position:relative;width:92px;height:92px;border:0;border-radius:24px;background:#9478ff;font-size:48px;cursor:pointer;transition:transform .12s}.hud{display:flex;justify-content:center;gap:32px;margin:28px;font-size:20px}#start{padding:12px 22px;border:0;background:#b7f34a;color:#171525;font-weight:800;cursor:pointer}`,
  javascript: `const star=document.querySelector('#star');const scoreEl=document.querySelector('#score');const timeEl=document.querySelector('#time');const start=document.querySelector('#start');let score=0,timer=null,time=20;function move(){star.style.transform='translate('+(-220+Math.random()*440)+'px,'+(-80+Math.random()*160)+'px) rotate('+Math.random()*30+'deg)'}function reset(){clearInterval(timer);score=0;time=20;scoreEl.textContent='Score: 0';timeEl.textContent='Time: 20';start.hidden=false;move()}star.addEventListener('click',()=>{if(!timer)return;score++;scoreEl.textContent='Score: '+score;move()});start.addEventListener('click',()=>{reset();start.hidden=true;timer=setInterval(()=>{time--;timeEl.textContent='Time: '+time;if(time<=0){clearInterval(timer);timer=null;start.hidden=false;GenBlox.finish({score})}},1000)});GenBlox.ready();`,
});

export const CLICKER_FILE = serializeGenBloxFile(CLICKER_GAME);

export const TIC_TAC_TOE_GAME = Object.freeze({
  manifest: { formatVersion: 1, templateId: "tic-tac-toe-remix-1", title: "Tic-Tac-Toe Remix", description: "Play against a robot locally or another player in a room.", mode: "multiplayer", maxPlayers: 2, orientation: "any", sdkVersion: 1 },
  html: `<main class="game"><p class="kicker">YOUR FIRST REMIX</p><h1>Tic-Tac-Toe</h1><p id="status" aria-live="polite">Your turn — you are X</p><div id="board" class="board" role="grid" aria-label="Tic-Tac-Toe board"></div><div class="score"><span><span id="x-player">You (X)</span> <strong id="x-score">0</strong></span><span><span id="o-player">Robot (O)</span> <strong id="o-score">0</strong></span></div><button id="again">New round</button><small>Local preview uses a robot. Launch for Room to play on one shared board.</small></main>`,
  css: `*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:radial-gradient(circle at top,#302b61,#12111f 62%);color:#f8f7ff;font-family:system-ui,sans-serif}.game{width:min(92vw,520px);text-align:center}.kicker{margin:0;color:#b7f34a;font-size:12px;font-weight:900;letter-spacing:2px}h1{margin:8px 0;font-size:clamp(36px,10vw,62px)}#status{min-height:24px;color:#c6c0db}.board{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;width:min(82vw,360px);aspect-ratio:1;margin:22px auto}.cell{border:1px solid #ffffff22;background:#211f36;color:#ff668c;font-size:clamp(38px,12vw,72px);font-weight:900;cursor:pointer}.cell[data-mark="O"]{color:#63dcff}.cell:disabled{cursor:default}.score{display:flex;justify-content:center;gap:35px;margin:18px;font-size:18px}.score strong{color:#b7f34a}#again{padding:12px 22px;border:0;background:#b7f34a;color:#171525;font-weight:900;cursor:pointer}small{display:block;margin:18px auto;color:#aaa7bd;line-height:1.5}`,
  javascript: `const boardEl=document.querySelector('#board');
const statusEl=document.querySelector('#status');
const again=document.querySelector('#again');
const xPlayerEl=document.querySelector('#x-player');
const oPlayerEl=document.querySelector('#o-player');
const xScoreEl=document.querySelector('#x-score');
const oScoreEl=document.querySelector('#o-score');
const wins=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
const emptyBoard=()=>Array(9).fill('');
let board=emptyBoard(),over=false,you=0,bot=0,match=null,pending=false;

function resultFor(cells){
  for(const [a,b,c] of wins)if(cells[a]&&cells[a]===cells[b]&&cells[a]===cells[c])return cells[a];
  return cells.every(Boolean)?'draw':null;
}

function drawCells(cells,canPlay){
  boardEl.replaceChildren(...cells.map((mark,index)=>{
    const cell=document.createElement('button');
    cell.className='cell';cell.dataset.mark=mark;cell.textContent=mark;
    cell.disabled=Boolean(mark)||!canPlay(index);
    cell.setAttribute('aria-label',mark?'Cell '+(index+1)+': '+mark:'Empty cell '+(index+1));
    cell.onclick=()=>play(index);
    return cell;
  }));
}

function playerName(id,fallback){
  const player=GenBlox.getPlayers().find(item=>item.id===id);
  return player?((player.avatar||'')+' '+(player.name||fallback)).trim():fallback;
}

function validMatch(value){
  return value&&Array.isArray(value.board)&&value.board.length===9&&value.board.every(mark=>mark===''||mark==='X'||mark==='O')&&
    (value.turn==='X'||value.turn==='O')&&value.seats&&value.scores;
}

function freshMatch(previous=null,seats=null){
  const ids=GenBlox.getPlayers().slice(0,2).map(player=>player.id);
  return {
    board:emptyBoard(),turn:'X',result:null,
    seats:seats||{X:ids[0]||null,O:ids[1]||null},
    scores:{X:Number(previous?.scores?.X)||0,O:Number(previous?.scores?.O)||0},
    round:(Number(previous?.round)||0)+1,
    revision:(Number(previous?.revision)||0)+1
  };
}

function reconcileRoom(){
  if(!GenBlox.isMultiplayer()||!GenBlox.isHost())return;
  const current=GenBlox.getState('match',null);
  if(!validMatch(current)){GenBlox.setState('match',freshMatch());return;}
  const ids=GenBlox.getPlayers().slice(0,2).map(player=>player.id);
  const connected=new Set(ids);
  let x=connected.has(current.seats.X)?current.seats.X:null;
  let o=connected.has(current.seats.O)&&current.seats.O!==x?current.seats.O:null;
  for(const id of ids){if(!x)x=id;else if(!o&&id!==x)o=id;}
  if(x!==current.seats.X||o!==current.seats.O)GenBlox.setState('match',freshMatch(current,{X:x,O:o}));
}

function myMark(current){
  const id=GenBlox.getPlayer().id;
  return current?.seats?.X===id?'X':current?.seats?.O===id?'O':null;
}

function renderRoom(){
  const current=validMatch(match)?match:null;
  const mine=current?myMark(current):null;
  xPlayerEl.textContent=playerName(current?.seats?.X,'Waiting for X')+' (X)';
  oPlayerEl.textContent=playerName(current?.seats?.O,'Waiting for O')+' (O)';
  xScoreEl.textContent=String(Number(current?.scores?.X)||0);
  oScoreEl.textContent=String(Number(current?.scores?.O)||0);
  again.hidden=!current?.result;
  again.disabled=!GenBlox.isHost();
  if(!current){statusEl.textContent='Synchronizing the shared board…';drawCells(emptyBoard(),()=>false);return;}
  if(!current.seats.O)statusEl.textContent='Waiting for the second room player…';
  else if(current.result==='draw')statusEl.textContent='It is a draw — nice game!';
  else if(current.result)statusEl.textContent=playerName(current.seats[current.result],current.result)+' wins! 🎉';
  else if(!mine)statusEl.textContent='You are watching this round.';
  else if(current.turn===mine)statusEl.textContent='Your turn — you are '+mine;
  else statusEl.textContent=playerName(current.seats[current.turn],current.turn)+"'s turn";
  drawCells(current.board,index=>!pending&&!current.result&&Boolean(current.seats.O)&&current.turn===mine&&!current.board[index]);
}

function playRoom(index){
  const latest=GenBlox.getState('match',null);
  const current=validMatch(latest)?latest:match;
  const mine=validMatch(current)?myMark(current):null;
  if(pending||!mine||!current.seats.O||current.result||current.turn!==mine||current.board[index])return;
  const cells=[...current.board];cells[index]=mine;
  const result=resultFor(cells);
  const scores={X:Number(current.scores.X)||0,O:Number(current.scores.O)||0};
  if(result==='X'||result==='O')scores[result]++;
  pending=true;
  GenBlox.setState('match',{...current,board:cells,turn:result?current.turn:(mine==='X'?'O':'X'),result,scores,revision:(Number(current.revision)||0)+1});
  renderRoom();
  if(result)GenBlox.finish({result,score:scores[mine]});
}

function renderSolo(){
  xPlayerEl.textContent='You (X)';oPlayerEl.textContent='Robot (O)';
  xScoreEl.textContent=String(you);oScoreEl.textContent=String(bot);again.hidden=false;again.disabled=false;
  drawCells(board,index=>!over&&!board[index]);
}

function finishSolo(result){
  over=true;
  if(result==='X'){you++;statusEl.textContent='You win! 🎉';}
  else if(result==='O'){bot++;statusEl.textContent='The robot wins this round.';}
  else statusEl.textContent='It is a draw — nice game!';
  renderSolo();GenBlox.finish({result,score:you});
}

function checkSolo(){const result=resultFor(board);if(result)finishSolo(result);return Boolean(result);}
function botMove(){
  if(over)return;
  const empty=board.map((mark,index)=>mark?null:index).filter(index=>index!==null);
  const complete=mark=>{for(const line of wins){const marks=line.map(index=>board[index]);if(marks.filter(value=>value===mark).length===2&&marks.includes(''))return line[marks.indexOf('')];}return null;};
  const choice=complete('O')??complete('X')??(board[4]===''?4:null)??empty[Math.floor(Math.random()*empty.length)];
  board[choice]='O';if(!checkSolo()){statusEl.textContent='Your turn — you are X';renderSolo();}
}
function playSolo(index){if(over||board[index])return;board[index]='X';renderSolo();if(checkSolo())return;statusEl.textContent='Robot is thinking…';setTimeout(botMove,350);}
function resetSolo(){board=emptyBoard();over=false;statusEl.textContent='Your turn — you are X';renderSolo();}
function play(index){if(GenBlox.isMultiplayer())playRoom(index);else playSolo(index);}

again.onclick=()=>{
  if(!GenBlox.isMultiplayer()){resetSolo();return;}
  if(!GenBlox.isHost()||!validMatch(match))return;
  pending=true;GenBlox.setState('match',freshMatch(match,match.seats));renderRoom();
};
GenBlox.onStateChange(state=>{if(!GenBlox.isMultiplayer())return;match=validMatch(state.match)?state.match:null;pending=false;renderRoom();});
GenBlox.onPlayersChange(()=>{reconcileRoom();if(GenBlox.isMultiplayer())renderRoom();});
if(GenBlox.isMultiplayer()){match=GenBlox.getState('match',null);reconcileRoom();renderRoom();}else resetSolo();
GenBlox.ready();`,
});

export const TIC_TAC_TOE_FILE = serializeGenBloxFile(TIC_TAC_TOE_GAME);

export const RUNNER_GAME = Object.freeze({
  manifest: { formatVersion: 1, templateId: "runner-remix-1", title: "Sky Runner Remix", description: "Jump over blocks and collect stars.", mode: "solo", maxPlayers: 1, orientation: "landscape", sdkVersion: 1 },
  html: `<main class="game"><p class="kicker">RUNNER REMIX</p><h1>Sky Runner</h1><div class="hud"><strong id="score">Score: 0</strong><span id="best">Best: 0</span></div><canvas id="game" width="800" height="360" aria-label="Runner game"></canvas><p id="status" aria-live="polite">Press Jump to start</p><div class="controls"><button id="left" aria-label="Move left">←</button><button id="jump" aria-label="Jump">JUMP</button><button id="right" aria-label="Move right">→</button></div><button id="again">Play again</button><small>Keyboard: A/D or arrows to move, Space to jump.</small></main>`,
  css: `*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;overflow:hidden;background:linear-gradient(#352d72,#141225);color:#f8f7ff;font-family:system-ui,sans-serif;touch-action:none}.game{width:min(96vw,900px);text-align:center}.kicker{margin:0;color:#b7f34a;font-size:11px;font-weight:900;letter-spacing:2px}h1{margin:3px 0;font-size:clamp(28px,7vw,48px)}.hud{display:flex;justify-content:center;gap:30px;margin:6px}canvas{display:block;width:100%;max-height:55vh;aspect-ratio:20/9;border:2px solid #ffffff22;background:#63dcff;image-rendering:pixelated}#status{min-height:20px;margin:7px}.controls{display:flex;justify-content:center;gap:10px}.controls button,#again{min-width:72px;padding:12px;border:0;background:#9478ff;color:#fff;font-weight:900;cursor:pointer}.controls #jump{background:#b7f34a;color:#171525}#again{display:none;margin:8px auto;background:#ff668c}small{display:block;margin-top:7px;color:#aaa7bd}@media (pointer:fine){.controls{opacity:.7}}`,
  javascript: `const canvas=document.querySelector('#game');const ctx=canvas.getContext('2d');const scoreEl=document.querySelector('#score');const bestEl=document.querySelector('#best');const statusEl=document.querySelector('#status');const again=document.querySelector('#again');const keys=new Set();const player={x:110,y:270,w:36,h:48,vy:0};let obstacles=[],stars=[],score=0,best=0,speed=250,running=false,last=0,spawn=0;function overlap(a,b){return a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y}function reset(){player.x=110;player.y=270;player.vy=0;obstacles=[];stars=[];score=0;speed=250;spawn=.8;running=true;last=performance.now();again.style.display='none';statusEl.textContent='Run, jump, and collect stars!';requestAnimationFrame(loop)}function jump(){if(!running){reset();return}if(player.y>=269)player.vy=-570}function input(dt){if(keys.has('ArrowLeft')||keys.has('a'))player.x-=230*dt;if(keys.has('ArrowRight')||keys.has('d'))player.x+=230*dt;player.x=Math.max(15,Math.min(360,player.x))}function addObstacle(){const h=35+Math.random()*45;obstacles.push({x:820,y:318-h,w:32+Math.random()*28,h});if(Math.random()>.35)stars.push({x:850,y:205-Math.random()*80,w:28,h:28,taken:false})}function finish(){running=false;best=Math.max(best,Math.floor(score));bestEl.textContent='Best: '+best;statusEl.textContent='Great run! You scored '+Math.floor(score)+'.';again.style.display='block';GenBlox.finish({score:Math.floor(score)})}function update(dt){input(dt);player.vy+=1450*dt;player.y+=player.vy*dt;if(player.y>270){player.y=270;player.vy=0}spawn-=dt;if(spawn<=0){addObstacle();spawn=Math.max(.65,1.35-score/120)}speed=Math.min(480,speed+dt*3);for(const item of obstacles)item.x-=speed*dt;for(const star of stars)star.x-=speed*dt;for(const item of obstacles)if(overlap(player,item))return finish();for(const star of stars)if(!star.taken&&overlap(player,star)){star.taken=true;score+=10}obstacles=obstacles.filter(item=>item.x>-80);stars=stars.filter(item=>item.x>-50&&!item.taken);score+=dt*4;scoreEl.textContent='Score: '+Math.floor(score)}function draw(){ctx.clearRect(0,0,800,360);const sky=ctx.createLinearGradient(0,0,0,360);sky.addColorStop(0,'#63dcff');sky.addColorStop(1,'#d8f7ff');ctx.fillStyle=sky;ctx.fillRect(0,0,800,360);ctx.fillStyle='#ffffff99';for(let i=0;i<5;i++)ctx.fillRect((i*190-score*8)%950-80,55+i%2*45,95,18);ctx.fillStyle='#29233f';ctx.fillRect(0,318,800,42);ctx.fillStyle='#b7f34a';ctx.fillRect(0,318,800,7);ctx.fillStyle='#ff668c';ctx.fillRect(player.x,player.y,player.w,player.h);ctx.fillStyle='#fff';ctx.fillRect(player.x+22,player.y+10,7,7);ctx.fillStyle='#9478ff';for(const item of obstacles)ctx.fillRect(item.x,item.y,item.w,item.h);ctx.font='27px serif';for(const star of stars)if(!star.taken)ctx.fillText('⭐',star.x,star.y+25)}function loop(now){if(!running){draw();return}const dt=Math.min((now-last)/1000,.035);last=now;update(dt);draw();if(running)requestAnimationFrame(loop)}function bind(id,key){const button=document.querySelector(id);button.onpointerdown=e=>{e.preventDefault();keys.add(key);if(key==='jump')jump()};const up=()=>keys.delete(key);button.onpointerup=up;button.onpointercancel=up}bind('#left','ArrowLeft');bind('#right','ArrowRight');bind('#jump','jump');addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight',' ','a','d'].includes(e.key))e.preventDefault();keys.add(e.key);if(e.key===' ')jump()});addEventListener('keyup',e=>keys.delete(e.key));again.onclick=reset;draw();GenBlox.ready();`,
});

export const RUNNER_FILE = serializeGenBloxFile(RUNNER_GAME);

export const CREATOR_TEMPLATES = Object.freeze({
  "tic-tac-toe": { label: "Tic-Tac-Toe", file: TIC_TAC_TOE_FILE, filename: "tic-tac-toe-remix.genblox.txt" },
  runner: { label: "Sky Runner", file: RUNNER_FILE, filename: "sky-runner-remix.genblox.txt" },
  clicker: { label: "Star Clicker", file: CLICKER_FILE, filename: "star-clicker.genblox.txt" },
});
