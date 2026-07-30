// Receives Zendesk trigger when a new message arrives on a ticket
// Looks for formResponse data and updates the ticket requester

const ZD_SUBDOMAIN = 'pdi-omycare';
const ZD_EMAIL = process.env.ZD_EMAIL;
const ZD_TOKEN = process.env.ZD_TOKEN;

function zdAuth() {
  return 'Basic ' + Buffer.from(`${ZD_EMAIL}/token:${ZD_TOKEN}`).toString('base64');
}

async function findOrCreateUser(name, email) {
  // Search for existing user
  const searchRes = await fetch(`https://${ZD_SUBDOMAIN}.zendesk.com/api/v2/users/search?query=${encodeURIComponent(email)}`, {
    headers: { 'Authorization': zdAuth() }
  });
  const searchData = await searchRes.json();
  const existing = searchData.users?.[0];
  if (existing) {
    // Update name if needed
    if (existing.name !== name) {
      await fetch(`https://${ZD_SUBDOMAIN}.zendesk.com/api/v2/users/${existing.id}`, {
        method: 'PUT',
        headers: { 'Authorization': zdAuth(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: { name } })
      });
    }
    return existing.id;
  }

  // Create new user
  const createRes = await fetch(`https://${ZD_SUBDOMAIN}.zendesk.com/api/v2/users`, {
    method: 'POST',
    headers: { 'Authorization': zdAuth(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ user: { name, email, role: 'end-user' } })
  });
  const createData = await createRes.json();
  return createData.user?.id;
}

async function updateTicketRequester(ticketId, userId) {
  const res = await fetch(`https://${ZD_SUBDOMAIN}.zendesk.com/api/v2/tickets/${ticketId}`, {
    method: 'PUT',
    headers: { 'Authorization': zdAuth(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticket: { requester_id: userId } })
  });
  const data = await res.json();
  console.log('Update ticket:', res.status, JSON.stringify(data?.ticket?.id));
  return res.status;
}

function extractFormResponse(commentBody) {
  // formResponse appears in ticket comments as JSON or text
  // Try parsing JSON first
  try {
    const parsed = JSON.parse(commentBody);
    if (parsed.fields || parsed.name || parsed.email) return parsed;
  } catch (_) {}

  // Try extracting from text patterns
  const nameMatch = commentBody.match(/[Nn]ombre[:\s]+([^\n,]+)/);
  const emailMatch = commentBody.match(/[Ee]mail[:\s]+([^\s\n,]+@[^\s\n,]+)/);

  if (nameMatch || emailMatch) {
    return {
      name: nameMatch?.[1]?.trim(),
      email: emailMatch?.[1]?.trim()
    };
  }
  return null;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const body = req.body || {};
  console.log('Ticket trigger received:', JSON.stringify(body).slice(0, 500));

  const ticketId = body.ticket_id;
  const commentBody = body.comment_body || '';

  if (!ticketId) {
    return res.status(200).json({ ok: false, reason: 'no ticket_id' });
  }

  const formData = extractFormResponse(commentBody);

  if (!formData) {
    // Not a form response, ignore
    return res.status(200).json({ ok: true, action: 'ignored', reason: 'not a form response' });
  }

  const { name, email } = formData;

  if (!email) {
    return res.status(200).json({ ok: false, reason: 'no email in form data', received: formData });
  }

  const userId = await findOrCreateUser(name || 'Unknown', email);
  if (!userId) {
    return res.status(200).json({ ok: false, reason: 'could not find/create user' });
  }

  const updateStatus = await updateTicketRequester(ticketId, userId);
  res.status(200).json({ ok: updateStatus < 300, ticket_id: ticketId, user_id: userId, name, email });
};
