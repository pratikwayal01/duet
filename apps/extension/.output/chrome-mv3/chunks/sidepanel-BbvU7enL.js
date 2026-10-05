import"./tokens-Cab-mSq2.js";const t={synced:{dot:"●",copy:"Synced",token:"var(--ok)"},catching:{dot:"◐",copy:"Catching up…",token:"var(--warn)"},waiting:{dot:"⏸",copy:"Waiting to buffer",token:"var(--warn)"},reconnecting:{dot:"○",copy:"Reconnecting…",token:"var(--danger)"},noplayer:{dot:"!",copy:"Open a video to begin",token:"var(--text-2)"}};function o(n){const e=t[n];return`<span class="chip" style="color:${e.token}"><span aria-hidden="true">${e.dot}</span> ${e.copy}</span>`}function a(){const n=document.getElementById("app");n&&(n.innerHTML=`
    <header><span id="room">Room —</span> <span id="chip">${o("noplayer")}</span></header>
    <section id="presence"></section>
    <section id="title"><h2>Watching</h2><p id="watching">Nothing yet</p></section>
    <section id="chat" aria-label="Chat"></section>
    <form id="composer"><input type="text" placeholder="Type a message…" aria-label="Type a message" />
    <button type="submit">↩</button></form>`,window.addEventListener("beforeunload",()=>{n.innerHTML=""}))}a();
