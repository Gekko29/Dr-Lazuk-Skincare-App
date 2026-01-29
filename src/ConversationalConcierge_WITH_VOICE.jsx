// ConversationalConcierge_WITH_VOICE.jsx
// Replace your ConversationalConcierge.jsx with this version
// This includes the voice conversation integration

import React, { useState, useEffect, useRef } from 'react';
import { MessageCircle, Mic, Send, Loader, Sparkles, Check, MicOff } from 'lucide-react';
import useVoiceConversation from './hooks/useVoiceConversation';

// ... [Keep all the QUESTIONS array and conversation flow from before] ...

export default function ConversationalConcierge({ 
  analysisReport, 
  userContext 
}) {
  const [mode, setMode] = useState(null); // null | 'text' | 'voice'
  
  // Voice conversation hook
  const {
    isConnected: voiceConnected,
    isListening: voiceListening,
    isSpeaking: voiceSpeaking,
    transcript: voiceTranscript,
    error: voiceError,
    startConversation: startVoiceConversation,
    endConversation: endVoiceConversation,
  } = useVoiceConversation({
    firstName: userContext?.firstName,
    onComplete: (answers) => {
      console.log('Voice conversation completed:', answers);
      // Handle completion
    }
  });

  // ... [Keep all the existing text conversation state and logic] ...

  const startConversation = (selectedMode) => {
    setMode(selectedMode);
    
    if (selectedMode === 'voice') {
      // Start voice conversation
      startVoiceConversation();
    } else {
      // Start text conversation (existing logic)
      setStage('conversation');
      const firstName = userContext?.firstName || "there";
      addMessage(
        `Hi ${firstName}, I'm your Lazuk Esthetics AI Concierge...`,
        'ai',
        500
      );
      // ... rest of text logic
    }
  };

  // ... [Keep all existing mode selection screen code] ...

  // Voice mode - REAL implementation
  if (mode === 'voice') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-600 via-indigo-600 to-blue-600">
        <div className="max-w-4xl mx-auto px-4 py-16">
          <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-8 py-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                    <Mic className="text-white" size={24} />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold">Voice Conversation</h2>
                    <p className="text-sm text-purple-100">Speaking with your AI Concierge</p>
                  </div>
                </div>
                
                {voiceConnected && (
                  <div className="flex items-center gap-2 text-sm">
                    <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                    <span>Connected</span>
                  </div>
                )}
              </div>
            </div>

            {/* Voice Visualizer */}
            <div className="px-8 py-12 bg-gradient-to-br from-purple-50 to-indigo-50">
              <div className="flex flex-col items-center justify-center">
                {/* Animated microphone */}
                <div className={`relative w-32 h-32 rounded-full flex items-center justify-center mb-8 ${
                  voiceListening ? 'bg-gradient-to-br from-red-500 to-pink-500 animate-pulse' :
                  voiceSpeaking ? 'bg-gradient-to-br from-blue-500 to-indigo-500 animate-pulse' :
                  'bg-gradient-to-br from-purple-500 to-indigo-500'
                } shadow-2xl`}>
                  {voiceListening ? (
                    <Mic className="text-white" size={48} />
                  ) : voiceSpeaking ? (
                    <Loader className="text-white animate-spin" size={48} />
                  ) : (
                    <Mic className="text-white" size={48} />
                  )}
                </div>

                {/* Status */}
                <div className="text-center mb-8">
                  {!voiceConnected && (
                    <>
                      <h3 className="text-2xl font-bold text-gray-900 mb-2">
                        Ready to Start
                      </h3>
                      <p className="text-gray-600">
                        Click the button below to begin your voice consultation
                      </p>
                    </>
                  )}
                  
                  {voiceListening && (
                    <>
                      <h3 className="text-2xl font-bold text-gray-900 mb-2">
                        Listening...
                      </h3>
                      <p className="text-gray-600">
                        I'm listening to your response
                      </p>
                    </>
                  )}
                  
                  {voiceSpeaking && (
                    <>
                      <h3 className="text-2xl font-bold text-gray-900 mb-2">
                        Speaking...
                      </h3>
                      <p className="text-gray-600">
                        Your AI Concierge is responding
                      </p>
                    </>
                  )}
                </div>

                {/* Controls */}
                <div className="flex gap-4">
                  {!voiceConnected ? (
                    <button
                      onClick={startVoiceConversation}
                      className="px-8 py-4 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold rounded-xl hover:from-purple-700 hover:to-indigo-700 shadow-lg hover:shadow-xl transition-all flex items-center gap-3"
                    >
                      <Mic size={24} />
                      <span>Start Voice Conversation</span>
                    </button>
                  ) : (
                    <button
                      onClick={endVoiceConversation}
                      className="px-8 py-4 bg-gradient-to-r from-red-600 to-pink-600 text-white font-bold rounded-xl hover:from-red-700 hover:to-pink-700 shadow-lg hover:shadow-xl transition-all flex items-center gap-3"
                    >
                      <MicOff size={24} />
                      <span>End Conversation</span>
                    </button>
                  )}
                </div>

                {voiceError && (
                  <div className="mt-6 bg-red-50 border-2 border-red-200 rounded-xl p-4">
                    <p className="text-red-800 text-sm">{voiceError}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Transcript */}
            {voiceTranscript.length > 0 && (
              <div className="px-8 py-6 bg-white border-t border-gray-200">
                <h4 className="text-sm font-bold text-gray-600 uppercase tracking-wide mb-4">
                  Conversation Transcript
                </h4>
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {voiceTranscript.map((item, idx) => (
                    <div key={idx} className="flex gap-3">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-xs font-bold text-purple-600">
                        {item.sender === 'user' ? 'You' : 'AI'}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm text-gray-700">{item.text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Back button */}
            <div className="px-8 py-6 bg-gray-50 border-t border-gray-200">
              <button
                onClick={() => setMode(null)}
                className="text-gray-600 hover:text-gray-900 font-semibold"
              >
                ← Back to Mode Selection
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ... [Keep all existing text conversation code] ...
}
