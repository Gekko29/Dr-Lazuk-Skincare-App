import React, { useState, useRef, useEffect } from 'react';
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
