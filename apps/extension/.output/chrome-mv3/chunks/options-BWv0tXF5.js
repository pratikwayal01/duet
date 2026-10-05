import"./app-nuwP_u1z.js";import{g as m,a as h,D as d,s as v,b as f}from"./room-link-CM9wu0Jq.js";function r(e){const t=e.trim().replace(/\/+$/,"");return t===""?d:/^https?:\/\//i.test(t)?t:`https://${t}`}async function p(e,t){try{const o={};t&&(o.Authorization=`Bearer ${t}`);const n=await fetch(`${e}/api/health`,{headers:o});if(!n.ok)return`Server answered ${n.status} — check the URL.`;const a=await n.json();return a.ok?`Connected to ${a.service??"signal server"}.`:"Server answered oddly — check the URL."}catch{return"Can't reach that server. Check the URL and your connection."}}async function y(e){try{const t=new URL(e).origin;return await chrome.permissions.request({origins:[`${t}/*`]})}catch{return!1}}function b(){const e=document.getElementById("app");e&&(e.innerHTML=`
    <h1 id="title">Settings</h1>
    <form id="form" class="section">
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
      <p id="status" class="status" role="status"></p>
    </form>`)}async function g(){b();const e=document.getElementById("base"),t=document.getElementById("key"),o=document.getElementById("status");e.value=await m(),t.value=await h();try{(await chrome.storage.local.get("duet:theme"))["duet:theme"]==="light"&&(document.documentElement.dataset.theme="light")}catch{}const n=s=>{o.textContent=s};document.getElementById("form").addEventListener("submit",s=>{s.preventDefault()});let a,c=r(e.value);const i=async()=>{const s=r(e.value),u=t.value.trim();if(s!==c&&s!==d&&!await y(s)){n("Browser permission for that server was declined.");return}c=s,await v(s),await f(u),e.value=s,n("Saved.")},l=()=>{window.clearTimeout(a),a=window.setTimeout(()=>void i(),600)};e.addEventListener("input",l),t.addEventListener("input",l),e.addEventListener("change",()=>void i()),t.addEventListener("change",()=>void i()),document.getElementById("test").addEventListener("click",async()=>{n("Testing…"),n(await p(r(e.value),t.value.trim()))})}g();
