const APP_ID = process.env.SUNCO_APP_ID;
const KEY_ID = process.env.SUNCO_KEY_ID;
const SECRET = process.env.SUNCO_SECRET;
const ZD_SUBDOMAIN = 'pdi-omycare';
const ZD_EMAIL = process.env.ZD_EMAIL;
const ZD_TOKEN = process.env.ZD_TOKEN;

function suncoAuth() {
  return 'Basic ' + Buffer.from(`${KEY_ID}:${SECRET}`).toString('base64');
}
function zdAuth() {
  return 'Basic ' + Buffer.from(`${ZD_EMAIL}/token:${ZD_TOKEN}`).toString('base64');
}

const AGENT_KEYWORDS = ['agente', 'agent', 'human', 'humano', 'persona', 'operador', 'hablar con'];

// Dedup: track conversations where form was recently sent (expires after 60s)
const recentForms = new Map();
function formAlreadySent(convId) {
  const ts = recentForms.get(convId);
  if (ts && Date.now() - ts < 60000) return true;
  recentForms.set(convId, Date.now());
  return false;
}

async function sendAgentForm(conversationId) {
  const res = await fetch(`https://api.smooch.io/v2/apps/${APP_ID}/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: { 'Authorization': suncoAuth(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      author: { type: 'business' },
      content: {
        type: 'form',
        blockChatInput: true,
        fields: [
          { type: 'text',  name: 'name',  label: 'Nombre', placeholder: 'Tu nombre completo', minSize: 1, maxSize: 100 },
          { type: 'email', name: 'email', label: 'Email',  placeholder: 'tu@email.com' }
        ],
        submitLabel: 'Conectar con un agente'
      }
    })
  });
  console.log('sendAgentForm:', res.status);
  return res.status;
}

async function sendMessage(conversationId, text) {
  await fetch(`https://api.smooch.io/v2/apps/${APP_ID}/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: { 'Authorization': suncoAuth(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ author: { type: 'business' }, content: { type: 'text', text } })
  });
}

async function passControlToAgent(conversationId) {
  const res = await fetch(`https://api.smooch.io/v2/apps/${APP_ID}/conversations/${conversationId}/passControl`, {
    method: 'POST',
    headers: { 'Authorization': suncoAuth(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ switchboardIntegration: 'zd-agentWorkspace' })
  });
  console.log('passControl:', res.status);
}

async function updateSuncoUser(userId, name, email) {
  await fetch(`https://api.smooch.io/v2/apps/${APP_ID}/users/${userId}`, {
    method: 'PATCH',
    headers: { 'Authorization': suncoAuth(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email })
  });
  console.log('Updated Sunco user:', userId, name, email);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const body = req.body || {};

  // Called by Zendesk bot integration (no conversation_id available — just ack)
  if (!body.events) {
    console.log('Bot integration call — no events, ignoring');
    return res.status(200).json({ ok: true });
  }

  // Called by Sunco webhook with real events
  for (const event of body.events) {
    const { type, payload } = event;
    console.log('Event:', type, JSON.stringify(payload).slice(0, 200));

    if (type === 'conversation:message') {
      const { conversation, message } = payload;
      const convId = conversation.id;
      const { author, content } = message;

      if (author.type !== 'user') continue;

      // User submitted the form
      if (content.type === 'formResponse') {
        const messageAge = Date.now() - new Date(message.received).getTime();
        if (messageAge > 120000) {
          console.log('Ignoring stale formResponse (age:', Math.round(messageAge / 1000), 's)');
          continue;
        }
        const name  = content.fields?.find(f => f.name === 'name')?.value  || '';
        const email = content.fields?.find(f => f.name === 'email')?.value || '';
        console.log('Form submitted:', name, email, 'conv:', convId);
        if (author.userId) await updateSuncoUser(author.userId, name, email);
        await sendMessage(convId, 'Thank you. An agent will be in touch with you shortly.');
        await passControlToAgent(convId);
        continue;
      }

      // User requested an agent via text
      const text = (content.text || '').toLowerCase();
      if (AGENT_KEYWORDS.some(kw => text.includes(kw)) && !formAlreadySent(convId)) {
        await sendAgentForm(convId);
      }
    }

    // User clicked a button (postback)
    if (type === 'conversation:postback') {
      const { conversation, postback } = payload;
      console.log('Postback:', postback.payload, 'conv:', conversation.id);
      const p = (postback.payload || '').toLowerCase();
      if ((p.includes('agent') || p.includes('contact') || p.includes('human')) && !formAlreadySent(conversation.id)) {
        await sendAgentForm(conversation.id);
      }
    }
  }

  res.status(200).json({ ok: true });
};
