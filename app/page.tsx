"use client"

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Check, X, Clock, Users, Calendar, QrCode } from 'lucide-react';

// Types
interface SessionData {
  id: string;
  name: string;
  department: string;
  price: number;
  loginTime: string;
  sessionId: string;
}

interface MealUsedInfo {
  name: string;
  department: string;
  staffId: string;
  usedDate: string;
  usedTime: string;
}

declare global {
  interface Window {
    jsQR?: {
      (imageData: Uint8ClampedArray, width: number, height: number, options?: { inversionAttempts: string }): {
        data: string;
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
  const [currentPage, setCurrentPage] = useState<string>('login');
  const [session, setSession] = useState<SessionData | null>(null);
  const [staffId, setStaffId] = useState<string>('');
  const [surname, setSurname] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [mealUsedToday, setMealUsedToday] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [showQRScanner, setShowQRScanner] = useState<boolean>(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [mealUsedInfo, setMealUsedInfo] = useState<MealUsedInfo | null>(null);
  const [jsQRLoaded, setJsQRLoaded] = useState<boolean>(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const detectIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Load jsQR library
  useEffect(() => {
    const loadJsQR = async (): Promise<void> => {
      const cdnUrls = [
        'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js',
        'https://unpkg.com/jsqr@1.4.0/dist/jsQR.min.js'
      ];

      for (const url of cdnUrls) {
        try {
          const script = document.createElement('script');
          script.src = url;
          
          const loadPromise = new Promise<void>((resolve, reject) => {
            script.onload = () => {
              setJsQRLoaded(true);
              resolve();
            };
            script.onerror = () => reject(new Error(`Failed to load from ${url}`));
          });

          document.body.appendChild(script);
          await loadPromise;
          return;
        } catch (err) {
          continue;
        }
      }
    };

    loadJsQR();
  }, []);

  const checkMealStatus = useCallback(async (staffId: string): Promise<void> => {
    const today = new Date().toISOString().split('T')[0];
    
    try {
      const response = await fetch(`${GOOGLE_SHEETS_CONFIG.SCRIPT_URL}?action=checkMeal&staffId=${staffId}&date=${today}`);
      const data = await response.json();
      setMealUsedToday(data.used);
    } catch (err) {
      console.error('Error checking meal status:', err);
    }
  }, []);

  // Check stored session
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];

    const storedSession = localStorage.getItem('mealTicketSession');
    if (storedSession) {
      const sessionData = JSON.parse(storedSession);
      
      fetch(`${GOOGLE_SHEETS_CONFIG.SCRIPT_URL}?action=checkMeal&staffId=${sessionData.id}&date=${today}`)
        .then(res => res.json())
        .then(mealData => {
          if (mealData.used) {
            setMealUsedInfo({
              name: sessionData.name,
              department: sessionData.department,
              staffId: sessionData.id,
              usedDate: mealData.date || today,
              usedTime: mealData.time || 'Earlier today'
            });
            localStorage.removeItem('mealTicketSession');
            setCurrentPage('alreadyUsed');
            return;
          }
          
          if (sessionData.sessionId) {
            fetch(`${GOOGLE_SHEETS_CONFIG.SCRIPT_URL}?action=verifySession&staffId=${sessionData.id}&sessionId=${sessionData.sessionId}`)
              .then(res => res.json())
              .then(data => {
                if (data.valid) {
                  setSession(sessionData);
                  checkMealStatus(sessionData.id);
                  setCurrentPage('dashboard');
                } else {
                  localStorage.removeItem('mealTicketSession');
                  setError('Your session has expired or you logged in on another device.');
                }
              })
              .catch(err => {
                console.error('Session verification failed:', err);
                localStorage.removeItem('mealTicketSession');
              });
          } else {
            localStorage.removeItem('mealTicketSession');
          }
        })
        .catch(err => {
          console.error('Failed to check meal status:', err);
          localStorage.removeItem('mealTicketSession');
        });
    }
  }, [checkMealStatus]);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement> | React.MouseEvent<HTMLButtonElement> | React.KeyboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const startTime = Date.now();
    const minLoadTime = 3000;

    try {
      const today = new Date().toISOString().split('T')[0];
      
      const [mealCheckResponse, validationResponse] = await Promise.all([
        fetch(`${GOOGLE_SHEETS_CONFIG.SCRIPT_URL}?action=checkMeal&staffId=${staffId}&date=${today}`),
        fetch(`${GOOGLE_SHEETS_CONFIG.SCRIPT_URL}?action=validateStaff&staffId=${staffId}&surname=${surname}`)
      ]);
      
      const mealCheck = await mealCheckResponse.json();
      const data = await validationResponse.json();
      
      if (mealCheck.used) {
        setMealUsedInfo({
          name: mealCheck.name,
          department: mealCheck.department,
          staffId: staffId,
          usedDate: mealCheck.date,
          usedTime: mealCheck.time
        });
        
        const elapsed = Date.now() - startTime;
        if (elapsed < minLoadTime) {
          await new Promise(resolve => setTimeout(resolve, minLoadTime - elapsed));
        }
        
        setLoading(false);
        setCurrentPage('alreadyUsed');
        return;
      }

      if (!data.valid) {
        const elapsed = Date.now() - startTime;
        if (elapsed < minLoadTime) {
          await new Promise(resolve => setTimeout(resolve, minLoadTime - elapsed));
        }
        
        setError('Invalid Staff ID or Surname. Please check your credentials.');
        setLoading(false);
        return;
      }
      
      const checkSessionResponse = await fetch(`${GOOGLE_SHEETS_CONFIG.SCRIPT_URL}?action=checkActiveSession&staffId=${staffId}`);
      const sessionCheck = await checkSessionResponse.json();
      
      if (sessionCheck.hasActiveSession) {
        const elapsed = Date.now() - startTime;
        if (elapsed < minLoadTime) {
          await new Promise(resolve => setTimeout(resolve, minLoadTime - elapsed));
        }
        
        setError('You are already logged in on another device. Please logout from that device first.');
        setLoading(false);
        return;
      }

      const sessionId = `${staffId}_${Date.now()}`;
      const sessionData = {
        id: staffId,
        name: data.name,
        department: data.department,
        price: data.price || 0,
        loginTime: new Date().toISOString(),
        sessionId: sessionId
      };
      
      await fetch(`${GOOGLE_SHEETS_CONFIG.SCRIPT_URL}?action=registerSession&staffId=${staffId}&sessionId=${sessionId}&loginTime=${sessionData.loginTime}`);
      
      setSession(sessionData);
      localStorage.setItem('mealTicketSession', JSON.stringify(sessionData));
      await checkMealStatus(staffId);
      
      const elapsed = Date.now() - startTime;
      if (elapsed < minLoadTime) {
        await new Promise(resolve => setTimeout(resolve, minLoadTime - elapsed));
      }
      
      setCurrentPage('dashboard');
    } catch (err) {
      console.error('Login error:', err);
      
      const elapsed = Date.now() - startTime;
      if (elapsed < minLoadTime) {
        await new Promise(resolve => setTimeout(resolve, minLoadTime - elapsed));
      }
      
      setError('Connection failed. Please check your internet connection.');
    }
    
    setLoading(false);
  };

  const verifyMeal = useCallback(async () => {
    if (!session) {
      setCurrentPage('login');
      return;
    }

    if (mealUsedToday) {
      setError('You have already used your meal ticket today');
      return;
    }

    setLoading(true);
    const startTime = Date.now();
    const minLoadTime = 3000;

    try {
      const timestamp = new Date().toLocaleTimeString();
      const today = new Date().toISOString().split('T')[0];
      
      const checkResponse = await fetch(`${GOOGLE_SHEETS_CONFIG.SCRIPT_URL}?action=checkMeal&staffId=${session.id}&date=${today}`);
      const checkData = await checkResponse.json();
      
      if (checkData.used) {
        const elapsed = Date.now() - startTime;
        if (elapsed < minLoadTime) {
          await new Promise(resolve => setTimeout(resolve, minLoadTime - elapsed));
        }
        
        setError('You have already used your meal ticket today');
        setMealUsedToday(true);
        setLoading(false);
        return;
      }
      
      const url = `${GOOGLE_SHEETS_CONFIG.SCRIPT_URL}?action=logMeal&staffId=${encodeURIComponent(session.id)}&name=${encodeURIComponent(session.name)}&department=${encodeURIComponent(session.department)}&price=${encodeURIComponent(session.price || 0)}&date=${encodeURIComponent(today)}&time=${encodeURIComponent(timestamp)}`;
      
      const response = await fetch(url);
      const result = await response.json();
      
      const elapsed = Date.now() - startTime;
      if (elapsed < minLoadTime) {
        await new Promise(resolve => setTimeout(resolve, minLoadTime - elapsed));
      }
      
      if (result.success) {
        setMealUsedToday(true);
        setCurrentPage('success');
      } else {
        setError(result.message || 'Failed to log meal');
      }
    } catch (err) {
      console.error('Meal logging error:', err);
      
      const elapsed = Date.now() - startTime;
      if (elapsed < minLoadTime) {
        await new Promise(resolve => setTimeout(resolve, minLoadTime - elapsed));
      }
      
      setError('Failed to connect to Google Sheets. Please try again.');
    }
    
    setLoading(false);
  }, [session, mealUsedToday]);

  const stopQRScanner = useCallback(() => {
    if (detectIntervalRef.current) {
      clearInterval(detectIntervalRef.current);
      detectIntervalRef.current = null;
    }

    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    
    setShowQRScanner(false);
  }, [cameraStream]);

  const startQRDetection = useCallback((): void => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    if (!video || !canvas) {
      return;
    }
    
    const context = canvas.getContext('2d');
    
    if (!context) {
      return;
    }
    
    detectIntervalRef.current = setInterval(() => {
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        if (canvas.width > 0 && canvas.height > 0) {
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
          
          try {
            if (typeof window !== 'undefined' && window.jsQR) {
              const code = window.jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: "dontInvert",
              });
              
              if (code && code.data) {
                if (detectIntervalRef.current) {
                  clearInterval(detectIntervalRef.current);
                  detectIntervalRef.current = null;
                }
                stopQRScanner();
                
                const detectedCode = code.data.trim();
                const expectedCode = CAFETERIA_QR_CODE.trim();
                
                if (detectedCode === expectedCode) {
                  verifyMeal();
                } else {
                  setError('Invalid QR Code. Please scan the correct cafeteria QR code.');
                  setTimeout(() => setError(''), 5000);
                }
              }
            }
          } catch (err) {
            // Silently handle detection errors
          }
        }
      }
    }, 250);
  }, [stopQRScanner, verifyMeal]);

  const startQRScanner = async () => {
    if (!jsQRLoaded) {
      setError('QR scanner is still loading. Please wait a moment and try again.');
      return;
    }
    
    try {
      setError('');
      setShowQRScanner(true);
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          width: { ideal: 1280 },
          height: { ideal: 720 }
        } 
      });
      
      setCameraStream(stream);
      
      setTimeout(() => {
        const video = videoRef.current;
        if (video && stream) {
          video.srcObject = stream;
          video.play()
            .then(() => {
              setTimeout(startQRDetection, 500);
            })
            .catch(() => {
              setError('Failed to start video');
            });
        }
      }, 300);
      
    } catch (err) {
      setError('Camera access denied. Please enable camera permissions.');
      setShowQRScanner(false);
    }
  };

  const handleLogout = async () => {
    setLoading(true);
    const startTime = Date.now();
    const minLoadTime = 2000;
    
    if (session?.sessionId && !mealUsedToday) {
      try {
        await fetch(`${GOOGLE_SHEETS_CONFIG.SCRIPT_URL}?action=unregisterSession&staffId=${session.id}&sessionId=${session.sessionId}`);
      } catch (err) {
        console.error('Unregister error:', err);
      }
    }
    
    localStorage.removeItem('mealTicketSession');
    setSession(null);
    setMealUsedToday(false);
    setStaffId('');
    setSurname('');
    setError('');
    setMealUsedInfo(null);
    
    stopQRScanner();
    
    const elapsed = Date.now() - startTime;
    if (elapsed < minLoadTime) {
      await new Promise(resolve => setTimeout(resolve, minLoadTime - elapsed));
    }
    
    setLoading(false);
    setCurrentPage('login');
  };
  

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopQRScanner();
    };
  }, [stopQRScanner]);

  if (currentPage === 'login') {
    return (
      <div className="min-h-screen bg-linear-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
          <div className="text-center mb-8">
            <div className="bg-indigo-600 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <Users className="text-white" size={32} />
            </div>
            <h1 className="text-3xl font-bold text-gray-800 mb-2">Meal Ticket System</h1>
            <p className="text-gray-600">Login to access your meal ticket</p>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Staff ID</label>
              <input
                type="text"
                value={staffId}
                onChange={(e) => setStaffId(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleLogin(e)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                placeholder="Enter your Staff ID"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Surname</label>
              <input
                type="text"
                value={surname}
                onChange={(e) => setSurname(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleLogin(e)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                placeholder="Enter your Surname"
              />
            </div>

            {error && (
              <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg flex items-center gap-2">
                <X size={20} />
                <span className="text-sm">{error}</span>
              </div>
            )}

            <button
              onClick={handleLogin}
              disabled={loading}
              className="w-full bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 transition disabled:opacity-50"
            >
              {loading ? 'Logging in...' : 'Login'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (currentPage === 'dashboard') {
    return (
      <div className="min-h-screen bg-linear-to-br from-blue-50 to-indigo-100 p-4">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
            <div className="bg-indigo-600 text-white p-6">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-2xl font-bold mb-1">{session?.name}</h2>
                  <p className="text-indigo-200">ID: {session?.id} • {session?.department}</p>
                </div>
                <button
                  onClick={handleLogout}
                  disabled={loading}
                  className="bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg text-sm transition disabled:opacity-50"
                >
                  {loading ? 'Logging out...' : 'Logout'}
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
                  <p className="text-sm text-indigo-600 font-medium">Your Meal Ticket Price</p>
                  <p className="font-bold text-2xl text-indigo-900">₦{session?.price || 0}</p>
                </div>
              </div>

              <div className={`rounded-xl p-6 ${mealUsedToday ? 'bg-green-50' : 'bg-amber-50'}`}>
                <div className="flex items-center gap-3 mb-4">
                  {mealUsedToday ? (
                    <Check className="text-green-600" size={32} />
                  ) : (
                    <Clock className="text-amber-600" size={32} />
                  )}
                  <div>
                    <h3 className="text-xl font-bold text-gray-800">
                      {mealUsedToday ? 'Meal Ticket Used' : 'Meal Ticket Available'}
                    </h3>
                    <p className={`text-sm ${mealUsedToday ? 'text-green-700' : 'text-amber-700'}`}>
                      {mealUsedToday 
                        ? 'You have already used your meal ticket today' 
                        : 'Scan the QR code at the cafeteria to use your meal ticket'}
                    </p>
                  </div>
                </div>

                {!mealUsedToday && (
                  <div className="mt-6 space-y-4">
                    {!showQRScanner ? (
                      <button
                        onClick={startQRScanner}
                        disabled={!jsQRLoaded}
                        className="w-full bg-green-600 text-white py-4 rounded-lg font-semibold hover:bg-green-700 transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <QrCode size={24} />
                        {jsQRLoaded ? 'Open Camera to Scan QR Code' : 'Loading Scanner...'}
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
                          
                          <div className="absolute bottom-4 left-0 right-0 text-center">
                            <p className="text-white text-sm bg-black/70 inline-block px-4 py-2 rounded-lg">
                              Hold QR code steady within green frame
                            </p>
                          </div>
                        </div>
                        
                        <div className="bg-gray-800 p-3">
                          <p className="text-white text-xs text-center">
                            💡 Make sure QR code is well-lit and clear
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

                {error && (
                  <div className="mt-4 bg-red-50 text-red-600 px-4 py-3 rounded-lg flex items-center gap-2">
                    <X size={20} />
                    <span className="text-sm">{error}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (currentPage === 'success') {
    return (
      <div className="min-h-screen bg-linear-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
          <div className="text-center">
            <div className="bg-green-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="text-green-600" size={40} />
            </div>
            <h2 className="text-3xl font-bold text-gray-800 mb-2">Meal Ticket Used!</h2>
            <p className="text-gray-600 mb-2">Successfully marked for {session?.name}</p>
            <p className="text-sm text-gray-500 mb-2">
              Date: {new Date().toLocaleDateString()}
            </p>
            <p className="text-sm text-gray-500 mb-2">
              Time: {new Date().toLocaleTimeString()}
            </p>
            <div className="bg-indigo-100 border-2 border-indigo-300 rounded-lg p-3 mb-6">
              <p className="text-indigo-700 text-sm font-medium mb-1">Ticket Price</p>
              <p className="text-indigo-900 text-3xl font-bold">₦{session?.price || 0}</p>
            </div>
            
            <div className="bg-green-50 border-l-4 border-green-500 p-4 mb-6">
              <p className="text-sm text-green-700 font-semibold">
                ✓ Logged to Google Sheets
              </p>
              <p className="text-xs text-green-600 mt-1">
                Session locked until tomorrow at 7 AM
              </p>
            </div>
            
            <button
              onClick={handleLogout}
              disabled={loading}
              className="bg-indigo-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-indigo-700 transition w-full disabled:opacity-50"
            >
              {loading ? 'Logging out...' : 'Logout'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (currentPage === 'alreadyUsed') {
    return (
      <div className="min-h-screen bg-linear-to-br from-red-50 to-orange-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
          <div className="text-center">
            <div className="bg-red-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4">
              <X className="text-red-600" size={40} />
            </div>
            <h2 className="text-3xl font-bold text-gray-800 mb-2">Meal Already Used!</h2>
            <p className="text-gray-600 mb-4">{mealUsedInfo?.name}</p>
            
            <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6 text-left">
              <p className="text-sm text-red-700 font-semibold mb-2">
                ⚠️ You have already used your meal ticket today
              </p>
              <div className="text-xs text-red-600 space-y-1">
                <p>• Staff ID: {mealUsedInfo?.staffId}</p>
                <p>• Department: {mealUsedInfo?.department}</p>
                <p>• Used on: {mealUsedInfo?.usedDate}</p>
                <p>• Time: {mealUsedInfo?.usedTime}</p>
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
                Monday - Friday only
              </p>
            </div>
            
            <button
              onClick={() => {
                setMealUsedInfo(null);
                setStaffId('');
                setSurname('');
                setCurrentPage('login');
              }}
              className="bg-gray-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-gray-700 transition w-full"
            >
              Back to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default MealTicketSystem;