// src/App.jsx
import React, { useState, useEffect, useRef } from 'react';
import { 
  Camera, 
  MessageSquare, 
  Info, 
  ChevronRight, 
  Shield, 
  User, 
  Sparkles, 
  Calendar, 
  MapPin, 
  Phone, 
  Mail, 
  Send,
  ArrowRight,
  Menu,
  X,
  Stethoscope,
  Heart
} from 'lucide-react';

const DermatologyApp = () => {
  const [activeTab, setActiveTab] = useState('home');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState([
    { role: 'assistant', content: "Hello! I am Dr. Lazuk's Cosmetic Skincare Assistant. How can I help you achieve your skin goals today?" }
  ]);
  const [userInput, setUserInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const gaEvent = (action, params) => {
    if (window.gtag) {
      window.gtag('event', action, params);
    }
  };

  const sendMessage = async () => {
    if (!userInput.trim()) return;
    
    const userMessage = userInput.trim();
    setUserInput('');
    setChatMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setChatLoading(true);
    
    gaEvent('chat_message_sent', { message_length: userMessage.length });

    // Mock API response
    setTimeout(() => {
      setChatMessages(prev => [...prev, { 
        role: 'assistant', 
        content: "Thank you for your question about " + userMessage + ". While I can provide general skincare information, for a personalized plan, I recommend booking a professional consultation with Dr. Lazuk."
      }]);
      setChatLoading(false);
    }, 1000);
  };

  const estheticServices = [
    {
      name: "Medical Grade Facials",
      description: "Customized deep cleansing and hydration treatments designed for your specific skin type.",
      benefits: ["Deep pore cleansing", "Improved texture", "Radiant glow"]
    },
    {
      name: "Chemical Peels",
      description: "Advanced exfoliation treatments to address pigmentation, fine lines, and acne scarring.",
      benefits: ["Even skin tone", "Reduced fine lines", "Clearer complexion"]
    },
    {
      name: "Microneedling",
      description: "Collagen induction therapy to rejuvenate skin and improve the appearance of scars.",
      benefits: ["Increased collagen", "Smoother skin", "Firming effect"]
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900">
      {/* Navigation */}
      <nav className="bg-white border-b sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-gray-900 rounded-full flex items-center justify-center">
              <Sparkles className="text-white" size={24} />
            </div>
            <div>
              <h1 className="font-bold text-xl tracking-tight">Dr. Lazuk</h1>
              <p className="text-[10px] uppercase tracking-widest text-gray-500">Cosmetics & Esthetics</p>
            </div>
          </div>

          {/* Mobile Menu Button */}
          <button className="md:hidden" onClick={() => setIsMenuOpen(!isMenuOpen)}>
            {isMenuOpen ? <X /> : <Menu />}
          </button>

          {/* Desktop Nav */}
          <div className="hidden md:flex gap-8">
            {['home', 'consultation', 'education'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`text-sm font-bold uppercase tracking-widest ${
                  activeTab === tab ? 'text-gray-900 border-b-2 border-gray-900' : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <div className="max-w-6xl mx-auto px-4 py-12">
        {activeTab === 'home' && (
          <div className="space-y-16">
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div>
                <h2 className="text-5xl font-bold leading-tight mb-6">
                  Elevate Your Skin Health.
                </h2>
                <p className="text-xl text-gray-600 mb-8 leading-relaxed">
                  Expert cosmetic dermatology led by Dr. Lazuk. We combine medical science with esthetic artistry to reveal your best skin.
                </p>
                <div className="flex gap-4">
                  <button 
                    onClick={() => setActiveTab('consultation')}
                    className="px-8 py-4 bg-gray-900 text-white font-bold hover:bg-gray-800 flex items-center gap-2"
                  >
                    Start AI Consult <ArrowRight size={20} />
                  </button>
                </div>
              </div>
              <div className="bg-gray-200 aspect-square rounded-2xl flex items-center justify-center">
                <User size={120} className="text-gray-400" />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'consultation' && (
          <div className="max-w-3xl mx-auto">
            <div className="bg-white border-2 border-gray-900 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
              <div className="p-6 border-b-2 border-gray-900 bg-gray-900 text-white flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center">
                    <Stethoscope className="text-gray-900" size={18} />
                  </div>
                  <span className="font-bold uppercase tracking-widest text-sm">AI Skincare Assistant</span>
                </div>
              </div>
              
              <div className="h-[500px] overflow-y-auto p-6 space-y-4">
                {chatMessages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] p-4 ${
                      msg.role === 'user' 
                        ? 'bg-gray-100 text-gray-900 font-medium' 
                        : 'bg-white border-2 border-gray-900 text-gray-900'
                    }`}>
                      {msg.content}
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex justify-start">
                    <div className="bg-white border-2 border-gray-900 p-4">...</div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              <div className="p-4 border-t-2 border-gray-900">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={userInput}
                    onChange={(e) => setUserInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                    placeholder="Ask a cosmetic skincare question..."
                    className="flex-1 px-4 py-3 border-2 focus:outline-none focus:border-gray-900"
                  />
                  <button
                    onClick={sendMessage}
                    disabled={chatLoading}
                    className="px-8 py-3 bg-gray-900 text-white font-bold hover:bg-gray-800 disabled:bg-gray-400"
                    type="button"
                  >
                    <Send size={20} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'education' && (
          <div className="bg-white border shadow-sm p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Our Esthetic Services</h2>
            <div className="grid md:grid-cols-1 gap-6">
              {estheticServices.map((s, i) => (
                <div key={i} className="border-2 p-6">
                  <h3 className="font-bold text-xl text-gray-900 mb-2">{s.name}</h3>
                  <p className="text-gray-700 mb-4">{s.description}</p>
                  <div className="mb-4">
                    <p className="font-bold text-gray-900 mb-2">Benefits:</p>
                    <ul className="text-sm text-gray-700">
                      {s.benefits.map((b, j) => (
                        <li key={j}>✓ {b}</li>
                      ))}
                    </ul>
                  </div>
                  <a
                    href="mailto:contact@skindoctor.ai"
                    onClick={() => gaEvent('services_learn_more_click', { serviceName: s.name })}
                    className="block text-center bg-gray-900 text-white py-3 font-bold hover:bg-gray-800"
                  >
                    Learn More
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="bg-gray-900 text-white py-8 mt-12">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <p className="text-sm text-gray-400">© 2026 by SkinDoctor AI®</p>
          <p className="text-sm text-gray-400 mt-2">
            Dr. Lazuk Cosmetics® | Dr. Lazuk Esthetics® | Contact: contact@skindoctor.ai
          </p>
        </div>
      </div>
    </div>
  );
};

export default DermatologyApp;
