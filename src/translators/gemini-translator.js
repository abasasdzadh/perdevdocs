import { GoogleGenAI } from '@google/genai';
import fs from 'fs';

export class GeminiTranslator {
  constructor() {
    this.glossary = this.loadGlossary();
    
    // ۱. بارگذاری کلیدهای جمنای جهت سیستم چرخش کلید
    const keysRaw = process.env.GEMINI_API_KEYS || '';
    this.geminiKeys = keysRaw.split(',').map(k => k.trim()).filter(Boolean);
    this.activeKeyIndex = 0;
    
    // ۲. تعریف مدل‌های گوگل (مدل اصلی و مدل بک‌آپ)
    this.primaryModel = 'gemini-3.5-flash-lite';
    this.fallbackModel = 'gemini-3.1-flash-lite';
    
    this.initGemini();
  }

  initGemini() {
    if (this.geminiKeys.length > 0) {
      const currentKey = this.geminiKeys[this.activeKeyIndex];
      this.ai = new GoogleGenAI({ apiKey: currentKey });
    } else {
      throw new Error("❌ هیچ کلید جمنای در فایل .env یافت نشد!");
    }
  }

  rotateGeminiKey() {
    if (this.geminiKeys.length <= 1) return false;
    
    this.activeKeyIndex = (this.activeKeyIndex + 1) % this.geminiKeys.length;
    console.warn(`\n🔄 کلید جمنای شماره ${this.activeKeyIndex} لیمیت شد. سوئیچ به کلید شماره ${this.activeKeyIndex + 1}...`);
    this.initGemini();
    return true;
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

  async translateWithGoogle(textsArray, modelName) {
    if (!this.ai) {
      throw new Error("SDK جمنای مقداردهی نشده است.");
    }

    const prompt = `
تو یک مترجم ارشد مستندات برنامه‌نویسی هستی.
آرایه JSON زیر شامل متون یک صفحه مستندات است.
آرایه را ترجمه کن و دقیقاً یک آرایه JSON معتبر با همان تعداد عناصر خروجی بده.

قوانین سخت‌گیرانه:
۱. توکن‌هایی به شکل __CODE_TOKEN_X__ کدهای حساس هستند؛ به هیچ وجه آن‌ها را ترجمه نکن، تغییر نده و حذف نکن.
۲. اصطلاحات را دقیقاً طبق این واژه‌نامه ترجمه کن: ${JSON.stringify(this.glossary)}
۳. خروجی باید صرفاً یک آرایه JSON معتبر باشد و تعداد عناصر ورودی و خروجی دقیقاً برابر باشد.

ورودی:
${JSON.stringify(textsArray)}
    `;

    const response = await this.ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });

    return JSON.parse(response.text.trim());
  }

  async translateBatch(textsArray) {
    if (!textsArray || textsArray.length === 0) return [];

    let geminiAttempts = 0;
    
    // تلاش با مدل اصلی (Gemini 3.5 Flash-Lite)
    try {
      console.log(`    ⚡ ارسال به Google Gemini (${this.primaryModel})...`);
      return await this.translateWithGoogle(textsArray, this.primaryModel);
    } catch (err) {
      console.warn(`⚠️ خطا در مدل ${this.primaryModel}: ${err.message}. سوئیچ به مدل جایگزین (${this.fallbackModel})...`);
    }

    // تلاش با مدل جایگزین (Gemini 3.1 Flash-Lite / 2.5 Flash-Lite)
    while (geminiAttempts < this.geminiKeys.length * 2) {
      try {
        return await this.translateWithGoogle(textsArray, this.fallbackModel);
      } catch (err) {
        const isQuota = err.message && (err.message.includes('429') || err.message.includes('quota'));
        
        if (isQuota) {
          geminiAttempts++;
          const rotated = this.rotateGeminiKey();
          if (rotated) {
            console.log("🔄 کلید جدید جمنای اعمال شد. تلاش مجدد...");
            continue;
          } else {
            console.warn(`⚠️ کلید فعلی لیمیت شد. مکث ۱۵ ثانیه‌ای...`);
            await new Promise(res => setTimeout(res, 15000));
          }
        } else {
          throw err;
        }
      }
    }

    return textsArray;
  }
}