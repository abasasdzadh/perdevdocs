import { GoogleGenAI } from '@google/genai';
import fs from 'fs';

export class GeminiTranslator {
  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    this.glossary = this.loadGlossary();
  }
  
  loadGlossary() {
    try {
      if (fs.existsSync('./glossary.json')) {
        return JSON.parse(fs.readFileSync('./glossary.json', 'utf8'));
      }
    } catch (e) {
      console.warn("⚠️ واژه‌نامه glossary.json بارگذاری نشد.");
    }
    return {};
  }
  
  async translate(text) {
    if (!text || !text.trim()) return text;
    
    const prompt = `
تو یک مترجم ارشد مستندات برنامه‌نویسی هستی.
متن زیر را به فارسی تخصصی و روان ترجمه کن.

قوانین سخت‌گیرانه:
۱. توکن‌هایی به شکل __CODE_TOKEN_X__ کدهای حساس هستند؛ به هیچ وجه آن‌ها را ترجمه نکن، تغییر نده و حذف نکن.
۲. اصطلاحات را طبق این واژه‌نامه ترجمه کن: ${JSON.stringify(this.glossary)}
۳. فقط ترجمه فارسی متن را برگردان و هیچ توضیح دیگری اضافه نکن.

متن:
${text}
    `;
    
    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });
      return response.text.trim();
    } catch (error) {
      console.error("خطا در ترجمه:", error.message);
      return text; // Fallback در صورت خطا
    }
  }
}