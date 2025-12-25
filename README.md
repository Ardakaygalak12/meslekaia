
# Gemini Multimodal Voice-Visual AI Assistant

Bu uygulama, kullanıcıların metin, görsel ve ses kullanarak Gemini AI ile etkileşime girmesini sağlayan modern bir asistandır.

## Özellikler
- **Görsel Analiz**: Özetleme, OCR ve görsel tabanlı soru-cevap.
- **Ses Desteği**: Mikrofon kaydı ve Web Speech API ile sesli yanıt okuma (TTS).
- **Çoklu Dil**: Türkçe (Varsayılan), İngilizce, Almanca ve Arapça (RTL desteğiyle).
- **Hafıza Yönetimi**: Yerel depolama ile sohbet geçmişi koruma ve JSON dışa/içe aktarma.

## Kurulum ve Çalıştırma
Uygulama tamamen front-end tabanlıdır. 

### API Anahtarı (API Key)
Güvenlik gereği API anahtarı `config.ts` dosyasında `process.env.API_KEY` üzerinden yönetilmektedir. 
- Geliştirme ortamında bu anahtar otomatik olarak enjekte edilir.
- **Önemli**: Front-end uygulamalarında API anahtarları istemci tarafında görünür olabilir. Üretim ortamında anahtarınızı korumak için bir proxy sunucusu kullanılması şiddetle önerilir.

## Teknolojiler
- React 19
- Tailwind CSS
- Google Gemini AI (@google/genai)
- Web Speech API (STT & TTS)
