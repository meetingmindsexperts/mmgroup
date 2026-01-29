// Serves the chat widget JavaScript

export function handleWidget(request: Request, apiUrl: string): Response {
  const url = new URL(request.url);
  const workerUrl = `${url.protocol}//${url.host}`;

  // Configuration from query params (optional)
  const title = url.searchParams.get('title') || 'Chat with us';
  const primaryColor = url.searchParams.get('color') || '#2eb2ff';
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
  return `(function() {
  'use strict';

  const API_URL = "${apiUrl}";
  const WIDGET_TITLE = "${title}";
  const PRIMARY_COLOR = "${primaryColor}";
  const POSITION = "${position}";

  let isOpen = false;
  let sessionId = localStorage.getItem('mm_chat_session') || null;

  // Format message with clickable links and markdown
  function formatMessage(text) {
    let html = text
      // Escape HTML first
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      // Bold text **text** or __text__
      .replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>')
      .replace(/__(.+?)__/g, '<strong>$1</strong>')
      // Email addresses - make clickable
      .replace(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,})/g,
        '<a href="mailto:$1" class="mm-link mm-email">📧 $1</a>')
      // Phone numbers - make clickable
      .replace(/(\\+?[0-9][0-9\\s\\-]{8,}[0-9])/g,
        '<a href="tel:$1" class="mm-link mm-phone">📞 $1</a>')
      // URLs - make clickable
      .replace(/(https?:\\/\\/[^\\s]+)/g,
        '<a href="$1" target="_blank" rel="noopener" class="mm-link">🔗 $1</a>')
      // Location/Address detection (Dubai, UAE pattern)
      .replace(/(Dubai[^,]*,?\\s*(?:UAE|United Arab Emirates))/gi,
        '<a href="https://maps.google.com/?q=$1" target="_blank" rel="noopener" class="mm-link mm-location">📍 $1</a>')
      // Line breaks
      .replace(/\\n/g, '<br>')
      // Bullet points
      .replace(/^- (.+)$/gm, '<div class="mm-bullet">• $1</div>')
      .replace(/^\\* (.+)$/gm, '<div class="mm-bullet">• $1</div>');

    return html;
  }

  const styles = \`
    .mm-chat-widget * {
      box-sizing: border-box;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
    }
    .mm-chat-bubble {
      position: fixed;
      bottom: 20px;
      \${POSITION}: 20px;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: \${PRIMARY_COLOR};
      color: white;
      border: none;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.2s, box-shadow 0.2s;
      z-index: 9999;
    }
    .mm-chat-bubble:hover {
      transform: scale(1.05);
      box-shadow: 0 6px 16px rgba(0,0,0,0.2);
    }
    .mm-chat-bubble svg { width: 28px; height: 28px; }
    .mm-chat-container {
      position: fixed;
      bottom: 90px;
      \${POSITION}: 20px;
      width: 380px;
      max-width: calc(100vw - 40px);
      height: 520px;
      max-height: calc(100vh - 120px);
      background: white;
      border-radius: 16px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.15);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      z-index: 9998;
      opacity: 0;
      transform: translateY(20px) scale(0.95);
      pointer-events: none;
      transition: opacity 0.2s, transform 0.2s;
    }
    .mm-chat-container.open {
      opacity: 1;
      transform: translateY(0) scale(1);
      pointer-events: auto;
    }
    .mm-chat-header {
      background: \${PRIMARY_COLOR};
      color: white;
      padding: 16px 20px;
      font-weight: 600;
      font-size: 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .mm-chat-close {
      background: none;
      border: none;
      color: white;
      cursor: pointer;
      padding: 4px;
      opacity: 0.8;
      transition: opacity 0.2s;
    }
    .mm-chat-close:hover { opacity: 1; }
    .mm-chat-messages {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .mm-chat-message {
      max-width: 85%;
      padding: 12px 16px;
      border-radius: 16px;
      font-size: 14px;
      line-height: 1.6;
      word-wrap: break-word;
    }
    .mm-chat-message.user {
      align-self: flex-end;
      background: \${PRIMARY_COLOR};
      color: white;
      border-bottom-right-radius: 4px;
    }
    .mm-chat-message.assistant {
      align-self: flex-start;
      background: #f1f5f9;
      color: #1e293b;
      border-bottom-left-radius: 4px;
    }
    .mm-chat-message.assistant strong {
      color: #0f172a;
      font-weight: 600;
    }
    .mm-chat-message .mm-link {
      display: inline-block;
      color: \${PRIMARY_COLOR};
      text-decoration: none;
      padding: 4px 8px;
      margin: 4px 0;
      background: white;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
      transition: all 0.2s;
    }
    .mm-chat-message .mm-link:hover {
      background: \${PRIMARY_COLOR};
      color: white;
      border-color: \${PRIMARY_COLOR};
    }
    .mm-chat-message .mm-bullet {
      padding: 4px 0;
    }
    .mm-chat-message.typing {
      display: flex;
      gap: 4px;
      padding: 16px;
    }
    .mm-chat-message.typing span {
      width: 8px;
      height: 8px;
      background: #94a3b8;
      border-radius: 50%;
      animation: mm-typing 1.4s infinite ease-in-out;
    }
    .mm-chat-message.typing span:nth-child(2) { animation-delay: 0.2s; }
    .mm-chat-message.typing span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes mm-typing {
      0%, 60%, 100% { transform: translateY(0); }
      30% { transform: translateY(-4px); }
    }
    .mm-chat-input-container {
      padding: 16px;
      border-top: 1px solid #e2e8f0;
      display: flex;
      gap: 8px;
    }
    .mm-chat-input {
      flex: 1;
      padding: 12px 16px;
      border: 1px solid #e2e8f0;
      border-radius: 24px;
      font-size: 14px;
      outline: none;
      transition: border-color 0.2s;
    }
    .mm-chat-input:focus { border-color: \${PRIMARY_COLOR}; }
    .mm-chat-send {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: \${PRIMARY_COLOR};
      color: white;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.2s;
    }
    .mm-chat-send:hover { filter: brightness(0.9); }
    .mm-chat-send:disabled { background: #cbd5e1; cursor: not-allowed; }
    .mm-chat-welcome {
      text-align: center;
      padding: 40px 20px;
      color: #64748b;
    }
    .mm-chat-welcome h3 {
      color: #1e293b;
      margin: 0 0 8px;
      font-size: 18px;
    }
    .mm-chat-welcome p { margin: 0; font-size: 14px; }
    @media (max-width: 480px) {
      .mm-chat-container {
        width: calc(100vw - 20px);
        height: calc(100vh - 100px);
        bottom: 80px;
        \${POSITION}: 10px;
        border-radius: 12px;
      }
      .mm-chat-bubble { bottom: 15px; \${POSITION}: 15px; }
    }
  \`;

  const chatIcon = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>';
  const closeIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>';
  const sendIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg>';

  function createWidget() {
    const styleEl = document.createElement('style');
    styleEl.textContent = styles;
    document.head.appendChild(styleEl);

    const widget = document.createElement('div');
    widget.className = 'mm-chat-widget';
    widget.innerHTML = \`
      <button class="mm-chat-bubble" aria-label="Open chat">\${chatIcon}</button>
      <div class="mm-chat-container">
        <div class="mm-chat-header">
          <span>\${WIDGET_TITLE}</span>
          <button class="mm-chat-close" aria-label="Close chat">\${closeIcon}</button>
        </div>
        <div class="mm-chat-messages">
          <div class="mm-chat-welcome">
            <h3>Welcome! 👋</h3>
            <p>How can we help you today?</p>
          </div>
        </div>
        <div class="mm-chat-input-container">
          <input type="text" class="mm-chat-input" placeholder="Type your message..." />
          <button class="mm-chat-send" aria-label="Send message">\${sendIcon}</button>
        </div>
      </div>
    \`;
    document.body.appendChild(widget);

    const bubble = widget.querySelector('.mm-chat-bubble');
    const container = widget.querySelector('.mm-chat-container');
    const closeBtn = widget.querySelector('.mm-chat-close');
    const messagesEl = widget.querySelector('.mm-chat-messages');
    const input = widget.querySelector('.mm-chat-input');
    const sendBtn = widget.querySelector('.mm-chat-send');

    function toggleChat() {
      isOpen = !isOpen;
      container.classList.toggle('open', isOpen);
      if (isOpen) input.focus();
    }

    async function sendMessage() {
      const message = input.value.trim();
      if (!message) return;

      input.value = '';
      sendBtn.disabled = true;

      const welcome = messagesEl.querySelector('.mm-chat-welcome');
      if (welcome) welcome.remove();

      addMessage('user', message, false);

      const typingEl = document.createElement('div');
      typingEl.className = 'mm-chat-message assistant typing';
      typingEl.innerHTML = '<span></span><span></span><span></span>';
      messagesEl.appendChild(typingEl);
      scrollToBottom();

      try {
        const response = await fetch(API_URL + '/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message, sessionId }),
        });
        const data = await response.json();
        typingEl.remove();

        if (data.error) {
          addMessage('assistant', 'Sorry, something went wrong. Please try again.', false);
        } else {
          if (data.sessionId) {
            sessionId = data.sessionId;
            localStorage.setItem('mm_chat_session', sessionId);
          }
          addMessage('assistant', data.response, true);
        }
      } catch (error) {
        typingEl.remove();
        addMessage('assistant', 'Sorry, I couldn\\'t connect. Please check your internet connection.', false);
      }

      sendBtn.disabled = false;
      input.focus();
    }

    function addMessage(role, content, format = true) {
      const messageEl = document.createElement('div');
      messageEl.className = 'mm-chat-message ' + role;

      if (format && role === 'assistant') {
        messageEl.innerHTML = formatMessage(content);
      } else {
        messageEl.textContent = content;
      }

      messagesEl.appendChild(messageEl);
      scrollToBottom();
    }

    function scrollToBottom() {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    bubble.addEventListener('click', toggleChat);
    closeBtn.addEventListener('click', toggleChat);
    sendBtn.addEventListener('click', sendMessage);
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createWidget);
  } else {
    createWidget();
  }
})();`;
}
