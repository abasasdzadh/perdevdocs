export class TextExtractor {
  static extractAndMask($, $element) {
    const placeholders = [];
    let tokenIndex = 0;
    
    // پیدا کردن گره‌های کد و ماسک‌گذاری آن‌ها
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
}