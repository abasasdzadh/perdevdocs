import Parser from "./parser/parser.js";

const parser = new Parser();

const markdown = {
  index: "<h1>Markdown</h1><p>Hello World</p>"
};

const result = parser.parse(markdown);

console.log(result);