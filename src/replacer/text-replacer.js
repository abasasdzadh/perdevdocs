export class TextReplacer {
  static unmask(translatedText, placeholders) {
    let result = translatedText;
    placeholders.forEach(({ token, html }) => {
      result = result.replace(new RegExp(token, 'g'), html);
    });
    return result;
  }
}