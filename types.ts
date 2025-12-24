export enum MessageType {
  TEXT = 'text',
  IMAGE = 'image',
  AUDIO = 'audio',
  SYSTEM = 'system'
}

export interface Message {
  id: string;
  role: 'user' | 'model';
  type: MessageType;
  content: string; 
  timestamp: number;
  metadata?: {
    audioDuration?: number;
    prompt?: string;
    emotion?: 'happy' | 'blush' | 'sad' | 'angry' | 'thinking' | 'tired' | 'sleepy';
  };
}

export interface UserMemory {
  key: string;
  value: string;
  timestamp: number;
}

export interface UserSettings {
  name: string;
  language: 'UZB' | 'RUS' | 'GB' | null;
  characterDescription?: string;
  avatarUrl?: string;
  onboardingComplete: boolean;
  isAgeVerified: boolean | null;
  loveLevel: number; // 0 to 100
  memories: UserMemory[];
  lastActive: number;
  firstMet: number;
  moodState: 'happy' | 'sad' | 'hurt' | 'neutral'; // Mood mirror
}

export enum AppView {
  AGE_CHECK = 'AGE_CHECK',
  ONBOARDING = 'ONBOARDING',
  CHAT = 'CHAT'
}