// Same in-memory storage (replace with database later)
const analysisRecords = new Map();

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email } = req.body;
  
  if (!email) {
    return res.status(400).json({ error: 'Email required' });
  }

  analysisRecords.set(email, Date.now());
  
  res.status(200).json({ success: true });
}
