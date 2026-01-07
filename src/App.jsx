// src/App.jsx
import React, { useState, useEffect, useRef } from 'react';
import { Camera, Sparkles, Upload, Loader2, CheckCircle2, AlertCircle, ArrowRight, Menu, X } from 'lucide-react';

const DermatologyApp = () => {
  const [activeTab, setActiveTab] = useState('home');
  const [selectedImage, setSelectedImage] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [results, setResults] = useState(null);
  const fileInputRef = useRef(null);

  // Function to handle the AI Skin Analysis backend call
  const handleAnalysis = async (image) => {
    setAnalyzing(true);
    // This connects to your AI backend for facial analysis
    try {
      const formData = new FormData();
      formData.append('image', image);
      
      // Replace with your actual AI backend endpoint
      const response = await fetch('https://your-ai-backend-api.com/analyze', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      setResults(data);
    } catch (error) {
      console.error("Analysis failed", error);
    } finally {
      setAnalyzing(false);
    }
  };

  const onFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedImage(URL.createObjectURL(file));
      handleAnalysis(file);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <nav className="bg-white border-b p-4 flex justify-between items-center sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <Sparkles className="text-gray-900" />
          <span className="font-bold text-xl">Dr. Lazuk AI</span>
        </div>
        <div className="flex gap-6 font-medium text-sm uppercase tracking-widest">
          <button onClick={() => setActiveTab('home')} className={activeTab === 'home' ? 'border-b-2 border-black' : ''}>Home</button>
          <button onClick={() => setActiveTab('analysis')} className={activeTab === 'analysis' ? 'border-b-2 border-black' : ''}>AI Analysis</button>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto p-8">
        {activeTab === 'home' && (
          <div className="text-center py-20">
            <h1 className="text-6xl font-bold mb-6">AI Facial Skincare Analysis</h1>
            <p className="text-xl text-gray-600 mb-10">Professional-grade skin assessment powered by advanced AI.</p>
            <button 
              onClick={() => setActiveTab('analysis')}
              className="bg-gray-900 text-white px-10 py-4 font-bold rounded-full flex items-center gap-2 mx-auto hover:bg-black transition"
            >
              Start Your Analysis <ArrowRight size={20} />
            </button>
          </div>
        )}

        {activeTab === 'analysis' && (
          <div className="bg-white border-2 border-black p-8 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
            {!selectedImage ? (
              <div 
                onClick={() => fileInputRef.current.click()}
                className="border-4 border-dashed border-gray-200 p-20 text-center cursor-pointer hover:border-gray-900 transition"
              >
                <Camera size={48} className="mx-auto mb-4 text-gray-400" />
                <p className="font-bold text-xl">Upload or Take a Photo</p>
                <p className="text-gray-500">Ensure your face is well-lit and centered.</p>
                <input type="file" ref={fileInputRef} onChange={onFileChange} className="hidden" accept="image/*" />
              </div>
            ) : (
              <div className="space-y-6">
                <img src={selectedImage} alt="User Face" className="w-full max-h-96 object-contain rounded-lg" />
                {analyzing ? (
                  <div className="flex items-center justify-center gap-3 p-6 bg-gray-50 font-bold">
                    <Loader2 className="animate-spin" /> Analyzing Skin Texture & Health...
                  </div>
                ) : results && (
                  <div className="grid gap-4">
                    <h3 className="text-2xl font-bold border-b-2 pb-2">Analysis Results</h3>
                    {/* Map through your actual backend results here */}
                    <div className="flex justify-between items-center p-4 bg-green-50 border border-green-200 rounded">
                      <span>Hydration Level</span>
                      <span className="font-bold">Optimal</span>
                    </div>
                    <button onClick={() => setSelectedImage(null)} className="underline text-sm">Start New Analysis</button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default DermatologyApp;
