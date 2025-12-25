import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { AppMode, SummaryLength, ChatStyle, Language, Message } from "../types";
import { GEMINI_MODEL } from "../config";

// Initialize the Google GenAI client using the pre-configured environment variable.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

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
    systemInstruction += `You are an image summarizer. Length: ${options.summaryLength}. ${options.useBullets ? 'Use bullet points.' : ''} ${options.generateTitle ? 'Include a catchy title.' : ''}`;
  } else if (mode === AppMode.OCR) {
    systemInstruction += `Extract all visible text from the image. If there are tables, try to format them clearly or offer a CSV-like structure.`;
  } else if (mode === AppMode.CHAT) {
    systemInstruction += `You are a helpful assistant talking about an image. Your style is ${options.chatStyle}. Keep the context of the conversation.`;
  }

  // Handle history based on memory level
  const msgLimit = options.memoryLevel === 'high' ? 15 : options.memoryLevel === 'medium' ? 8 : 4;
  const historyContent = options.history 
    ? options.history.slice(-msgLimit).map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.content}`).join('\n')
    : '';

  const finalPrompt = historyContent ? `Context:\n${historyContent}\n\nCurrent Task: ${prompt}` : prompt;

  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: { 
        parts: [
          { text: finalPrompt }, 
          ...(imageB64 ? [{ inlineData: { mimeType: "image/png", data: imageB64.split(',')[1] } }] : [])
        ] 
      },
      config: {
        systemInstruction,
        temperature: 0.7,
      }
    });

    return response.text || "No response generated.";
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    throw new Error(error.message || "Unknown API error");
  }
}
