import test from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { parseGenBloxFile, serializeGenBloxFile } from "../js/creator/genblox-format.js";
import { CLICKER_FILE, CLICKER_GAME, RUNNER_FILE, RUNNER_GAME, TIC_TAC_TOE_FILE, TIC_TAC_TOE_GAME } from "../js/creator/templates.js";

test("Clicker template round-trips",()=>assert.deepEqual(parseGenBloxFile(serializeGenBloxFile(CLICKER_GAME)),CLICKER_GAME));
test("exported Clicker parses",()=>assert.equal(parseGenBloxFile(CLICKER_FILE).manifest.templateId,"clicker-1"));
test("explains a missing section",()=>assert.throws(()=>parseGenBloxFile(CLICKER_FILE.replace("=== JAVASCRIPT ===","")),/JAVASCRIPT section is missing/));
test("rejects Markdown fences",()=>assert.throws(()=>parseGenBloxFile(`\`\`\`\n${CLICKER_FILE}\n\`\`\``),/Markdown code fences/));
test("rejects broken JSON",()=>assert.throws(()=>parseGenBloxFile(CLICKER_FILE.replace('"formatVersion": 1','"formatVersion":')),/MANIFEST JSON is broken/));
test("rejects scripts hidden in HTML",()=>assert.throws(()=>parseGenBloxFile(CLICKER_FILE.replace('<main class="game">','<script>alert(1)</script><main class="game">')),/HTML section contains a script tag/));
test("Tic-Tac-Toe remix round-trips",()=>assert.deepEqual(parseGenBloxFile(TIC_TAC_TOE_FILE),TIC_TAC_TOE_GAME));
test("Tic-Tac-Toe remix is a two-player room game",()=>{
  assert.equal(TIC_TAC_TOE_GAME.manifest.mode,"multiplayer");
  assert.equal(TIC_TAC_TOE_GAME.manifest.maxPlayers,2);
  assert.match(TIC_TAC_TOE_GAME.javascript,/GenBlox\.setState\('match'/);
  assert.match(TIC_TAC_TOE_GAME.javascript,/GenBlox\.onStateChange/);
});

test("Tic-Tac-Toe room players share one board",()=>{
  const players=[
    {id:"host",name:"Host",avatar:"X"},
    {id:"guest",name:"Guest",avatar:"O"},
  ];
  const shared={};
  const stateListeners=[];

  function createGame(player,isHost){
    const elements=new Map();
    for(const selector of ["#board","#status","#again","#x-player","#o-player","#x-score","#o-score"]){
      elements.set(selector,{children:[],dataset:{},hidden:false,disabled:false,textContent:"",replaceChildren(...children){this.children=children;}});
    }
    const document={
      querySelector:selector=>elements.get(selector),
      createElement:()=>({dataset:{},disabled:false,textContent:"",onclick:null,setAttribute(){}}),
    };
    const GenBlox={
      getPlayer:()=>player,
      getPlayers:()=>players,
      isHost:()=>isHost,
      isMultiplayer:()=>true,
      getState:(key,fallback=null)=>Object.hasOwn(shared,key)?structuredClone(shared[key]):fallback,
      setState:(key,value)=>{
        shared[key]=structuredClone(value);
        const state=structuredClone(shared);
        stateListeners.forEach(listener=>listener(state));
      },
      onStateChange:listener=>stateListeners.push(listener),
      onPlayersChange:()=>{},
      finish:()=>{},
      ready:()=>{},
    };
    runInNewContext(TIC_TAC_TOE_GAME.javascript,{document,GenBlox,setTimeout});
    return elements;
  }

  const host=createGame(players[0],true);
  const guest=createGame(players[1],false);
  host.get("#board").children[0].onclick();
  assert.equal(shared.match.board[0],"X");
  assert.equal(guest.get("#board").children[0].textContent,"X");
  guest.get("#board").children[1].onclick();
  assert.equal(shared.match.board[1],"O");
  assert.equal(host.get("#board").children[1].textContent,"O");
});
test("Runner remix round-trips",()=>assert.deepEqual(parseGenBloxFile(RUNNER_FILE),RUNNER_GAME));
