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

  const tm = new TranslationMemory();
  await tm.init();

  const translator = new GeminiTranslator();
  const queue = new TranslationQueue(3000);

  const docsetsRaw = fs.readFileSync('./docsets.json', 'utf8');
  const docsets = JSON.parse(docsetsRaw);

  for (const doc of docsets) {
    console.log(`\n========================================`);
    console.log(`📚 پردازش مستندات: ${doc.name} (${doc.id})`);
    console.log(`========================================`);

    const rawDbContent = await FileLoader.load(doc.contentUrl);
    const dbData = JSON.parse(rawDbContent);

    const translatedDbData = {};
    const pageKeys = Object.keys(dbData);
    console.log(`📑 تعداد کل صفحات در db.json: ${pageKeys.length}`);

    for (let index = 0; index < pageKeys.length; index++) {
      const pageKey = pageKeys[index];
      const pageHtml = dbData[pageKey];

      console.log(`\n[صفحه ${index + 1}/${pageKeys.length}] 📄 در حال پردازش کلید: "${pageKey}"`);

      const $ = HtmlParser.parse(pageHtml);
      $('body').attr('dir', 'rtl').addClass('fa-doc');

      const nodes = TextExtractor.extractSequentialNodes($);
      const unCachedNodes = [];

      // ۱. بررسی حافظه محلی
      for (const node of nodes) {
        const cached = await tm.get(node.maskedText);
        if (cached) {
          node.translatedText = cached;
        } else {
          unCachedNodes.push(node);
        }
      }

      // ۲. ارسال کل پاراگراف‌های جدید صفحه در ۱ درخواست تک به gemini-1.5-flash
      if (unCachedNodes.length > 0) {
        const textsToTranslate = unCachedNodes.map(n => n.maskedText);
        console.log(`  🌐 ارسال کل صفحه (${textsToTranslate.length} پاراگراف) در ۱ درخواست به gemini-1.5-flash...`);

        const translatedArray = await queue.executeBatchWithRetry(translator, textsToTranslate);

        for (let i = 0; i < unCachedNodes.length; i++) {
          const node = unCachedNodes[i];
          const trans = (translatedArray && translatedArray[i]) ? translatedArray[i] : node.maskedText;
          
          const isValid = TranslationValidator.validate(node.placeholders, trans);
          if (isValid) {
            node.translatedText = trans;
            await tm.set(node.maskedText, trans);
          } else {
            node.translatedText = node.maskedText;
          }
        }
      } else {
        console.log(`  ⚡ تمام پاراگراف‌های این صفحه از حافظه محلی خوانده شد (0ms)`);
      }

      // ۳. بازسازی DOM
      for (const node of nodes) {
        const finalBlockHtml = TextReplacer.unmask(node.translatedText || node.maskedText, node.placeholders);
        node.$block.html(finalBlockHtml);
      }

      translatedDbData[pageKey] = $.html();
    }

    const outputPath = `./data/output/${doc.id}/db.json`;
    OutputBuilder.saveJson(outputPath, translatedDbData);
    console.log(`\n🎉 ترجمه مستندات ${doc.name} با موفقیت تمام شد و در ${outputPath} ذخیره گردید!`);
  }
}

runPipeline().catch(console.error);