import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import {
  AppMode,
  SummaryLength,
  ChatStyle,
  Language,
  Message
} from "../types";

// ❌ config / env yok
// ✅ direkt API key ve model
const GEMINI_API_KEY = 'AIzaSyAAY-nW4x5mzgb7l1UkGN33JsACV0TlEUI';
const GEMINI_MODEL = 'gemini-3-flash-preview';

// Gemini client
const ai = new GoogleGenAI({
  apiKey: GEMINI_API_KEY
});

export async function askGemini(
  prompt: string,
  imageB64: string | null,
  mode: AppMode,
  options: {
    language: Language;
    summaryLength?: SummaryLength;
    useBullets?: boolean;
    generateTitle?: boolean;
    chatStyle?: ChatStyle;
    history?: Message[];
    memoryLevel?: string;
  }
) {
  let systemInstruction = `Response language must be strictly ${options.language}. `;

  if (mode === AppMode.SUMMARIZE) {
    systemInstruction += `
You are an image summarizer.
Length: ${options.summaryLength}.
${options.useBullets ? 'Use bullet points.' : ''}
${options.generateTitle ? 'Include a catchy title.' : ''}
`;
  } else if (mode === AppMode.OCR) {
    systemInstruction += `
Extract all visible text from the image.
If tables exist, format them clearly or provide CSV-like output.
`;
  } else if (mode === AppMode.CHAT) {
    systemInstruction += `
You are a helpful assistant discussing an image.
Style: ${options.chatStyle}.
Maintain conversation context.
`;
  }

  // Memory handling
  const msgLimit =
    options.memoryLevel === 'high'
      ? 15
      : options.memoryLevel === 'medium'
      ? 8
      : 4;

  const historyContent = options.history
    ? options.history
        .slice(-msgLimit)
        .map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.content}`)
        .join('\n')
    : '';

  const finalPrompt = historyContent
    ? `Context:\n${historyContent}\n\nCurrent Task: ${prompt}`
    : prompt;

  try {
    const response: GenerateContentResponse =
      await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: {
          parts: [
            { text: finalPrompt },
            ...(imageB64
              ? [
                  {
                    inlineData: {
                      mimeType: "image/png",
                      data: imageB64.split(',')[1]
                    }
                  }
                ]
              : [])
          ]
        },
        config: {
          systemInstruction,
          temperature: 0.7
        }
      });

    return response.text || "No response generated.";
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    throw new Error(error.message || "Unknown API error");
  }
}
