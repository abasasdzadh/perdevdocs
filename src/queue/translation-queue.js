import fs from 'fs';
import path from 'path';

export class TranslationQueue {
  constructor() {
    // ۱۴ درخواست در دقیقه یعنی حداقل ۴۳۰۰ میلی‌ثانیه تاخیر بین هر درخواست
    this.minDelayMs = 4300; 
    this.maxDailyRequests = 400;
    this.trackerPath = './data/usage_tracker.json';
    this.lastRequestTime = 0;
  }

  // خواندن وضعیت مصرف روزانه از دیسک
  loadUsage() {
    const today = new Date().toISOString().split('T')[0];
    if (fs.existsSync(this.trackerPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(this.trackerPath, 'utf8'));
        if (data.date === today) {
          return data;
        }
      } catch (e) {
        // در صورت بروز خطای خواندن، داتا ریست می‌شود
      }
    }
    return { date: today, count: 0 };
  }

  // ذخیره وضعیت جدید روی دیسک
  saveUsage(usage) {
    const dir = path.dirname(this.trackerPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.trackerPath, JSON.stringify(usage, null, 2), 'utf8');
  }

  async executeBatchWithRetry(translator, textsArray, maxRetries = 3) {
    // ۱. بررسی سقف daily limit (۴۰۰ درخواست در روز)
    const usage = this.loadUsage();
    if (usage.count >= this.maxDailyRequests) {
      console.error(`\n🛑 سقف مجاز روزانه (${this.maxDailyRequests} درخواست) به پایان رسیده است.`);
      console.error(`⏳ پردازش متوقف شد. کار فردا پس از بازنشانی سهمیه روزانه ادامه خواهد یافت.`);
      process.exit(0); // خروج ایمن؛ با اجرا در روز بعد کار از ادامه کش خوانده می‌شود
    }

    // ۲. کنترل دقیق ۱۴ درخواست در دقیقه (Rate Limiter)
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.minDelayMs) {
      const waitTime = this.minDelayMs - timeSinceLastRequest;
      await new Promise(res => setTimeout(res, waitTime));
    }

    // ۳. ارسال درخواست به API و به روزرسانی آمار
    let attempt = 0;
    while (attempt < maxRetries) {
      try {
        this.lastRequestTime = Date.now();
        const result = await translator.translateBatch(textsArray);

        // افزایش شمارنده روزانه
        usage.count += 1;
        this.saveUsage(usage);
        console.log(`  📊 آمار درخواست امروز: ${usage.count}/${this.maxDailyRequests}`);

        return result;
      } catch (err) {
        attempt++;
        console.warn(`⚠️ خطا در ارسال (تلاش ${attempt}/${maxRetries}): ${err.message}`);
        await new Promise(res => setTimeout(res, 6000));
      }
    }

    return textsArray;
  }
}