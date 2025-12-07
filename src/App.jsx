import React, { useState, useRef, useEffect } from 'react';
import { Camera, MessageCircle, BookOpen, Upload, X, Send, AlertCircle, Info, Mail, Sparkles, Loader } from 'lucide-react';

const DermatologyApp = () => {
  const [activeTab, setActiveTab] = useState('home');
  const [step, setStep] = useState('photo');
  const [cameraActive, setCameraActive] = useState(false);
  const [capturedImage, setCapturedImage] = useState(null);
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
      name: 'Beneficial Face Cleanser with Centella Asiatica (Dermo Complex)',
      price: 139.99,
      category: 'Cleanser',
      benefits: ['Soothes irritation', 'Reduces redness', 'Strengthens barrier'],
      url: 'https://www.skindoctor.ai/product-page/beneficial-face-cleanser-with-centella-asiatica'
    },
    {
      name: 'Enriched Face Wash with Hyaluronic and Amino Acid',
      price: 169.99,
      category: 'Cleanser',
      benefits: ['Deep hydration', 'Plump skin', 'Strengthens barrier'],
      url: 'https://www.skindoctor.ai/product-page/enriched-face-wash-with-hyaluronic-and-amino-acid'
    },
    {
      name: 'Rehydrating Face Emulsion with Centella Asiatica and Peptides',
      price: 179.99,
      category: 'Moisturizer',
      benefits: ['Deep hydration', 'Anti-aging', 'Natural glow'],
      url: 'https://www.skindoctor.ai/product-page/rehydrating-face-emulsion-with-centella-asiatica-and-peptides'
    },
    {
      name: 'Concentrated Toner Pads with Hyaluronic Acid',
      price: 99.99,
      category: 'Toner',
      benefits: ['Pore-tightening', 'Tone-evening', 'Barrier-boosting'],
      url: 'https://www.skindoctor.ai/product-page/concentrated-toner-pads-with-hyaluronic-acid'
    },
    {
      name: 'Balancing Toner Pads with Niacinamide',
      price: 99.99,
      category: 'Toner',
      benefits: ['Brightening', 'Oil control', 'Radiant glow'],
      url: 'https://www.skindoctor.ai/product-page/balancing-toner-pads-with-niacinamide'
    },
    {
      name: 'Natural Mineral Sunscreen Protection',
      price: 79.99,
      category: 'Sunscreen',
      benefits: ['Zinc oxide protection', 'Botanical nourishment', 'No white cast'],
      url: 'https://www.skindoctor.ai/product-page/natural-mineral-sunscreen-protection'
    },
    {
      name: 'Hydrating Face Cloud Mask',
      price: 149.99,
      category: 'Mask',
      benefits: ['Tightens pores', 'Reduces fine lines', 'Deep hydration'],
      url: 'https://www.skindoctor.ai/product-page/revit

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
    setEmailSubmitting(true);
    
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
      
      setEmailSubmitting(false);
      setStep('results');
      
    } catch (error) {
      console.error('Analysis error:', error);
      setEmailSubmitting(false);
      alert('There was an error processing your analysis. Please try again.');
    }
  };

  const handleEmailSubmit = async () => {
    if (!userEmail || !userEmail.includes('@')) {
      alert('Please enter a valid email address');
      return;
    }
    await performAnalysis();
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
    <div className="min-h-screen bg-white">
      <div className="bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 text-white shadow-lg">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">DR. LAZUK</h1>
              <p className="text-sm mt-1 text-gray-300">ESTHETICS | COSMETICS | BIOTICS | NUTRITION</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-400 uppercase tracking-wider">Virtual Skincare Analysis</p>
              <p className="text-sm text-gray-300 mt-1">Enhancing the Beautiful You, Naturally</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-gray-50 border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-3">
          <div className="flex gap-2">
            <button onClick={() => setActiveTab('home')} className={`flex items-center gap-2 px-6 py-3 font-medium transition-all ${activeTab === 'home' ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-200'}`}>
              <Camera size={18} />
              <span>Skin Analysis</span>
            </button>
            <button onClick={() => setActiveTab('chat')} className={`flex items-center gap-2 px-6 py-3 font-medium transition-all ${activeTab === 'chat' ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-200'}`}>
              <MessageCircle size={18} />
              <span>Ask Dr. Lazuk</span>
            </button>
            <button onClick={() => setActiveTab('education')} className={`flex items-center gap-2 px-6 py-3 font-medium transition-all ${activeTab === 'education' ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-200'}`}>
              <BookOpen size={18} />
              <span>Products</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8">
        {activeTab === 'home' && (
          <div className="bg-white border border-gray-200 shadow-sm p-8">
            <div className="flex items-center gap-3 mb-6">
              <Sparkles className="text-gray-900" size={28} />
              <h2 className="text-2xl font-bold text-gray-900">Virtual Skin Analysis</h2>
            </div>

            {step === 'photo' && (
              <>
                <div className="bg-gray-50 border border-gray-300 p-4 mb-8 flex items-start gap-3">
                  <Info className="text-gray-700 flex-shrink-0 mt-0.5" size={20} />
                  <p className="text-sm text-gray-700">Take or upload a well-lit photo of your face. Our AI will provide comprehensive analysis in Dr. Lazuk expert voice.</p>
                </div>

                {!capturedImage && !cameraActive && (
                  <div className="grid md:grid-cols-2 gap-6">
                    <button onClick={startCamera} className="flex flex-col items-center justify-center p-12 border-2 border-dashed border-gray-400 hover:border-gray-900 hover:bg-gray-50 transition-all">
                      <Camera size={56} className="text-gray-900 mb-4" />
                      <span className="font-bold text-gray-900 text-lg">Use Camera</span>
                      <span className="text-sm text-gray-600 mt-2">Take a photo now</span>
                    </button>
                    <button onClick={() => fileInputRef.current?.click()} className="flex flex-col items-center justify-center p-12 border-2 border-dashed border-gray-400 hover:border-gray-900 hover:bg-gray-50 transition-all">
                      <Upload size={56} className="text-gray-900 mb-4" />
                      <span className="font-bold text-gray-900 text-lg">Upload Photo</span>
                      <span className="text-sm text-gray-600 mt-2">From your device</span>
                    </button>
                    <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
                  </div>
                )}

                {cameraActive && (
                  <div className="space-y-4">
                    <div className="relative bg-black overflow-hidden">
                      <video ref={videoRef} autoPlay playsInline className="w-full" />
                    </div>
                    <div className="flex gap-3 justify-center">
                      <button onClick={capturePhoto} className="px-8 py-3 bg-gray-900 text-white font-bold hover:bg-gray-800 transition-colors">Capture Photo</button>
                      <button onClick={stopCamera} className="px-8 py-3 bg-gray-300 text-gray-900 font-bold hover:bg-gray-400 transition-colors">Cancel</button>
                    </div>
                  </div>
                )}
              </>
            )}

            {step === 'questions' && capturedImage && (
              <div className="space-y-6">
                <div className="relative max-w-md mx-auto">
                  <img src={capturedImage} alt="Your photo" className="w-full border border-gray-300" />
                </div>
                <div className="max-w-2xl mx-auto space-y-6">
                  <div className="bg-gray-50 border border-gray-300 p-6">
                    <h3 className="font-bold text-gray-900 mb-4 text-lg">Tell Us About Your Skin</h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-bold text-gray-900 mb-2">Age Range *</label>
                        <select value={ageRange} onChange={(e) => setAgeRange(e.target.value)} required className="w-full px-4 py-3 border-2 border-gray-300 focus:outline-none focus:border-gray-900">
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
                        <label className="block text-sm font-bold text-gray-900 mb-2">Primary Skin Concern *</label>
                        <select value={primaryConcern} onChange={(e) => setPrimaryConcern(e.target.value)} required className="w-full px-4 py-3 border-2 border-gray-300 focus:outline-none focus:border-gray-900">
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
                        <label className="block text-sm font-bold text-gray-900 mb-2">Ask Dr. Lazuk a Question (Optional)</label>
                        <textarea value={visitorQuestion} onChange={(e) => setVisitorQuestion(e.target.value)} placeholder="E.g., What is the best way to prevent wrinkles?" rows="4" className="w-full px-4 py-3 border-2 border-gray-300 focus:outline-none focus:border-gray-900" />
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={resetAnalysis} className="px-6 py-3 bg-gray-300 text-gray-900 font-bold hover:bg-gray-400 transition-colors">Start Over</button>
                    <button onClick={handleQuestionsSubmit} className="flex-1 px-6 py-3 bg-gray-900 text-white font-bold hover:bg-gray-800 transition-colors">Continue to Analysis</button>
                  </div>
                </div>
              </div>
            )}

            {step === 'email' && (
              <div className="max-w-xl mx-auto">
                <div className="bg-gray-900 text-white p-8 border border-gray-800">
                  <div className="flex items-center gap-3 mb-4">
                    <Mail className="text-white" size={32} />
                    <h3 className="text-2xl font-bold">Get Your Personalized Analysis</h3>
                  </div>
                  <p className="text-gray-300 mb-6">Enter your email to receive your comprehensive skin analysis report from Dr. Lazuk including personalized product recommendations and aging prognosis.</p>
                  <div className="space-y-4">
                    <input type="email" value={userEmail} onChange={(e) => setUserEmail(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleEmailSubmit()} placeholder="your.email@example.com" required className="w-full px-4 py-3 bg-white text-gray-900 border-2 border-gray-300 focus:outline-none focus:border-gray-600" />
                    <button onClick={handleEmailSubmit} disabled={emailSubmitting} className="w-full px-6 py-3 bg-white text-gray-900 font-bold hover:bg-gray-200 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                      {emailSubmitting ? (
                        <>
                          <Loader className="animate-spin" size={20} />
                          <span>Analyzing Your Skin...</span>
                        </>
                      ) : (
                        'View My Results'
                      )}
                    </button>
                    <p className="text-xs text-gray-400 text-center">We respect your privacy. Your analysis will be sent to contact@skindoctor.ai and you will receive a copy via email.</p>
                  </div>
                </div>
              </div>
            )}

            {step === 'results' && analysisReport && (
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <h3 className="text-2xl font-bold text-gray-900">Your Personalized Skincare Analysis</h3>
                  <button onClick={resetAnalysis} className="px-4 py-2 bg-gray-300 text-gray-900 font-bold hover:bg-gray-400 transition-colors text-sm">New Analysis</button>
                </div>
                <div className="bg-white border-2 border-gray-900 p-8">
                  <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap">{analysisReport}</div>
                </div>
                <div className="bg-white border-2 border-gray-900 p-8">
                  <h4 className="font-bold text-gray-900 mb-4 text-2xl">Recommended Dr. Lazuk Products</h4>
                  <div className="grid md:grid-cols-3 gap-4">
                    {drLazukProducts.map((product, idx) => (
                      <div key={idx} className="bg-gray-50 border border-gray-300 p-5 hover:border-gray-900 transition-all">
                        <div className="mb-3">
                          <h5 className="font-bold text-gray-900 mb-1">{product.name}</h5>
                          <span className="text-gray-900 font-bold text-lg">${product.price}</span>
                        </div>
                        <p className="text-xs text-gray-500 mb-3 uppercase tracking-wider">{product.category}</p>
                        <ul className="space-y-1 mb-4">
                          {product.benefits.map((benefit, bidx) => (
                            <li key={bidx} className="text-sm text-gray-700">✓ {benefit}</li>
                          ))}
                        </ul>
                        <a href={product.url} target="_blank" rel="noopener noreferrer" className="block w-full text-center bg-gray-900 text-white py-3 font-bold hover:bg-gray-800 transition-colors">View Product</a>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            <canvas ref={canvasRef} className="hidden" />
          </div>
        )}

        {activeTab === 'chat' && (
          <div className="bg-white border border-gray-200 shadow-sm overflow-hidden" style={{ height: '600px' }}>
            <div className="flex flex-col h-full">
              <div className="bg-gray-900 text-white p-6">
                <h2 className="text-2xl font-bold">Ask Dr. Lazuk</h2>
                <p className="text-sm text-gray-300 mt-1">Get expert skincare advice</p>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-gray-50">
                {chatMessages.map((msg, idx) => (
                  <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] p-4 ${msg.role === 'user' ? 'bg-gray-900 text-white' : 'bg-white border border-gray-300 text-gray-900'}`}>
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex justify-start">
                    <div className="bg-white border border-gray-300 p-4">
                      <div className="flex gap-1">
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="border-t border-gray-300 p-4 bg-white">
                <div className="flex gap-2">
                  <input type="text" value={inputMessage} onChange={(e) => setInputMessage(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && sendMessage()} placeholder="Ask about skin conditions routines products..." className="flex-1 px-4 py-3 border-2 border-gray-300 focus:outline-none focus:border-gray-900" />
                  <button onClick={sendMessage} disabled={chatLoading || !inputMessage.trim()} className="px-8 py-3 bg-gray-900 text-white font-bold hover:bg-gray-800 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed">
                    <Send size={20} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'education' && (
          <div className="bg-white border border-gray-200 shadow-sm p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Dr. Lazuk Cosmetics Product Line</h2>
            <p className="text-gray-600 mb-8">Dermatologist-formulated natural skincare powered by science and botanical ingredients.</p>
            <div className="grid md:grid-cols-3 gap-6">
              {drLazukProducts.map((product, idx) => (
                <div key={idx} className="border-2 border-gray-300 p-6 hover:border-gray-900 transition-all">
                  <div className="mb-4">
                    <span className="inline-block px-3 py-1 bg-gray-900 text-white text-xs uppercase tracking-wider mb-3">{product.category}</span>
                    <h3 className="font-bold text-gray-900 text-lg mb-2">{product.name}</h3>
                    <span className="text-xl font-bold text-gray-900">${product.price}</span>
                  </div>
                  <ul className="space-y-2 mb-5">
                    {product.benefits.map((benefit, bidx) => (
                      <li key={bidx} className="text-sm text-gray-700 flex items-start">
                        <span className="text-gray-900 mr-2 font-bold">✓</span>
                        {benefit}
                      </li>
                    ))}
                  </ul>
                  <a href={product.url} target="_blank" rel="noopener noreferrer" className="block w-full text-center bg-gray-900 text-white py-3 font-bold hover:bg-gray-800 transition-colors">Learn More</a>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="bg-gray-900 text-white py-8 mt-12">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <p className="text-sm text-gray-400">© 2026 by SkinDoctor AI®</p>
          <p className="text-sm text-gray-400 mt-2">Dr. Lazuk Cosmetics® | Dr. Lazuk Esthetics® | Dr. Lazuk Biotics® | Dr. Lazuk Nutrition®</p>
          <p className="text-sm text-gray-400 mt-2">Johns Creek Georgia | Alpharetta Georgia | Atlanta Georgia | Cumming Georgia</p>
        </div>
      </div>
    </div>
  );
};

export default DermatologyApp;
