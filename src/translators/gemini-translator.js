import { GoogleGenAI } from '@google/genai';
import fs from 'fs';

export class GeminiTranslator {
  constructor(modelCascade = ['gemini-3.5-flash-Lite', 'gemini-3.1-flash-Lite']) {
    this.glossary = this.loadGlossary();
    this.modelCascade = Array.isArray(modelCascade) && modelCascade.length > 0 
      ? modelCascade 
      : ['gemini-3.5-flash-Lite', 'gemini-3.1-flash-Lite'];
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

  setModelCascade(cascadeArray) {
    if (Array.isArray(cascadeArray) && cascadeArray.length > 0) {
      this.modelCascade = cascadeArray;
    }
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

  // 🌐 دریافت مستقیم و زنده لیست مدل‌ها از Google API
  static async fetchLiveModels(apiKey) {
    if (!apiKey) return [];
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
      if (!response.ok) throw new Error('خطا در دریافت لیست مدل‌ها');
      const data = await response.json();
      
      if (data.models && Array.isArray(data.models)) {
        return data.models
          .filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent'))
          .map(m => m.name.replace('models/', ''));
      }
    } catch (err) {
      console.warn('⚠️ خطا در دریافت زنده مدل‌ها:', err.message);
    }
    // لیست پیش‌فرض در صورت عدم دسترسی شبکه
    return ['gemini-3.5-flash-Lite', 'gemini-3.1-flash-Lite', 'Gemini-Flash-Latest', 'Gemini-Flash-Lite-Latest'];
  }

  static async testKey(apiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash-Lite',
        contents: 'سلام، تست ارتباط API'
      });
      return { success: true, text: response.text };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async translateWithGoogle(textsArray, modelName) {
    if (!this.ai) {
      throw new Error("❌ هیچ کلید فعال جمنای یافت نشد!");
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

  // 🔄 زنجیره شکست‌ناپذیر Fallback روی مدل‌ها
  async translateBatch(textsArray) {
    if (!textsArray || textsArray.length === 0) return [];

    // گردش روی تک تک مدل‌های زنجیره
    for (let mIdx = 0; mIdx < this.modelCascade.length; mIdx++) {
      const currentModel = this.modelCascade[mIdx];
      try {
        console.log(`    ⚡ ارسال به Gemini (مدل ${mIdx + 1}/${this.modelCascade.length}: ${currentModel})...`);
        return await this.translateWithGoogle(textsArray, currentModel);
      } catch (err) {
        console.warn(`⚠️ خطا در مدل "${currentModel}": ${err.message}. سوئیچ به مدل بعدی در زنجیره...`);
      }
    }

    // چرخش کلید در صورت ناموفق بودن تمام مدل‌ها
    let attempts = 0;
    while (attempts < this.geminiKeys.length * 2) {
      attempts++;
      const rotated = this.rotateGeminiKey();
      if (rotated) {
        try {
          return await this.translateWithGoogle(textsArray, this.modelCascade[0]);
        } catch (e) {}
      } else {
        await new Promise(res => setTimeout(res, 5000));
      }
    }

    return textsArray;
  }
}