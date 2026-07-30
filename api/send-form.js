// Called by Zendesk bot integration OR Zendesk trigger
// Finds the conversation via Zendesk API and sends the Sunco form

const ZD_SUBDOMAIN = 'pdi-omycare';
const ZD_EMAIL = process.env.ZD_EMAIL;
const ZD_TOKEN = process.env.ZD_TOKEN;
const APP_ID = process.env.SUNCO_APP_ID;
const KEY_ID = process.env.SUNCO_KEY_ID;
const SECRET = process.env.SUNCO_SECRET;

function zdAuth() {
  return 'Basic ' + Buffer.from(`${ZD_EMAIL}/token:${ZD_TOKEN}`).toString('base64');
}

function suncoAuth() {
  return 'Basic ' + Buffer.from(`${KEY_ID}:${SECRET}`).toString('base64');
}

async function getSuncoConversationId(zdRequesterId) {
  // Get Zendesk user to extract Sunco user ID from name
  const userRes = await fetch(`https://${ZD_SUBDOMAIN}.zendesk.com/api/v2/users/${zdRequesterId}.json`, {
    headers: { 'Authorization': zdAuth() }
  });
  const userData = await userRes.json();
  const userName = userData.user?.name || '';
  console.log('User name:', userName);

  // Extract Sunco user ID — format: "Web User {suncoId}"
  const match = userName.match(/Web User ([a-f0-9]{24})/i);
  if (!match) return null;

  const suncoUserId = match[1];
  console.log('Sunco user ID:', suncoUserId);

  // Get conversation ID from Sunco user metadata
  const suncoRes = await fetch(`https://api.smooch.io/v2/apps/${APP_ID}/users/${suncoUserId}`, {
    headers: { 'Authorization': suncoAuth() }
  });
  const suncoData = await suncoRes.json();
  const conversationId = suncoData.user?.metadata?.conversationId;
  console.log('Conversation ID:', conversationId);

  return conversationId || null;
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
  const body = await res.json();
  console.log('Sunco send form:', res.status);
  return res.status;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const body = req.body || {};
  console.log('send-form received:', JSON.stringify(body).slice(0, 300));

  const requesterId = body.requester_id || body.requesterId;

  if (!requesterId) {
    return res.status(200).json({ ok: false, reason: 'no requester_id' });
  }

  const conversationId = await getSuncoConversationId(requesterId);

  if (!conversationId) {
    return res.status(200).json({ ok: false, reason: 'conversation not found', requester_id: requesterId });
  }

  const status = await sendAgentForm(conversationId);
  res.status(200).json({ ok: status === 201, sunco_status: status, conversation_id: conversationId });
};
