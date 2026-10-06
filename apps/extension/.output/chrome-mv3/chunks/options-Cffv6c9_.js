import"./app-YG5p5wWR.js";import{g as U,a as M,D as B,s as O,b as R}from"./room-link-CM9wu0Jq.js";const l={name:"duet:name",theme:"duet:theme",control:"duet:control-default",nudge:"duet:rate-nudge"};async function c(e){try{const s=(await chrome.storage.local.get(e))[e];return typeof s=="string"?s:null}catch{return null}}async function b(e,s){try{s===null?await chrome.storage.local.remove(e):await chrome.storage.local.set({[e]:s})}catch{}}function w(e){const s=e.trim().replace(/\/+$/,"");return s===""?B:/^https?:\/\//i.test(s)?s:`https://${s}`}async function j(e,s){try{const a={};s&&(a.Authorization=`Bearer ${s}`);const i=await fetch(`${e}/api/health`,{headers:a});if(!i.ok)return`Server answered ${i.status} — check the URL.`;const r=await i.json();return r.ok?`Connected to ${r.service??"signal server"}.`:"Server answered oddly — check the URL."}catch{return"Can't reach that server. Check the URL and your connection."}}async function G(e){try{const s=new URL(e).origin;return await chrome.permissions.request({origins:[`${s}/*`]})}catch{return!1}}function I(){const e=document.getElementById("app");e&&(e.innerHTML=`
    <h1 id="title">Settings</h1>

    <section class="section" aria-labelledby="h-profile">
      <h2 id="h-profile">Profile</h2>
      <label class="field-label" for="name">Display name</label>
      <input id="name" class="field" type="text" maxlength="64" autocomplete="off" spellcheck="false" />
      <p class="hint">Shown to the other person. Defaults to Guest.</p>
    </section>

    <section class="section" aria-labelledby="h-conn">
      <h2 id="h-conn">Connection</h2>
      <label class="field-label" for="base">Signal server</label>
      <input id="base" class="field" type="url" autocomplete="off" spellcheck="false"
        aria-describedby="base-hint" />
      <p id="base-hint" class="hint">Where rooms live. Use your own server or a friend's. Defaults to the public demo server.</p>
      <label class="field-label" for="key">API key <span class="hint-inline">(only if your server needs one)</span></label>
      <input id="key" class="field" type="password" autocomplete="off" spellcheck="false" />
      <p class="hint">Stays on this device. Sent as a Bearer token to your server only.</p>
      <div class="btn-row">
        <button id="test" class="btn btn-secondary" type="button">Test connection</button>
      </div>
    </section>

    <section class="section" aria-labelledby="h-play">
      <h2 id="h-play">Playback</h2>
      <p class="field-label" id="control-label">Who controls by default</p>
      <div class="seg-group" role="group" aria-labelledby="control-label">
        <button id="ctl-both" class="seg" type="button" aria-pressed="true">Both</button>
        <button id="ctl-host" class="seg" type="button" aria-pressed="false">Just me</button>
      </div>
      <div class="switch-row">
        <div>
          <p class="field-label">Gentle catch-up</p>
          <p class="hint">Nudge speed instead of jumping on small drift. Off on services that dislike it.</p>
        </div>
        <button id="nudge" class="switch" type="button" role="switch" aria-checked="true" aria-label="Gentle catch-up"><span aria-hidden="true"></span></button>
      </div>
      <p class="field-label" id="theme-label">Theme</p>
      <div class="seg-group" role="group" aria-labelledby="theme-label">
        <button id="th-system" class="seg" type="button" aria-pressed="true">System</button>
        <button id="th-dark" class="seg" type="button" aria-pressed="false">Dark</button>
        <button id="th-light" class="seg" type="button" aria-pressed="false">Light</button>
      </div>
    </section>

    <section class="section" aria-labelledby="h-diag">
      <h2 id="h-diag">Diagnostics</h2>
      <p class="hint">Clock sync between you and the server. Big offsets mean choppy sync.</p>
      <div class="btn-row">
        <button id="refresh" class="btn btn-secondary" type="button">Refresh</button>
      </div>
      <dl class="kv">
        <div><dt>Room</dt><dd id="d-room">—</dd></div>
        <div><dt>Connected</dt><dd id="d-conn">—</dd></div>
        <div><dt>Clock offset</dt><dd id="d-offset">—</dd></div>
        <div><dt>Round trip</dt><dd id="d-rtt">—</dd></div>
        <div><dt>Extension</dt><dd id="d-ver">—</dd></div>
      </dl>
    </section>

    <section class="section danger" aria-labelledby="h-danger">
      <h2 id="h-danger">Danger zone</h2>
      <div class="btn-row">
        <button id="leave" class="btn btn-ghost" type="button">Leave all rooms</button>
        <button id="uninstall" class="btn btn-ghost leave" type="button">Uninstall Duet…</button>
      </div>
      <p id="status" class="status" role="status"></p>
    </section>`)}async function P(){I();const e=t=>document.getElementById(t),s=e("status"),a=t=>{s.textContent=t};try{await c(l.theme)==="light"&&(document.documentElement.dataset.theme="light")}catch{}const i=e("base"),r=e("key"),m=e("name");i.value=await U(),r.value=await M(),m.value=await c(l.name)??"";let k,C=w(i.value);const E=async()=>{const t=w(i.value);if(t!==C&&t!==B&&!await G(t)){a("Browser permission for that server was declined.");return}C=t,await O(t),await R(r.value.trim()),await b(l.name,m.value.trim().slice(0,64)||null),i.value=t,a("Saved.")},x=()=>{window.clearTimeout(k),k=window.setTimeout(()=>void E(),600)};for(const t of[i,r,m])t.addEventListener("input",x),t.addEventListener("change",()=>void E());e("test").addEventListener("click",async()=>{a("Testing…"),a(await j(w(i.value),r.value.trim()))});const f=e("ctl-both"),p=e("ctl-host"),L=async t=>{f.setAttribute("aria-pressed",String(!t)),p.setAttribute("aria-pressed",String(t)),await b(l.control,t?"host":"both"),a(t?"Only you control by default.":"You both control by default.")};f.addEventListener("click",()=>void L(!1)),p.addEventListener("click",()=>void L(!0)),await c(l.control)==="host"&&(f.setAttribute("aria-pressed","false"),p.setAttribute("aria-pressed","true"));const d=e("nudge"),T=async t=>{d.setAttribute("aria-checked",String(t)),await b(l.nudge,t?"1":"0")};d.addEventListener("click",()=>void T(d.getAttribute("aria-checked")!=="true")),await c(l.nudge)==="0"&&d.setAttribute("aria-checked","false");const g={system:e("th-system"),dark:e("th-dark"),light:e("th-light")},D=async t=>{var o;for(const[u,h]of Object.entries(g))h.setAttribute("aria-pressed",String(u===t));t==="light"?document.documentElement.dataset.theme="light":delete document.documentElement.dataset.theme,await b(l.theme,t==="system"?null:t),a(t==="system"?"Following the system theme.":`${(o=t[0])==null?void 0:o.toUpperCase()}${t.slice(1)} theme on.`)};for(const[t,o]of Object.entries(g))o.addEventListener("click",()=>void D(t));const S=await c(l.theme),$=S==="light"?"light":S==="dark"?"dark":"system";for(const[t,o]of Object.entries(g))o.setAttribute("aria-pressed",String(t===$));e("refresh").addEventListener("click",async()=>{var t,o,u,h;a("Checking…");try{const n=await chrome.runtime.sendMessage({cmd:"duet:diag"});e("d-room").textContent=((t=n==null?void 0:n.room)==null?void 0:t.roomId)??"no room",e("d-conn").textContent=(o=n==null?void 0:n.diag)!=null&&o.connected?"yes":"no",e("d-offset").textContent=typeof((u=n==null?void 0:n.diag)==null?void 0:u.serverOffsetMs)=="number"?`${n.diag.serverOffsetMs} ms`:"—",e("d-rtt").textContent=typeof((h=n==null?void 0:n.diag)==null?void 0:h.rttMs)=="number"?`${n.diag.rttMs} ms`:"—";try{e("d-ver").textContent=chrome.runtime.getManifest().version}catch{e("d-ver").textContent="—"}a("Updated.")}catch{a("Couldn't reach the background worker.")}}),e("leave").addEventListener("click",async()=>{try{await chrome.runtime.sendMessage({cmd:"duet:leave"})}catch{}try{await chrome.storage.session.clear()}catch{}a("Left all rooms.")});const v=e("uninstall");let y=!1,A;v.addEventListener("click",()=>{if(!y){y=!0,v.textContent="Click again to confirm uninstall",a("This removes Duet and its local settings."),A=window.setTimeout(()=>{y=!1,v.textContent="Uninstall Duet…"},5e3);return}window.clearTimeout(A),chrome.management.uninstallSelf({showConfirmDialog:!0}).catch(()=>{a("Couldn't uninstall — remove it from the extensions page.")})})}P();
