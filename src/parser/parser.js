import JsonReader from "./json-reader.js";
import HtmlParser from "./html-parser.js";

export default class Parser {
    
    constructor() {
        this.reader = new JsonReader();
        this.htmlParser = new HtmlParser();
    }
    
    parse(json) {
        
        const document = this.reader.read(json);
        
        const html = this.htmlParser.parse(document.html);
        
        return html;
        
    }
    
}