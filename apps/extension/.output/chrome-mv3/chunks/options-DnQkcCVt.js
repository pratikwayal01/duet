import"./app-YG5p5wWR.js";import{g as U,a as M,D as B,s as O,b as R}from"./room-link-CM9wu0Jq.js";const l={name:"duet:name",theme:"duet:theme",control:"duet:control-default",nudge:"duet:rate-nudge"};async function d(t){try{const s=(await chrome.storage.local.get(t))[t];return typeof s=="string"?s:null}catch{return null}}async function b(t,s){try{s===null?await chrome.storage.local.remove(t):await chrome.storage.local.set({[t]:s})}catch{}}function w(t){const s=t.trim().replace(/\/+$/,"");return s===""?B:/^https?:\/\//i.test(s)?s:`https://${s}`}async function j(t,s){try{const a={};s&&(a.Authorization=`Bearer ${s}`);const o=await fetch(`${t}/api/health`,{headers:a});if(!o.ok)return`Server answered ${o.status} — check the URL.`;const r=await o.json();return r.ok?`Connected to ${r.service??"signal server"}.`:"Server answered oddly — check the URL."}catch{return"Can't reach that server. Check the URL and your connection."}}async function G(t){try{const s=new URL(t).origin;return await chrome.permissions.request({origins:[`${s}/*`]})}catch{return!1}}function I(){const t=document.getElementById("app");t&&(t.innerHTML=`
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
    </section>`)}async function P(){I();const t=e=>document.getElementById(e),s=t("status"),a=e=>{s.textContent=e};try{await d(l.theme)==="light"&&(document.documentElement.dataset.theme="light")}catch{}const o=t("base"),r=t("key"),m=t("name");o.value=await U(),r.value=await M(),m.value=await d(l.name)??"";let k,C=w(o.value);const E=async()=>{const e=w(o.value);if(e!==C&&e!==B&&!await G(e)){a("Browser permission for that server was declined.");return}C=e,await O(e),await R(r.value.trim()),await b(l.name,m.value.trim().slice(0,64)||null),o.value=e,a("Saved.")},x=()=>{window.clearTimeout(k),k=window.setTimeout(()=>void E(),600)};for(const e of[o,r,m])e.addEventListener("input",x),e.addEventListener("change",()=>void E());t("test").addEventListener("click",async()=>{a("Testing…"),a(await j(w(o.value),r.value.trim()))});const f=t("ctl-both"),p=t("ctl-host"),L=async e=>{f.setAttribute("aria-pressed",String(!e)),p.setAttribute("aria-pressed",String(e)),await b(l.control,e?"host":"both"),a(e?"Only you control by default.":"You both control by default.")};f.addEventListener("click",()=>void L(!1)),p.addEventListener("click",()=>void L(!0)),await d(l.control)==="host"&&(f.setAttribute("aria-pressed","false"),p.setAttribute("aria-pressed","true"));const c=t("nudge"),T=async e=>{c.setAttribute("aria-checked",String(e)),await b(l.nudge,e?"1":"0")};c.addEventListener("click",()=>void T(c.getAttribute("aria-checked")!=="true")),await d(l.nudge)==="0"&&c.setAttribute("aria-checked","false");const v={system:t("th-system"),dark:t("th-dark"),light:t("th-light")},D=async e=>{var i;for(const[u,h]of Object.entries(v))h.setAttribute("aria-pressed",String(u===e));e==="light"?document.documentElement.dataset.theme="light":delete document.documentElement.dataset.theme,await b(l.theme,e==="system"?null:e),a(e==="system"?"Following the system theme.":`${(i=e[0])==null?void 0:i.toUpperCase()}${e.slice(1)} theme on.`)};for(const[e,i]of Object.entries(v))i.addEventListener("click",()=>void D(e));const S=await d(l.theme),$=S==="light"?"light":S==="dark"?"dark":"system";for(const[e,i]of Object.entries(v))i.setAttribute("aria-pressed",String(e===$));t("refresh").addEventListener("click",async()=>{var e,i,u,h;a("Checking…");try{const n=await chrome.runtime.sendMessage({cmd:"duet:diag"});t("d-room").textContent=((e=n==null?void 0:n.room)==null?void 0:e.roomId)??"no room",t("d-conn").textContent=(i=n==null?void 0:n.diag)!=null&&i.connected?"yes":"no",t("d-offset").textContent=typeof((u=n==null?void 0:n.diag)==null?void 0:u.serverOffsetMs)=="number"?`${n.diag.serverOffsetMs} ms`:"—",t("d-rtt").textContent=typeof((h=n==null?void 0:n.diag)==null?void 0:h.rttMs)=="number"?`${n.diag.rttMs} ms`:"—";try{t("d-ver").textContent=chrome.runtime.getManifest().version}catch{t("d-ver").textContent="—"}a("Updated.")}catch{a("Couldn't reach the background worker.")}}),t("leave").addEventListener("click",async()=>{try{await chrome.runtime.sendMessage({cmd:"duet:leave"}),await chrome.storage.session.remove("duet:room")}catch{}a("Left all rooms.")});const g=t("uninstall");let y=!1,A;g.addEventListener("click",()=>{if(!y){y=!0,g.textContent="Click again to confirm uninstall",a("This removes Duet and its local settings."),A=window.setTimeout(()=>{y=!1,g.textContent="Uninstall Duet…"},5e3);return}window.clearTimeout(A),chrome.management.uninstallSelf({showConfirmDialog:!0}).catch(()=>{a("Couldn't uninstall — remove it from the extensions page.")})})}P();
