/**
 * مدیریت صف ارسال با کنترل نرخ مصرف پلن رایگان (15 RPM) و Retry خودکار در صورت خطای ۴۲۹
 */
export class TranslationQueue {
  constructor(delayMs = 4500) {
    this.delayMs = delayMs; // تاخیر ۴.۵ ثانیه‌ای بین هر درخواست جهت رعایت سقف رایگان
  }

  async executeWithRetry(translator, text, maxRetries = 5) {
    let attempt = 0;
    while (attempt < maxRetries) {
      try {
        // تاخیر هوشمند قبل از ارسال جهت رعایت نرخ رایگان
        await new Promise(res => setTimeout(res, this.delayMs));
        return await translator.translate(text);
      } catch (err) {
        attempt++;
        const isQuotaError = err.message && (err.message.includes('429') || err.message.includes('quota'));
        
        if (isQuotaError) {
          const waitTime = attempt * 10000; // افزایش پله‌ای زمان انتظار (10s, 20s, 30s)
          console.warn(`⚠️ به محدودیت رایگان (Rate Limit) خوردیم. مکث ${waitTime / 1000} ثانیه‌ای و تلاش مجدد (تلاش ${attempt}/${maxRetries})...`);
          await new Promise(res => setTimeout(res, waitTime));
        } else {
          console.error(`خطا در ترجمه (تلاش ${attempt}):`, err.message);
          if (attempt >= maxRetries) return text; // Fallback در صورت شکست نهایی
        }
      }
    }
    return text;
  }
}