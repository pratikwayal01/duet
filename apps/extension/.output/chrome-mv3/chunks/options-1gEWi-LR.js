import"./app-BCs5HQSB.js";import{g as U,a as M,D,s as O,b as P}from"./room-link-CM9wu0Jq.js";const r={name:"duet:name",theme:"duet:theme",control:"duet:control-default",nudge:"duet:rate-nudge"};async function d(t){try{const a=(await chrome.storage.local.get(t))[t];return typeof a=="string"?a:null}catch{return null}}async function b(t,a){try{a===null?await chrome.storage.local.remove(t):await chrome.storage.local.set({[t]:a})}catch{}}function w(t){const a=t.trim().replace(/\/+$/,"");return a===""?D:/^https?:\/\//i.test(a)?a:`https://${a}`}async function R(t,a){try{const s={};a&&(s.Authorization=`Bearer ${a}`);const i=await fetch(`${t}/api/health`,{headers:s});if(!i.ok)return`Server answered ${i.status} — check the URL.`;const l=await i.json();return l.ok?`Connected to ${l.service??"signal server"}.`:"Server answered oddly — check the URL."}catch{return"Can't reach that server. Check the URL and your connection."}}async function j(t){try{const a=new URL(t).origin;return await chrome.permissions.request({origins:[`${a}/*`]})}catch{return!1}}function _(){const t=document.getElementById("app");t&&(t.innerHTML=`
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
    </section>

    <section class="section" aria-labelledby="h-about">
      <h2 id="h-about">About Duet</h2>
      <p class="hint" id="about-ver">Duet — browser extension</p>
      <ul class="link-list">
        <li><a id="about-change" href="https://github.com/pratikwayal01/duet/releases" target="_blank" rel="noreferrer">Changelog</a></li>
        <li><a href="https://github.com/pratikwayal01/duet/tree/main/docs" target="_blank" rel="noreferrer">Documentation</a></li>
        <li><a href="https://github.com/pratikwayal01/duet" target="_blank" rel="noreferrer">GitHub</a></li>
        <li><a href="https://github.com/pratikwayal01/duet/issues/new/choose" target="_blank" rel="noreferrer">Send feedback</a></li>
        <li><a href="https://github.com/pratikwayal01/duet/blob/main/docs/privacy.md" target="_blank" rel="noreferrer">Privacy policy</a></li>
      </ul>
      <h3 class="sub">Permissions used</h3>
      <dl class="kv">
        <div><dt>storage</dt><dd>Settings and room state, on this device only</dd></div>
        <div><dt>sidePanel</dt><dd>Chat and sync controls beside the video</dd></div>
        <div><dt>activeTab</dt><dd>Detect the video on the tab you invoke us from</dd></div>
        <div><dt>management</dt><dd>Self-uninstall from Settings only</dd></div>
        <div><dt>site access</dt><dd>Sync on streaming sites + your signal server (changeable in Connection)</dd></div>
      </dl>
    </section>`)}async function G(){_();const t=e=>document.getElementById(e),a=t("status"),s=e=>{a.textContent=e};try{await d(r.theme)==="light"&&(document.documentElement.dataset.theme="light")}catch{}const i=t("base"),l=t("key"),m=t("name");i.value=await U(),l.value=await M(),m.value=await d(r.name)??"";let k,C=w(i.value);const S=async()=>{const e=w(i.value);if(e!==C&&e!==D&&!await j(e)){s("Browser permission for that server was declined.");return}C=e,await O(e),await P(l.value.trim()),await b(r.name,m.value.trim().slice(0,64)||null),i.value=e,s("Saved.")},x=()=>{window.clearTimeout(k),k=window.setTimeout(()=>void S(),600)};for(const e of[i,l,m])e.addEventListener("input",x),e.addEventListener("change",()=>void S());t("test").addEventListener("click",async()=>{s("Testing…"),s(await R(w(i.value),l.value.trim()))});const f=t("ctl-both"),p=t("ctl-host"),E=async e=>{f.setAttribute("aria-pressed",String(!e)),p.setAttribute("aria-pressed",String(e)),await b(r.control,e?"host":"both"),s(e?"Only you control by default.":"You both control by default.")};f.addEventListener("click",()=>void E(!1)),p.addEventListener("click",()=>void E(!0)),await d(r.control)==="host"&&(f.setAttribute("aria-pressed","false"),p.setAttribute("aria-pressed","true"));const c=t("nudge"),B=async e=>{c.setAttribute("aria-checked",String(e)),await b(r.nudge,e?"1":"0")};c.addEventListener("click",()=>void B(c.getAttribute("aria-checked")!=="true")),await d(r.nudge)==="0"&&c.setAttribute("aria-checked","false");const v={system:t("th-system"),dark:t("th-dark"),light:t("th-light")},T=async e=>{var o;for(const[u,h]of Object.entries(v))h.setAttribute("aria-pressed",String(u===e));e==="light"?document.documentElement.dataset.theme="light":delete document.documentElement.dataset.theme,await b(r.theme,e==="system"?null:e),s(e==="system"?"Following the system theme.":`${(o=e[0])==null?void 0:o.toUpperCase()}${e.slice(1)} theme on.`)};for(const[e,o]of Object.entries(v))o.addEventListener("click",()=>void T(e));const L=await d(r.theme),$=L==="light"?"light":L==="dark"?"dark":"system";for(const[e,o]of Object.entries(v))o.setAttribute("aria-pressed",String(e===$));t("refresh").addEventListener("click",async()=>{var e,o,u,h;s("Checking…");try{const n=await chrome.runtime.sendMessage({cmd:"duet:diag"});t("d-room").textContent=((e=n==null?void 0:n.room)==null?void 0:e.roomId)??"no room",t("d-conn").textContent=(o=n==null?void 0:n.diag)!=null&&o.connected?"yes":"no",t("d-offset").textContent=typeof((u=n==null?void 0:n.diag)==null?void 0:u.serverOffsetMs)=="number"?`${n.diag.serverOffsetMs} ms`:"—",t("d-rtt").textContent=typeof((h=n==null?void 0:n.diag)==null?void 0:h.rttMs)=="number"?`${n.diag.rttMs} ms`:"—";try{t("d-ver").textContent=chrome.runtime.getManifest().version}catch{t("d-ver").textContent="—"}s("Updated.")}catch{s("Couldn't reach the background worker.")}}),t("leave").addEventListener("click",async()=>{try{await chrome.runtime.sendMessage({cmd:"duet:leave"}),await chrome.storage.session.remove("duet:room")}catch{}s("Left all rooms.")});const g=t("uninstall");let y=!1,A;g.addEventListener("click",()=>{if(!y){y=!0,g.textContent="Click again to confirm uninstall",s("Tell us why first — a feedback form opens, then confirm here.");try{chrome.tabs.create({url:"https://github.com/pratikwayal01/duet/issues/new?template=uninstall.yml"}).catch(()=>{})}catch{}A=window.setTimeout(()=>{y=!1,g.textContent="Uninstall Duet…"},3e4);return}window.clearTimeout(A),chrome.management.uninstallSelf({showConfirmDialog:!0}).catch(()=>{s("Couldn't uninstall — remove it from the extensions page.")})});try{t("about-ver").textContent=`Duet v${chrome.runtime.getManifest().version} — watch together, just the two of you.`}catch{}}G();
