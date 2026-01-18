"use client"

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Check, X, Clock, Users, Calendar, QrCode, AlertCircle, MapPin } from 'lucide-react';

interface SessionData {
  id: string;
  name: string;
  department: string;
  location: string;
  price: number;
}

interface MealUsedInfo {
  name: string;
  department: string;
  location: string;
  staffId: string;
  usedDate: string;
  usedTime: string;
  price: number;
}

declare global {
  interface Window {
    jsQR?: {
      (imageData: Uint8ClampedArray, width: number, height: number, options?: {
        inversionAttempts?: string;
        greyScaleWeights?: {
          red: number;
          green: number;
          blue: number;
        };
      }): {
        data: string;
        location: {
          topRightCorner: { x: number; y: number };
          topLeftCorner: { x: number; y: number };
          bottomRightCorner: { x: number; y: number };
          bottomLeftCorner: { x: number; y: number };
        };
      } | null;
    };
  }
}

const CAFETERIA_QR_CODE = "ELIZADE NIGERIA LIMITED MEAL TICKETING";
const GOOGLE_SHEETS_CONFIG = {
  SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbz3W4uY_rORZRrxar31BV7l3G14F8egzggutmvLyL70sMBLAlKOnteXysdD6oD4Tgsu6A/exec',
  ENABLED: true
} as const;

const MealTicketSystem = () => {
  // Consolidated state
  const [state, setState] = useState({
    currentPage: 'login',
    session: null as SessionData | null,
    staffId: '',
    surname: '',
    error: '',
    mealUsedToday: false,
    loading: false,
    showQRScanner: false,
    cameraStream: null as MediaStream | null,
    mealUsedInfo: null as MealUsedInfo | null,
    jsQRLoaded: false,
    isTransitioning: false
  });
  
  // Helper to update state - useCallback to prevent recreating on every render
  const updateState = useCallback((updates: Partial<typeof state>) => {
    setState(prev => ({ ...prev, ...updates }));
  }, []);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const detectIntervalRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    // Preload jsQR library immediately
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js';
    script.async = true;
    
    const loadScript = () => {
      updateState({ jsQRLoaded: true });
    };
    
    script.onload = loadScript;
    script.onerror = () => {
      // Fallback to unpkg if CDN fails
      const fallback = document.createElement('script');
      fallback.src = 'https://unpkg.com/jsqr@1.4.0/dist/jsQR.min.js';
      fallback.async = true;
      fallback.onload = loadScript;
      fallback.onerror = () => {
        console.error('Failed to load jsQR library');
        updateState({ error: 'Failed to load QR scanner. Please refresh the page.' });
      };
      document.body.appendChild(fallback);
    };
    
    document.body.appendChild(script);

    return () => {
      if (script.parentNode) script.parentNode.removeChild(script);
    };
  }, [updateState]);

  // Smooth page transition - very subtle
  const changePage = useCallback((newPage: string) => {
    updateState({ isTransitioning: true });
    setTimeout(() => {
      updateState({ currentPage: newPage });
      setTimeout(() => updateState({ isTransitioning: false }), 50);
    }, 150);
  }, [updateState]);

  const handleLogin = useCallback(async (e: React.FormEvent<HTMLFormElement> | React.MouseEvent<HTMLButtonElement> | React.KeyboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    updateState({ error: '', loading: true });

    try {
      const today = new Date().toISOString().split('T')[0];
      const upperStaffId = state.staffId.toUpperCase().trim();
      const upperSurname = state.surname.toUpperCase().trim();
      
      // Optimized: Use Promise.race with timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Request timeout')), 10000) // 10 second timeout
      );
      
      const fetchPromise = fetch(
        `${GOOGLE_SHEETS_CONFIG.SCRIPT_URL}?action=batchLogin&staffId=${encodeURIComponent(upperStaffId)}&surname=${encodeURIComponent(upperSurname)}&date=${today}`,
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        }
      );
      
      const response = await Promise.race([fetchPromise, timeoutPromise]) as Response;
      const data = await response.json();
      
      if (!data.success) {
        if (data.errorType === 'ALREADY_USED') {
          updateState({
            mealUsedInfo: {
              name: data.mealInfo.name,
              department: data.mealInfo.department,
              location: data.mealInfo.location || 'Unknown',
              staffId: upperStaffId,
              usedDate: data.mealInfo.date,
              usedTime: data.mealInfo.time,
              price: data.mealInfo.price || 0
            },
            loading: false
          });
          changePage('alreadyUsed');
          return;
        }
        
        updateState({
          error: data.errorType === 'TIME_EXPIRED' ? data.error : (data.error || 'Invalid Staff ID or Surname'),
          loading: false
        });
        return;
      }

      const sessionData = {
        id: upperStaffId,
        name: data.staff.name,
        department: data.staff.department,
        location: data.staff.location || 'NOT SET',
        price: data.staff.price || 0
      };
      
      updateState({ session: sessionData, mealUsedToday: false, loading: false });
      changePage('dashboard');
      
    } catch (err) {
      console.error('Login error:', err);
      const errorMsg = err instanceof Error && err.message === 'Request timeout' 
        ? 'Request timeout. Server is taking too long to respond.' 
        : 'Connection failed. Please check your internet connection.';
      updateState({ error: errorMsg, loading: false });
    }
  }, [state.staffId, state.surname, updateState, changePage]);

  const verifyMeal = useCallback(async () => {
    if (!state.session) {
      changePage('login');
      return;
    }

    if (state.mealUsedToday) {
      updateState({ error: 'You have already used your meal ticket today' });
      return;
    }

    updateState({ loading: true });

    try {
      const timestamp = new Date().toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true 
      });
      const today = new Date().toISOString().split('T')[0];
      
      const url = `${GOOGLE_SHEETS_CONFIG.SCRIPT_URL}?action=logMeal&staffId=${encodeURIComponent(state.session.id)}&name=${encodeURIComponent(state.session.name)}&department=${encodeURIComponent(state.session.department)}&location=${encodeURIComponent(state.session.location)}&price=${encodeURIComponent(state.session.price || 0)}&date=${encodeURIComponent(today)}&time=${encodeURIComponent(timestamp)}`;
      
      // Optimized: Add timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Request timeout')), 10000)
      );
      
      const fetchPromise = fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });
      
      const response = await Promise.race([fetchPromise, timeoutPromise]) as Response;
      const result = await response.json();
      
      if (result.success) {
        updateState({ mealUsedToday: true, loading: false });
        changePage('success');
      } else {
        updateState({ error: result.message || 'Failed to log meal', loading: false });
      }
    } catch (err) {
      console.error('Meal logging error:', err);
      const errorMsg = err instanceof Error && err.message === 'Request timeout' 
        ? 'Request timeout. Server is taking too long to respond.' 
        : 'Failed to connect. Please try again.';
      updateState({ error: errorMsg, loading: false });
    }
  }, [state.session, state.mealUsedToday, changePage, updateState]);

  const stopQRScanner = useCallback(() => {
    if (detectIntervalRef.current) {
      clearInterval(detectIntervalRef.current);
      detectIntervalRef.current = null;
    }

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (state.cameraStream) {
      state.cameraStream.getTracks().forEach(track => track.stop());
    }
    
    updateState({ cameraStream: null, showQRScanner: false });
    
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, [state.cameraStream, updateState]);

  const startQRDetection = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    if (!video || !canvas) return;
    
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return;
    
    let lastScanTime = 0;
    const scanInterval = 150; // Reduced from 300ms to 150ms for faster scanning
    
    const detectFrame = (timestamp: number) => {
      if (!video || !canvas || !context) return;
      
      if (timestamp - lastScanTime < scanInterval) {
        animationFrameRef.current = requestAnimationFrame(detectFrame);
        return;
      }
      
      lastScanTime = timestamp;
      
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }
        
        if (canvas.width > 0 && canvas.height > 0) {
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
          
          try {
            if (window.jsQR) {
              const code = window.jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: "dontInvert",
              });
              
              if (code?.data) {
                stopQRScanner();
                
                const detectedCode = code.data.trim();
                const expectedCode = CAFETERIA_QR_CODE.trim();
                
                if (detectedCode === expectedCode) {
                  verifyMeal();
                } else {
                  updateState({ error: 'Invalid QR Code. Please scan the correct canteen QR code.' });
                  setTimeout(() => updateState({ error: '' }), 5000);
                }
                return;
              }
            }
          } catch (err) {
            console.error('QR detection error:', err);
          }
        }
      }
      
      animationFrameRef.current = requestAnimationFrame(detectFrame);
    };
    
    animationFrameRef.current = requestAnimationFrame(detectFrame);
  }, [stopQRScanner, verifyMeal, updateState]);

  const startQRScanner = useCallback(async () => {
    if (!state.jsQRLoaded) {
      updateState({ error: 'QR scanner is still loading. Please wait a moment and try again.' });
      return;
    }
    
    try {
      updateState({ error: '' });
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        } 
      });
      
      updateState({ cameraStream: stream, showQRScanner: true });
      
      // Reduced delay for faster camera startup
      setTimeout(() => {
        const video = videoRef.current;
        if (video && stream?.active) {
          video.srcObject = stream;
          video.play()
            .then(() => {
              setTimeout(startQRDetection, 100); // Reduced from 300ms to 100ms
            })
            .catch(() => {
              updateState({ error: 'Failed to start video' });
            });
        }
      }, 100); // Reduced from 200ms to 100ms
      
    } catch {
      updateState({ error: 'Camera access denied. Please enable camera permissions.', showQRScanner: false });
    }
  }, [state.jsQRLoaded, updateState, startQRDetection]);

  const handleLogout = useCallback(async () => {
    updateState({ loading: true });
    
    stopQRScanner();
    
    updateState({
      session: null,
      mealUsedToday: false,
      staffId: '',
      surname: '',
      error: '',
      mealUsedInfo: null,
      loading: false
    });
    
    changePage('login');
  }, [updateState, stopQRScanner, changePage]);

  useEffect(() => {
    return () => {
      if (detectIntervalRef.current) clearInterval(detectIntervalRef.current);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (state.cameraStream) state.cameraStream.getTracks().forEach(track => track.stop());
    };
  }, [state.cameraStream]);

  return (
    <>
      <style>{`
        @keyframes subtleFade {
          from {
            opacity: 0.7;
          }
          to {
            opacity: 1;
          }
        }
        
        .page-transition {
          animation: subtleFade 0.15s ease-out;
        }
      `}</style>

      <div className={state.isTransitioning ? 'opacity-0 transition-opacity duration-150' : 'page-transition'}>
        {state.currentPage === 'login' && (
          <div className="min-h-screen bg-linear-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4 pb-20">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
              <div className="text-center mb-8">
                <div className="bg-indigo-600 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Users className="text-white" size={32} />
                </div>
                <h1 className="text-3xl font-bold text-gray-800 mb-2">Meal Ticket System</h1>
                <p className="text-gray-600">Login to access your meal ticket</p>
                <div className="mt-3 text-xs text-gray-500 bg-blue-50 px-3 py-2 rounded-lg flex items-center justify-center">
                  <Clock className="inline-block mr-1" size={12} />
                  Available: Mon-Fri, 7AM - 5PM
                </div>
              </div>

              <form onSubmit={handleLogin} autoComplete="on">
                <div className="space-y-6">
                  <div>
                    <label htmlFor="staffId" className="block text-sm font-medium text-gray-700 mb-2">
                      Staff ID <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="staffId"
                      name="username"
                      type="text"
                      value={state.staffId}
                      onChange={(e) => updateState({ staffId: e.target.value.toUpperCase() })}
                      autoComplete="username"
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none uppercase"
                      placeholder="ENTER STAFF ID"
                      required
                    />
                  </div>

                  <div>
                    <label htmlFor="surname" className="block text-sm font-medium text-gray-700 mb-2">
                      Surname <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="surname"
                      name="password"
                      type="text"
                      value={state.surname}
                      onChange={(e) => updateState({ surname: e.target.value.toUpperCase() })}
                      autoComplete="current-password"
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none uppercase"
                      placeholder="ENTER SURNAME"
                      required
                    />
                  </div>

                  {state.error && (
                    <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg flex items-start gap-2">
                      <AlertCircle size={20} className="shrink-0 mt-0.5" />
                      <span className="text-sm">{state.error}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={state.loading}
                    className="w-full bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {state.loading ? 'Authenticating...' : 'Login'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {state.currentPage === 'dashboard' && (
          <div className="min-h-screen bg-linear-to-br from-blue-50 to-indigo-100 p-4 pb-20">
            <div className="max-w-4xl mx-auto">
              <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
                <div className="bg-indigo-600 text-white p-6">
                  <div className="flex justify-between items-start">
                    <div>
                      <h2 className="text-2xl font-bold mb-1">{state.session?.name}</h2>
                      <p className="text-indigo-200">ID: {state.session?.id} • {state.session?.department}</p>
                      <div className="flex items-center gap-1 mt-2 text-indigo-100">
                        <MapPin size={16} />
                        <span className="text-sm">{state.session?.location}</span>
                      </div>
                    </div>
                    <button
                      onClick={handleLogout}
                      disabled={state.loading}
                      className="bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg text-sm transition disabled:opacity-50"
                    >
                      Logout
                    </button>
                  </div>
                </div>

                <div className="p-6 space-y-6">
                  <div className="bg-gray-50 rounded-xl p-4 flex items-center gap-3">
                    <Calendar className="text-indigo-600" size={24} />
                    <div>
                      <p className="text-sm text-gray-600">Today&apos;s Date</p>
                      <p className="font-semibold text-gray-800">
                        {new Date().toLocaleDateString('en-US', { 
                          weekday: 'long', 
                          year: 'numeric', 
                          month: 'long', 
                          day: 'numeric' 
                        })}
                      </p>
                    </div>
                  </div>

                  <div className="bg-indigo-50 rounded-xl p-4 flex items-center gap-3 border border-indigo-200">
                    <div className="bg-indigo-600 text-white w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg">
                      ₦
                    </div>
                    <div>
                      <p className="text-sm text-indigo-600 font-medium">Your Meal Price</p>
                      <p className="font-bold text-2xl text-indigo-900">₦{state.session?.price?.toLocaleString() || 0}</p>
                    </div>
                  </div>

                  <div className={`rounded-xl p-6 ${state.mealUsedToday ? 'bg-green-50' : 'bg-amber-50'}`}>
                    <div className="flex items-center gap-3 mb-4">
                      {state.mealUsedToday ? (
                        <Check className="text-green-600" size={32} />
                      ) : (
                        <Clock className="text-amber-600" size={32} />
                      )}
                      <div>
                        <h3 className="text-xl font-bold text-gray-800">
                          {state.mealUsedToday ? 'Meal Ticket Used' : 'Meal Ticket Available'}
                        </h3>
                        <p className={`text-sm ${state.mealUsedToday ? 'text-green-700' : 'text-amber-700'}`}>
                          {state.mealUsedToday 
                            ? 'You have already used your meal ticket today' 
                            : 'Scan the QR code at the canteen to use your meal ticket'}
                        </p>
                      </div>
                    </div>

                    {!state.mealUsedToday && (
                      <div className="mt-6 space-y-4">
                        {!state.showQRScanner ? (
                          <button
                            onClick={startQRScanner}
                            disabled={!state.jsQRLoaded || state.loading}
                            className="w-full bg-green-600 text-white py-4 rounded-lg font-semibold hover:bg-green-700 transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <QrCode size={24} />
                            {state.loading ? 'Processing...' : state.jsQRLoaded ? 'Open Camera to Scan QR Code' : 'Loading Scanner...'}
                          </button>
                        ) : (
                          <div className="bg-black rounded-lg overflow-hidden">
                            <div className="relative bg-black" style={{ minHeight: '350px' }}>
                              <video
                                ref={videoRef}
                                autoPlay
                                playsInline
                                muted
                                className="w-full"
                                style={{ 
                                  maxHeight: '500px', 
                                  minHeight: '350px',
                                  objectFit: 'cover'
                                }}
                              />
                              <canvas ref={canvasRef} style={{ display: 'none' }} />
                              
                              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <div className="w-64 h-64 border-4 border-green-500 rounded-lg animate-pulse"></div>
                              </div>
                              
                              <div className="absolute top-4 left-0 right-0 text-center">
                                <p className="text-white text-xs bg-green-600/80 inline-block px-4 py-2 rounded-lg">
                                  📹 Scanning for QR Code...
                                </p>
                              </div>
                            </div>
                            
                            <div className="bg-gray-800 p-3">
                              <p className="text-white text-xs text-center">
                                💡 Hold QR code steady within green frame
                              </p>
                            </div>
                            
                            <button
                              onClick={stopQRScanner}
                              className="w-full bg-red-600 text-white py-3 font-semibold hover:bg-red-700 transition"
                            >
                              Cancel Scan
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {state.error && (
                      <div className="mt-4 bg-red-50 text-red-600 px-4 py-3 rounded-lg flex items-start gap-2">
                        <AlertCircle size={20} className="shrink-0 mt-0.5" />
                        <span className="text-sm">{state.error}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {state.currentPage === 'success' && (
          <div className="min-h-screen bg-linear-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4 pb-20">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
              <div className="text-center">
                <div className="bg-green-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Check className="text-green-600" size={40} />
                </div>
                <h2 className="text-3xl font-bold text-gray-800 mb-2">Meal Ticket Used!</h2>
                <p className="text-gray-600 mb-2">Successfully marked for {state.session?.name}</p>
                <p className="text-sm text-gray-500 mb-2">Date: {new Date().toLocaleDateString()}</p>
                <p className="text-sm text-gray-500 mb-2">Time: {new Date().toLocaleTimeString()}</p>
                
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 mb-3 flex items-center gap-2 justify-center">
                  <MapPin size={16} className="text-purple-600" />
                  <span className="text-purple-700 font-medium text-sm">{state.session?.location}</span>
                </div>
                
                <div className="bg-indigo-100 border-2 border-indigo-300 rounded-lg p-3 mb-6">
                  <p className="text-indigo-700 text-sm font-medium mb-1">Ticket Price</p>
                  <p className="text-indigo-900 text-3xl font-bold">₦{state.session?.price?.toLocaleString() || 0}</p>
                </div>
                
                <div className="bg-green-50 border-l-4 border-green-500 p-4 mb-6">
                  <p className="text-sm text-green-700 font-semibold">✓ STATUS: USED</p>
                  <p className="text-xs text-green-600 mt-1">Your meal ticket has been successfully used for today.</p>
                  <p className="text-xs text-green-600">You may use your next ticket starting tomorrow at 7:00 AM.</p>
                </div>
                
                <button
                  onClick={handleLogout}
                  disabled={state.loading}
                  className="bg-indigo-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-indigo-700 transition w-full disabled:opacity-50"
                >
                  {state.loading ? 'Logging out...' : 'Logout'}
                </button>
              </div>
            </div>
          </div>
        )}

        {state.currentPage === 'alreadyUsed' && (
          <div className="min-h-screen bg-linear-to-br from-red-50 to-orange-100 flex items-center justify-center p-4 pb-20">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
              <div className="text-center">
                <div className="bg-red-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <X className="text-red-600" size={40} />
                </div>
                <h2 className="text-3xl font-bold text-gray-800 mb-2">Meal Already Used!</h2>
                <p className="text-gray-600 mb-4">{state.mealUsedInfo?.name}</p>
                
                <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6 text-left">
                  <p className="text-sm text-red-700 font-semibold mb-2">
                    ⚠️ You have already used your meal ticket today
                  </p>
                  <div className="text-xs text-red-600 space-y-1">
                    <p>• Staff ID: {state.mealUsedInfo?.staffId}</p>
                    <p>• Department: {state.mealUsedInfo?.department}</p>
                    <p className="flex items-center gap-1">
                      • Location: <MapPin size={12} className="inline" /> {state.mealUsedInfo?.location}
                    </p>
                    <p>• Price: ₦{state.mealUsedInfo?.price?.toLocaleString() || 0}</p>
                    <p>• Used on: {state.mealUsedInfo?.usedDate}</p>
                    <p>• Time: {state.mealUsedInfo?.usedTime}</p>
                    <p className="font-bold text-red-700 mt-2">• STATUS: USED</p>
                  </div>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                  <p className="text-sm text-blue-800 font-semibold mb-1">
                    Next Available Time:
                  </p>
                  <p className="text-lg text-blue-900 font-bold">
                    Tomorrow at 7:00 AM
                  </p>
                  <p className="text-xs text-blue-700 mt-2">
                    Monday - Friday only • Expires daily at 5:00 PM
                  </p>
                </div>
                
                <button
                  onClick={() => {
                    updateState({ mealUsedInfo: null, staffId: '', surname: '' });
                    changePage('login');
                  }}
                  className="bg-gray-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-gray-700 transition w-full"
                >
                  Back to Login
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
     
      <div className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-sm border-t border-gray-200 py-3 z-50">
        <p className="text-center text-xs text-gray-600">
          © {new Date().getFullYear()} ENL ICT. All rights reserved.
        </p>
      </div>
    </>
  );
};

export default MealTicketSystem;