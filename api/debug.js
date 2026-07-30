module.exports = async function handler(req, res) {
  // Log exactly what Zendesk sends
  res.status(200).json({
    method: req.method,
    headers: req.headers,
    body: req.body,
    query: req.query
  });
};
