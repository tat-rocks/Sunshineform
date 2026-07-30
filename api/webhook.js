const APP_ID = process.env.SUNCO_APP_ID;
const KEY_ID = process.env.SUNCO_KEY_ID;
const SECRET = process.env.SUNCO_SECRET;

function authHeader() {
  return 'Basic ' + Buffer.from(`${KEY_ID}:${SECRET}`).toString('base64');
}

async function getConversationByUser(userId) {
  const res = await fetch(`https://api.smooch.io/v2/apps/${APP_ID}/conversations?userId=${userId}&page%5Bsize%5D=1`, {
    headers: { 'Authorization': authHeader() }
  });
  const data = await res.json();
  return data.conversations?.[0]?.id || null;
}

async function sendAgentForm(conversationId) {
  const res = await fetch(`https://api.smooch.io/v2/apps/${APP_ID}/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: { 'Authorization': authHeader(), 'Content-Type': 'application/json' },
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
  const body = await res.json();
  console.log('Sunco sendForm:', res.status, JSON.stringify(body));
  return { status: res.status, body };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const body = req.body || {};
  console.log('Received:', JSON.stringify(body));

  // Try conversation_id directly, or look up by end_user_id
  let conversationId =
    body.conversation_id ||
    body.conversationId ||
    body.conversation?.id;

  // If conversation_id is unresolved template literal, ignore it
  if (conversationId && conversationId.includes('{{')) conversationId = null;

  if (!conversationId && (body.end_user_id || body.userId)) {
    const userId = body.end_user_id || body.userId;
    console.log('Looking up conversation for user:', userId);
    conversationId = await getConversationByUser(userId);
  }

  console.log('Using conversation_id:', conversationId);

  if (!conversationId) {
    return res.status(200).json({ ok: false, reason: 'no_conversation_id', received: body });
  }

  const result = await sendAgentForm(conversationId);
  res.status(200).json({ ok: result.status === 201, sunco_status: result.status, conversation_id_used: conversationId });
};
