export class TranslationValidator {
  static validate(originalPlaceholders, translatedText) {
    for (const item of originalPlaceholders) {
      if (!translatedText.includes(item.token)) {
        console.warn(`⚠️ هشدار اعتبارسنجی: توکن ${item.token} توسط هوش مصنوعی حذف شده است!`);
        return false;
      }
    }
    return true;
  }
}