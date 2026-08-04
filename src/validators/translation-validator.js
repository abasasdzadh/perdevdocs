export class TranslationValidator {
  static validate(originalPlaceholders, translatedText) {
    if (!translatedText || typeof translatedText !== 'string') return false;

    for (const item of originalPlaceholders) {
      if (!translatedText.includes(item.token)) {
        console.warn(`⚠️ اعتبارسنجی رد شد: توکن محافظت‌شده ${item.token} توسط مدل حذف شده است!`);
        return false;
      }
    }
    return true;
  }
}