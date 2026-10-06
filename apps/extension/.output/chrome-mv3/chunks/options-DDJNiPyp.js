import"./app-C1C7aP05.js";import{c as e,l as t,n,r,t as i}from"./room-link-Bxyolr-T.js";var a={name:`duet:name`,theme:`duet:theme`,control:`duet:control-default`,nudge:`duet:rate-nudge`};async function o(e){try{let t=(await chrome.storage.local.get(e))[e];return typeof t==`string`?t:null}catch{return null}}async function s(e,t){try{t===null?await chrome.storage.local.remove(e):await chrome.storage.local.set({[e]:t})}catch{}}function c(e){let t=e.trim().replace(/\/+$/,``);return t===``?i:/^https?:\/\//i.test(t)?t:`https://${t}`}async function l(e,t){try{let n={};t&&(n.Authorization=`Bearer ${t}`);let r=await fetch(`${e}/api/health`,{headers:n});if(!r.ok)return`Server answered ${r.status} — check the URL.`;let i=await r.json();return i.ok?`Connected to ${i.service??`signal server`}.`:`Server answered oddly — check the URL.`}catch{return`Can't reach that server. Check the URL and your connection.`}}async function u(e){try{let t=new URL(e).origin;return await chrome.permissions.request({origins:[`${t}/*`]})}catch{return!1}}function d(){let e=document.getElementById(`app`);e&&(e.innerHTML=`
  <div class="opt-layout">
    <aside class="opt-side" aria-label="Settings sections">
      <div class="brand" aria-label="Duet">
        <span class="mark" aria-hidden="true"></span>
        <span><span class="wordmark">Duet</span><br /><span class="hint" id="side-ver">settings</span></span>
      </div>
      <nav class="opt-nav" aria-label="Settings">
        <a href="#profile">Profile</a>
        <a href="#connection">Connection</a>
        <a href="#playback">Playback</a>
        <a href="#diagnostics">Diagnostics</a>
        <a href="#about">About</a>
        <a href="#danger" class="danger-link">Danger zone</a>
      </nav>
    </aside>
    <div class="opt-main">
    <h1 id="title">Settings</h1>

    <section class="section" id="profile" aria-labelledby="h-profile">
      <h2 id="h-profile">Profile</h2>
      <label class="field-label" for="name">Display name</label>
      <input id="name" class="field" type="text" maxlength="64" autocomplete="off" spellcheck="false" />
      <p class="hint">Shown to the other person. Defaults to Guest.</p>
    </section>

    <section class="section" aria-labelledby="h-conn" id="connection">
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

    <section class="section" aria-labelledby="h-play" id="playback">
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

    <section class="section" aria-labelledby="h-diag" id="diagnostics">
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

    <section class="section danger" aria-labelledby="h-danger" id="danger">
      <h2 id="h-danger">Danger zone</h2>
      <div class="btn-row">
        <button id="leave" class="btn btn-ghost" type="button">Leave all rooms</button>
        <button id="uninstall" class="btn btn-ghost leave" type="button">Uninstall Duet…</button>
      </div>
      <p id="status" class="status" role="status"></p>
    </section>

    <section class="section" aria-labelledby="h-about" id="about">
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
    </section>
    </div>
  </div>`)}async function f(){d();let i=e=>document.getElementById(e),f=i(`status`),p=e=>{f.textContent=e};try{await o(a.theme)===`light`&&(document.documentElement.dataset.theme=`light`)}catch{}let m=i(`base`),h=i(`key`),g=i(`name`);m.value=await r(),h.value=await n(),g.value=await o(a.name)??``;let _,v=c(m.value),y=async()=>{let n=c(m.value);if(n!==v&&n!==`https://duet-jhwt.onrender.com`&&!await u(n)){p(`Browser permission for that server was declined.`);return}v=n,await t(n),await e(h.value.trim()),await s(a.name,g.value.trim().slice(0,64)||null),m.value=n,p(`Saved.`)},b=()=>{window.clearTimeout(_),_=window.setTimeout(()=>void y(),600)};for(let e of[m,h,g])e.addEventListener(`input`,b),e.addEventListener(`change`,()=>void y());i(`test`).addEventListener(`click`,async()=>{p(`Testing…`),p(await l(c(m.value),h.value.trim()))});let x=i(`ctl-both`),S=i(`ctl-host`),C=async e=>{x.setAttribute(`aria-pressed`,String(!e)),S.setAttribute(`aria-pressed`,String(e)),await s(a.control,e?`host`:`both`),p(e?`Only you control by default.`:`You both control by default.`)};x.addEventListener(`click`,()=>void C(!1)),S.addEventListener(`click`,()=>void C(!0)),await o(a.control)===`host`&&(x.setAttribute(`aria-pressed`,`false`),S.setAttribute(`aria-pressed`,`true`));let w=i(`nudge`),T=async e=>{w.setAttribute(`aria-checked`,String(e)),await s(a.nudge,e?`1`:`0`)};w.addEventListener(`click`,()=>void T(w.getAttribute(`aria-checked`)!==`true`)),await o(a.nudge)===`0`&&w.setAttribute(`aria-checked`,`false`);let E={system:i(`th-system`),dark:i(`th-dark`),light:i(`th-light`)},D=async e=>{for(let[t,n]of Object.entries(E))n.setAttribute(`aria-pressed`,String(t===e));e===`light`?document.documentElement.dataset.theme=`light`:delete document.documentElement.dataset.theme,await s(a.theme,e===`system`?null:e),p(e===`system`?`Following the system theme.`:`${e[0]?.toUpperCase()}${e.slice(1)} theme on.`)};for(let[e,t]of Object.entries(E))t.addEventListener(`click`,()=>void D(e));let O=await o(a.theme),k=O===`light`?`light`:O===`dark`?`dark`:`system`;for(let[e,t]of Object.entries(E))t.setAttribute(`aria-pressed`,String(e===k));i(`refresh`).addEventListener(`click`,async()=>{p(`Checking…`);try{let e=await chrome.runtime.sendMessage({cmd:`duet:diag`});i(`d-room`).textContent=e?.room?.roomId??`no room`,i(`d-conn`).textContent=e?.diag?.connected?`yes`:`no`,i(`d-offset`).textContent=typeof e?.diag?.serverOffsetMs==`number`?`${e.diag.serverOffsetMs} ms`:`—`,i(`d-rtt`).textContent=typeof e?.diag?.rttMs==`number`?`${e.diag.rttMs} ms`:`—`;try{i(`d-ver`).textContent=chrome.runtime.getManifest().version}catch{i(`d-ver`).textContent=`—`}p(`Updated.`)}catch{p(`Couldn't reach the background worker.`)}}),i(`leave`).addEventListener(`click`,async()=>{try{await chrome.runtime.sendMessage({cmd:`duet:leave`}),await chrome.storage.session.remove(`duet:room`)}catch{}p(`Left all rooms.`)});let A=i(`uninstall`),j=!1,M;A.addEventListener(`click`,()=>{if(!j){j=!0,A.textContent=`Click again to confirm uninstall`,p(`Tell us why first — a feedback form opens, then confirm here.`);try{chrome.tabs.create({url:`https://github.com/pratikwayal01/duet/issues/new?template=uninstall.yml`}).catch(()=>{})}catch{}M=window.setTimeout(()=>{j=!1,A.textContent=`Uninstall Duet…`},3e4);return}window.clearTimeout(M),chrome.management.uninstallSelf({showConfirmDialog:!0}).catch(()=>{p(`Couldn't uninstall — remove it from the extensions page.`)})});try{let e=chrome.runtime.getManifest().version;i(`about-ver`).textContent=`Duet v${e} — watch together, just the two of you.`,i(`side-ver`).textContent=`v${e}`}catch{}}f();