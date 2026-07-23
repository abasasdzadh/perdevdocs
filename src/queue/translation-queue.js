export class TranslationQueue {
  constructor(delayMs = 3000) {
    this.delayMs = delayMs;
  }

  async executeBatchWithRetry(translator, textsArray, maxRetries = 5) {
    let attempt = 0;
    while (attempt < maxRetries) {
      try {
        await new Promise(res => setTimeout(res, this.delayMs));
        return await translator.translateBatch(textsArray);
      } catch (err) {
        attempt++;
        const isQuotaError = err.message && (err.message.includes('429') || err.message.includes('quota'));
        
        if (isQuotaError) {
          const waitTime = attempt * 8000;
          console.warn(`⚠️ خطای سهمیه رایگان (Rate Limit). مکث ${waitTime / 1000} ثانیه‌ای و تلاش مجدد...`);
          await new Promise(res => setTimeout(res, waitTime));
        } else {
          console.error(`خطا در ارسال دسته‌ای (تلاش ${attempt}):`, err.message);
          if (attempt >= maxRetries) return textsArray;
        }
      }
    }
    return textsArray;
  }
}