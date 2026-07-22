export default class JsonReader {
    
    read(json) {
        
        if (!json) {
            throw new Error("JSON is empty.");
        }
        
        if (typeof json !== "object") {
            throw new Error("Invalid JSON.");
        }
        
        if (!json.index) {
            throw new Error("Missing 'index' property.");
        }
        
        return {
            documentType: "devdocs",
            html: json.index
        };
        
    }
    
}