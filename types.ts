
export enum Language {
  TR = 'tr',
  EN = 'en',
  DE = 'de',
  AR = 'ar'
}

export enum AppMode {
  SUMMARIZE = 'summarize',
  CHAT = 'chat',
  OCR = 'ocr',
  REGION_ANALYSIS = 'region'
}

export enum SummaryLength {
  SHORT = 'short',
  MEDIUM = 'medium',
  LONG = 'long'
}

export enum ChatStyle {
  NORMAL = 'normal',
  TECHNICAL = 'technical',
  CHILDISH = 'childish',
  SALES = 'sales'
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  image?: string;
  timestamp: number;
}

export interface AppState {
  language: Language;
  mode: AppMode;
  history: Message[];
  isLoading: boolean;
  isRecording: boolean;
  summaryLength: SummaryLength;
  useBullets: boolean;
  generateTitle: boolean;
  chatStyle: ChatStyle;
  memoryLevel: 'low' | 'medium' | 'high';
  currentImage: string | null;
  cropRect: { x: number, y: number, w: number, h: number } | null;
}
