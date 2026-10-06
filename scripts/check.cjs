const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const files=["MMM-DietCalories.js","diet-core.js","diet-ui.js","diet-store.cjs","api.cjs","node_helper.js","scripts/install.cjs","scripts/demo.cjs","scripts/mirror-path.cjs"];
for(const file of files)new vm.Script(fs.readFileSync(path.resolve(__dirname,"..",file),"utf8"),{filename:file});
console.log("Syntax checked: "+files.length+" files.");
