import * as parse5 from "parse5";
import DomWalker from "./dom-walker.js";

export default class HtmlParser {
    
    constructor() {
        
        this.walker = new DomWalker();
        
    }
    
    parse(html) {
        
        const document = parse5.parseFragment(html);
        
        this.walker.walk(document, node => {
            
        if (node.nodeName === "#text") {

             console.log(node.value.trim());

}
            
        });
        
        return document;
        
    }
    
}