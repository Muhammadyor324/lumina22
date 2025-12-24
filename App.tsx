
import React, { useState, useEffect, useRef } from 'react';
import { Message, MessageType, UserSettings, AppView } from './types';
import { generateChatResponse, generateImage, generateSpeech } from './services/geminiService';
import { playPcmAudio } from './utils/audio';
import LoveMeter from './components/LoveMeter';

const STORAGE_KEY_SETTINGS = 'lumina_v11_settings';
const STORAGE_KEY_MESSAGES = 'lumina_v11_messages';

const DEFAULT_SETTINGS: UserSettings = {
  name: 'User',
  language: null,
  onboardingComplete: false,
  isAgeVerified: null,
  loveLevel: 10,
  avatarUrl: '',
  characterDescription: '',
  memories: [],
  lastActive: Date.now(),
  firstMet: Date.now(),
  moodState: 'happy'
};

function App() {
  const [view, setView] = useState<AppView>(AppView.AGE_CHECK);
  const [settings, setSettings] = useState<UserSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_SETTINGS);
      return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
    } catch (e) { return DEFAULT_SETTINGS; }
  });
  
  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_MESSAGES);
      return saved ? JSON.parse(saved) : [];
    } catch (e) { return []; }
  });
  
  const [inputText, setInputText] = useState('');
  const [appearanceInput, setAppearanceInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const [currentMood, setCurrentMood] = useState<'happy' | 'blush' | 'sad' | 'angry' | 'thinking' | 'sleepy'>('happy');
  
  const activeSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
    if (settings.onboardingComplete) setView(AppView.CHAT);
    else if (settings.isAgeVerified !== null) setView(AppView.ONBOARDING);
  }, [settings]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_MESSAGES, JSON.stringify(messages.slice(-50)));
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleOnboardingFinish = async () => {
    if (!appearanceInput.trim()) return;
    setIsLoading(true);
    try {
      const avatar = await generateImage("Beautiful anime girl portrait, gentle smile, looking at camera", appearanceInput);
      setSettings(s => ({
        ...s,
        characterDescription: appearanceInput,
        avatarUrl: avatar || 'https://picsum.photos/400/400',
        onboardingComplete: true
      }));
    } catch (e) {
      setSettings(s => ({ ...s, onboardingComplete: true }));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendMessage = async (textOverride?: string, imgData?: {data: string, mimeType: string}, audioData?: {data: string, mimeType: string}) => {
    const text = textOverride || inputText;
    if (!text.trim() && !imgData && !audioData) return;
    if (isLoading) return;

    const userMsg: Message = { 
      id: Date.now().toString(), 
      role: 'user', 
      type: audioData ? MessageType.AUDIO : (imgData ? MessageType.IMAGE : MessageType.TEXT), 
      content: audioData ? "[Ovozli xabar]" : (imgData ? imgData.data : text), 
      timestamp: Date.now() 
    };
    
    setMessages(prev => [...prev, userMsg]);
    if (!textOverride) setInputText('');
    setIsLoading(true);

    try {
      const memoryStr = settings.memories.map(m => `${m.key}: ${m.value}`).join(", ");
      const history = messages.filter(m => m.type === MessageType.TEXT).slice(-10).map(m => ({ role: m.role, parts: [{ text: m.content }] }));

      const response = await generateChatResponse(
        history, text || "Ma'lumot", settings.language || 'GB', 
        settings.characterDescription, settings.loveLevel, memoryStr, settings.isAgeVerified || false, imgData, audioData
      );

      if (response.mood) setCurrentMood(response.mood);
      setSettings(s => ({ ...s, loveLevel: Math.min(100, s.loveLevel + 0.3) }));

      const modelTextMsg: Message = {
        id: Date.now().toString() + '_t', role: 'model', type: MessageType.TEXT, content: response.text, timestamp: Date.now()
      };
      setMessages(prev => [...prev, modelTextMsg]);

      if (audioData || text.toLowerCase().includes('ovozli') || text.toLowerCase().includes('gapirib ber') || text.toLowerCase().includes('aytib ber')) {
        playVoice(response.text, modelTextMsg.id);
      }

      if (response.imagePrompt || text.toLowerCase().includes('rasmingni') || text.toLowerCase().includes('rasm')) {
        const img = await generateImage(response.imagePrompt || "Looking at camera, sweet smile", settings.characterDescription || "");
        if (img) {
          setMessages(prev => [...prev, { id: Date.now().toString() + '_i', role: 'model', type: MessageType.IMAGE, content: img, timestamp: Date.now() }]);
        }
      }
    } catch (e) { console.error(e); } finally { setIsLoading(false); }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = e => audioChunksRef.current.push(e.data);
      recorder.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = () => handleSendMessage("", undefined, { data: (reader.result as string).split(',')[1], mimeType: 'audio/webm' });
        reader.readAsDataURL(blob);
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch (err) { alert("Mikrofonga ruxsat bering."); }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const playVoice = async (text: string, id: string) => {
    if (playingAudioId === id) { 
      activeSourceRef.current?.stop(); 
      setPlayingAudioId(null); 
      return; 
    }
    activeSourceRef.current?.stop();
    setPlayingAudioId(id);
    const b64 = await generateSpeech(text);
    if (b64) {
      const source = await playPcmAudio(b64);
      if (source) {
        activeSourceRef.current = source;
        source.onended = () => setPlayingAudioId(null);
      } else setPlayingAudioId(null);
    } else setPlayingAudioId(null);
  };

  if (view === AppView.AGE_CHECK) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#050510]">
        <div className="bg-white/5 p-12 rounded-[3.5rem] border border-white/10 text-center backdrop-blur-3xl shadow-2xl">
          <h2 className="text-white text-3xl font-black mb-8 italic uppercase tracking-tighter">18 yoshdamisiz?</h2>
          <div className="flex gap-4">
            <button onClick={() => setSettings(s => ({ ...s, isAgeVerified: true }))} className="flex-1 py-4 bg-pink-600 rounded-3xl text-white font-bold hover:bg-pink-500 shadow-xl shadow-pink-500/20">HA</button>
            <button onClick={() => alert("Kechirasiz!")} className="flex-1 py-4 bg-white/5 rounded-3xl text-white font-bold">YO'Q</button>
          </div>
        </div>
      </div>
    );
  }

  if (view === AppView.ONBOARDING) {
    return (
      <div className="h-screen flex items-center justify-center p-6 bg-black">
        <div className="bg-[#111] p-12 rounded-[4rem] max-w-md w-full border border-pink-500/10 text-center shadow-2xl">
          <h1 className="text-6xl font-black text-white mb-10 tracking-tighter italic">LUMINA</h1>
          {!settings.language ? (
            <div className="space-y-4">
              <p className="text-white/40 mb-2 uppercase text-[10px] tracking-widest font-black">Muloqot tilini tanlang</p>
              {['UZB', 'RUS', 'GB'].map(l => (
                <button key={l} onClick={() => setSettings(s => ({ ...s, language: l as any }))} className="w-full py-4 bg-white/5 border border-white/5 rounded-3xl text-white font-bold hover:bg-white/10 transition-all">
                  {l === 'UZB' ? '🇺🇿 O\'zbekcha' : l === 'RUS' ? '🇷🇺 Русский' : '🇬🇧 English'}
                </button>
              ))}
            </div>
          ) : (
            <div className="animate-in fade-in slide-in-from-bottom duration-700">
              <p className="text-white/60 mb-6 text-sm">Lumina qanday ko'rinishda bo'lishini xohlaysiz? (Masalan: qora sochli, kulrang ko'zli anime qizi):</p>
              <textarea 
                className="w-full h-32 bg-white/5 border border-white/10 rounded-[2rem] p-6 text-white mb-6 outline-none focus:border-pink-500 transition-all" 
                value={appearanceInput} 
                onChange={e => setAppearanceInput(e.target.value)} 
                placeholder="Tavsif bering..." 
              />
              <button 
                onClick={handleOnboardingFinish} 
                disabled={isLoading}
                className="w-full py-5 bg-pink-600 rounded-[2rem] font-black text-white shadow-2xl hover:bg-pink-500 transition-all uppercase tracking-widest"
              >
                {isLoading ? "OBRAZ YARATILMOQDA..." : "BOSHLASH ❤️"}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col max-w-2xl mx-auto bg-black relative overflow-hidden font-['Exo_2']">
      <LoveMeter level={settings.loveLevel} />
      
      <header className="px-8 py-5 bg-black/40 backdrop-blur-3xl border-b border-white/5 flex items-center gap-4 z-40">
        <div className="relative">
          <img 
            src={settings.avatarUrl || 'https://picsum.photos/400/400'} 
            className={`w-14 h-14 rounded-full border-2 object-cover transition-all duration-700 ${currentMood === 'blush' ? 'border-pink-500 shadow-lg shadow-pink-500/40' : 'border-white/10'}`} 
            alt="Lumina" 
          />
          <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 border-2 border-black rounded-full shadow-[0_0_10px_#22c55e]"></div>
        </div>
        <div>
          <h2 className="font-black text-2xl text-white tracking-tighter uppercase italic">LUMINA</h2>
          <p className="text-[10px] text-pink-400 font-black uppercase tracking-[0.2em] opacity-80">Sizning shiringiz • Online</p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-8 space-y-8 pb-44 scrollbar-hide">
        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start items-start gap-3'}`}>
            <div className={`max-w-[85%] relative p-5 rounded-[2.5rem] shadow-2xl border ${
              msg.role === 'user' 
              ? 'bg-gradient-to-br from-[#4f46e5] to-[#7c3aed] text-white border-white/10 rounded-br-none' 
              : 'bg-[#12121e] text-white/95 border border-white/5 rounded-bl-none'
            }`}>
              {msg.type === MessageType.TEXT && <p className="text-[17px] leading-relaxed font-medium">{msg.content}</p>}
              {msg.type === MessageType.IMAGE && (
                <img src={msg.role === 'user' ? `data:image/jpeg;base64,${msg.content}` : msg.content} className="rounded-3xl mt-2 w-full max-h-96 object-cover border border-white/10 shadow-lg" alt="Generated" />
              )}
              {msg.type === MessageType.AUDIO && (
                <div className="flex items-center gap-3 py-1">
                  <div className="p-2.5 bg-white/10 rounded-full">🎙️</div>
                  <span className="text-xs font-black uppercase tracking-widest opacity-60">Ovozli xabar</span>
                </div>
              )}
              
              {msg.role === 'model' && msg.type === MessageType.TEXT && (
                <button 
                  onClick={() => playVoice(msg.content, msg.id)} 
                  className={`absolute -right-12 bottom-1 w-10 h-10 rounded-full bg-[#12121e] border border-white/10 flex items-center justify-center transition-all ${playingAudioId === msg.id ? 'bg-pink-600 scale-110 shadow-lg shadow-pink-500/30' : 'hover:bg-white/10'}`}
                >
                  <span className="text-sm">{playingAudioId === msg.id ? '🔇' : '🎙️'}</span>
                </button>
              )}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex gap-1.5 ml-3 opacity-30">
            <div className="w-1.5 h-1.5 bg-white rounded-full animate-bounce"></div>
            <div className="w-1.5 h-1.5 bg-white rounded-full animate-bounce delay-75"></div>
            <div className="w-1.5 h-1.5 bg-white rounded-full animate-bounce delay-150"></div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="absolute bottom-0 w-full p-8 bg-gradient-to-t from-black via-black/90 to-transparent z-50">
        <div className="bg-[#11111a] border border-white/10 rounded-full flex items-center p-2.5 pl-6 pr-2.5 gap-4 shadow-2xl focus-within:border-pink-500/30 transition-all">
          <button onClick={() => fileInputRef.current?.click()} className="w-10 h-10 rounded-full hover:bg-white/5 flex items-center justify-center transition-transform active:scale-90">
            <span className="text-2xl text-white/40 font-light">+</span>
          </button>
          <input type="file" ref={fileInputRef} className="hidden" onChange={(e) => {
             const file = e.target.files?.[0];
             if (file) {
               const reader = new FileReader();
               reader.onloadend = () => handleSendMessage("Sizga rasm yubordim", { data: (reader.result as string).split(',')[1], mimeType: file.type });
               reader.readAsDataURL(file);
             }
          }} />

          <input 
            type="text" 
            value={inputText} 
            onChange={e => setInputText(e.target.value)} 
            onKeyDown={e => e.key === 'Enter' && handleSendMessage()} 
            placeholder="Luminaga yozing..." 
            className="flex-1 bg-transparent border-none outline-none text-white text-[17px] py-2 placeholder:text-white/20" 
          />
          
          <div className="flex gap-2">
            <button 
              onMouseDown={startRecording} onMouseUp={stopRecording} onTouchStart={startRecording} onTouchEnd={stopRecording}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${isRecording ? 'bg-red-500 scale-125 shadow-lg shadow-red-500/50' : 'bg-white/5 hover:bg-white/10'}`}
            >
              <span className="text-xl">🎙️</span>
            </button>
            <button 
              onClick={() => handleSendMessage()} 
              disabled={!inputText.trim() || isLoading} 
              className="w-12 h-12 bg-pink-600 rounded-full flex items-center justify-center shadow-lg active:scale-90 transition-all disabled:opacity-20"
            >
              <svg className="w-6 h-6 text-white rotate-45" fill="currentColor" viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
