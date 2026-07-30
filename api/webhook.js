const APP_ID = process.env.SUNCO_APP_ID;
const KEY_ID = process.env.SUNCO_KEY_ID;
const SECRET = process.env.SUNCO_SECRET;

function authHeader() {
  return 'Basic ' + Buffer.from(`${KEY_ID}:${SECRET}`).toString('base64');
}

async function sendAgentForm(conversationId) {
  const res = await fetch(`https://api.smooch.io/v2/apps/${APP_ID}/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': authHeader(),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      author: { type: 'business' },
      content: {
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
      }
    })
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('Error sending form:', err);
    return { ok: false, error: err };
  }

  return { ok: true };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  // Accept conversation_id in any common format
  const body = req.body || {};
  const conversationId =
    body.conversation_id ||
    body.conversationId ||
    body.conversation?.id ||
    body.id;

  if (!conversationId) {
    return res.status(400).json({ error: 'conversation_id required' });
  }

  const result = await sendAgentForm(conversationId);

  if (!result.ok) {
    return res.status(500).json({ error: result.error });
  }

  res.status(200).json({ ok: true, message: 'Form sent' });
};
