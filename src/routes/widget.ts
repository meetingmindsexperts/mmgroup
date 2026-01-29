// Serves the chat widget JavaScript

export function handleWidget(request: Request, apiUrl: string): Response {
  const url = new URL(request.url);
  const workerUrl = `${url.protocol}//${url.host}`;

  // Configuration from query params (optional)
  const title = url.searchParams.get('title') || 'Chat with us';
  const primaryColor = url.searchParams.get('color') || '#2563eb';
  const position = url.searchParams.get('position') || 'right';

  const widgetJs = generateWidgetJs(workerUrl, title, primaryColor, position);

  return new Response(widgetJs, {
    headers: {
      'Content-Type': 'application/javascript',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

function generateWidgetJs(
  apiUrl: string,
  title: string,
  primaryColor: string,
  position: string
): string {
  return `(function(){'use strict';const e="${apiUrl}",t="${title}",n="${primaryColor}",o="${position}";let i=!1,s=localStorage.getItem("mm_chat_session")||null,a=[];function r(e,t){const n=e.replace("#",""),o=parseInt(n,16);return"#"+(Math.max(0,Math.min(255,(65536&o)+t))|Math.max(0,Math.min(255,(256&o>>8)+t))<<8|Math.max(0,Math.min(255,(o>>16)+t))).toString(16).padStart(6,"0")}const c=\`
.mm-chat-widget *{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,sans-serif}
.mm-chat-bubble{position:fixed;bottom:20px;\${o}:20px;width:60px;height:60px;border-radius:50%;background:\${n};color:#fff;border:none;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.15);display:flex;align-items:center;justify-content:center;transition:transform .2s,box-shadow .2s;z-index:9999}
.mm-chat-bubble:hover{transform:scale(1.05);box-shadow:0 6px 16px rgba(0,0,0,.2)}
.mm-chat-bubble svg{width:28px;height:28px}
.mm-chat-container{position:fixed;bottom:90px;\${o}:20px;width:380px;max-width:calc(100vw - 40px);height:520px;max-height:calc(100vh - 120px);background:#fff;border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,.15);display:flex;flex-direction:column;overflow:hidden;z-index:9998;opacity:0;transform:translateY(20px) scale(.95);pointer-events:none;transition:opacity .2s,transform .2s}
.mm-chat-container.open{opacity:1;transform:translateY(0) scale(1);pointer-events:auto}
.mm-chat-header{background:\${n};color:#fff;padding:16px 20px;font-weight:600;font-size:16px;display:flex;align-items:center;justify-content:space-between}
.mm-chat-close{background:0 0;border:none;color:#fff;cursor:pointer;padding:4px;display:flex;align-items:center;justify-content:center;opacity:.8;transition:opacity .2s}
.mm-chat-close:hover{opacity:1}
.mm-chat-messages{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px}
.mm-chat-message{max-width:85%;padding:12px 16px;border-radius:16px;font-size:14px;line-height:1.5;word-wrap:break-word}
.mm-chat-message.user{align-self:flex-end;background:\${n};color:#fff;border-bottom-right-radius:4px}
.mm-chat-message.assistant{align-self:flex-start;background:#f1f5f9;color:#1e293b;border-bottom-left-radius:4px}
.mm-chat-message.typing{display:flex;gap:4px;padding:16px}
.mm-chat-message.typing span{width:8px;height:8px;background:#94a3b8;border-radius:50%;animation:mm-typing 1.4s infinite ease-in-out}
.mm-chat-message.typing span:nth-child(2){animation-delay:.2s}
.mm-chat-message.typing span:nth-child(3){animation-delay:.4s}
@keyframes mm-typing{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-4px)}}
.mm-chat-input-container{padding:16px;border-top:1px solid #e2e8f0;display:flex;gap:8px}
.mm-chat-input{flex:1;padding:12px 16px;border:1px solid #e2e8f0;border-radius:24px;font-size:14px;outline:0;transition:border-color .2s}
.mm-chat-input:focus{border-color:\${n}}
.mm-chat-send{width:44px;height:44px;border-radius:50%;background:\${n};color:#fff;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .2s}
.mm-chat-send:hover{background:\${r(n,-20)}}
.mm-chat-send:disabled{background:#cbd5e1;cursor:not-allowed}
.mm-chat-welcome{text-align:center;padding:40px 20px;color:#64748b}
.mm-chat-welcome h3{color:#1e293b;margin:0 0 8px;font-size:18px}
.mm-chat-welcome p{margin:0;font-size:14px}
@media(max-width:480px){.mm-chat-container{width:calc(100vw - 20px);height:calc(100vh - 100px);bottom:80px;\${o}:10px;border-radius:12px}.mm-chat-bubble{bottom:15px;\${o}:15px}}
\`,l='<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>',d='<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>',m='<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg>';function p(){const n=document.createElement("style");n.textContent=c,document.head.appendChild(n);const o=document.createElement("div");o.className="mm-chat-widget",o.innerHTML=\`<button class="mm-chat-bubble" aria-label="Open chat">\${l}</button><div class="mm-chat-container"><div class="mm-chat-header"><span>\${t}</span><button class="mm-chat-close" aria-label="Close chat">\${d}</button></div><div class="mm-chat-messages"><div class="mm-chat-welcome"><h3>Welcome! 👋</h3><p>How can we help you today?</p></div></div><div class="mm-chat-input-container"><input type="text" class="mm-chat-input" placeholder="Type your message..."/><button class="mm-chat-send" aria-label="Send message">\${m}</button></div></div>\`,document.body.appendChild(o);const r=o.querySelector(".mm-chat-bubble"),p=o.querySelector(".mm-chat-container"),h=o.querySelector(".mm-chat-close"),u=o.querySelector(".mm-chat-messages"),g=o.querySelector(".mm-chat-input"),f=o.querySelector(".mm-chat-send");function x(){i=!i,p.classList.toggle("open",i),i&&g.focus()}async function v(){const t=g.value.trim();if(!t)return;g.value="",f.disabled=!0;const n=u.querySelector(".mm-chat-welcome");n&&n.remove(),w("user",t);const o=document.createElement("div");o.className="mm-chat-message assistant typing",o.innerHTML="<span></span><span></span><span></span>",u.appendChild(o),y();try{const n=await fetch(e+"/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:t,sessionId:s})}),i=await n.json();o.remove(),i.error?w("assistant","Sorry, something went wrong. Please try again."):(i.sessionId&&(s=i.sessionId,localStorage.setItem("mm_chat_session",s)),w("assistant",i.response))}catch(e){o.remove(),w("assistant","Sorry, I couldn't connect. Please check your internet connection.")}f.disabled=!1,g.focus()}function w(e,t){const n=document.createElement("div");n.className="mm-chat-message "+e,n.textContent=t,u.appendChild(n),a.push({role:e,content:t}),y()}function y(){u.scrollTop=u.scrollHeight}r.addEventListener("click",x),h.addEventListener("click",x),f.addEventListener("click",v),g.addEventListener("keypress",e=>{"Enter"!==e.key||e.shiftKey||(e.preventDefault(),v())})}"loading"===document.readyState?document.addEventListener("DOMContentLoaded",p):p()})();`;
}
