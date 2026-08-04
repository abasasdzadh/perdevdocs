import 'dotenv/config';
import fs from 'fs';
import { FileLoader } from './loaders/file-loader.js';
import { HtmlParser } from './parsers/html-parser.js';
import { TextExtractor } from './extractor/text-extractor.js';
import { StaticDictionary } from './cache/static-dictionary.js';
import { TranslationMemory } from './cache/translation-memory.js';
import { GeminiTranslator } from './translators/gemini-translator.js';
import { TranslationQueue } from './queue/translation-queue.js';
import { TranslationValidator } from './validators/translation-validator.js';
import { TextReplacer } from './replacer/text-replacer.js';
import { OutputBuilder } from './builders/output-builder.js';

async function runPipeline() {
  console.log("🚀 شروع موتور اختصاصی ترجمه DevDocs (تمرکز بر db.json)...");

  const tm = new TranslationMemory();
  await tm.init();

  const translator = new GeminiTranslator();
  const queue = new TranslationQueue();

  const docsetsRaw = fs.readFileSync('./docsets.json', 'utf8');
  const docsets = JSON.parse(docsetsRaw);

  for (const doc of docsets) {
    console.log(`\n========================================`);
    console.log(`📚 پردازش مستندات: ${doc.name} (${doc.id})`);
    console.log(`========================================`);

    // دریافت مستقیم db.json
    const rawDbContent = await FileLoader.load(doc.contentUrl);
    const dbData = JSON.parse(rawDbContent);

    // شیء خروجی که دقیقا کلیدهای db.json اصلی را حفظ می‌کند
    const translatedDbData = {};
    const pageKeys = Object.keys(dbData);
    console.log(`📑 تعداد کل صفحات در db.json: ${pageKeys.length}`);

    for (let index = 0; index < pageKeys.length; index++) {
      const pageKey = pageKeys[index];
      const pageHtml = dbData[pageKey];

      console.log(`\n[صفحه ${index + 1}/${pageKeys.length}] 📄 در حال پردازش: "${pageKey}"`);

      const $ = HtmlParser.parse(pageHtml);
      $('body').attr('dir', 'rtl').addClass('fa-doc');

      const nodes = TextExtractor.extractSequentialNodes($);
      const unCachedNodes = [];

      // ۱. بررسی کش سه‌لایه‌ای (Static Dict + SQLite TM)
      for (const node of nodes) {
        // الف) لایه ۱: دیکشنری عبارات ثابت (0ms)
        const staticMatch = StaticDictionary.get(node.maskedText);
        if (staticMatch) {
          node.translatedText = staticMatch;
          continue;
        }

        // ب) لایه ۲: حافظه ترجمه محلی SQLite (0ms)
        const cached = await tm.get(node.maskedText);
        if (cached) {
          node.translatedText = cached;
        } else {
          unCachedNodes.push(node);
        }
      }

      // ۲. دسته‌بندی هوشمند پویا و ارسال به Gemini
      if (unCachedNodes.length > 0) {
        // ایجاد چنک‌های پویا بر اساس حجم توکن/کاراکتر واقعی
        const smartChunks = TextExtractor.createSmartChunks(unCachedNodes, 5000);
        console.log(`  🌐 پاراگراف‌های جدید: ${unCachedNodes.length} (در قالب ${smartChunks.length} چنک پویا)...`);

        for (let chunkIdx = 0; chunkIdx < smartChunks.length; chunkIdx++) {
          const chunkNodes = smartChunks[chunkIdx];
          const textsToTranslate = chunkNodes.map(n => n.maskedText);

          console.log(`   📦 ارسال چنک ${chunkIdx + 1}/${smartChunks.length} (${textsToTranslate.length} آیتم)...`);
          const translatedArray = await queue.executeBatchWithRetry(translator, textsToTranslate);

          for (let j = 0; j < chunkNodes.length; j++) {
            const node = chunkNodes[j];
            const trans = (translatedArray && translatedArray[j]) ? translatedArray[j] : node.maskedText;
            
            const isValid = TranslationValidator.validate(node.placeholders, trans);
            if (isValid) {
              node.translatedText = trans;
              await tm.set(node.maskedText, trans);
            } else {
              node.translatedText = node.maskedText;
            }
          }
        }
      } else {
        console.log(`  ⚡ تمام پاراگراف‌های این صفحه از کش محلی خوانده شد (0ms)`);
      }

      // ۳. بازسازی DOM صفحه
      for (const node of nodes) {
        const finalBlockHtml = TextReplacer.unmask(node.translatedText || node.maskedText, node.placeholders);
        node.$block.html(finalBlockHtml);
      }

      // حفظ ۱۰۰٪ دقیق Key صفحه در db.json
      translatedDbData[pageKey] = $.html();

      // ۴. فاصله ۹۰ ثانیه‌ای بین اتمام صفحه و شروع صفحه بعد (مطابق با قانون ۱۲)
      if (index < pageKeys.length - 1) {
        console.log(`\n⏳ اتمام صفحه "${pageKey}". تعلیق ۹۰ ثانیه‌ای موتور قبل از شروع صفحه بعدی...`);
        await new Promise(res => setTimeout(res, 90000));
      }
    }

    // ذخیره فایل نهایی db.json ترجمه‌شده
    const outputPath = `./data/output/${doc.id}/db.json`;
    OutputBuilder.saveJson(outputPath, translatedDbData);
    console.log(`\n🎉 ترجمه db.json برای ${doc.name} با موفقیت در ${outputPath} ذخیره شد!`);
  }
}

runPipeline().catch(console.error);