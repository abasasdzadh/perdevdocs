/**
 * مسئول ماسک‌گذاری کدهای فنی و حفظ ۱۰۰٪ ترتیب گره‌ها (Sequential Indexing)
 */
export class TextExtractor {
  static extractAndMask($, $element) {
    const placeholders = [];
    let tokenIndex = 0;

    // ۱. ماسک‌گذاری تمام عناصر فنی (code, pre, var, kbd)
    $element.find('code, pre, var, kbd, samp').each((i, el) => {
      const $code = $(el);
      const token = `__CODE_TOKEN_${tokenIndex}__`;

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
   * شماره‌گذاری ترتیبی تمام گره‌های متنی صفحه جهت تضمین عدم جابه‌جایی
   */
  static extractSequentialNodes($) {
    const nodes = [];
    const elements = $('p, li, h1, h2, h3, h4, h5, h6, td, th, figcaption');

    elements.each((index, el) => {
      const $block = $(el);
      const { maskedText, placeholders } = TextExtractor.extractAndMask($, $block);

      if (maskedText && maskedText.trim().length > 0) {
        nodes.push({
          nodeIndex: index, // شماره ترتیبی گره در صفحه
          $block,
          maskedText,
          placeholders
        });
      }
    });

    return nodes;
  }
}