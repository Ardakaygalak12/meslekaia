
import React from 'react';

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
export const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const SUPPORTED_AUDIO_TYPES = ['audio/mpeg', 'audio/wav', 'audio/x-m4a', 'audio/m4a'];

export const Spinner = () => (
  <div className="flex items-center justify-center p-4">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
  </div>
);

export const Logo = () => (
  <div className="flex items-center gap-2">
    <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center neon-glow">
      <i className="fas fa-brain text-white text-xl"></i>
    </div>
    <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400 hidden sm:inline">
      AURA MULTIMODAL
    </span>
  </div>
);
