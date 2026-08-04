import * as cheerio from 'cheerio';

export class TextExtractor {
  /**
   * ماسک‌گذاری عناصر فنی (code, pre, var, kbd, samp, svg, tableهای مشخص و اتریبیوت‌ها)
   */
  static extractAndMask($, $element) {
    const placeholders = [];
    let tokenIndex = 0;

    // ۱. ماسک‌گذاری عناصر کد و عناصر فنی حساس
    $element.find('code, pre, var, kbd, samp, svg, script, style, math, table.bc-table, table.properties').each((i, el) => {
      const $code = $(el);
      const token = `___KEEP_REF_${tokenIndex}___`;

      placeholders.push({
        token,
        html: $.html($code.attr('dir', 'ltr').attr('style', 'unicode-bidi: isolate; display: inline-block;'))
      });

      $code.replaceWith(token);
      tokenIndex++;
    });

    return {
      maskedText: $element.html(),
      placeholders
    };
  }

  /**
   * استخراج تمامی نودهای متنی قابل ترجمه به ترتیب دقیق DOM
   */
  static extractSequentialNodes($) {
    const nodes = [];
    const elements = $('p, li, h1, h2, h3, h4, h5, h6, td, th, figcaption, dt, dd');

    elements.each((index, el) => {
      const $block = $(el);
      const { maskedText, placeholders } = TextExtractor.extractAndMask($, $block);

      if (maskedText && maskedText.trim().length > 0) {
        nodes.push({
          nodeIndex: index,
          $block,
          maskedText,
          placeholders
        });
      }
    });

    return nodes;
  }

  /**
   * تقسیم هوشمندانه نودها به چنک‌های پویا بر اساس حجم کاراکتر (Dynamic Token Budgeting)
   * و شکستن پاراگراف‌های بسیار بزرگ
   */
  static createSmartChunks(unCachedNodes, maxCharsPerBatch = 5000) {
    const chunks = [];
    let currentChunk = [];
    let currentChunkChars = 0;

    for (const node of unCachedNodes) {
      const text = node.maskedText;

      // اگر خود پاراگراف به‌تنهایی از سقف مجاز بزرگتر باشد (> 5000 کاراکتر)
      if (text.length > maxCharsPerBatch) {
        // ابتدا چنک فعلی را اگر خالی نیست ثبت می‌کنیم
        if (currentChunk.length > 0) {
          chunks.push(currentChunk);
          currentChunk = [];
          currentChunkChars = 0;
        }

        // شکستن هوشمند پاراگراف بزرگ بر اساس مرز جملات
        const subSegments = TextExtractor.splitGiantParagraph(text, maxCharsPerBatch);
        subSegments.forEach((segmentText, subIdx) => {
          chunks.push([{
            ...node,
            maskedText: segmentText,
            isSubSegment: true,
            subIndex: subIdx,
            totalSubSegments: subSegments.length
          }]);
        });

      } else {
        // اگر اضافه کردن این نود از سقف مجاز تجاوز کند، چنک قبلی را می‌بندیم
        if (currentChunkChars + text.length > maxCharsPerBatch && currentChunk.length > 0) {
          chunks.push(currentChunk);
          currentChunk = [];
          currentChunkChars = 0;
        }

        currentChunk.push(node);
        currentChunkChars += text.length;
      }
    }

    if (currentChunk.length > 0) {
      chunks.push(currentChunk);
    }

    return chunks;
  }

  /**
   * تقسیم پاراگراف‌های غول‌پیکر بر اساس نقطه یا خط جدید بدون آسیب به توکن‌ها
   */
  static splitGiantParagraph(text, maxChars) {
    const sentences = text.split(/(?<=[.!?\n])\s+/);
    const parts = [];
    let currentPart = '';

    for (const sentence of sentences) {
      if ((currentPart + ' ' + sentence).length > maxChars && currentPart.length > 0) {
        parts.push(currentPart);
        currentPart = sentence;
      } else {
        currentPart = currentPart ? `${currentPart} ${sentence}` : sentence;
      }
    }

    if (currentPart.length > 0) {
      parts.push(currentPart);
    }

    return parts.length > 0 ? parts : [text];
  }
}