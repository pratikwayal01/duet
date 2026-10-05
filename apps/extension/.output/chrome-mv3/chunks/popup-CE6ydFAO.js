import{i as k}from"./theme-CEjCZQpf.js";const u="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567",c="duet:base";function b(n){const t=new Uint8Array(n);crypto.getRandomValues(t);let e="",a=0,o=0;for(const s of t)for(o=o<<8|s,a+=8;a>=5;)e+=u[o>>>a-5&31],a-=5;return a>0&&(e+=u[o<<5-a&31]),e}function y(){const n="ABCDEFGHJKMNPQRSTUVWXYZ23456789",t=new Uint8Array(8);crypto.getRandomValues(t);const e=Array.from(t,a=>n[a%n.length]).join("");return`${e.slice(0,4)}·${e.slice(4)}`}function g(){return b(10)}function v(){return b(16)}function d(n,t,e){return`${n.replace(/\/$/,"")}/r/${t}#${e}`}function p(n,t){const e=new URL(n);return e.protocol=e.protocol==="https:"?"wss:":"ws:",e.pathname="/api/room",e.hash="",e.search=`?id=${encodeURIComponent(t)}`,e.toString()}function w(n){const t=n.trim();if(/^https?:\/\//i.test(t))try{const a=new URL(t),o=a.pathname.match(/^\/r\/([\w-]+)/),s=a.hash.startsWith("#")?a.hash.slice(1):"";return{roomId:o?o[1]:null,secret:s||null,base:o?a.origin:null}}catch{return{roomId:null,secret:null,base:null}}const e=t.replace(/[·\s-]/g,"").toUpperCase();return{roomId:/^[A-Z2-9]{4,64}$/.test(e)?t.trim():null,secret:null,base:null}}async function m(){try{const n=(await chrome.storage.local.get(c))[c];return typeof n=="string"?n:null}catch{return null}}async function C(n){try{await chrome.storage.local.set({[c]:n})}catch{}}function i(n){const t=document.getElementById(n);if(!t)throw new Error(`missing #${n}`);return t}async function h(n,t){try{const e=await chrome.runtime.sendMessage({cmd:"duet:join",url:n,roomId:t});return!!(e!=null&&e.ok)}catch{return!1}}function f(n,t,e){const a=i("ticket");a.hidden=!1,i("ticket-code").textContent=n;const o=i("copy");o.textContent=e,o.onclick=()=>{var r;const s=t??n;(r=navigator.clipboard)==null||r.writeText(s).catch(()=>{}),i("status").textContent=t?"Invite link copied.":"Code copied."},t?o.dataset.link=t:delete o.dataset.link}function I(){const n=document.getElementById("app");if(!n)return;n.innerHTML=`
    <div class="wrap">
      <div class="brand-row">
        <div class="brand" aria-label="Duet">
          <span class="mark" aria-hidden="true"></span>
          <span class="wordmark">Duet</span>
        </div>
        <button id="theme" class="icon-btn" type="button" aria-pressed="false" aria-label="Toggle light theme">☾</button>
      </div>
      <button id="start" class="btn btn-primary" type="button">Start a room</button>
      <div class="divider" aria-hidden="true">or</div>
      <form id="join" class="join field">
        <input id="link" type="text" placeholder="Paste invite link…" aria-label="Invite link"
          autocomplete="off" spellcheck="false" />
        <button class="btn btn-secondary" type="submit">Join</button>
      </form>
      <section id="ticket" class="ticket ticket-stub" hidden>
        <p class="ticket-kicker">ADMIT TWO</p>
        <p id="ticket-code" class="ticket-code" aria-label="Room code"></p>
        <button id="copy" class="btn btn-secondary" type="button">Copy invite link</button>
      </section>
      <p id="status" class="status" role="status"></p>
    </div>`;const t=i("status");k(i("theme")),i("start").addEventListener("click",async()=>{const e=await m();if(!e){t.textContent="Paste any Duet invite link below first, so we know your server.",i("link").focus();return}const a=g(),o=d(e,a,v());t.textContent="Starting your room…",await h(p(e,a),a)?(f(y(),o,"Copy invite link"),t.textContent="Waiting for your person…"):t.textContent="That didn't work. Try again, or check the help page."}),i("join").addEventListener("submit",async e=>{e.preventDefault();const a=i("link").value,o=w(a);if(!o.roomId){t.textContent="That didn't work. Try again, or check the help page.";return}o.base&&C(o.base);const s=o.base??await m();if(!s){t.textContent="Paste a full invite link, not just a code.";return}t.textContent="Joining…";const r=p(s,o.roomId);if(await h(r,o.roomId)){const l=o.secret?d(s,o.roomId,o.secret):null;f(o.roomId,l,l?"Copy invite link":"Copy code"),t.textContent="Waiting for your person…"}else t.textContent="That didn't work. Try again, or check the help page."})}I();
