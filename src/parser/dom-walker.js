export default class DomWalker {
    
    walk(node, callback) {
        
        if (!node) {
            return;
        }
        
        callback(node);
        
        if (node.childNodes) {
            
            for (const child of node.childNodes) {
                
                this.walk(child, callback);
                
            }
            
        }
        
    }
    
}