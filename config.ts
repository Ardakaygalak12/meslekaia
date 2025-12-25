
/**
 * Configuration for the Gemini Multimodal Assistant.
 * Note: The API key is sourced from process.env.API_KEY as required by the platform 
 * to ensure secure and valid access to the Gemini models.
 */
export const GEMINI_API_KEY = process.env.API_KEY;

/**
 * Recommended model for fast multimodal tasks.
 * Using 'gemini-3-flash-preview' as per coding guidelines.
 */
export const GEMINI_MODEL = 'gemini-3-flash-preview';
