import"./app-YG5p5wWR.js";import{i as y}from"./theme-DJsw9SeE.js";const p=200,u={synced:{dot:"●",tone:"ok",copy:"Synced"},catching:{dot:"◐",tone:"warn",copy:"Catching up…"},waiting:{dot:"⏸",tone:"warn",copy:"Waiting to buffer"},reconnecting:{dot:"○",tone:"danger",copy:"Reconnecting…"},noplayer:{dot:"!",tone:"muted",copy:"Open a video to begin"}};function h(n,a){const s=u[n],e=n==="waiting"&&a?`Waiting for ${a} to buffer`:s.copy,o=n==="catching"||n==="reconnecting"?" pulse":"";return`<span class="chip" data-tone="${s.tone}"><span class="chip-dot${o}" aria-hidden="true">${s.dot}</span> ${e}</span>`}const t={roomId:null,peer:null,status:"noplayer",mineTitle:null,peerTitle:null,driftMs:null,control:"both",chat:[]};function i(n){const a=document.getElementById(n);if(!a)throw new Error(`missing #${n}`);return a}function r(n){return n.replace(/[&<>"']/g,a=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[a])}function c(){i("chip").innerHTML=h(t.status,t.peer??void 0)}function m(){const n=t.peer??"Waiting for your person…",a=s=>(s.trim().charAt(0)||"?").toUpperCase();i("presence").innerHTML=`
    <span class="pill"><span class="avatar avatar-you" aria-hidden="true">Y</span> You</span>
    <span class="pill"><span class="avatar avatar-them" aria-hidden="true">${r(a(t.peer??"?"))}</span> ${r(n)}</span>`}function b(){const n=t.mineTitle??"Nothing yet";i("watching").textContent=n;const a=i("title-warn"),s=!!t.peerTitle&&!!t.mineTitle&&t.peerTitle!==t.mineTitle;a.hidden=!s,s&&(i("peer-title").textContent=t.peerTitle)}function f(){i("drift").textContent=t.driftMs==null?"—":`${t.driftMs>=0?"+":""}${(t.driftMs/1e3).toFixed(2)} s`}function g(){const n=i("chat-list");n.innerHTML=t.chat.map(a=>a.from==="you"?`<li class="chat-row chat-row-own"><div class="bubble bubble-own">${r(a.text)}<time>${new Date(a.ts).toLocaleTimeString()}</time></div></li>`:`<li class="chat-row"><div class="bubble bubble-peer">${r(a.text)}<time>${new Date(a.ts).toLocaleTimeString()}</time></div></li>`).join(""),n.scrollTop=n.scrollHeight}function l(){i("room").textContent=t.roomId?`Room ${t.roomId}`:"Room —",c(),m(),b(),f(),g()}function d(n,a){t.chat.push({from:n,text:a,ts:Date.now()}),t.chat.length>p&&t.chat.splice(0,t.chat.length-p),g()}function v(){const n=document.getElementById("app");if(!n)return;n.innerHTML=`
    <div class="wrap side-wrap duet-side">
      <div class="brand-row">
        <div class="brand" aria-label="Duet">
          <span class="mark" aria-hidden="true"></span>
          <span class="wordmark">Duet</span>
        </div>
        <button id="theme" class="icon-btn" type="button" aria-pressed="false" aria-label="Toggle light theme">☾</button>
      </div>
      <div class="room-head">
        <span id="room" class="room-id">Room —</span>
        <span id="chip">${h("noplayer")}</span>
      </div>
      <div id="presence" class="pills" aria-label="Who's here"></div>
      <section class="section" aria-label="Now watching">
        <h2>Watching</h2>
        <p id="watching" class="watch-title">Nothing yet</p>
        <div id="title-warn" class="warn-row" hidden>
          <span aria-hidden="true">⚠</span>
          <span><span id="peer-title"></span> is on something else.</span>
          <button id="gothere" class="btn btn-secondary" type="button">Go there</button>
        </div>
        <details class="kv">
          <summary>Sync drift&nbsp;&nbsp;<span id="drift" class="drift">—</span></summary>
          <div class="seg-group" role="group" aria-label="Who controls playback">
            <button id="ctl-both" class="seg" type="button" aria-pressed="true">Both</button>
            <button id="ctl-me" class="seg" type="button" aria-pressed="false">Just me</button>
          </div>
        </details>
      </section>
      <section class="chat" aria-label="Chat">
        <ol id="chat-list" class="chat-list" aria-label="Messages"></ol>
        <form id="composer" class="composer field">
          <input id="msg" type="text" placeholder="Type a message…" aria-label="Type a message"
            autocomplete="off" maxlength="2000" />
          <button class="btn btn-secondary" type="submit" aria-label="Send message">↩</button>
        </form>
      </section>
      <button id="leave" class="btn btn-ghost" type="button">Leave room</button>
      <p id="toast" class="status" role="status"></p>
    </div>`,y(i("theme"));const a=s=>{t.control=s,i("ctl-both").setAttribute("aria-pressed",s==="both"?"true":"false"),i("ctl-me").setAttribute("aria-pressed",s==="me"?"true":"false"),i("toast").textContent=s==="both"?"Both of you control playback.":"Only you control playback."};i("ctl-both").addEventListener("click",()=>a("both")),i("ctl-me").addEventListener("click",()=>a("me")),i("gothere").addEventListener("click",()=>{i("toast").textContent=t.peerTitle?`Catching up with ${t.peer??"them"}…`:""}),i("composer").addEventListener("submit",s=>{s.preventDefault();const e=i("msg"),o=e.value.trim();o&&(d("you",o),e.value="")}),i("leave").addEventListener("click",async()=>{try{await chrome.runtime.sendMessage({cmd:"duet:leave"})}catch{}t.roomId=null,t.peer=null,t.status="noplayer",l(),i("toast").textContent="You left the room."}),chrome.runtime.onMessage.addListener(s=>{const e=s;if(e.cmd==="duet:state"){if(e.status&&e.status in u&&(t.status=e.status,c()),typeof e.peer=="string"){const o=!t.peer&&e.peer;t.peer=e.peer||null,m(),c(),o&&(i("toast").textContent=`${e.peer}’s here.`)}(typeof e.mineTitle=="string"||typeof e.peerTitle=="string")&&(typeof e.mineTitle=="string"&&(t.mineTitle=e.mineTitle||null),typeof e.peerTitle=="string"&&(t.peerTitle=e.peerTitle||null),b()),typeof e.driftMs=="number"&&(t.driftMs=e.driftMs,f()),e.chat&&typeof e.chat.text=="string"&&d(e.chat.from==="you"?"you":"them",e.chat.text)}}),chrome.storage.session.get("duet:room").then(s=>{const e=s["duet:room"];e!=null&&e.roomId&&(t.roomId=e.roomId,t.status="waiting",l())}),l(),window.addEventListener("beforeunload",()=>{n.innerHTML=""})}v();
