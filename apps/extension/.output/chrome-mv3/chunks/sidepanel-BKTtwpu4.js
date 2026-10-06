import"./app-C1C7aP05.js";import{t as e}from"./theme-L12QaRNd.js";var t={synced:{dot:`●`,tone:`ok`,copy:`Synced`},catching:{dot:`◐`,tone:`warn`,copy:`Catching up…`},waiting:{dot:`⏸`,tone:`warn`,copy:`Waiting to buffer`},reconnecting:{dot:`○`,tone:`danger`,copy:`Reconnecting…`},noplayer:{dot:`!`,tone:`muted`,copy:`Open a video to begin`}};function n(e,n){let r=t[e],i=e===`waiting`&&n?`Waiting for ${n} to buffer`:r.copy,a=e===`catching`||e===`reconnecting`?` pulse`:``;return`<span class="chip" data-tone="${r.tone}"><span class="chip-dot${a}" aria-hidden="true">${r.dot}</span> ${i}</span>`}var r={roomId:null,peer:null,status:`noplayer`,mineTitle:null,peerTitle:null,driftMs:null,control:`both`,chat:[],knock:null,waiting:!1};function i(e){let t=document.getElementById(e);if(!t)throw Error(`missing #${e}`);return t}function a(e){return e.replace(/[&<>"']/g,e=>({"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`,"'":`&#39;`})[e])}function o(){i(`chip`).innerHTML=n(r.status,r.peer??void 0)}function s(){let e=r.peer??`Waiting for your person…`,t=e=>(e.trim().charAt(0)||`?`).toUpperCase();i(`presence`).innerHTML=`
    <span class="pill"><span class="avatar avatar-you" aria-hidden="true">Y</span> You</span>
    <span class="pill"><span class="avatar avatar-them" aria-hidden="true">${a(t(r.peer??`?`))}</span> ${a(e)}</span>`}function c(){let e=r.mineTitle??`Nothing yet`;i(`watching`).textContent=e;let t=i(`title-warn`),n=!!r.peerTitle&&!!r.mineTitle&&r.peerTitle!==r.mineTitle;t.hidden=!n,n&&(i(`peer-title`).textContent=r.peerTitle)}function l(){i(`drift`).textContent=r.driftMs==null?`—`:`${r.driftMs>=0?`+`:``}${(r.driftMs/1e3).toFixed(2)} s`}function u(){let e=i(`chat-list`);e.innerHTML=r.chat.map(e=>e.from===`you`?`<li class="chat-row chat-row-own"><div class="bubble bubble-own">${a(e.text)}<time>${new Date(e.ts).toLocaleTimeString()}</time></div></li>`:`<li class="chat-row"><div class="bubble bubble-peer">${a(e.text)}<time>${new Date(e.ts).toLocaleTimeString()}</time></div></li>`).join(``),e.scrollTop=e.scrollHeight}function d(){i(`room`).textContent=r.roomId?`Room ${r.roomId}`:`Room —`,o(),s(),c(),l(),u(),f()}function f(){let e=document.getElementById(`knockbanner`),t=document.getElementById(`knocktext`);if(e&&t){if(!r.knock){e.hidden=!0;return}e.hidden=!1,t.textContent=`${r.knock.name} wants to join.`}}function p(e,t){r.chat.push({from:e,text:t,ts:Date.now()}),r.chat.length>200&&r.chat.splice(0,r.chat.length-200),u()}function m(){let a=document.getElementById(`app`);if(!a)return;a.innerHTML=`
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
      <div class="knock-banner" id="knockbanner" hidden>
        <span id="knocktext"></span>
        <span class="knock-actions">
          <button id="knock-yes" class="btn btn-primary btn-inline" type="button">Let in</button>
          <button id="knock-no" class="btn btn-ghost btn-inline" type="button">Decline</button>
        </span>
      </div>
      <div class="invite-row" id="inviterow" hidden>
        <span class="invite-link" id="invitelink"></span>
        <button id="copyinvite" class="btn btn-ghost btn-inline" type="button">Copy invite</button>
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
    </div>`,e(i(`theme`));let u=e=>{r.control=e,i(`ctl-both`).setAttribute(`aria-pressed`,e===`both`?`true`:`false`),i(`ctl-me`).setAttribute(`aria-pressed`,e===`me`?`true`:`false`),i(`toast`).textContent=e===`both`?`Both of you control playback.`:`Only you control playback.`};i(`ctl-both`).addEventListener(`click`,()=>u(`both`)),i(`ctl-me`).addEventListener(`click`,()=>u(`me`)),i(`gothere`).addEventListener(`click`,()=>{i(`toast`).textContent=r.peerTitle?`Catching up with ${r.peer??`them`}…`:``}),i(`composer`).addEventListener(`submit`,e=>{e.preventDefault();let t=i(`msg`),n=t.value.trim();n&&(p(`you`,n),t.value=``)}),i(`leave`).addEventListener(`click`,async()=>{try{await chrome.runtime.sendMessage({cmd:`duet:leave`})}catch{}r.roomId=null,r.peer=null,r.status=`noplayer`,r.knock=null,d(),i(`toast`).textContent=`You left the room.`});let m=e=>async()=>{let t=r.knock?.clientId;if(t){try{await chrome.runtime.sendMessage({cmd:e?`duet:admit`:`duet:deny`,target:t}),i(`toast`).textContent=e?`${r.knock?.name??`They`}'s in.`:`Declined.`}catch{i(`toast`).textContent=`Couldn't reach the room. Try again.`;return}r.knock=null,f()}};i(`knock-yes`).addEventListener(`click`,m(!0)),i(`knock-no`).addEventListener(`click`,m(!1)),chrome.runtime.onMessage.addListener(e=>{let n=e;if(n.cmd===`duet:state`){if(n.knock&&typeof n.knock.clientId==`string`){r.knock={clientId:n.knock.clientId,name:n.knock.name??`Someone`},f(),i(`toast`).textContent=`${r.knock.name} wants to join.`;return}if(n.waiting){r.waiting=!0,i(`toast`).textContent=`Knocking… the host lets you in.`;return}if(n.state&&typeof n.roomId==`string`){r.roomId=n.roomId,r.status=`synced`,r.waiting=!1,r.peer=r.peer??`Guest`,d(),i(`toast`).textContent=`You're in.`;return}if(n.status&&n.status in t&&(r.status=n.status,o()),typeof n.peer==`string`){let e=!r.peer&&n.peer;r.peer=n.peer||null,s(),o(),e&&(i(`toast`).textContent=`${n.peer}’s here.`)}(typeof n.mineTitle==`string`||typeof n.peerTitle==`string`)&&(typeof n.mineTitle==`string`&&(r.mineTitle=n.mineTitle||null),typeof n.peerTitle==`string`&&(r.peerTitle=n.peerTitle||null),c()),typeof n.driftMs==`number`&&(r.driftMs=n.driftMs,l()),n.chat&&typeof n.chat.text==`string`&&p(n.chat.from===`you`?`you`:`them`,n.chat.text)}}),chrome.storage.session.get(`duet:room`).then(e=>{let t=e[`duet:room`];if(t?.roomId&&(r.roomId=t.roomId,r.status=`waiting`,d(),t.base&&t.secret)){let e=`${t.base.replace(/\/$/,``)}/r/${t.roomId}#${t.secret}`,n=document.getElementById(`inviterow`),r=document.getElementById(`invitelink`);n&&r&&(n.hidden=!1,r.textContent=e.replace(/^https?:\/\//,``),r.setAttribute(`title`,e),document.getElementById(`copyinvite`)?.addEventListener(`click`,async()=>{try{await navigator.clipboard.writeText(e),i(`toast`).textContent=`Invite link copied — send it to them.`}catch{i(`toast`).textContent=e}}))}}),d(),window.addEventListener(`beforeunload`,()=>{a.innerHTML=``})}m();