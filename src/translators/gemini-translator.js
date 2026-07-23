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
      console.warn("⚠️ واژه‌نامه بارگذاری نشد.");
    }
    return {};
  }

  // ترجمه دسته‌ای تمام پاراگراف‌های ۱ صفحه در قالب ۱ درخواست تک
  async translateBatch(textsArray) {
    if (!textsArray || textsArray.length === 0) return [];

    const prompt = `
تو یک مترجم ارشد مستندات برنامه‌نویسی هستی.
آرایه JSON زیر شامل تمام متون و پاراگراف‌های یک صفحه مستندات است.
آرایه را ترجمه کن و دقیقا یک آرایه JSON معتبر با همان تعداد عناصر خروجی بده.

قوانین سخت‌گیرانه:
۱. توکن‌هایی به شکل __CODE_TOKEN_X__ کدهای حساس هستند؛ به هیچ وجه آن‌ها را ترجمه نکن، تغییر نده و حذف نکن.
۲. اصطلاحات را دقیقاً طبق این واژه‌نامه ترجمه کن: ${JSON.stringify(this.glossary)}
۳. خروجی باید صرفاً یک آرایه JSON معتبر باشد (تعداد عناصر ورودی و خروجی کاملاً برابر باشد).

ورودی:
${JSON.stringify(textsArray)}
    `;

    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: prompt,
        config: {
          responseMimeType: "application/json" // دریافت خروجی ساختاریافته JSON
        }
      });

      return JSON.parse(response.text.trim());
    } catch (error) {
      console.error("خطا در ترجمه دسته‌ای:", error.message);
      return textsArray; // Fallback در صورت خطا
    }
  }
}