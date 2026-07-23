import 'dotenv/config';
import fs from 'fs';
import { FileLoader } from './loaders/file-loader.js';
import { HtmlParser } from './parsers/html-parser.js';
import { TextExtractor } from './extractor/text-extractor.js';
import { TranslationMemory } from './cache/translation-memory.js';
import { GeminiTranslator } from './translators/gemini-translator.js';
import { TranslationQueue } from './queue/translation-queue.js';
import { TranslationValidator } from './validators/translation-validator.js';
import { TextReplacer } from './replacer/text-replacer.js';
import { OutputBuilder } from './builders/output-builder.js';

async function runPipeline() {
  console.log("🚀 شروع موتور هوشمند ترجمه مستندات perdevdocs...");

  // ۱. مقداردهی اولیه حافظه ترجمه محلی (SQLite)
  const tm = new TranslationMemory();
  await tm.init();

  const translator = new GeminiTranslator();
  const queue = new TranslationQueue(4500); // رعایت سقف رایگان

  // ۲. بارگذاری کاتالوگ مستندات docsets.json
  const docsetsRaw = fs.readFileSync('./docsets.json', 'utf8');
  const docsets = JSON.parse(docsetsRaw);

  for (const doc of docsets) {
    console.log(`\n========================================`);
    console.log(`📚 پردازش مستندات: ${doc.name} (${doc.id})`);
    console.log(`========================================`);

    // ۳. دریافت مستقیم فایل db.json از گیت‌هاب (doc-endevdocs) یا فایل محلی
    const rawDbContent = await FileLoader.load(doc.contentUrl);
    const dbData = JSON.parse(rawDbContent);

    const translatedDbData = {};
    const pageKeys = Object.keys(dbData);
    console.log(`📑 تعداد کل صفحات (آیتم‌ها) در db.json: ${pageKeys.length}`);

    // ۴. تفکیک صفحه‌به‌صفحه (Page-by-Page Chunking)
    for (let index = 0; index < pageKeys.length; index++) {
      const pageKey = pageKeys[index];
      const pageHtml = dbData[pageKey];

      console.log(`\n[صفحه ${index + 1}/${pageKeys.length}] 📄 در حال پردازش کلید: "${pageKey}"`);

      // پارس کردن HTML این صفحه
      const $ = HtmlParser.parse(pageHtml);
      $('body').attr('dir', 'rtl').addClass('fa-doc');

      // استخراج گره‌ها با حفظ ۱۰۰٪ ترتیب ترتیبی
      const nodes = TextExtractor.extractSequentialNodes($);

      for (const node of nodes) {
        const { $block, maskedText, placeholders } = node;

        // بررسی در حافظه محلی (پیش‌ترجمه آنی)
        let translatedText = await tm.get(maskedText);

        if (translatedText) {
          console.log(`  ⚡ خوانده شده از حافظه محلی (0ms)`);
        } else {
          // ارسال به صف هوشمند جهت ترجمه با جمنای
          console.log(`  🌐 ارسال به Gemini API...`);
          translatedText = await queue.executeWithRetry(translator, maskedText);

          // اعتبارسنجی توکن‌ها
          const isValid = TranslationValidator.validate(placeholders, translatedText);
          if (isValid) {
            // ذخیره جدید در حافظه محلی جهت استفاده در صفحات بعدی
            await tm.set(maskedText, translatedText);
          } else {
            translatedText = maskedText; // Fallback
          }
        }

        // بازگرداندن کدها و جایگذاری در DOM همان صفحه
        const finalBlockHtml = TextReplacer.unmask(translatedText, placeholders);
        $block.html(finalBlockHtml);
      }

      // ذخیره نتیجه صفحه در آبجکت خروجی
      translatedDbData[pageKey] = $.html();
    }

    // ۵. ساخت و ذخیره فایل db.json ترجمه‌شده نهایی
    const outputPath = `./data/output/${doc.id}/db.json`;
    OutputBuilder.saveJson(outputPath, translatedDbData);
    console.log(`\n🎉 ترجمه مستندات ${doc.name} با موفقیت تمام شد و در ${outputPath} ذخیره گردید!`);
  }
}

runPipeline().catch(console.error);