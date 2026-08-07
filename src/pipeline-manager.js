import EventEmitter from 'events';
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

export class PipelineManager extends EventEmitter {
  constructor() {
    super();
    this.isRunning = false;
    this.shouldStop = false;
    this.currentDoc = null;
    this.currentPage = '';
    this.progress = { current: 0, total: 0 };
  }

  log(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString('fa-IR');
    const logData = { timestamp, message, type };
    console.log(`[${timestamp}] ${message}`);
    this.emit('log', logData);
  }

  stop() {
    if (this.isRunning) {
      this.shouldStop = true;
      this.log('🛑 دستور توقف موتور دریافت شد...', 'warn');
    }
  }

  async start(selectedDocId = null) {
    if (this.isRunning) return;

    this.isRunning = true;
    this.shouldStop = false;
    this.emit('statusChange', { isRunning: true });

    try {
      this.log('🚀 شروع موتور اختصاصی ترجمه DevDocs...');

      const tm = new TranslationMemory();
      await tm.init();

      const translator = new GeminiTranslator();
      const queue = new TranslationQueue();

      const docsetsRaw = fs.readFileSync('./docsets.json', 'utf8');
      let docsets = JSON.parse(docsetsRaw);

      if (selectedDocId) {
        docsets = docsets.filter(d => d.id === selectedDocId);
      }

      for (const doc of docsets) {
        if (this.shouldStop) break;

        this.currentDoc = doc.name;
        this.log(`📚 پردازش مستندات: ${doc.name} (${doc.id})`);

        const rawDbContent = await FileLoader.load(doc.contentUrl);
        const dbData = JSON.parse(rawDbContent);

        const translatedDbData = {};
        const pageKeys = Object.keys(dbData);
        this.progress = { current: 0, total: pageKeys.length };

        for (let index = 0; index < pageKeys.length; index++) {
          if (this.shouldStop) {
            this.log('🛑 فرایند ترجمه متوقف شد.', 'warn');
            break;
          }

          const pageKey = pageKeys[index];
          this.currentPage = pageKey;
          this.progress.current = index + 1;
          this.emit('progress', this.progress);

          const pageHtml = dbData[pageKey];
          this.log(`[صفحه ${index + 1}/${pageKeys.length}] 📄 در حال پردازش: "${pageKey}"`);

          const $ = HtmlParser.parse(pageHtml);
          $('body').attr('dir', 'rtl').addClass('fa-doc');

          const nodes = TextExtractor.extractSequentialNodes($);
          const unCachedNodes = [];

          for (const node of nodes) {
            const staticMatch = StaticDictionary.get(node.maskedText);
            if (staticMatch) {
              node.translatedText = staticMatch;
              continue;
            }

            const cached = await tm.get(node.maskedText);
            if (cached) {
              node.translatedText = cached;
            } else {
              unCachedNodes.push(node);
            }
          }

          if (unCachedNodes.length > 0) {
            const smartChunks = TextExtractor.createSmartChunks(unCachedNodes, 5000);
            this.log(`  🌐 پاراگراف‌های جدید: ${unCachedNodes.length} (در قالب ${smartChunks.length} چنک پویا)...`);

            for (let chunkIdx = 0; chunkIdx < smartChunks.length; chunkIdx++) {
              if (this.shouldStop) break;

              const chunkNodes = smartChunks[chunkIdx];
              const textsToTranslate = chunkNodes.map(n => n.maskedText);

              this.log(`   📦 ارسال چنک ${chunkIdx + 1}/${smartChunks.length} (${textsToTranslate.length} آیتم)...`);
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
            this.log(`  ⚡ تمام پاراگراف‌های این صفحه از کش محلی خوانده شد (0ms)`);
          }

          for (const node of nodes) {
            const finalBlockHtml = TextReplacer.unmask(node.translatedText || node.maskedText, node.placeholders);
            node.$block.html(finalBlockHtml);
          }

          translatedDbData[pageKey] = $.html();

          if (index < pageKeys.length - 1 && !this.shouldStop) {
            this.log(`⏳ اتمام صفحه "${pageKey}". تعلیق ۹۰ ثانیه‌ای موتور...`);
            for (let sec = 90; sec > 0; sec--) {
              if (this.shouldStop) break;
              await new Promise(res => setTimeout(res, 1000));
            }
          }
        }

        if (!this.shouldStop) {
          const outputPath = `./data/output/${doc.id}/db.json`;
          OutputBuilder.saveJson(outputPath, translatedDbData);
          this.log(`🎉 ترجمه db.json برای ${doc.name} در ${outputPath} ذخیره شد!`, 'success');
        }
      }
    } catch (error) {
      this.log(`❌ خطا در اجرای موتور: ${error.message}`, 'error');
    } finally {
      this.isRunning = false;
      this.emit('statusChange', { isRunning: false });
      this.log('🏁 عملیات موتور خاتمه یافت.');
    }
  }
}