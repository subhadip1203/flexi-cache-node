// TagCache: add tags & query
import { TagCache } from "flexi-cache-node"


const tc = new TagCache();
tc.setWithTags("user:42", { name: "Ada" }, ["users", "vip"]);
tc.addTagToKey("user:42", "beta");
console.log("vip →", tc.getValuesByTag("vip"));