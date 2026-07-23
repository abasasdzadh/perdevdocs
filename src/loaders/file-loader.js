import fs from 'fs';

/**
 * مسئول دریافت فایل‌ها از لینک مستقیم Raw گیت‌هاب یا فایل محلی دیسک
 */
export class FileLoader {
  static async load(input) {
    let targetUrl = input;

    // تبدیل لینک معمولی گیت‌هاب به لینک Raw جهت دریافت بدون واسطه
    if (targetUrl.includes('github.com') && targetUrl.includes('/blob/')) {
      targetUrl = targetUrl
        .replace('github.com', 'raw.githubusercontent.com')
        .replace('/blob/', '/');
    }

    // اگر ورودی یک URL اینترنتی باشد
    if (targetUrl.startsWith('http://') || targetUrl.startsWith('https://')) {
      console.log(`🌐 در حال دریافت داده مستقیم از گیت‌هاب: ${targetUrl}`);
      const response = await fetch(targetUrl);
      
      if (!response.ok) {
        throw new Error(`خطا در دریافت فایل از گیت‌هاب (${response.status}): ${response.statusText}`);
      }
      return await response.text();
    }

    // اگر ورودی مسیر فایل محلی باشد
    if (!fs.existsSync(targetUrl)) {
      throw new Error(`فایل محلی یافت نشد: ${targetUrl}`);
    }
    return fs.readFileSync(targetUrl, 'utf8');
  }
}