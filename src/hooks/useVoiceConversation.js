// useVoiceConversation.js
// React hook for OpenAI Realtime API voice conversation
// Put this in src/hooks/ folder

import { useState, useRef, useCallback } from 'react';

export default function useVoiceConversation({ firstName, onComplete }) {
  const [isConnected, setIsConnected] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState([]);
  const [error, setError] = useState(null);
  
  const mediaRecorderRef = useRef(null);
  const audioContextRef = useRef(null);
  const audioChunksRef = useRef([]);
  const conversationStateRef = useRef(null);
  const sessionIdRef = useRef(null);

  // Start voice conversation
  const startConversation = useCallback(async () => {
    try {
      setError(null);
      
      // Request microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Initialize session with backend
      const response = await fetch('/api/esthetics/voice-conversation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start',
          firstName,
        }),
      });

      const data = await response.json();
      
      if (!data.ok) {
        throw new Error('Failed to start session');
      }

      sessionIdRef.current = data.sessionId;
      setIsConnected(true);

      // Play initial greeting
      await playAudioResponse(data.greeting);

      // Set up media recorder
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = async (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
          
          // Send audio chunk to backend
          await sendAudioChunk(event.data);
        }
      };

      mediaRecorder.start(1000); // Collect audio every 1 second
      setIsListening(true);

    } catch (err) {
      console.error('Voice conversation error:', err);
      setError(err.message || 'Failed to start voice conversation');
    }
  }, [firstName]);

  // Send audio chunk to backend
  const sendAudioChunk = async (audioBlob) => {
    try {
      const base64Audio = await blobToBase64(audioBlob);

      const response = await fetch('/api/esthetics/voice-conversation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send-audio',
          sessionId: sessionIdRef.current,
          audioData: base64Audio,
          conversationState: conversationStateRef.current,
        }),
      });

      const data = await response.json();

      if (data.ok) {
        // Update conversation state
        conversationStateRef.current = data.conversationState;
        
        // Add transcript
        if (data.transcript) {
          setTranscript(prev => [...prev, data.transcript]);
        }

        // Play AI response
        if (data.audio) {
          await playAudioResponse(data.audio);
        }
      }
    } catch (err) {
      console.error('Audio chunk error:', err);
    }
  };

  // Play audio response
  const playAudioResponse = async (audioData) => {
    setIsSpeaking(true);
    
    try {
      // Convert base64 to audio and play
      const audio = new Audio(`data:audio/wav;base64,${audioData}`);
      
      audio.onended = () => {
        setIsSpeaking(false);
      };

      await audio.play();
    } catch (err) {
      console.error('Audio playback error:', err);
      setIsSpeaking(false);
    }
  };

  // End conversation
  const endConversation = useCallback(async () => {
    try {
      // Stop recording
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      }

      setIsListening(false);

      // Send end signal to backend
      const response = await fetch('/api/esthetics/voice-conversation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'end',
          sessionId: sessionIdRef.current,
          conversationState: conversationStateRef.current,
        }),
      });

      const data = await response.json();

      if (data.ok && onComplete) {
        onComplete(data.answers);
      }

      setIsConnected(false);
    } catch (err) {
      console.error('End conversation error:', err);
      setError('Failed to end conversation');
    }
  }, [onComplete]);

  // Helper: Convert blob to base64
  const blobToBase64 = (blob) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  return {
    isConnected,
    isListening,
    isSpeaking,
    transcript,
    error,
    startConversation,
    endConversation,
  };
}
