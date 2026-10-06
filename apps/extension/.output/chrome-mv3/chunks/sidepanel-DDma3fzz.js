import"./app-CCqO0uJ4.js";import{t as e}from"./theme-L12QaRNd.js";var t={synced:{dot:`●`,tone:`ok`,copy:`Synced`},catching:{dot:`◐`,tone:`warn`,copy:`Catching up…`},waiting:{dot:`⏸`,tone:`warn`,copy:`Waiting to buffer`},reconnecting:{dot:`○`,tone:`danger`,copy:`Reconnecting…`},noplayer:{dot:`!`,tone:`muted`,copy:`Open a video to begin`}};function n(e,n){let r=t[e],i=e===`waiting`&&n?`Waiting for ${n} to buffer`:r.copy,a=e===`catching`||e===`reconnecting`?` pulse`:``;return`<span class="chip" data-tone="${r.tone}"><span class="chip-dot${a}" aria-hidden="true">${r.dot}</span> ${i}</span>`}var r={roomId:null,peer:null,status:`noplayer`,mineTitle:null,peerTitle:null,driftMs:null,control:`both`,chat:[]};function i(e){let t=document.getElementById(e);if(!t)throw Error(`missing #${e}`);return t}function a(e){return e.replace(/[&<>"']/g,e=>({"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`,"'":`&#39;`})[e])}function o(){i(`chip`).innerHTML=n(r.status,r.peer??void 0)}function s(){let e=r.peer??`Waiting for your person…`,t=e=>(e.trim().charAt(0)||`?`).toUpperCase();i(`presence`).innerHTML=`
    <span class="pill"><span class="avatar avatar-you" aria-hidden="true">Y</span> You</span>
    <span class="pill"><span class="avatar avatar-them" aria-hidden="true">${a(t(r.peer??`?`))}</span> ${a(e)}</span>`}function c(){let e=r.mineTitle??`Nothing yet`;i(`watching`).textContent=e;let t=i(`title-warn`),n=!!r.peerTitle&&!!r.mineTitle&&r.peerTitle!==r.mineTitle;t.hidden=!n,n&&(i(`peer-title`).textContent=r.peerTitle)}function l(){i(`drift`).textContent=r.driftMs==null?`—`:`${r.driftMs>=0?`+`:``}${(r.driftMs/1e3).toFixed(2)} s`}function u(){let e=i(`chat-list`);e.innerHTML=r.chat.map(e=>e.from===`you`?`<li class="chat-row chat-row-own"><div class="bubble bubble-own">${a(e.text)}<time>${new Date(e.ts).toLocaleTimeString()}</time></div></li>`:`<li class="chat-row"><div class="bubble bubble-peer">${a(e.text)}<time>${new Date(e.ts).toLocaleTimeString()}</time></div></li>`).join(``),e.scrollTop=e.scrollHeight}function d(){i(`room`).textContent=r.roomId?`Room ${r.roomId}`:`Room —`,o(),s(),c(),l(),u()}function f(e,t){r.chat.push({from:e,text:t,ts:Date.now()}),r.chat.length>200&&r.chat.splice(0,r.chat.length-200),u()}function p(){let a=document.getElementById(`app`);if(!a)return;a.innerHTML=`
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
        <span id="chip">${n(`noplayer`)}</span>
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
    </div>`,e(i(`theme`));let u=e=>{r.control=e,i(`ctl-both`).setAttribute(`aria-pressed`,e===`both`?`true`:`false`),i(`ctl-me`).setAttribute(`aria-pressed`,e===`me`?`true`:`false`),i(`toast`).textContent=e===`both`?`Both of you control playback.`:`Only you control playback.`};i(`ctl-both`).addEventListener(`click`,()=>u(`both`)),i(`ctl-me`).addEventListener(`click`,()=>u(`me`)),i(`gothere`).addEventListener(`click`,()=>{i(`toast`).textContent=r.peerTitle?`Catching up with ${r.peer??`them`}…`:``}),i(`composer`).addEventListener(`submit`,e=>{e.preventDefault();let t=i(`msg`),n=t.value.trim();n&&(f(`you`,n),t.value=``)}),i(`leave`).addEventListener(`click`,async()=>{try{await chrome.runtime.sendMessage({cmd:`duet:leave`})}catch{}r.roomId=null,r.peer=null,r.status=`noplayer`,d(),i(`toast`).textContent=`You left the room.`}),chrome.runtime.onMessage.addListener(e=>{let n=e;if(n.cmd===`duet:state`){if(n.status&&n.status in t&&(r.status=n.status,o()),typeof n.peer==`string`){let e=!r.peer&&n.peer;r.peer=n.peer||null,s(),o(),e&&(i(`toast`).textContent=`${n.peer}’s here.`)}(typeof n.mineTitle==`string`||typeof n.peerTitle==`string`)&&(typeof n.mineTitle==`string`&&(r.mineTitle=n.mineTitle||null),typeof n.peerTitle==`string`&&(r.peerTitle=n.peerTitle||null),c()),typeof n.driftMs==`number`&&(r.driftMs=n.driftMs,l()),n.chat&&typeof n.chat.text==`string`&&f(n.chat.from===`you`?`you`:`them`,n.chat.text)}}),chrome.storage.session.get(`duet:room`).then(e=>{let t=e[`duet:room`];t?.roomId&&(r.roomId=t.roomId,r.status=`waiting`,d())}),d(),window.addEventListener(`beforeunload`,()=>{a.innerHTML=``})}p();