import { GoogleGenAI } from '@google/genai';
import fs from 'fs';

export class GeminiTranslator {
  constructor(modelName = 'gemini-2.5-flash') {
    this.glossary = this.loadGlossary();
    this.primaryModel = modelName;
    this.fallbackModel = 'gemini-2.0-flash';
    this.geminiKeys = [];
    this.activeKeyIndex = 0;
    this.reloadKeys();
  }

  reloadKeys() {
    const keysRaw = process.env.GEMINI_API_KEYS || '';
    this.geminiKeys = keysRaw.split(',').map(k => k.trim()).filter(Boolean);
    this.activeKeyIndex = 0;
    this.initGemini();
  }

  setModel(modelName) {
    this.primaryModel = modelName;
  }

  initGemini() {
    if (this.geminiKeys.length > 0) {
      const currentKey = this.geminiKeys[this.activeKeyIndex];
      this.ai = new GoogleGenAI({ apiKey: currentKey });
    } else {
      this.ai = null;
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
    } catch (e) {}
    return {};
  }

  static async testKey(apiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: 'سلام، تست ارتباط API'
      });
      return { success: true, text: response.text };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async translateWithGoogle(textsArray, modelName) {
    if (!this.ai) {
      throw new Error("❌ هیچ کلید فعال جمنای یافت نشد! ابتدا کلید API خود را وارد کنید.");
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
      config: { responseMimeType: "application/json" }
    });

    const rawText = response.text.trim();
    return JSON.parse(rawText);
  }

  async translateBatch(textsArray) {
    if (!textsArray || textsArray.length === 0) return [];

    try {
      return await this.translateWithGoogle(textsArray, this.primaryModel);
    } catch (err) {
      console.warn(`⚠️ خطا در مدل ${this.primaryModel}: ${err.message}. تلاش با مدل جایگزین (${this.fallbackModel})...`);
    }

    let attempts = 0;
    while (attempts < this.geminiKeys.length * 2) {
      try {
        return await this.translateWithGoogle(textsArray, this.fallbackModel);
      } catch (err) {
        attempts++;
        const rotated = this.rotateGeminiKey();
        if (!rotated) {
          await new Promise(res => setTimeout(res, 10000));
        }
      }
    }

    return textsArray;
  }
}