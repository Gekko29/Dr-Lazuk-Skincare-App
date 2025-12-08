// For now, this is a simple in-memory version
// You'll need to connect to a database later (Vercel KV, Supabase, etc.)

const analysisRecords = new Map();

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email } = req.body;
  
  if (!email) {
    return res.status(400).json({ error: 'Email required' });
  }

  const lastAnalysis = analysisRecords.get(email);
  const now = Date.now();
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

  if (lastAnalysis && (now - lastAnalysis) < thirtyDaysMs) {
    const nextAvailable = new Date(lastAnalysis + thirtyDaysMs);
    return res.status(200).json({
      canGenerate: false,
      nextAvailableDate: nextAvailable.toLocaleDateString(),
      message: `You've already generated a report. Please return on ${nextAvailable.toLocaleDateString()}`
    });
  }

  res.status(200).json({ canGenerate: true });
}
