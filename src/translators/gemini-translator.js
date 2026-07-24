import { GoogleGenAI } from '@google/genai';
import fs from 'fs';

export class GeminiTranslator {
  constructor() {
    this.glossary = this.loadGlossary();
    
    // ۱. بارگذاری کلیدهای جمنای جهت سیستم چرخش کلید
    const keysRaw = process.env.GEMINI_API_KEYS || '';
    this.geminiKeys = keysRaw.split(',').map(k => k.trim()).filter(Boolean);
    this.activeKeyIndex = 0;
    
    // ۲. بارگذاری کلید گراک
    this.groqKey = process.env.GROQ_API_KEY ? process.env.GROQ_API_KEY.trim() : null;
    
    this.initGemini();
  }

  // مقداردهی اولیه جمنای با کلید فعال فعلی
  initGemini() {
    if (this.geminiKeys.length > 0) {
      const currentKey = this.geminiKeys[this.activeKeyIndex];
      this.ai = new GoogleGenAI({ apiKey: currentKey });
    }
  }

  // چرخاندن و سوئیچ روی کلید بعدی جمنای در صورت وقوع لیمیت
  rotateGeminiKey() {
    if (this.geminiKeys.length <= 1) return false;
    
    this.activeKeyIndex = (this.activeKeyIndex + 1) % this.geminiKeys.length;
    console.warn(`\n🔄 کلید جمنای شماره ${this.activeKeyIndex} لیمیت شد. سوئیچ خودکار به کلید بعدی (شماره ${this.activeKeyIndex + 1})...`);
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

  // ترجمه با گراک (فوق‌سریع با مدل جدید و فعال Llama 3.3 70B)
  async translateWithGroq(textsArray) {
    const prompt = `
You are an expert technical translator. 
Translate the following JSON array of documentation texts into Persian.
Return ONLY a valid JSON object matching this schema: {"translations": ["Persian text 1", "Persian text 2", ...]}

Strict Rules:
1. Do NOT translate or modify tokens matching __CODE_TOKEN_X__ (these are code placeholders).
2. Do NOT add any conversational explanation. Return ONLY the JSON object.
3. Keep technical method names in English.
    `;

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.groqKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile', // مدل رسمی، فوق‌العاده قوی و فعال در گراک
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: JSON.stringify(textsArray) }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`خطای گراک (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const resultObj = JSON.parse(data.choices[0].message.content.trim());
    return resultObj.translations;
  }

  // ترجمه بک‌آپ با جمنای
  async translateWithGemini(textsArray) {
    if (!this.ai) {
      throw new Error("هیچ کلید جمنای ست نشده است.");
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
      model: 'gemini-2.0-flash',
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });

    return JSON.parse(response.text.trim());
  }

  // متد اصلی ارکستر ترجمه
  async translateBatch(textsArray) {
    if (!textsArray || textsArray.length === 0) return [];

    // ۱. اولویت اول: گراک (در صورت ست بودن کلید)
    if (this.groqKey) {
      try {
        console.log("    ⚡ استفاده از موتور فوق‌سریع Groq (مدل Llama 3.3)...");
        return await this.translateWithGroq(textsArray);
      } catch (err) {
        console.warn("⚠️ موتور گراک با خطا مواجه شد. سوئیچ به جمنای بک‌آپ...", err.message);
      }
    }

    // ۲. اولویت دوم: جمنای با چرخش خودکار کلیدها و کنترل لوپ بی نهایت در صورت محدودیت ۴۲۹
    let geminiAttempts = 0;
    while (true) {
      try {
        return await this.translateWithGemini(textsArray);
      } catch (err) {
        const isQuota = err.message && (err.message.includes('429') || err.message.includes('quota'));
        
        if (isQuota) {
          geminiAttempts++;
          // اگر تمام کلیدهای لیست یک‌دور کاملاً چرخیدند و همگی لیمیت بودند
          if (geminiAttempts >= this.geminiKeys.length) {
            console.warn(`⚠️ تمام کلیدهای جمنای شما در حال حاضر لیمیت هستند. مکث ۱۵ ثانیه‌ای جهت بازنشانی سهمیه توسط گوگل...`);
            await new Promise(res => setTimeout(res, 15000));
            geminiAttempts = 0; // ریست شمارنده تلاش‌ها
          }

          const rotated = this.rotateGeminiKey();
          if (rotated) {
            console.log("🔄 کلید جدید جمنای اعمال شد. تلاش مجدد برای ارسال درخواست...");
            continue; 
          }
        }
        throw err; 
      }
    }
  }
}