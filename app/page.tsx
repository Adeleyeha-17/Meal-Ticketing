"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Check, X, Clock, Users, Calendar, QrCode, AlertCircle, MapPin, Eye, EyeOff } from 'lucide-react';

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
  const [currentPage, setCurrentPage] = useState<string>('login');
  const [session, setSession] = useState<SessionData | null>(null);
  const [staffId, setStaffId] = useState<string>('');
  const [surname, setSurname] = useState<string>('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string>('');
  const [mealUsedToday, setMealUsedToday] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [showQRScanner, setShowQRScanner] = useState<boolean>(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [mealUsedInfo, setMealUsedInfo] = useState<MealUsedInfo | null>(null);
  const [jsQRLoaded, setJsQRLoaded] = useState<boolean>(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const detectIntervalRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js';
    script.async = true;
    script.onload = () => setJsQRLoaded(true);
    script.onerror = () => {
      const fallback = document.createElement('script');
      fallback.src = 'https://unpkg.com/jsqr@1.4.0/dist/jsQR.min.js';
      fallback.async = true;
      fallback.onload = () => setJsQRLoaded(true);
      document.body.appendChild(fallback);
    };
    document.body.appendChild(script);

    return () => {
      if (script.parentNode) script.parentNode.removeChild(script);
    };
  }, []);

 const handleLogin = useCallback(async (e: React.FormEvent) => {
  e.preventDefault();
  
  setError('');
  setLoading(true);

  try {
    const today = new Date().toISOString().split('T')[0];
    const upperStaffId = staffId.toUpperCase().trim();
    const upperSurname = surname.toUpperCase().trim();
    
    const response = await fetch(
      `${GOOGLE_SHEETS_CONFIG.SCRIPT_URL}?action=batchLogin&staffId=${encodeURIComponent(upperStaffId)}&surname=${encodeURIComponent(upperSurname)}&date=${today}`
    );
    
    const data = await response.json();
    
    if (!data.success) {
      if (data.errorType === 'ALREADY_USED') {
        setMealUsedInfo({
          name: data.mealInfo.name,
          department: data.mealInfo.department,
          location: data.mealInfo.location || 'Unknown',
          staffId: upperStaffId,
          usedDate: data.mealInfo.date,
          usedTime: data.mealInfo.time,
          price: data.mealInfo.price || 0
        });
        setLoading(false);
        setTimeout(() => setCurrentPage('alreadyUsed'), 100);
        return;
      }
      
      if (data.errorType === 'TIME_EXPIRED') {
        setError(data.error);
      } else {
        setError(data.error || 'Invalid Staff ID or Surname');
      }
      
      setLoading(false);
      return;
    }

    const sessionData = {
      id: upperStaffId,
      name: data.staff.name,
      department: data.staff.department,
      location: data.staff.location || 'NOT SET',
      price: data.staff.price || 0
    };
    
    setSession(sessionData);
    setMealUsedToday(false);
    setTimeout(() => setCurrentPage('dashboard'), 100);
    
  } catch (err) {
    console.error('Login error:', err);
    setError('Connection failed. Please check your internet connection.');
  }
  
  setLoading(false);
}, [staffId, surname]);

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

    try {
      const timestamp = new Date().toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true 
      });
      const today = new Date().toISOString().split('T')[0];
      
      const url = `${GOOGLE_SHEETS_CONFIG.SCRIPT_URL}?action=logMeal&staffId=${encodeURIComponent(session.id)}&name=${encodeURIComponent(session.name)}&department=${encodeURIComponent(session.department)}&location=${encodeURIComponent(session.location)}&price=${encodeURIComponent(session.price || 0)}&date=${encodeURIComponent(today)}&time=${encodeURIComponent(timestamp)}`;
      
      const response = await fetch(url);
      const result = await response.json();
      
      if (result.success) {
        setMealUsedToday(true);
        setCurrentPage('success');
      } else {
        setError(result.message || 'Failed to log meal');
      }
    } catch (err) {
      console.error('Meal logging error:', err);
      setError('Failed to connect. Please try again.');
    }
    
    setLoading(false);
  }, [session, mealUsedToday]);

  const stopQRScanner = useCallback(() => {
    if (detectIntervalRef.current) {
      clearInterval(detectIntervalRef.current);
      detectIntervalRef.current = null;
    }

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
    }
    
    setCameraStream(null);
    
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    
    setShowQRScanner(false);
  }, [cameraStream]);

  const startQRDetection = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    if (!video || !canvas) return;
    
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return;
    
    let lastScanTime = 0;
    const scanInterval = 300;
    
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
                  setError('Invalid QR Code. Please scan the correct canteen QR code.');
                  setTimeout(() => setError(''), 5000);
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
  }, [stopQRScanner, verifyMeal]);

  const startQRScanner = async () => {
    if (!jsQRLoaded) {
      setError('QR scanner is still loading. Please wait a moment and try again.');
      return;
    }
    
    try {
      setError('');
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        } 
      });
      
      setCameraStream(stream);
      setShowQRScanner(true);
      
      setTimeout(() => {
        const video = videoRef.current;
        if (video && stream?.active) {
          video.srcObject = stream;
          video.play()
            .then(() => {
              setTimeout(startQRDetection, 300);
            })
            .catch(() => {
              setError('Failed to start video');
            });
        }
      }, 200);
      
    } catch {
      setError('Camera access denied. Please enable camera permissions.');
      setShowQRScanner(false);
    }
  };

  const handleLogout = async () => {
    setLoading(true);
    
    setSession(null);
    setMealUsedToday(false);
    setStaffId('');
    setSurname('');
    setError('');
    setMealUsedInfo(null);
    
    stopQRScanner();
    
    setLoading(false);
    setCurrentPage('login');
  };

  useEffect(() => {
    return () => {
      if (detectIntervalRef.current) clearInterval(detectIntervalRef.current);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (cameraStream) cameraStream.getTracks().forEach(track => track.stop());
    };
  }, [cameraStream]);

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

      {currentPage === 'login' && (
        <div className="page-transition min-h-screen bg-linear-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4 pb-20">
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

       <form onSubmit={handleLogin} method="post" action="#" className="space-y-6">
  <div>
    <label htmlFor="staffId" className="block text-sm font-medium text-gray-700 mb-2">
      Staff ID <span className="text-red-500">*</span>
    </label>
    <input
      id="staffId"
      type="text"
      name="username"
      autoComplete="username"
      value={staffId}
      onChange={(e) => setStaffId(e.target.value.toUpperCase())}
      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none uppercase"
      placeholder="ENTER STAFF ID"
      required
    />
  </div>

  <div>
    <label htmlFor="surname" className="block text-sm font-medium text-gray-700 mb-2">
      Surname <span className="text-red-500">*</span>
    </label>
    <div className="relative">
      <input
        id="surname"
        type={showPassword ? "text" : "password"}
        name="password"
        autoComplete="current-password"
        value={surname}
        onChange={(e) => setSurname(e.target.value.toUpperCase())}
        className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none uppercase"
        placeholder="ENTER SURNAME"
        required
      />
      <div
        onTouchEnd={(e) => {
          e.preventDefault();
          setShowPassword(!showPassword);
        }}
        onClick={(e) => {
          e.preventDefault();
          setShowPassword(!showPassword);
        }}
        className="absolute right-0 top-0 h-full px-4 text-gray-500 active:text-gray-900 flex items-center justify-center cursor-pointer select-none"
        style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
      >
        {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
      </div>
    </div>
  </div>

  {error && (
    <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg flex items-start gap-2">
      <AlertCircle size={20} className="shrink-0 mt-0.5" />
      <span className="text-sm">{error}</span>
    </div>
  )}

  <button
    type="submit"
    disabled={loading}
    className="w-full bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
  >
    {loading ? 'Authenticating...' : 'Login'}
  </button>
</form>
          </div>
        </div>
      )}

      {currentPage === 'dashboard' && (
        <div className="page-transition min-h-screen bg-linear-to-br from-blue-50 to-indigo-100 p-4 pb-20">
          <div className="max-w-4xl mx-auto">
            <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
              <div className="bg-indigo-600 text-white p-6">
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-2xl font-bold mb-1">{session?.name}</h2>
                    <p className="text-indigo-200">ID: {session?.id} • {session?.department}</p>
                    <div className="flex items-center gap-1 mt-2 text-indigo-100">
                      <MapPin size={16} />
                      <span className="text-sm">{session?.location}</span>
                    </div>
                  </div>
                  <button
                    onClick={handleLogout}
                    disabled={loading}
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
                    <p className="font-bold text-2xl text-indigo-900">₦{session?.price?.toLocaleString() || 0}</p>
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
                          : 'Scan the QR code at the canteen to use your meal ticket'}
                      </p>
                    </div>
                  </div>

                  {!mealUsedToday && (
                    <div className="mt-6 space-y-4">
                      {!showQRScanner ? (
                        <button
                          onClick={startQRScanner}
                          disabled={!jsQRLoaded || loading}
                          className="w-full bg-green-600 text-white py-4 rounded-lg font-semibold hover:bg-green-700 transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <QrCode size={24} />
                          {loading ? 'Processing...' : jsQRLoaded ? 'Open Camera to Scan QR Code' : 'Loading Scanner...'}
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

                  {error && (
                    <div className="mt-4 bg-red-50 text-red-600 px-4 py-3 rounded-lg flex items-start gap-2">
                      <AlertCircle size={20} className="shrink-0 mt-0.5" />
                      <span className="text-sm">{error}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {currentPage === 'success' && (
        <div className="page-transition min-h-screen bg-linear-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4 pb-20">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
            <div className="text-center">
              <div className="bg-green-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="text-green-600" size={40} />
              </div>
              <h2 className="text-3xl font-bold text-gray-800 mb-2">Meal Ticket Used!</h2>
              <p className="text-gray-600 mb-2">Successfully marked for {session?.name}</p>
              <p className="text-sm text-gray-500 mb-2">Date: {new Date().toLocaleDateString()}</p>
              <p className="text-sm text-gray-500 mb-2">Time: {new Date().toLocaleTimeString()}</p>
              
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 mb-3 flex items-center gap-2 justify-center">
                <MapPin size={16} className="text-purple-600" />
                <span className="text-purple-700 font-medium text-sm">{session?.location}</span>
              </div>
              
              <div className="bg-indigo-100 border-2 border-indigo-300 rounded-lg p-3 mb-6">
                <p className="text-indigo-700 text-sm font-medium mb-1">Ticket Price</p>
                <p className="text-indigo-900 text-3xl font-bold">₦{session?.price?.toLocaleString() || 0}</p>
              </div>
              
              <div className="bg-green-50 border-l-4 border-green-500 p-4 mb-6">
                <p className="text-sm text-green-700 font-semibold">✓ STATUS: USED</p>
                <p className="text-xs text-green-600 mt-1">Your meal ticket has been successfully used for today.</p>
                <p className="text-xs text-green-600">You may use your next ticket starting tomorrow at 7:00 AM.</p>
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
      )}

      {currentPage === 'alreadyUsed' && (
        <div className="page-transition min-h-screen bg-linear-to-br from-red-50 to-orange-100 flex items-center justify-center p-4 pb-20">
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
                  <p className="flex items-center gap-1">
                    • Location: <MapPin size={12} className="inline" /> {mealUsedInfo?.location}
                  </p>
                  <p>• Price: ₦{mealUsedInfo?.price?.toLocaleString() || 0}</p>
                  <p>• Used on: {mealUsedInfo?.usedDate}</p>
                  <p>• Time: {mealUsedInfo?.usedTime}</p>
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
      )}

      <div className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-sm border-t border-gray-200 py-3 z-50">
        <p className="text-center text-xs text-gray-600">
          © {new Date().getFullYear()} ENL ICT. All rights reserved.
        </p>
      </div>
    </>
  );
};

export default MealTicketSystem;