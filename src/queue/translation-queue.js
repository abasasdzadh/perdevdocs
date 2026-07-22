export class TranslationQueue {
  constructor() {
    this.queue = [];
  }
  
  enqueue(task) {
    this.queue.push(task);
  }
  
  async processAll(translator) {
    const results = [];
    for (const text of this.queue) {
      const translated = await translator.translate(text);
      results.push(translated);
    }
    this.queue = [];
    return results;
  }
}