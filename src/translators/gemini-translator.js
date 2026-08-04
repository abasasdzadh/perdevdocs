import { GoogleGenAI } from '@google/genai';
import fs from 'fs';

export class GeminiTranslator {
  constructor() {
    this.glossary = this.loadGlossary();
    
    const keysRaw = process.env.GEMINI_API_KEYS || '';
    this.geminiKeys = keysRaw.split(',').map(k => k.trim()).filter(Boolean);
    this.activeKeyIndex = 0;
    
    // مدل‌های مشخص‌شده پروژه
    this.primaryModel = 'gemini-3.5-flash-lite';
    this.fallbackModel = 'gemini-3.1-flash-lite';
    
    this.initGemini();
  }

  initGemini() {
    if (this.geminiKeys.length > 0) {
      const currentKey = this.geminiKeys[this.activeKeyIndex];
      this.ai = new GoogleGenAI({ apiKey: currentKey });
    } else {
      throw new Error("❌ هیچ کلید جمنای در فایل .env (کلید GEMINI_API_KEYS) یافت نشد!");
    }
  }

  rotateGeminiKey() {
    if (this.geminiKeys.length <= 1) return false;
    
    this.activeKeyIndex = (this.activeKeyIndex + 1) % this.geminiKeys.length;
    console.warn(`\n🔄 سوئیچ به کلید جمنای شماره ${this.activeKeyIndex + 1}...`);
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
تو یک مترجم ارشد مستندات برنامه‌نویسی DevDocs به زبان فارسی هستی.
آرایه JSON زیر شامل متون یک صفحه مستندات است.
آرایه را به فارسی روان و دقیق ترجمه کن و دقیقا یک آرایه JSON معتبر با همان تعداد عناصر خروجی بده.

قوانین سخت‌گیرانه:
۱. توکن‌هایی به شکل ___KEEP_REF_X___ کدهای حساس یا عناصر HTML هستند؛ به هیچ وجه آن‌ها را ترجمه نکن، تغییر نده و حذف نکن.
۲. اصطلاحات فنی را دقیقاً طبق این واژه‌نامه ترجمه کن: ${JSON.stringify(this.glossary)}
۳. خروجی باید صرفاً یک آرایه JSON معتبر شامل رشته‌ها باشد (بدون کد بلاک markdown سرریز مانند \`\`\`json).
۴. ساختار متون و توکن‌ها باید ۱۰۰٪ حفظ شود.

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

    const rawText = response.text.trim();
    return JSON.parse(rawText);
  }

  async translateBatch(textsArray) {
    if (!textsArray || textsArray.length === 0) return [];

    // تلاش با مدل اصلی (Gemini 3.5 Flash-Lite)
    try {
      console.log(`    ⚡ ارسال به Gemini (${this.primaryModel})...`);
      return await this.translateWithGoogle(textsArray, this.primaryModel);
    } catch (err) {
      console.warn(`⚠️ خطا در مدل ${this.primaryModel}: ${err.message}. سوئیچ به مدل جایگزین (${this.fallbackModel})...`);
    }

    // تلاش با مدل جایگزین (Gemini 3.1 Flash-Lite) و چرخش کلیدها
    let attempts = 0;
    while (attempts < this.geminiKeys.length * 2) {
      try {
        return await this.translateWithGoogle(textsArray, this.fallbackModel);
      } catch (err) {
        const isQuota = err.message && (err.message.includes('429') || err.message.includes('quota'));
        
        if (isQuota) {
          attempts++;
          const rotated = this.rotateGeminiKey();
          if (!rotated) {
            console.warn(`⚠️ تمام کلیدها محدود شده‌اند. مکث ۱۵ ثانیه‌ای...`);
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