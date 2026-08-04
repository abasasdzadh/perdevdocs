import fs from 'fs';
import path from 'path';

export class TranslationQueue {
  constructor() {
    // حداقل ۶ ثانیه (۶۰۰۰ میلی‌ثانیه) تاخیر بین هر درخواست API
    this.minDelayMs = 6000; 
    this.maxDailyRequests = 400;
    this.trackerPath = './data/usage_tracker.json';
    this.lastRequestTime = 0;
  }

  loadUsage() {
    const today = new Date().toISOString().split('T')[0];
    if (fs.existsSync(this.trackerPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(this.trackerPath, 'utf8'));
        if (data.date === today) {
          return data;
        }
      } catch (e) {}
    }
    return { date: today, count: 0 };
  }

  saveUsage(usage) {
    const dir = path.dirname(this.trackerPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.trackerPath, JSON.stringify(usage, null, 2), 'utf8');
  }

  async executeBatchWithRetry(translator, textsArray, maxRetries = 3) {
    // ۱. کنترل سقف روزانه
    const usage = this.loadUsage();
    if (usage.count >= this.maxDailyRequests) {
      console.error(`\n🛑 سقف مجاز روزانه (${this.maxDailyRequests} درخواست) به پایان رسیده است.`);
      console.error(`⏳ کار متوقف شد. کار فردا پس از بازنشانی سهمیه ادامه خواهد یافت.`);
      process.exit(0);
    }

    // ۲. کنترل دقیق ۶ ثانیه فاصله بین درخواست‌ها
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.minDelayMs) {
      const waitTime = this.minDelayMs - timeSinceLastRequest + Math.floor(Math.random() * 500); // به همراه Jitter
      console.log(`  ⏳ شکیبایی ${Math.round(waitTime / 1000)} ثانیه‌ای بین درخواست‌ها...`);
      await new Promise(res => setTimeout(res, waitTime));
    }

    // ۳. ارسال درخواست به AI
    let attempt = 0;
    while (attempt < maxRetries) {
      try {
        this.lastRequestTime = Date.now();
        const result = await translator.translateBatch(textsArray);

        usage.count += 1;
        this.saveUsage(usage);
        console.log(`  📊 آمار درخواست امروز: ${usage.count}/${this.maxDailyRequests}`);

        return result;
      } catch (err) {
        attempt++;
        console.warn(`⚠️ خطا در ارسال درخواست (تلاش ${attempt}/${maxRetries}): ${err.message}`);
        await new Promise(res => setTimeout(res, 8000));
      }
    }

    return textsArray;
  }
}