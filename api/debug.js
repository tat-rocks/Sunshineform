module.exports = async function handler(req, res) {
  const KEY_ID = process.env.SUNCO_KEY_ID || '';
  const SECRET = process.env.SUNCO_SECRET || '';
  const APP_ID = process.env.SUNCO_APP_ID || '';

  // Test the actual Sunco API call
  const auth = 'Basic ' + Buffer.from(`${KEY_ID}:${SECRET}`).toString('base64');

  const testRes = await fetch(`https://api.smooch.io/v2/apps/${APP_ID}`, {
    headers: { 'Authorization': auth }
  });
  const testBody = await testRes.json();

  res.status(200).json({
    key_id_length: KEY_ID.length,
    secret_length: SECRET.length,
    app_id_length: APP_ID.length,
    sunco_status: testRes.status,
    sunco_response: testBody
  });
};
