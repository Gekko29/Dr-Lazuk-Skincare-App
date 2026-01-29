// api/esthetics/voice-conversation.js
// OpenAI Realtime API integration for voice-based Esthetics Concierge
// British English Female voice, conversational flow

export const config = {
  runtime: 'nodejs',
  maxDuration: 300, // 5 minutes max
};

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action, sessionId, audioData, conversationState } = req.body;

  // Action: 'start' | 'send-audio' | 'end'
  
  if (action === 'start') {
    // Initialize OpenAI Realtime session
    return handleStartSession(req, res);
  }
  
  if (action === 'send-audio') {
    // Process audio chunk and get AI response
    return handleAudioChunk(req, res, audioData, conversationState);
  }
  
  if (action === 'end') {
    // End session and return collected data
    return handleEndSession(req, res, sessionId, conversationState);
  }

  return res.status(400).json({ error: 'Invalid action' });
}

async function handleStartSession(req, res) {
  const { firstName, userContext } = req.body;
  
  // Initialize OpenAI Realtime API connection
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    return res.status(500).json({ error: 'OpenAI API key not configured' });
  }

  // Create session
  const sessionId = generateSessionId();
  
  // Initial greeting
  const greeting = `Hi ${firstName || 'there'}, I'm your Lazuk Esthetics AI Concierge. I'm here to understand your aesthetic goals and help create a personalized treatment protocol. This will take about 5 minutes. Shall we begin?`;

  return res.status(200).json({
    ok: true,
    sessionId,
    greeting,
    voiceConfig: {
      model: 'gpt-4o-realtime-preview',
      voice: 'alloy', // British-sounding female voice
      instructions: buildSystemInstructions(firstName),
    }
  });
}

async function handleAudioChunk(req, res, audioData, conversationState) {
  const apiKey = process.env.OPENAI_API_KEY;
  
  try {
    // Send audio to OpenAI Realtime API
    const response = await fetch('https://api.openai.com/v1/realtime/audio', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-realtime-preview',
        voice: 'alloy',
        input_audio: audioData,
        conversation_state: conversationState,
      }),
    });

    const data = await response.json();

    return res.status(200).json({
      ok: true,
      audio: data.output_audio,
      transcript: data.transcript,
      conversationState: data.conversation_state,
    });
  } catch (error) {
    console.error('Voice processing error:', error);
    return res.status(500).json({ 
      ok: false, 
      error: 'Voice processing failed' 
    });
  }
}

async function handleEndSession(req, res, sessionId, conversationState) {
  // Extract answers from conversation state
  const answers = extractAnswersFromConversation(conversationState);
  
  // Send emails (reuse existing complete.js logic)
  const emailPayload = {
    user: req.body.user,
    answers,
    transcript: conversationState.fullTranscript || '',
    protocolSummary: generateProtocolSummary(answers),
  };

  // TODO: Call complete.js logic or send emails here
  
  return res.status(200).json({
    ok: true,
    answers,
    message: 'Session completed successfully'
  });
}

function buildSystemInstructions(firstName) {
  return `You are the Lazuk Esthetics AI Concierge, a professional and warm British English-speaking female consultant in her late 30s to early 40s.

Your personality:
- Professional yet approachable
- Warm and reassuring
- British English accent and phrasing
- Knowledgeable about aesthetic treatments

Your task:
You're conducting a consultation to understand the client's aesthetic goals and create a personalized treatment protocol. Ask these questions one at a time, naturally:

1. "What would you most like to improve or change about your appearance right now? This could be anything from skin texture to body contouring."

2. "Is there anything else you'd like to address during your visit? It's perfectly fine if your primary goal is your main focus."

3. "Are there any treatments or procedures you'd prefer to avoid? For example, some clients prefer to avoid needles, lasers, or treatments with downtime."

4. "How would you describe your approach to treatments? Are you looking for subtle, gradual improvements, or are you comfortable with more intensive procedures?"

5. "Do you have any timing constraints we should know about? For example, upcoming events, travel plans, or limited availability?"

6. "Do you have any specific questions or concerns you'd like to discuss with your esthetic artist during the consultation?"

After collecting all answers:
"${firstName}, thank you for sharing all of that. Based on what you've told me, I'm creating a personalized esthetic protocol for you. This will be reviewed with one of our esthetic artists during your consultation."

Then ask: "Before we finish, is there anything else we can help you with today? Any additional questions or concerns you'd like us to note for your consultation?"

Finally close with:
"${firstName}, we greatly appreciate the opportunity to join you on this exciting journey toward your aesthetic goals. Remember, your personalized protocol is in your inbox, and our team will be reaching out to you soon to schedule your consultation. Thank you for choosing Lazuk Esthetics. Have a wonderful day!"

Important:
- Speak naturally and conversationally
- Listen carefully to their answers
- Show empathy and understanding
- Keep responses concise (2-3 sentences max)
- Use British English phrasing naturally
- Never rush the client
- Pause appropriately between questions
`;
}

function extractAnswersFromConversation(conversationState) {
  // Parse conversation transcript to extract structured answers
  // This would need to be implemented based on OpenAI's response format
  return {
    primary_goal: conversationState.answers?.primary_goal || '',
    secondary_goals: conversationState.answers?.secondary_goals || '',
    treatment_preferences: conversationState.answers?.treatment_preferences || '',
    aggressiveness: conversationState.answers?.aggressiveness || '',
    timeline: conversationState.answers?.timeline || '',
    questions: conversationState.answers?.questions || '',
  };
}

function generateProtocolSummary(answers) {
  return {
    title: "Your Curated Esthetics Protocol",
    narrative: "Based on what you shared, this protocol was designed specifically for you.",
    recommendedPath: [
      "Consultation-first curated plan",
      "Supportive additions based on tolerance and timing"
    ],
    goals: [answers.primary_goal, answers.secondary_goals].filter(Boolean),
  };
}

function generateSessionId() {
  return `voice_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
