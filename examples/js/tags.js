// TagCache: group values by tags
const { TagCache } = require("flexi-cache-node")


const tc = new TagCache();
tc.setWithTags("item:1", { price: 100 }, ["electronics", "sale"]);
tc.setWithTags("item:2", { price: 40 }, ["books"]);
console.log("electronics →", tc.getValuesByTag("electronics"));
tc.deleteTag("sale"); // removes all keys that had tag "sale"