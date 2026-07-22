import 'dotenv/config';
import { FileLoader } from './loaders/file-loader.js';
import { FormatDetector } from './detectors/format-detector.js';
import { HtmlParser } from './parsers/html-parser.js';
import { TextExtractor } from './extractor/text-extractor.js';
import { GeminiTranslator } from './translators/gemini-translator.js';
import { TranslationValidator } from './validators/translation-validator.js';
import { TextReplacer } from './replacer/text-replacer.js';
import { OutputBuilder } from './builders/output-builder.js';

async function processDocument(inputPath, outputPath) {
  console.log(`📂 شروع پردازش فایل: ${inputPath}`);
  
  // ۱. بارگذاری فایل
  const content = FileLoader.load(inputPath);
  
  // ۲. تشخیص فرمت
  const format = FormatDetector.detect(inputPath);
  console.log(`ℹ️ فرمت فایل تشخیص داده شد: ${format}`);
  
  if (format === 'html') {
    // ۳. پارس کردن به درخت HTML
    const $ = HtmlParser.parse(content);
    const translator = new GeminiTranslator();
    
    // تنظیم جهت راست‌به‌چپ برای بدنه سند
    $('body').attr('dir', 'rtl').addClass('fa-doc');
    
    // استخراج گره‌های متنی
    const blocks = $('p, li, h1, h2, h3, h4, h5, h6, td, th');
    console.log(`📊 تعداد بلوک‌های متنی: ${blocks.length}`);
    
    for (let i = 0; i < blocks.length; i++) {
      const $block = $(blocks[i]);
      
      // ۴. ماسک‌گذاری کدها
      const { maskedText, placeholders } = TextExtractor.extractAndMask($, $block);
      
      if (maskedText && maskedText.trim().length > 0) {
        // ۵. ترجمه با جمنای
        const translatedText = await translator.translate(maskedText);
        
        // ۶. اعتبارسنجی
        const isValid = TranslationValidator.validate(placeholders, translatedText);
        
        // ۷. بازگرداندن کدها و جایگذاری
        const finalHtml = isValid ?
          TextReplacer.unmask(translatedText, placeholders) :
          TextReplacer.unmask(maskedText, placeholders); // Fallback در صورت خطا
        
        $block.html(finalHtml);
      }
    }
    
    // ۸. بازسازی و ذخیره خروجی
    const finalDocument = $.html();
    OutputBuilder.save(outputPath, finalDocument);
    console.log(`✅ فایل ترجمه‌شده با موفقیت ذخیره شد در: ${outputPath}`);
  }
}

// اجرای تست روی فایل نمونه
processDocument('./data/input/test.html', './data/output/test.html').catch(console.error);