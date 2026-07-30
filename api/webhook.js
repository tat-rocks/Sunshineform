const APP_ID = process.env.SUNCO_APP_ID;
const KEY_ID = process.env.SUNCO_KEY_ID;
const SECRET = process.env.SUNCO_SECRET;

const AGENT_KEYWORDS = ['agente', 'humano', 'persona', 'operador', 'asesor', 'hablar con'];

function authHeader() {
  return 'Basic ' + Buffer.from(`${KEY_ID}:${SECRET}`).toString('base64');
}

async function sendMessage(conversationId, content) {
  const res = await fetch(`https://api.smooch.io/v2/apps/${APP_ID}/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: { 'Authorization': authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ author: { type: 'business' }, content })
  });
  if (!res.ok) console.error('sendMessage error:', await res.text());
}

async function sendAgentForm(conversationId) {
  return sendMessage(conversationId, {
    type: 'form',
    blockChatInput: true,
    fields: [
      {
        type: 'text',
        name: 'name',
        label: 'Nombre',
        placeholder: 'Tu nombre completo',
        minSize: 1,
        maxSize: 100
      },
      {
        type: 'email',
        name: 'email',
        label: 'Email',
        placeholder: 'tu@email.com'
      }
    ],
    submitLabel: 'Conectar con un agente'
  });
}

async function updateUser(userId, name, email) {
  const res = await fetch(`https://api.smooch.io/v2/apps/${APP_ID}/users/${userId}`, {
    method: 'PATCH',
    headers: { 'Authorization': authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email })
  });
  if (!res.ok) console.error('updateUser error:', await res.text());
}

async function passToAgent(conversationId) {
  const res = await fetch(`https://api.smooch.io/v2/apps/${APP_ID}/conversations/${conversationId}/passControl`, {
    method: 'POST',
    headers: { 'Authorization': authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ switchboardIntegration: 'zd-agentWorkspace' })
  });
  if (!res.ok) console.error('passToAgent error:', await res.text());
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { events = [] } = req.body || {};

  for (const event of events) {
    const { type, payload } = event;

    if (type === 'conversation:message') {
      const { conversation, message } = payload;
      const { id: convId } = conversation;
      const { author, content } = message;

      if (author.type !== 'user') continue;

      // Form submitted
      if (content.type === 'formResponse') {
        const name = content.fields?.find(f => f.name === 'name')?.value || '';
        const email = content.fields?.find(f => f.name === 'email')?.value || '';

        await updateUser(author.userId, name, email);
        await sendMessage(convId, {
          type: 'text',
          text: `Gracias ${name}. Un agente se pondrá en contacto contigo en breve.`
        });
        await passToAgent(convId);
        continue;
      }

      // User requests agent via text
      const text = (content.text || '').toLowerCase();
      const wantsAgent = AGENT_KEYWORDS.some(kw => text.includes(kw));
      if (wantsAgent) await sendAgentForm(convId);
    }

    // Postback (button del bot flow)
    if (type === 'conversation:postback') {
      const { conversation, postback } = payload;
      const payload_str = (postback.payload || '').toUpperCase();
      if (payload_str.includes('AGENT') || payload_str.includes('AGENTE')) {
        await sendAgentForm(conversation.id);
      }
    }
  }

  res.status(200).json({ ok: true });
};
