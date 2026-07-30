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

  const responseBody = await res.json();
  console.log('Sunco response:', res.status, JSON.stringify(responseBody));
  return { status: res.status, body: responseBody };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const body = req.body || {};
  console.log('Received body:', JSON.stringify(body));

  const conversationId =
    body.conversation_id ||
    body.conversationId ||
    body.conversation?.id ||
    body.id;

  console.log('Resolved conversation_id:', conversationId);

  if (!conversationId) {
    // Return 200 so Zendesk doesn't mark as Failure, but log the issue
    console.error('No conversation_id found in body:', JSON.stringify(body));
    return res.status(200).json({ ok: false, reason: 'no_conversation_id', received: body });
  }

  const result = await sendAgentForm(conversationId);

  // Always return 200 to Zendesk
  res.status(200).json({ ok: result.status === 201, sunco_status: result.status });
};
