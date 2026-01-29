// ConversationalConcierge.jsx
// Premium conversational interface for Lazuk Esthetics Concierge
import React, { useState, useEffect, useRef } from 'react';
import { MessageCircle, Mic, Send, Loader, Sparkles, Check } from 'lucide-react';

// Conversation questions
const QUESTIONS = [
  {
    id: 'primary_goal',
    text: "What would you most like to improve or change about your appearance right now? This could be anything from skin texture to body contouring.",
    type: 'text'
  },
  {
    id: 'secondary_goals',
    text: "Is there anything else you'd like to address during your visit? It's okay if your primary goal is your main focus.",
    type: 'text',
    optional: true
  },
  {
    id: 'treatment_preferences',
    text: "Are there any treatments or procedures you'd prefer to avoid? For example, some clients prefer to avoid needles, lasers, or treatments with downtime.",
    type: 'text',
    optional: true
  },
  {
    id: 'aggressiveness',
    text: "How would you describe your approach to treatments? Are you looking for subtle, gradual improvements, or are you comfortable with more intensive procedures?",
    type: 'text'
  },
  {
    id: 'timeline',
    text: "Do you have any timing constraints we should know about? For example, upcoming events, travel plans, or limited availability?",
    type: 'text',
    optional: true
  },
  {
    id: 'questions',
    text: "Do you have any specific questions or concerns you'd like to discuss with your provider during the consultation?",
    type: 'text',
    optional: true
  }
];

export default function ConversationalConcierge({ 
  analysisReport, 
  userContext 
}) {
  const [mode, setMode] = useState(null); // null | 'text' | 'voice'
  const [stage, setStage] = useState('intro'); // intro | conversation | processing | complete
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [messages, setMessages] = useState([]);
  const [userInput, setUserInput] = useState('');
  const [answers, setAnswers] = useState({});
  const [isTyping, setIsTyping] = useState(false);
  const [finalQuestion, setFinalQuestion] = useState(false);
  
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const addMessage = (text, sender, delay = 0) => {
    setTimeout(() => {
      setMessages(prev => [...prev, { text, sender, timestamp: Date.now() }]);
      setIsTyping(false);
    }, delay);
  };

  const startConversation = (selectedMode) => {
    setMode(selectedMode);
    setStage('conversation');
    
    const firstName = userContext?.firstName || "there";
    
    // Welcome message
    addMessage(
      `Hi ${firstName}, I'm your Lazuk Esthetics AI Concierge. I'm here to understand your aesthetic goals and help create a personalized treatment protocol. This will take about 5 minutes. Shall we begin?`,
      'ai',
      500
    );

    // First question
    setTimeout(() => {
      addMessage(QUESTIONS[0].text, 'ai', 1500);
    }, 2000);
  };

  const handleSubmit = (e) => {
    e?.preventDefault();
    if (!userInput.trim()) return;

    const currentQuestion = QUESTIONS[currentQuestionIndex];
    
    // Add user message
    addMessage(userInput, 'user');
    
    // Store answer
    setAnswers(prev => ({
      ...prev,
      [currentQuestion.id]: userInput
    }));

    setUserInput('');
    setIsTyping(true);

    // Move to next question or finish
    if (currentQuestionIndex < QUESTIONS.length - 1) {
      const nextIndex = currentQuestionIndex + 1;
      setCurrentQuestionIndex(nextIndex);
      
      // Add next question
      setTimeout(() => {
        addMessage(QUESTIONS[nextIndex].text, 'ai', 1000);
      }, 1500);
    } else {
      // Conversation complete - move to protocol generation
      setTimeout(() => {
        generateProtocol();
      }, 1000);
    }
  };

  const generateProtocol = () => {
    const firstName = userContext?.firstName || "there";
    
    setIsTyping(true);
    addMessage(
      `${firstName}, thank you for sharing all of that. Based on what you've told me, I'm creating a personalized esthetic protocol for you. This will be reviewed with one of our esthetic artists during your consultation. Give me just a moment to finalize your recommendations...`,
      'ai',
      500
    );

    setTimeout(() => {
      setStage('processing');
      
      // Simulate protocol generation
      setTimeout(() => {
        showProtocol();
      }, 3000);
    }, 2000);
  };

  const showProtocol = () => {
    // Skip to complete stage with exit screen
    setStage('complete');
    setIsTyping(false);
    setFinalQuestion(false);
  };

  const handleFinalResponse = (e) => {
    e?.preventDefault();
    if (!userInput.trim()) return;

    const firstName = userContext?.firstName || "there";
    
    addMessage(userInput, 'user');
    setUserInput('');
    setIsTyping(true);

    if (userInput.trim().toLowerCase() === 'no' || userInput.trim().toLowerCase() === 'nothing' || userInput.trim().toLowerCase() === 'no thanks') {
      // No additional questions
      setTimeout(() => {
        addMessage(
          `${firstName}, we greatly appreciate the opportunity to join you on this exciting journey toward your aesthetic goals.\n\nRemember, your personalized protocol is in your inbox, and our team will be reaching out to you soon to schedule your consultation.\n\nThank you for choosing Lazuk Esthetics. Have a wonderful day!`,
          'ai',
          1000
        );
        setFinalQuestion(false);
        setIsTyping(false);
      }, 1500);
    } else {
      // They have additional questions
      setTimeout(() => {
        addMessage(
          "Thank you for sharing that. I've made a note, and we'll be sure to address this during your consultation with your esthetic artist.",
          'ai',
          1000
        );
        
        setTimeout(() => {
          addMessage(
            `${firstName}, we greatly appreciate the opportunity to join you on this exciting journey toward your aesthetic goals.\n\nRemember, your personalized protocol is in your inbox, and our team will be reaching out to you soon to schedule your consultation.\n\nThank you for choosing Lazuk Esthetics. Have a wonderful day!`,
            'ai',
            2000
          );
          setFinalQuestion(false);
          setIsTyping(false);
        }, 2500);
      }, 1500);
    }
  };

  // Mode selection screen
  if (!mode) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
        <div className="max-w-4xl mx-auto px-4 py-16">
          {/* Header */}
          <div className="text-center mb-12">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 text-white mb-6 shadow-xl">
              <Sparkles size={40} />
            </div>
            <h1 className="text-4xl font-extrabold text-gray-900 mb-4">
              The Esthetics Suite
            </h1>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Your Personal AI Concierge for Customized Esthetic Protocols
            </p>
          </div>

          {/* Mode Selection Cards */}
          <div className="grid md:grid-cols-2 gap-6 mb-12">
            {/* Text Chat Option */}
            <button
              onClick={() => startConversation('text')}
              className="group relative bg-white border-2 border-gray-200 rounded-2xl p-8 hover:border-blue-500 hover:shadow-xl transition-all duration-300 text-left"
            >
              <div className="absolute top-6 right-6 w-12 h-12 rounded-full bg-blue-100 group-hover:bg-blue-500 flex items-center justify-center transition-colors">
                <MessageCircle className="text-blue-600 group-hover:text-white transition-colors" size={24} />
              </div>
              
              <h3 className="text-2xl font-bold text-gray-900 mb-3 pr-16">
                Text Chat
              </h3>
              <p className="text-gray-600 mb-4">
                Type your responses in a conversational chat interface. Perfect for those who prefer to take their time.
              </p>
              <ul className="space-y-2 text-sm text-gray-600">
                <li className="flex items-center gap-2">
                  <Check size={16} className="text-green-500" />
                  <span>Take your time to think</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check size={16} className="text-green-500" />
                  <span>Easy to review and edit</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check size={16} className="text-green-500" />
                  <span>5-7 minutes</span>
                </li>
              </ul>
              
              <div className="mt-6 inline-flex items-center gap-2 text-blue-600 font-semibold group-hover:gap-3 transition-all">
                <span>Start Chat</span>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>

            {/* Voice Chat Option */}
            <button
              onClick={() => startConversation('voice')}
              className="group relative bg-gradient-to-br from-blue-600 to-indigo-600 text-white rounded-2xl p-8 hover:shadow-2xl transition-all duration-300 text-left"
            >
              <div className="absolute top-6 right-6 w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <Mic className="text-white" size={24} />
              </div>
              
              <h3 className="text-2xl font-bold mb-3 pr-16">
                Voice Conversation
              </h3>
              <p className="text-blue-100 mb-4">
                Have a natural, real-time conversation with your AI Concierge. Speak naturally and get instant responses.
              </p>
              <ul className="space-y-2 text-sm text-blue-100">
                <li className="flex items-center gap-2">
                  <Check size={16} className="text-white" />
                  <span>Natural conversation</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check size={16} className="text-white" />
                  <span>Real-time responses</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check size={16} className="text-white" />
                  <span>3-5 minutes</span>
                </li>
              </ul>
              
              <div className="mt-6 inline-flex items-center gap-2 text-white font-semibold group-hover:gap-3 transition-all">
                <span>Start Voice Chat</span>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>
          </div>

          {/* Info Box */}
          <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-6">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-blue-200 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-blue-700" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd"/>
                </svg>
              </div>
              <div className="flex-1">
                <h4 className="font-bold text-gray-900 mb-2">What to Expect</h4>
                <p className="text-sm text-gray-700 leading-relaxed">
                  Your AI Concierge will ask you about your aesthetic goals, preferences, and any constraints. Based on your responses, we'll create a personalized treatment protocol that will be reviewed with one of our esthetic artists during your consultation. This is not a diagnosis or booking—it's a curated conversation to prepare for your visit.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Voice mode (placeholder for OpenAI integration)
  if (mode === 'voice') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center p-4">
        <div className="max-w-2xl w-full bg-white rounded-3xl p-12 text-center shadow-2xl">
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center mx-auto mb-8 animate-pulse">
            <Mic className="text-white" size={40} />
          </div>
          
          <h2 className="text-3xl font-extrabold text-gray-900 mb-4">
            Voice Conversation Mode
          </h2>
          
          <p className="text-gray-600 mb-8">
            Voice conversation with OpenAI Realtime API will be integrated here.
            Your AI Concierge will speak with you naturally in real-time.
          </p>
          
          <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-6 mb-8">
            <p className="text-sm text-gray-700">
              <strong className="text-blue-900">Coming Soon:</strong> Real-time voice conversation powered by OpenAI. 
              For now, please use the text chat option.
            </p>
          </div>
          
          <button
            onClick={() => setMode(null)}
            className="px-8 py-3 bg-gray-900 text-white font-semibold rounded-xl hover:bg-gray-800 transition-colors"
          >
            Back to Mode Selection
          </button>
        </div>
      </div>
    );
  }

  // Text conversation mode
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Chat Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <Sparkles className="text-white" size={24} />
              </div>
              <div>
                <h2 className="text-xl font-bold">Lazuk Esthetics AI Concierge</h2>
                <p className="text-sm text-blue-100">Your Personal Protocol Designer</p>
              </div>
            </div>
            
            {stage === 'conversation' && (
              <div className="text-sm text-blue-100">
                Question {currentQuestionIndex + 1} of {QUESTIONS.length}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Messages Container */}
      <div className="max-w-4xl mx-auto px-4 py-6 pb-32">
        <div className="space-y-4">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-6 py-4 ${
                  message.sender === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white border-2 border-gray-200 text-gray-900'
                }`}
              >
                <p className="text-sm leading-relaxed whitespace-pre-line">
                  {message.text}
                </p>
              </div>
            </div>
          ))}
          
          {isTyping && (
            <div className="flex justify-start">
              <div className="bg-white border-2 border-gray-200 rounded-2xl px-6 py-4">
                <div className="flex gap-2">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                </div>
              </div>
            </div>
          )}
          
          {stage === 'processing' && (
            <div className="flex justify-center py-8">
              <div className="text-center">
                <Loader className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
                <p className="text-gray-600 font-medium">Creating your personalized protocol...</p>
              </div>
            </div>
          )}

          {/* EXIT SCREEN - After all questions complete */}
          {stage === 'complete' && (
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200 rounded-2xl p-6 sm:p-8 mx-4 sm:mx-6 my-6">
              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500 mb-4">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 mb-2">
                  Thank You! We've Captured Your Goals
                </h2>
                <p className="text-sm sm:text-base text-gray-600">
                  Here's what you shared with us:
                </p>
              </div>

              <div className="bg-white rounded-xl p-4 sm:p-6 mb-6 border border-gray-200">
                <h3 className="font-bold text-gray-900 mb-4">Your Responses:</h3>
                <div className="space-y-3">
                  {Object.entries(answers).map(([key, value], idx) => (
                    <div key={key} className="text-sm">
                      <span className="font-semibold text-blue-600">Q{idx + 1}:</span>{' '}
                      <span className="text-gray-700">{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mb-4">
                <h3 className="text-xl font-bold text-gray-900 text-center mb-4">What's Next?</h3>
                <p className="text-sm text-gray-600 text-center mb-6">
                  Choose how you'd like to proceed:
                </p>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <button
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent('switchToServicesTab'));
                  }}
                  className="bg-white border-2 border-blue-600 text-blue-600 hover:bg-blue-50 font-bold py-4 px-6 rounded-xl transition-all duration-200 flex items-center justify-center gap-2 text-center"
                  type="button"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  <span>View Our Services</span>
                </button>

                <a
                  href="mailto:contact@skindoctor.ai?subject=Esthetics Consultation Request&body=I'd like to schedule a consultation for esthetic services."
                  className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold py-4 px-6 rounded-xl transition-all duration-200 flex items-center justify-center gap-2 text-center shadow-md hover:shadow-lg"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <span>Request Consultation</span>
                </a>
              </div>

              <div className="mt-6 text-center">
                <p className="text-xs text-gray-500">
                  Email us to schedule your visit - we'll respond within 24 hours
                </p>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      {(stage === 'conversation' || finalQuestion) && !isTyping && stage !== 'processing' && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t-2 border-gray-200 shadow-lg">
          <div className="max-w-4xl mx-auto px-4 py-4">
            <form onSubmit={finalQuestion ? handleFinalResponse : handleSubmit} className="flex gap-3">
              <input
                ref={inputRef}
                type="text"
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                placeholder="Type your response..."
                className="flex-1 px-6 py-4 border-2 border-gray-300 rounded-xl focus:outline-none focus:border-blue-500 text-base"
                autoFocus
              />
              <button
                type="submit"
                disabled={!userInput.trim()}
                className="px-8 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-xl hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center gap-2"
              >
                <span>Send</span>
                <Send size={20} />
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
