import Node from "./node.js";

export default class NodeBuilder {
    
    constructor() {
        this.currentId = 1;
    }
    
    create(data = {}) {
        
        const node = new Node();
        
        node.id = this.currentId++;
        
        node.tag = data.tag || "";
        
        node.type = data.type || "";
        
        node.path = data.path || "";
        
        node.attributes = data.attributes || {};
        
        node.text = data.text || "";
        
        node.translate = data.translate ?? true;
        
        node.children = data.children || [];
        
        return node;
        
    }
    
}