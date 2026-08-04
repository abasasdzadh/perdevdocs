/**
 * دیکشنری عبارات و تیترهای ثابت و تکراری در مستندات DevDocs
 * جهت پاسخ‌دهی ۰ میلی‌ثانیه‌ای و کاهش هزینه API
 */
export class StaticDictionary {
  static dictionary = {
    "Overview": "بررسی کلی",
    "Specifications": "مشخصات فنی",
    "Specification": "مشخصات فنی",
    "Browser compatibility": "سازگاری با مرورگرها",
    "See also": "همچنین ببینید",
    "Syntax": "سنتکس (نحوه نگارش)",
    "Examples": "مثال‌ها",
    "Example": "مثال",
    "Description": "توضیحات",
    "Value": "مقدار",
    "Initial value": "مقدار اولیه",
    "Applies to": "اعمال می‌شود روی",
    "Inherited": "ارث‌بری",
    "Media": "رسانه",
    "Computed value": "مقدار محاسبه‌شده",
    "Animation type": "نوع پویانمایی",
    "Formal syntax": "سنتکس رسمی",
    "Formal definition": "تعریف رسمی",
    "Parameters": "پارامترها",
    "Return value": "مقدار بازگشتی",
    "Exceptions": "استثناها",
    "Notes": "نکات",
    "Note": "نکته",
    "Warning": "هشدار",
    "Methods": "متدها",
    "Properties": "ویژگی‌ها",
    "Constructor": "سازنده (Constructor)"
  };

  static get(text) {
    if (!text) return null;
    const trimmed = text.trim();
    return this.dictionary[trimmed] || null;
  }
}