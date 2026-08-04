export class TextReplacer {
  static unmask(translatedText, placeholders) {
    if (!translatedText) return '';
    let result = translatedText;

    placeholders.forEach(({ token, html }) => {
      // جایگزینی دقیق تمام توکن‌ها
      result = result.split(token).join(html);
    });

    return result;
  }
}