
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Language, 
  AppMode, 
  SummaryLength, 
  ChatStyle, 
  Message, 
  AppState 
} from './types';
import { translations } from './i18n';
import { askGemini } from './services/geminiService';
import { Logo, Spinner, MAX_FILE_SIZE, SUPPORTED_IMAGE_TYPES, SUPPORTED_AUDIO_TYPES } from './constants';

const App: React.FC = () => {
  const [state, setState] = useState<AppState>(() => {
    const saved = localStorage.getItem('aura_history');
    return {
      language: Language.TR,
      mode: AppMode.CHAT,
      history: saved ? JSON.parse(saved) : [],
      isLoading: false,
      isRecording: false,
      summaryLength: SummaryLength.MEDIUM,
      useBullets: false,
      generateTitle: false,
      chatStyle: ChatStyle.NORMAL,
      memoryLevel: 'medium',
      currentImage: null,
      cropRect: null,
    };
  });

  const [inputText, setInputText] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [volume, setVolume] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isSelecting, setIsSelecting] = useState(false);
  const [startPoint, setStartPoint] = useState({ x: 0, y: 0 });
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const t = translations[state.language];
  const isRTL = state.language === Language.AR;

  useEffect(() => {
    localStorage.setItem('aura_history', JSON.stringify(state.history));
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.history]);

  const handleError = (msg: string) => {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(null), 5000);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!SUPPORTED_IMAGE_TYPES.includes(file.type)) {
      handleError("Unsupported image type");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      handleError("File too large (>10MB)");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setState(prev => ({ ...prev, currentImage: event.target?.result as string, cropRect: null }));
    };
    reader.readAsDataURL(file);
  };

  const handleCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch (err) {
      handleError("Camera permission denied");
    }
  };

  const capturePhoto = () => {
    if (videoRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(videoRef.current, 0, 0);
      const dataUrl = canvas.toDataURL('image/png');
      setState(prev => ({ ...prev, currentImage: dataUrl, cropRect: null }));
      const tracks = (videoRef.current.srcObject as MediaStream)?.getTracks();
      tracks?.forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
  };

  // ROI Selection Logic
  const handleMouseDown = (e: React.MouseEvent) => {
    if (state.mode !== AppMode.REGION_ANALYSIS || !imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    setStartPoint({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    setIsSelecting(true);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isSelecting || !imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;
    setState(prev => ({
      ...prev,
      cropRect: {
        x: Math.min(startPoint.x, currentX),
        y: Math.min(startPoint.y, currentY),
        w: Math.abs(currentX - startPoint.x),
        h: Math.abs(currentY - startPoint.y),
      }
    }));
  };

  const handleMouseUp = () => {
    setIsSelecting(false);
  };

  const getCroppedImage = async (): Promise<string | null> => {
    if (!state.currentImage || !state.cropRect || !imgRef.current) return state.currentImage;
    
    const canvas = document.createElement('canvas');
    const scaleX = imgRef.current.naturalWidth / imgRef.current.clientWidth;
    const scaleY = imgRef.current.naturalHeight / imgRef.current.clientHeight;
    
    canvas.width = state.cropRect.w * scaleX;
    canvas.height = state.cropRect.h * scaleY;
    
    const ctx = canvas.getContext('2d');
    const image = new Image();
    image.src = state.currentImage;
    
    return new Promise<string>((resolve) => {
      image.onload = () => {
        ctx?.drawImage(
          image,
          state.cropRect!.x * scaleX, state.cropRect!.y * scaleY,
          state.cropRect!.w * scaleX, state.cropRect!.h * scaleY,
          0, 0, canvas.width, canvas.height
        );
        resolve(canvas.toDataURL('image/png'));
      };
    });
  };

  const handleScreenShare = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const video = document.createElement('video');
      video.srcObject = stream;
      video.onloadedmetadata = () => {
        video.play();
        setTimeout(() => {
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(video, 0, 0);
          setState(prev => ({ ...prev, currentImage: canvas.toDataURL('image/png'), cropRect: null }));
          stream.getTracks().forEach(t => t.stop());
        }, 300);
      };
    } catch (err) {
      handleError("Screen share cancelled");
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioContextRef.current = new AudioContext();
      analyserRef.current = audioContextRef.current.createAnalyser();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);
      
      const bufferLength = analyserRef.current.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      
      const updateVolume = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b) / bufferLength;
        setVolume(avg);
        if (state.isRecording) requestAnimationFrame(updateVolume);
      };

      mediaRecorderRef.current = new MediaRecorder(stream);
      mediaRecorderRef.current.start();
      setState(prev => ({ ...prev, isRecording: true }));
      updateVolume();

      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.lang = state.language === Language.TR ? 'tr-TR' : 'en-US';
        recognition.onresult = (event: any) => {
          const transcript = event.results[0][0].transcript;
          setInputText(transcript);
        };
        recognition.start();
      } else {
        handleError("STT not supported in this browser");
      }

    } catch (err) {
      handleError("Microphone permission denied");
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current?.stream.getTracks().forEach(t => t.stop());
    setState(prev => ({ ...prev, isRecording: false }));
    setVolume(0);
  };

  const handleSend = async () => {
    if (!inputText.trim() && !state.currentImage && state.mode !== AppMode.SUMMARIZE) return;

    let finalImage = state.currentImage;
    if (state.mode === AppMode.REGION_ANALYSIS && state.cropRect) {
      finalImage = await getCroppedImage();
    }

    const userMessage: Message = {
      role: 'user',
      content: inputText || (state.mode === AppMode.SUMMARIZE ? "Summarize this image" : state.mode === AppMode.OCR ? "Extract text from this image" : "Analyze this image"),
      image: finalImage || undefined,
      timestamp: Date.now(),
    };

    setState(prev => ({ 
      ...prev, 
      history: [...prev.history, userMessage],
      isLoading: true 
    }));
    setInputText('');

    try {
      const prompt = userMessage.content;
      const result = await askGemini(prompt, finalImage, state.mode, {
        language: state.language,
        summaryLength: state.summaryLength,
        useBullets: state.useBullets,
        generateTitle: state.generateTitle,
        chatStyle: state.chatStyle,
        history: state.history,
        memoryLevel: state.memoryLevel
      });

      const assistantMessage: Message = {
        role: 'assistant',
        content: result,
        timestamp: Date.now(),
      };

      setState(prev => ({ 
        ...prev, 
        history: [...prev.history, assistantMessage],
        isLoading: false 
      }));

    } catch (err: any) {
      handleError(err.message);
      setState(prev => ({ ...prev, isLoading: false }));
    }
  };

  const speak = (text: string) => {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const langMap = {
      [Language.TR]: 'tr-TR',
      [Language.EN]: 'en-US',
      [Language.DE]: 'de-DE',
      [Language.AR]: 'ar-SA'
    };
    utterance.lang = langMap[state.language];
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  };

  const stopSpeaking = () => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  };

  const exportChat = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state.history));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "chat_history.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  return (
    <div className={`flex flex-col h-screen overflow-hidden ${isRTL ? 'rtl' : 'ltr'}`}>
      {/* Header */}
      <header className="h-16 border-b border-slate-800 bg-slate-900/80 backdrop-blur-md px-4 flex items-center justify-between z-10">
        <Logo />
        
        <div className="flex items-center gap-4">
          <select 
            value={state.language}
            onChange={(e) => setState(prev => ({ ...prev, language: e.target.value as Language }))}
            className="bg-slate-800 border border-slate-700 rounded-md px-2 py-1 text-sm outline-none focus:border-indigo-500"
          >
            <option value={Language.TR}>TR</option>
            <option value={Language.EN}>EN</option>
            <option value={Language.DE}>DE</option>
            <option value={Language.AR}>AR</option>
          </select>

          <button 
            onClick={() => {
               if (window.confirm("Geçmişi temizlemek istiyor musunuz?")) {
                 setState(prev => ({ ...prev, history: [] }));
               }
            }}
            className="text-slate-400 hover:text-white transition-colors"
            title={t.newChat}
          >
            <i className="fas fa-trash-alt text-lg"></i>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex overflow-hidden">
        {/* Left Panel - Inputs & Modes */}
        <aside className="w-80 border-r border-slate-800 bg-slate-900/50 hidden lg:flex flex-col p-4 gap-6 custom-scrollbar overflow-y-auto">
          <div>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">{t.mode}</h3>
            <div className="flex flex-col gap-2">
              {[AppMode.SUMMARIZE, AppMode.CHAT, AppMode.OCR, AppMode.REGION_ANALYSIS].map((m) => (
                <button
                  key={m}
                  onClick={() => setState(prev => ({ ...prev, mode: m, cropRect: null }))}
                  className={`flex items-center gap-3 p-3 rounded-lg transition-all ${state.mode === m ? 'bg-indigo-600 text-white neon-glow' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                >
                  <i className={`fas fa-${m === AppMode.SUMMARIZE ? 'file-alt' : m === AppMode.CHAT ? 'comments' : m === AppMode.OCR ? 'font' : 'vector-square'}`}></i>
                  <span className="text-sm font-medium">{(t as any)[m]}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="p-4 rounded-xl border border-dashed border-slate-700 hover:border-indigo-500 transition-colors bg-slate-800/30 flex flex-col items-center gap-3">
            {state.currentImage ? (
              <div className="relative w-full aspect-video rounded-lg overflow-hidden group select-none">
                <img 
                  ref={imgRef}
                  src={state.currentImage} 
                  className={`w-full h-full object-contain ${state.mode === AppMode.REGION_ANALYSIS ? 'cursor-crosshair' : ''}`} 
                  alt="Selected" 
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                />
                {state.cropRect && state.mode === AppMode.REGION_ANALYSIS && (
                  <div 
                    className="absolute border-2 border-indigo-500 bg-indigo-500/20 pointer-events-none"
                    style={{
                      left: state.cropRect.x,
                      top: state.cropRect.y,
                      width: state.cropRect.w,
                      height: state.cropRect.h
                    }}
                  />
                )}
                <button 
                  onClick={() => setState(prev => ({ ...prev, currentImage: null, cropRect: null }))}
                  className="absolute top-2 right-2 bg-red-500/80 w-6 h-6 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <i className="fas fa-times text-xs"></i>
                </button>
                {state.mode === AppMode.REGION_ANALYSIS && (
                  <div className="absolute bottom-1 left-0 right-0 text-[9px] text-center bg-black/50 text-white py-0.5">
                    Seçim için sürükleyin
                  </div>
                )}
              </div>
            ) : (
              <label className="cursor-pointer flex flex-col items-center py-6 w-full">
                <i className="fas fa-cloud-upload-alt text-3xl text-indigo-400 mb-2"></i>
                <span className="text-xs text-slate-400">{t.uploadImg}</span>
                <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
              </label>
            )}
            
            <div className="flex w-full gap-2">
              <button onClick={handleCamera} className="flex-1 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-xs transition-colors">
                <i className="fas fa-camera mr-1"></i> {t.openCam}
              </button>
              <button onClick={handleScreenShare} className="flex-1 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-xs transition-colors">
                <i className="fas fa-desktop mr-1"></i> {t.screenShare}
              </button>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">{t.settings}</h3>
            <div className="space-y-4 text-sm">
              {state.mode === AppMode.SUMMARIZE && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">{t.length}</span>
                    <select 
                      value={state.summaryLength}
                      onChange={(e) => setState(prev => ({ ...prev, summaryLength: e.target.value as SummaryLength }))}
                      className="bg-slate-800 p-1 rounded border border-slate-700 text-xs"
                    >
                      <option value={SummaryLength.SHORT}>{t.short}</option>
                      <option value={SummaryLength.MEDIUM}>{t.medium}</option>
                      <option value={SummaryLength.LONG}>{t.long}</option>
                    </select>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={state.useBullets} onChange={(e) => setState(prev => ({ ...prev, useBullets: e.target.checked }))} className="rounded border-slate-700 bg-slate-800 text-indigo-500" />
                    <span className="text-slate-400">{t.bullets}</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={state.generateTitle} onChange={(e) => setState(prev => ({ ...prev, generateTitle: e.target.checked }))} className="rounded border-slate-700 bg-slate-800 text-indigo-500" />
                    <span className="text-slate-400">{t.addTitle}</span>
                  </label>
                </>
              )}

              {state.mode === AppMode.CHAT && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">{t.style}</span>
                  <select 
                    value={state.chatStyle}
                    onChange={(e) => setState(prev => ({ ...prev, chatStyle: e.target.value as ChatStyle }))}
                    className="bg-slate-800 p-1 rounded border border-slate-700 text-xs"
                  >
                    <option value={ChatStyle.NORMAL}>{t.normal}</option>
                    <option value={ChatStyle.TECHNICAL}>{t.technical}</option>
                    <option value={ChatStyle.CHILDISH}>{t.childish}</option>
                    <option value={ChatStyle.SALES}>{t.sales}</option>
                  </select>
                </div>
              )}

              <div className="flex items-center justify-between pt-4 border-t border-slate-800">
                <span className="text-slate-400">{t.memory}</span>
                <select 
                  value={state.memoryLevel}
                  onChange={(e) => setState(prev => ({ ...prev, memoryLevel: e.target.value as any }))}
                  className="bg-slate-800 p-1 rounded border border-slate-700 text-xs"
                >
                  <option value="low">{t.low}</option>
                  <option value="medium">{t.medium}</option>
                  <option value="high">{t.high}</option>
                </select>
              </div>
            </div>
          </div>

          <div className="mt-auto flex gap-2">
            <button onClick={exportChat} className="flex-1 py-2 text-xs bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors border border-slate-700">
              <i className="fas fa-download mr-1"></i> {t.export}
            </button>
            <label className="flex-1 py-2 text-xs bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors border border-slate-700 text-center cursor-pointer">
              <i className="fas fa-upload mr-1"></i> {t.import}
              <input type="file" className="hidden" accept=".json" onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  const reader = new FileReader();
                  reader.onload = (ev) => {
                    try {
                      const data = JSON.parse(ev.target?.result as string);
                      setState(prev => ({ ...prev, history: data }));
                    } catch(e) {
                      handleError("Geçersiz JSON dosyası");
                    }
                  };
                  reader.readAsText(file);
                }
              }} />
            </label>
          </div>
        </aside>

        {/* Chat Panel */}
        <section className="flex-1 flex flex-col bg-slate-950 relative overflow-hidden">
          {errorMsg && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 px-6 py-3 bg-red-500/90 text-white rounded-full shadow-lg flex items-center gap-3 animate-bounce">
              <i className="fas fa-exclamation-circle"></i>
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="flex-1 p-4 md:p-8 overflow-y-auto custom-scrollbar flex flex-col gap-6">
            {state.history.length === 0 && (
              <div className="flex-1 flex flex-col items-center justify-center text-center opacity-50 space-y-4">
                <i className="fas fa-robot text-6xl text-indigo-500"></i>
                <h2 className="text-xl font-semibold">{t.title}</h2>
                <p className="max-w-md text-slate-400">
                  {state.mode === AppMode.SUMMARIZE ? "Görsel yükleyin ve özetle butonuna basın." : t.chatPlaceholder}
                </p>
              </div>
            )}

            {state.history.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl p-4 ${
                  msg.role === 'user' 
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' 
                    : 'bg-slate-800 border border-slate-700'
                }`}>
                  {msg.image && (
                    <img src={msg.image} className="max-w-xs rounded-lg mb-3 border border-indigo-400/30" alt="Context" />
                  )}
                  <div className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</div>
                  <div className="flex items-center justify-between mt-3 text-[10px] opacity-60">
                    <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    {msg.role === 'assistant' && (
                      <div className="flex gap-2">
                        <button onClick={() => {
                           navigator.clipboard.writeText(msg.content);
                           handleError("Kopyalandı");
                        }} className="hover:text-indigo-400 p-1">
                          <i className="fas fa-copy"></i>
                        </button>
                        <button onClick={() => speak(msg.content)} className="hover:text-indigo-400 p-1">
                          <i className="fas fa-volume-up"></i>
                        </button>
                        {state.mode === AppMode.OCR && msg.content.includes('|') && (
                           <button onClick={() => {
                             const csv = msg.content.split('\n').filter(l => l.includes('|')).map(l => l.split('|').map(c => c.trim()).join(',')).join('\n');
                             const blob = new Blob([csv], {type: 'text/csv'});
                             const url = URL.createObjectURL(blob);
                             const a = document.createElement('a');
                             a.href = url;
                             a.download = 'data.csv';
                             a.click();
                           }} className="hover:text-green-400 p-1" title="CSV olarak indir">
                             <i className="fas fa-file-csv"></i>
                           </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {state.isLoading && <Spinner />}
            <div ref={chatEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-4 bg-slate-900/50 backdrop-blur-xl border-t border-slate-800">
            <div className="max-w-4xl mx-auto flex items-end gap-3 bg-slate-800 rounded-2xl p-2 pr-4 focus-within:ring-2 ring-indigo-500/50 transition-all">
              <div className="flex-1 relative">
                <textarea 
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
                  placeholder={t.chatPlaceholder}
                  className="w-full bg-transparent border-none focus:ring-0 text-sm py-3 px-4 resize-none min-h-[50px] max-h-32 custom-scrollbar"
                />
                {state.isRecording && (
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map(i => (
                      <div 
                        key={i} 
                        className="w-1 bg-indigo-400 rounded-full transition-all duration-75" 
                        style={{ height: `${Math.max(4, volume * (i * 0.2))}px` }}
                      ></div>
                    ))}
                  </div>
                )}
              </div>
              
              <div className="flex items-center gap-2 mb-1.5">
                <button 
                  onClick={state.isRecording ? stopRecording : startRecording}
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${state.isRecording ? 'bg-red-500 animate-pulse text-white' : 'bg-slate-700 hover:bg-slate-600 text-slate-300'}`}
                >
                  <i className={`fas fa-${state.isRecording ? 'stop' : 'microphone'}`}></i>
                </button>
                <button 
                  onClick={handleSend}
                  disabled={state.isLoading}
                  className={`w-12 h-10 rounded-xl bg-indigo-600 hover:bg-indigo-500 flex items-center justify-center transition-all shadow-lg shadow-indigo-600/30 text-white ${state.isLoading ? 'opacity-50' : ''}`}
                >
                  <i className="fas fa-paper-plane"></i>
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Hidden elements for utilities */}
      <video ref={videoRef} className="hidden" />
      <canvas ref={canvasRef} className="hidden" />

      {/* Camera Modal */}
      <div className={`fixed inset-0 bg-black/90 z-50 flex flex-col items-center justify-center transition-all ${videoRef.current?.srcObject ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <div className="relative w-full max-w-2xl bg-slate-900 rounded-3xl overflow-hidden shadow-2xl border border-slate-800 m-4">
          <video ref={videoRef} className="w-full aspect-video bg-black" autoPlay muted />
          <div className="absolute bottom-0 left-0 right-0 p-6 flex justify-center gap-8 bg-gradient-to-t from-black/80 to-transparent">
            <button onClick={capturePhoto} className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-xl hover:scale-110 active:scale-95 transition-transform">
              <div className="w-14 h-14 border-4 border-slate-900 rounded-full"></div>
            </button>
            <button 
              onClick={() => {
                const tracks = (videoRef.current?.srcObject as MediaStream)?.getTracks();
                tracks?.forEach(t => t.stop());
                if (videoRef.current) videoRef.current.srcObject = null;
              }}
              className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center shadow-xl hover:scale-110 active:scale-95 transition-transform text-white text-2xl"
            >
              <i className="fas fa-times"></i>
            </button>
          </div>
        </div>
      </div>

      {/* Speaking Indicator */}
      {isSpeaking && (
        <div className="fixed bottom-24 right-8 bg-slate-800 border border-indigo-500/50 rounded-full p-2 pr-4 flex items-center gap-3 shadow-2xl animate-fade-in z-50">
          <button onClick={stopSpeaking} className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center text-white">
            <i className="fas fa-stop text-xs"></i>
          </button>
          <span className="text-xs font-medium text-indigo-300">Konuşuyor...</span>
          <div className="flex gap-0.5">
            {[1,2,3].map(i => <div key={i} className="w-0.5 h-3 bg-indigo-400 animate-pulse"></div>)}
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
