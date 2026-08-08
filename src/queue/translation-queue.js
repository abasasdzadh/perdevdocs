import fs from 'fs';
import path from 'path';

export class TranslationQueue {
  constructor(minDelayMs = 6000, maxRetries = 3) {
    this.minDelayMs = minDelayMs; 
    this.maxRetries = maxRetries;
    this.maxDailyRequests = 400;
    this.trackerPath = './data/usage_tracker.json';
    this.lastRequestTime = 0;
  }

  loadUsage() {
    const today = new Date().toISOString().split('T')[0];
    if (fs.existsSync(this.trackerPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(this.trackerPath, 'utf8'));
        if (data.date === today) return data;
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

  async executeBatchWithRetry(translator, textsArray) {
    const usage = this.loadUsage();
    if (usage.count >= this.maxDailyRequests) {
      throw new Error("🛑 سقف مجاز روزانه (400 درخواست) پر شده است. موتور متوقف شد.");
    }

    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.minDelayMs) {
      const waitTime = this.minDelayMs - timeSinceLastRequest + Math.floor(Math.random() * 500);
      await new Promise(res => setTimeout(res, waitTime));
    }

    let attempt = 0;
    let lastError = null;
    
    while (attempt < this.maxRetries) {
      try {
        this.lastRequestTime = Date.now();
        const result = await translator.translateBatch(textsArray);

        usage.count += 1;
        this.saveUsage(usage);
        console.log(`  📊 آمار درخواست امروز: ${usage.count}/${this.maxDailyRequests}`);

        return result;
      } catch (err) {
        lastError = err;
        attempt++;
        
        const errStr = err.message.toLowerCase();
        if (errStr.includes('400') || errStr.includes('403') || errStr.includes('invalid')) {
          throw new Error(`خطای غیرقابل بازیابی API: ${err.message}`);
        }

        if (attempt < this.maxRetries) {
          await new Promise(res => setTimeout(res, 3000));
        }
      }
    }

    throw new Error(`❌ تلاش ناموفق پس از ${this.maxRetries} بار: ${lastError.message}`);
  }
}