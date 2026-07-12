import { serializeGenBloxFile } from "./genblox-format.js";

export const AI_PROMPT = `This is a GenBlox game file.
Change the game as I describe, but keep all section markers.
Return the complete file as plain text without Markdown fences.

My idea: make the player collect stars and add three difficulty levels.`;

export const CLICKER_GAME = Object.freeze({
  manifest: { formatVersion: 1, templateId: "clicker-1", title: "Star Clicker", description: "Catch stars before time runs out.", mode: "solo", maxPlayers: 1, orientation: "any", sdkVersion: 1 },
  html: `<main class="game"><h1>⭐ Star Clicker</h1><p>Catch as many stars as you can!</p><button id="star" aria-label="Catch the star">⭐</button><div class="hud"><strong id="score">Score: 0</strong><span id="time">Time: 20</span></div><button id="start">Start game</button></main>`,
  css: `*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:linear-gradient(145deg,#201d42,#121122);color:#fff;font-family:system-ui,sans-serif}.game{text-align:center;width:min(92vw,620px)}h1{color:#b7f34a}#star{position:relative;width:92px;height:92px;border:0;border-radius:24px;background:#9478ff;font-size:48px;cursor:pointer;transition:transform .12s}.hud{display:flex;justify-content:center;gap:32px;margin:28px;font-size:20px}#start{padding:12px 22px;border:0;background:#b7f34a;color:#171525;font-weight:800;cursor:pointer}`,
  javascript: `const star=document.querySelector('#star');const scoreEl=document.querySelector('#score');const timeEl=document.querySelector('#time');const start=document.querySelector('#start');let score=0,timer=null,time=20;function move(){star.style.transform='translate('+(-220+Math.random()*440)+'px,'+(-80+Math.random()*160)+'px) rotate('+Math.random()*30+'deg)'}function reset(){clearInterval(timer);score=0;time=20;scoreEl.textContent='Score: 0';timeEl.textContent='Time: 20';start.hidden=false;move()}star.addEventListener('click',()=>{if(!timer)return;score++;scoreEl.textContent='Score: '+score;move()});start.addEventListener('click',()=>{reset();start.hidden=true;timer=setInterval(()=>{time--;timeEl.textContent='Time: '+time;if(time<=0){clearInterval(timer);timer=null;start.hidden=false;GenBlox.finish({score})}},1000)});GenBlox.ready();`,
});

export const CLICKER_FILE = serializeGenBloxFile(CLICKER_GAME);
