import { GoogleGenAI } from '@google/genai';
import fs from 'fs';

/**
 * اتصال به Gemini API با پشتیبانی کامل از پلن رایگان و واژه‌نامه تک‌معنایی
 */
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
      console.warn("⚠️ واژه‌نامه بارگذاری نشد.");
    }
    return {};
  }

  async translate(text) {
    if (!text || !text.trim()) return text;

    const prompt = `
تو یک مترجم ارشد مستندات برنامه‌نویسی هستی.
متن زیر را به فارسی تخصصی، روان و دقیق ترجمه کن.

قوانین سخت‌گیرانه:
۱. توکن‌هایی به شکل __CODE_TOKEN_X__ کدهای حساس هستند؛ به هیچ وجه آن‌ها را ترجمه نکن، تغییر نده و حذف نکن.
۲. اصطلاحات را دقیقاً طبق این واژه‌نامه تک‌معنایی ترجمه کن: ${JSON.stringify(this.glossary)}
۳. فقط ترجمه فارسی متن را برگردان و هیچ توضیح اضافی اضافه نکن.

متن:
${text}
    `;

    const response = await this.ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: prompt,
    });

    return response.text.trim();
  }
}