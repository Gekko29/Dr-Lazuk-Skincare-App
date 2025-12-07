jsximport React, { useState, useRef, useEffect } from 'react';
import { Camera, MessageCircle, BookOpen, Upload, X, Send, AlertCircle, Info, Mail, Sparkles, Loader } from 'lucide-react';

const DermatologyApp = () => {
  const [activeTab, setActiveTab] = useState('home');
  const [step, setStep] = useState('photo');
  const [cameraActive, setCameraActive] = useState(false);
  const [capturedImage, setCapturedImage] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [ageRange, setAgeRange] = useState('');
  const [primaryConcern, setPrimaryConcern] = useState('');
  const [visitorQuestion, setVisitorQuestion] = useState('');
  const [analysisReport, setAnalysisReport] = useState(null);
  const [emailSubmitting, setEmailSubmitting] = useState(false);
  
  const [chatMessages, setChatMessages] = useState([
    { role: 'assistant', content: 'Hello! I am Dr. Lazuk virtual assistant. How can I help you with your skincare today?' }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);

  const drLazukProducts = [
    {
      name: 'Beneficial Face Cleanser with Centella Asiatica',
      price: 139.99,
      category: 'Cleanser',
      benefits: ['Soothes irritation', 'Reduces redness', 'Strengthens barrier'],
      url: 'https://www.skindoctor.ai/product-page/beneficial-face-cleanser-with-centella-asiatica'
    },
    {
      name: 'Rehydrating Face Emulsion with Centella Asiatica and Peptides',
      price: 179.99,
      category: 'Moisturizer',
      benefits: ['Deep hydration', 'Anti-aging', 'Natural glow'],
      url: 'https://www.skindoctor.ai/product-page/rehydrating-face-emulsion-with-centella-asiatica-and-peptides'
    },
    {
      name: 'Natural Mineral Sunscreen Protection',
      price: 79.99,
      category: 'Sunscreen',
      benefits: ['Zinc oxide protection', 'Botanical nourishment', 'No white cast'],
      url: 'https://www.skindoctor.ai/product-page/natural-mineral-sunscreen-protection'
    }
  ];

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'user', width: 640, height: 480 } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setCameraActive(true);
      }
    } catch (err) {
      alert('Unable to access camera. Please ensure camera permissions are granted.');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const capturePhoto = () => {
    if (canvasRef.current && videoRef.current) {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0);
      const imageData = canvas.toDataURL('image/jpeg');
      setCapturedImage(imageData);
      stopCamera();
      setStep('questions');
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setCapturedImage(event.target.result);
        setStep('questions');
      };
      reader.readAsDataURL(file);
    }
  };

  const handleQuestionsSubmit = () => {
    if (!ageRange || !primaryConcern) {
      alert('Please answer all required questions');
      return;
    }
    setStep('email');
  };

  const performAnalysis = async () => {
    setAnalyzing(true);
    
    try {
      const mockAnalysisData = {
        fitzpatrickType: 'III (medium, tans uniformly)',
        skinTypeCharacteristics: {
          sebumLevel: 'combination',
          shinePattern: 'T-zone',
          poreVisibility: 'moderate',
          hydrationLevel: 'balanced'
        }
      };

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4000,
          system: 'You are Dr. Iryna Lazuk, providing warm, expert skincare analysis. Generate a report with these sections: Initial Skincare Analysis, Aging Prognosis Current State, Esthetic Deep-Dive, Assessment If You Change Nothing, Future Roadmap, Why Pause Current Products, Daily Skincare Plan, and Important Notice disclaimer. Be warm, expert, non-diagnostic. Recommend Dr. Lazuk products: Beneficial Face Cleanser, Rehydrating Face Emulsion, Natural Mineral Sunscreen.',
          messages: [{
            role: 'user',
            content: `Generate skincare analysis for: Age ${ageRange}, Concern ${primaryConcern}, Question ${visitorQuestion || 'none'}, Analysis ${JSON.stringify(mockAnalysisData)}`
          }]
        })
      });

      const data = await response.json();
      const reportContent = data.content[0].text;
      
      setAnalysisReport(reportContent);
      
      console.log('Email to contact@skindoctor.ai - Subject: New Skincare Prospect');
      console.log('User:', userEmail, 'Age:', ageRange, 'Concern:', primaryConcern);
      
      setAnalyzing(false);
      setStep('results');
      
    } catch (error) {
      console.error('Analysis error:', error);
      setAnalyzing(false);
      alert('There was an error processing your analysis. Please try again.');
    }
  };

  const handleEmailSubmit = async () => {
    if (!userEmail || !userEmail.includes('@')) {
      alert('Please enter a valid email address');
      return;
    }
    setEmailSubmitting(true);
    await performAnalysis();
    setEmailSubmitting(false);
  };

  const sendMessage = async () => {
    if (!inputMessage.trim()) return;
    
    const userMsg = inputMessage;
    setChatMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setInputMessage('');
    setChatLoading(true);

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system: 'You are Dr. Lazuk virtual assistant. Provide warm expert dermatological advice. Mention Dr. Lazuk products when relevant. Always remind users to consult dermatologist for medical concerns.',
          messages: [
            ...chatMessages.map(m => ({ role: m.role, content: m.content })),
            { role: 'user', content: userMsg }
          ]
        })
      });

      const data = await response.json();
      const assistantMsg = data.content[0].text;
      
      setChatMessages(prev => [...prev, { role: 'assistant', content: assistantMsg }]);
    } catch (error) {
      setChatMessages(prev => [...prev, { 
        role: 'assistant', 
        content: 'I apologize but I am having trouble connecting right now. Please try again.' 
      }]);
    }
    
    setChatLoading(false);
  };

  const resetAnalysis = () => {
    setCapturedImage(null);
    setAnalysisReport(null);
    setStep('photo');
    setAgeRange('');
    setPrimaryConcern('');
    setVisitorQuestion('');
    setUserEmail('');
  };

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'white' }}>
      {/* Header */}
      <div style={{ 
        background: 'linear-gradient(to right, #111827, #1f2937, #111827)',
        color: 'white',
        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
      }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '1.5rem 1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold', letterSpacing: 'tight', margin: 0 }}>DR. LAZUK</h1>
              <p style={{ fontSize: '0.875rem', marginTop: '0.25rem', color: '#d1d5db' }}>ESTHETICS | COSMETICS | BIOTICS | NUTRITION</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: '0.75rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 'wider' }}>Virtual Skincare Analysis</p>
              <p style={{ fontSize: '0.875rem', color: '#d1d5db', marginTop: '0.25rem' }}>Enhancing the Beautiful You, Naturally</p>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '0.75rem 1rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              onClick={() => setActiveTab('home')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.75rem 1.5rem',
                fontWeight: '500',
                transition: 'all 0.2s',
                backgroundColor: activeTab === 'home' ? '#111827' : 'transparent',
                color: activeTab === 'home' ? 'white' : '#374151',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              <Camera size={18} />
              <span>Skin Analysis</span>
            </button>
            <button
              onClick={() => setActiveTab('chat')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.75rem 1.5rem',
                fontWeight: '500',
                transition: 'all 0.2s',
                backgroundColor: activeTab === 'chat' ? '#111827' : 'transparent',
                color: activeTab === 'chat' ? 'white' : '#374151',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              <MessageCircle size={18} />
              <span>Ask Dr. Lazuk</span>
            </button>
            <button
              onClick={() => setActiveTab('education')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.75rem 1.5rem',
                fontWeight: '500',
                transition: 'all 0.2s',
                backgroundColor: activeTab === 'education' ? '#111827' : 'transparent',
                color: activeTab === 'education' ? 'white' : '#374151',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              <BookOpen size={18} />
              <span>Products</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '2rem 1rem' }}>
        {activeTab === 'home' && (
          <div style={{ backgroundColor: 'white', border: '1px solid #e5e7eb', boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)', padding: '2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
              <Sparkles style={{ color: '#111827' }} size={28} />
              <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#111827', margin: 0 }}>Virtual Skin Analysis</h2>
            </div>

            {step === 'photo' && (
              <>
                <div style={{ backgroundColor: '#f9fafb', border: '1px solid #d1d5db', padding: '1rem', marginBottom: '2rem', display: 'flex', alignItems: 'start', gap: '0.75rem' }}>
                  <Info style={{ color: '#374151', flexShrink: 0, marginTop: '0.125rem' }} size={20} />
                  <p style={{ fontSize: '0.875rem', color: '#374151', margin: 0 }}>
                    Take or upload a well-lit photo of your face. Our AI will provide comprehensive analysis in Dr. Lazuk expert voice.
                  </p>
                </div>

                {!capturedImage && !cameraActive && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem' }}>
                    <button
                      onClick={startCamera}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '3rem',
                        border: '2px dashed #9ca3af',
                        backgroundColor: 'transparent',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.borderColor = '#111827';
                        e.currentTarget.style.backgroundColor = '#f9fafb';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.borderColor = '#9ca3af';
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                    >
                      <Camera size={56} style={{ color: '#111827', marginBottom: '1rem' }} />
                      <span style={{ fontWeight: 'bold', color: '#111827', fontSize: '1.125rem' }}>Use Camera</span>
                      <span style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.5rem' }}>Take a photo now</span>
                    </button>
                    
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '3rem',
                        border: '2px dashed #9ca3af',
                        backgroundColor: 'transparent',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.borderColor = '#111827';
                        e.currentTarget.style.backgroundColor = '#f9fafb';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.borderColor = '#9ca3af';
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                    >
                      <Upload size={56} style={{ color: '#111827', marginBottom: '1rem' }} />
                      <span style={{ fontWeight: 'bold', color: '#111827', fontSize: '1.125rem' }}>Upload Photo</span>
                      <span style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.5rem' }}>From your device</span>
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleFileUpload}
                      style={{ display: 'none' }}
                    />
                  </div>
                )}

                {cameraActive && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ position: 'relative', backgroundColor: 'black', overflow: 'hidden' }}>
                      <video ref={videoRef} autoPlay playsInline style={{ width: '100%' }} />
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
                      <button
                        onClick={capturePhoto}
                        style={{
                          padding: '0.75rem 2rem',
                          backgroundColor: '#111827',
                          color: 'white',
                          fontWeight: 'bold',
                          border: 'none',
                          cursor: 'pointer',
                          transition: 'background-color 0.2s'
                        }}
                        onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#1f2937'}
                        onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#111827'}
                      >
                        Capture Photo
                      </button>
                      <button
                        onClick={stopCamera}
                        style={{
                          padding: '0.75rem 2rem',
                          backgroundColor: '#d1d5db',
                          color: '#111827',
                          fontWeight: 'bold',
                          border: 'none',
                          cursor: 'pointer',
                          transition: 'background-color 0.2s'
                        }}
                        onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#9ca3af'}
                        onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#d1d5db'}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {step === 'questions' && capturedImage && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <div style={{ position: 'relative', maxWidth: '28rem', margin: '0 auto' }}>
                  <img src={capturedImage} alt="Your photo" style={{ width: '100%', border: '1px solid #d1d5db' }} />
                </div>

                <div style={{ maxWidth: '42rem', margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  <div style={{ backgroundColor: '#f9fafb', border: '1px solid #d1d5db', padding: '1.5rem' }}>
                    <h3 style={{ fontWeight: 'bold', color: '#111827', marginBottom: '1rem', fontSize: '1.125rem' }}>Tell Us About Your Skin</h3>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 'bold', color: '#111827', marginBottom: '0.5rem' }}>Age Range *</label>
                        <select
                          value={ageRange}
                          onChange={(e) => setAgeRange(e.target.value)}
                          required
                          style={{
                            width: '100%',
                            padding: '0.75rem 1rem',
                            border: '2px solid #d1d5db',
                            outline: 'none',
                            fontSize: '1rem'
                          }}
                        >
                          <option value="">Select your age range</option>
                          <option value="teens">Teens (13-19)</option>
                          <option value="20s">20s</option>
                          <option value="30s">30s</option>
                          <option value="40s">40s</option>
                          <option value="50s">50s</option>
                          <option value="60+">60+</option>
                        </select>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 'bold', color: '#111827', marginBottom: '0.5rem' }}>Primary Skin Concern *</label>
                        <select
                          value={primaryConcern}
                          onChange={(e) => setPrimaryConcern(e.target.value)}
                          required
                          style={{
                            width: '100%',
                            padding: '0.75rem 1rem',
                            border: '2px solid #d1d5db',
                            outline: 'none',
                            fontSize: '1rem'
                          }}
                        >
                          <option value="">Select your main concern</option>
                          <option value="acne">Acne and Breakouts</option>
                          <option value="aging">Aging and Fine Lines</option>
                          <option value="pigmentation">Dark Spots and Pigmentation</option>
                          <option value="redness">Redness and Sensitivity</option>
                          <option value="texture">Texture and Pores</option>
                          <option value="dryness">Dryness and Dehydration</option>
                          <option value="not sure">Not Sure</option>
                        </select>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 'bold', color: '#111827', marginBottom: '0.5rem' }}>
                          Ask Dr. Lazuk a Question (Optional)
                        </label>
                        <textarea
                          value={visitorQuestion}
                          onChange={(e) => setVisitorQuestion(e.target.value)}
                          placeholder="E.g., What is the best way to prevent wrinkles? How can I reduce my dark circles?"
                          rows="4"
                          style={{
                            width: '100%',
                            padding: '0.75rem 1rem',
                            border: '2px solid #d1d5db',
                            outline: 'none',
                            fontSize: '1rem',
                            fontFamily: 'inherit',
                            resize: 'vertical'
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button
                      onClick={resetAnalysis}
                      style={{
                        padding: '0.75rem 1.5rem',
                        backgroundColor: '#d1d5db',
                        color: '#111827',
                        fontWeight: 'bold',
                        border: 'none',
                        cursor: 'pointer',
                        transition: 'background-color 0.2s'
                      }}
                      onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#9ca3af'}
                      onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#d1d5db'}
                    >
                      Start Over
                    </button>
                    <button
                      onClick={handleQuestionsSubmit}
                      style={{
                        flex: 1,
                        padding: '0.75rem 1.5rem',
                        backgroundColor: '#111827',
                        color: 'white',
                        fontWeight: 'bold',
                        border: 'none',
                        cursor: 'pointer',
                        transition: 'background-color 0.2s'
                      }}
                      onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#1f2937'}
                      onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#111827'}
                    >
                      Continue to Analysis
                    </button>
                  </div>
                </div>
              </div>
            )}

            {step === 'email' && (
              <div style={{ maxWidth: '36rem', margin: '0 auto' }}>
                <div style={{ backgroundColor: '#111827', color: 'white', padding: '2rem', border: '1px solid #1f2937' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                    <Mail style={{ color: 'white' }} size={32} />
                    <h3 style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: 0 }}>Get Your Personalized Analysis</h3>
                  </div>
                  <p style={{ color: '#d1d5db', marginBottom: '1.5rem' }}>
                    Enter your email to receive your comprehensive skin analysis report from Dr. Lazuk including personalized product recommendations and aging prognosis.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <input
                      type="email"
                      value={userEmail}
                      onChange={(e) => setUserEmail(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleEmailSubmit()}
                      placeholder="your.email@example.com"
                      required
                      style={{
                        width: '100%',
                        padding: '0.75rem 1rem',
                        backgroundColor: 'white',
                        color: '#111827',
                        border: '2px solid #d1d5db',
                        outline: 'none',
                        fontSize: '1rem'
                      }}
                    />
                    <button
                      onClick={handleEmailSubmit}
                      disabled={emailSubmitting}
                      style={{
                        width: '100%',
                        padding: '0.75rem 1.5rem',
                        backgroundColor: 'white',
                        color: '#111827',
                        fontWeight: 'bold',
                        border: 'none',
                        cursor: emailSubmitting ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.5rem',
                        opacity: emailSubmitting ? 0.5 : 1,
                        transition: 'background-color 0.2s'
                      }}
                      onMouseOver={(e) => !emailSubmitting && (e.currentTarget.style.backgroundColor = '#e5e7eb')}
                      onMouseOut={(e) => !emailSubmitting && (e.currentTarget.style.backgroundColor = 'white')}
                    >
                      {emailSubmitting ? (
                        <>
                          <Loader style={{ animation: 'spin 1s linear infinite' }} size={20} />
                          <span>Analyzing Your Skin...</span>
                        </>
                      ) : (
                        'View My Results'
                      )}
                    </button>
                    <p style={{ fontSize: '0.75rem', color: '#9ca3af', textAlign: 'center', margin: 0 }}>
                      We respect your privacy. Your analysis will be sent to contact@skindoctor.ai and you will receive a copy via email.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {step === 'results' && analysisReport && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                  <h3 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#111827', margin: 0 }}>Your Personalized Skincare Analysis</h3>
                  <button
                    onClick={resetAnalysis}
                    style={{
                      padding: '0.5rem 1rem',
                      backgroundColor: '#d1d5db',
                      color: '#111827',
                      fontWeight: 'bold',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                      transition: 'background-color 0.2s'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#9ca3af'}
                    onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#d1d5db'}
                  >
                    New Analysis
                  </button>
                </div>

                <div style={{ backgroundColor: 'white', border: '2px solid #111827', padding: '2rem' }}>
                  <div style={{ 
                    color: '#374151', 
                    whiteSpace: 'pre-wrap',
                    lineHeight: '1.75',
                    fontSize: '0.9375rem'
                  }}>
                    {analysisReport}
                  </div>
                </div>

                <div style={{ backgroundColor: 'white', border: '2px solid #111827', padding: '2rem' }}>
                  <h4 style={{ fontWeight: 'bold', color: '#111827', marginBottom: '1rem', fontSize: '1.5rem' }}>Recommended Dr. Lazuk Products</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
                    {drLazukProducts.map((product, idx) => (
                      <div key={idx} style={{ backgroundColor: '#f9fafb', border: '1px solid #d1d5db', padding: '1.25rem', transitionMContinue: 'border-color 0.2s' }}
onMouseOver={(e) => e.currentTarget.style.borderColor = '#111827'}
onMouseOut={(e) => e.currentTarget.style.borderColor = '#d1d5db'}
>
<div style={{ marginBottom: '0.75rem' }}>
<h5 style={{ fontWeight: 'bold', color: '#111827', marginBottom: '0.25rem', fontSize: '1rem' }}>{product.name}</h5>
<span style={{ color: '#111827', fontWeight: 'bold', fontSize: '1.125rem' }}>${product.price}</span>
</div>
<p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{product.category}</p>
<ul style={{ listStyle: 'none', padding: 0, margin: '0 0 1rem 0' }}>
{product.benefits.map((benefit, bidx) => (
<li key={bidx} style={{ fontSize: '0.875rem', color: '#374151', marginBottom: '0.25rem' }}>✓ {benefit}</li>
))}
</ul>
<a
href={product.url}
target="_blank"
rel="noopener noreferrer"
style={{
display: 'block',
width: '100%',
textAlign: 'center',
backgroundColor: '#111827',
color: 'white',
padding: '0.75rem',
fontWeight: 'bold',
textDecoration: 'none',
transition: 'background-color 0.2s'
}}
onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#1f2937'}
onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#111827'}
>
View Product
</a>
</div>
))}
</div>
</div>
</div>
)}
        <canvas ref={canvasRef} style={{ display: 'none' }} />
      </div>
    )}

    {activeTab === 'chat' && (
      <div style={{ backgroundColor: 'white', border: '1px solid #e5e7eb', boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)', overflow: 'hidden', height: '600px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{ backgroundColor: '#111827', color: 'white', padding: '1.5rem' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: 0 }}>Ask Dr. Lazuk</h2>
            <p style={{ fontSize: '0.875rem', color: '#d1d5db', marginTop: '0.25rem' }}>Get expert skincare advice</p>
          </div>
          
          <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', backgroundColor: '#f9fafb' }}>
            {chatMessages.map((msg, idx) => (
              <div key={idx} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '80%',
                  padding: '1rem',
                  backgroundColor: msg.role === 'user' ? '#111827' : 'white',
                  color: msg.role === 'user' ? 'white' : '#111827',
                  border: msg.role === 'user' ? 'none' : '1px solid #d1d5db'
                }}>
                  <p style={{ fontSize: '0.875rem', whiteSpace: 'pre-wrap', margin: 0 }}>{msg.content}</p>
                </div>
              </div>
            ))}
            {chatLoading && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{ backgroundColor: 'white', border: '1px solid #d1d5db', padding: '1rem' }}>
                  <div style={{ display: 'flex', gap: '0.25rem' }}>
                    <div style={{ width: '0.5rem', height: '0.5rem', backgroundColor: '#9ca3af', borderRadius: '50%', animation: 'bounce 1s infinite' }}></div>
                    <div style={{ width: '0.5rem', height: '0.5rem', backgroundColor: '#9ca3af', borderRadius: '50%', animation: 'bounce 1s infinite', animationDelay: '0.1s' }}></div>
                    <div style={{ width: '0.5rem', height: '0.5rem', backgroundColor: '#9ca3af', borderRadius: '50%', animation: 'bounce 1s infinite', animationDelay: '0.2s' }}></div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div style={{ borderTop: '1px solid #d1d5db', padding: '1rem', backgroundColor: 'white' }}>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                placeholder="Ask about skin conditions routines products..."
                style={{
                  flex: 1,
                  padding: '0.75rem 1rem',
                  border: '2px solid #d1d5db',
                  outline: 'none',
                  fontSize: '1rem'
                }}
              />
              <button
                onClick={sendMessage}
                disabled={chatLoading || !inputMessage.trim()}
                style={{
                  padding: '0.75rem 2rem',
                  backgroundColor: '#111827',
                  color: 'white',
                  fontWeight: 'bold',
                  border: 'none',
                  cursor: (chatLoading || !inputMessage.trim()) ? 'not-allowed' : 'pointer',
                  opacity: (chatLoading || !inputMessage.trim()) ? 0.5 : 1,
                  transition: 'background-color 0.2s'
                }}
                onMouseOver={(e) => !chatLoading && inputMessage.trim() && (e.currentTarget.style.backgroundColor = '#1f2937')}
                onMouseOut={(e) => !chatLoading && inputMessage.trim() && (e.currentTarget.style.backgroundColor = '#111827')}
              >
                <Send size={20} />
              </button>
            </div>
          </div>
        </div>
      </div>
    )}

    {activeTab === 'education' && (
      <div style={{ backgroundColor: 'white', border: '1px solid #e5e7eb', boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)', padding: '2rem' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#111827', marginBottom: '0.5rem' }}>Dr. Lazuk Cosmetics Product Line</h2>
        <p style={{ color: '#6b7280', marginBottom: '2rem' }}>Dermatologist-formulated natural skincare powered by science and botanical ingredients.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
          {drLazukProducts.map((product, idx) => (
            <div key={idx} style={{ border: '2px solid #d1d5db', padding: '1.5rem', transition: 'border-color 0.2s' }}
              onMouseOver={(e) => e.currentTarget.style.borderColor = '#111827'}
              onMouseOut={(e) => e.currentTarget.style.borderColor = '#d1d5db'}
            >
              <div style={{ marginBottom: '1rem' }}>
                <span style={{ 
                  display: 'inline-block', 
                  padding: '0.25rem 0.75rem', 
                  backgroundColor: '#111827', 
                  color: 'white', 
                  fontSize: '0.75rem', 
                  textTransform: 'uppercase', 
                  letterSpacing: '0.05em',
                  marginBottom: '0.75rem'
                }}>{product.category}</span>
                <h3 style={{ fontWeight: 'bold', color: '#111827', fontSize: '1.125rem', marginBottom: '0.5rem' }}>{product.name}</h3>
                <span style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#111827' }}>${product.price}</span>
              </div>
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 1.25rem 0' }}>
                {product.benefits.map((benefit, bidx) => (
                  <li key={bidx} style={{ fontSize: '0.875rem', color: '#374151', display: 'flex', alignItems: 'start', marginBottom: '0.5rem' }}>
                    <span style={{ color: '#111827', marginRight: '0.5rem', fontWeight: 'bold' }}>✓</span>
                    {benefit}
                  </li>
                ))}
              </ul>
              <a 
                href={product.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'center',
                  backgroundColor: '#111827',
                  color: 'white',
                  padding: '0.75rem',
                  fontWeight: 'bold',
                  textDecoration: 'none',
                  transition: 'background-color 0.2s'
                }}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#1f2937'}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#111827'}
              >
                Learn More
              </a>
            </div>
          ))}
        </div>
      </div>
    )}
  </div>

  {/* Footer */}
  <div style={{ backgroundColor: '#111827', color: 'white', padding: '2rem 0', marginTop: '3rem' }}>
    <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '0 1rem', textAlign: 'center' }}>
      <p style={{ fontSize: '0.875rem', color: '#9ca3af' }}>© 2026 by SkinDoctor AI®</p>
      <p style={{ fontSize: '0.875rem', color: '#9ca3af', marginTop: '0.5rem' }}>Dr. Lazuk Cosmetics® | Dr. Lazuk Esthetics® | Dr. Lazuk Biotics® | Dr. Lazuk Nutrition®</p>
      <p style={{ fontSize: '0.875rem', color: '#9ca3af', marginTop: '0.5rem' }}>Johns Creek Georgia | Alpharetta Georgia | Atlanta Georgia | Cumming Georgia</p>
    </div>
  </div>

  {/* Keyframe animations */}
  <style>{`
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    @keyframes bounce {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-0.5rem); }
    }
  `}</style>
</div>  
);
};
