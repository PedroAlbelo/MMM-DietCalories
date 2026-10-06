const fs=require("node:fs"),path=require("node:path"),os=require("node:os"),vm=require("node:vm"),{createRequire}=require("node:module");
const ROOT=path.resolve(__dirname,".."),NAME="MMM-DietCalories",START="// BEGIN MMM-DietCalories configuration",END="// END MMM-DietCalories configuration";
const FILES=["MMM-DietCalories.js","diet-core.js","diet-ui.js","diet.css","diet-store.cjs","api.cjs","node_helper.js","package.json","README.md","NOTICE.md","data","public","scripts","tests","docs","demo"];
function readConfig(source,filename){const context={module:{exports:{}},require:createRequire(filename),process,console};vm.runInNewContext(source,context,{filename,timeout:1000});if(!Array.isArray(context.module.exports.modules))throw new Error("Invalid config.js.");return context.module.exports;}
function applySettings(config){
  const name="MMM-DietCalories";let module=config.modules.find(m=>m.module===name);
  if(!module){module={module:name,position:"middle_center",config:{}};config.modules.push(module);}
  module.disabled=false;
}
function prepareConfig(source,filename){
  const before=readConfig(source,filename);
  if(before.modules.filter(m=>m.module===NAME).length>1)throw new Error("Keep only one MMM-DietCalories instance.");
  const start=source.indexOf(START),end=source.indexOf(END);if((start>=0)!==(end>=0)||(start>=0&&end<start))throw new Error("Incomplete nutrition configuration block.");
  const original=start>=0?source.slice(0,start)+source.slice(end+END.length):source;
  const updated=original.trimEnd()+`\n\n${START}\n;(${applySettings.toString()})(typeof config!=="undefined"?config:module.exports);\n${END}\n`;
  const after=readConfig(updated,filename),unrelated=config=>config.modules.filter(m=>m.module!==NAME);
  if(JSON.stringify(unrelated(before))!==JSON.stringify(unrelated(after))||before.address!==after.address||JSON.stringify(before.ipWhitelist)!==JSON.stringify(after.ipWhitelist))throw new Error("Installation would change other modules or network settings.");
  return{before,after,updated};
}
function localIP(){return Object.entries(os.networkInterfaces()).filter(([name])=>!/vpn|tun|virtual|vethernet|wsl|loopback/i.test(name)).flatMap(([,entries])=>entries||[]).find(e=>e.family==="IPv4"&&!e.internal&&/^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(e.address))?.address;}
function run(mirrorPath,install=false,updateOnly=false){
  const mirror=fs.realpathSync(path.resolve(mirrorPath)),configRoot=fs.realpathSync(path.join(mirror,"config")),modules=fs.realpathSync(path.join(mirror,"modules"));
  if(!configRoot.startsWith(mirror+path.sep)||!modules.startsWith(mirror+path.sep))throw new Error("The folders resolve outside the installation.");
  const filename=path.join(configRoot,"config.js"),source=fs.readFileSync(filename,"utf8"),current=readConfig(source,filename),plan=updateOnly?{before:current,after:current,updated:source}:prepareConfig(source,filename),target=path.join(modules,NAME);
  if(updateOnly&&(!fs.existsSync(target)||!current.modules.some(module=>module.module===NAME&&!module.disabled)))throw new Error("Use --install for the first MMM-DietCalories installation.");
  console.log(updateOnly?"Update: config.js and your diary will be preserved.":"Validated: nutrition module. Other modules and network settings are preserved.");console.log(`Local editor: http://localhost:${plan.after.port||8080}/${NAME}/`);const ip=localIP();if(ip&&plan.after.address!=="localhost")console.log(`Network editor: http://${ip}:${plan.after.port||8080}/${NAME}/`);
  if(!install){console.log("Preview: no files changed. Use --install to apply.");return plan;}
  if(fs.existsSync(target)&&(fs.lstatSync(target).isSymbolicLink()||fs.realpathSync(target)===ROOT))throw new Error("Run from an external copy; the installed folder must not be a link.");
  const stamp=new Date().toISOString().replace(/[:.]/g,"-"),staging=target+".pending-"+stamp,backup=target+".backup-"+stamp,configBackup=filename+".diet-"+stamp+".bak",pending=filename+".diet-pending-"+stamp;
  fs.mkdirSync(staging);for(const file of FILES)fs.cpSync(path.join(ROOT,file),path.join(staging,file),{recursive:true});if(!updateOnly){fs.copyFileSync(filename,configBackup,fs.constants.COPYFILE_EXCL);fs.writeFileSync(pending,plan.updated,{flag:"wx"});}if(fs.readFileSync(filename,"utf8")!==source)throw new Error("config.js changed during installation; no configuration change was applied.");
  let oldMoved=false,newMoved=false;try{if(fs.existsSync(target)){fs.renameSync(target,backup);oldMoved=true;}fs.renameSync(staging,target);newMoved=true;if(!updateOnly)fs.renameSync(pending,filename);}catch(error){if(newMoved)fs.renameSync(target,staging+".failed");if(oldMoved)fs.renameSync(backup,target);throw error;}
  console.log(`MMM-DietCalories v${require("../package.json").version}: `+target);if(!updateOnly)console.log("Config backup: "+configBackup);console.log("Restart MagicMirror. Edit in your computer or phone browser.");return plan;
}
if(require.main===module){try{const args=process.argv.slice(2);run(args.find(arg=>!arg.startsWith("--"))||".",args.includes("--install")||args.includes("--update-only"),args.includes("--update-only"));}catch(error){console.error(error.message);process.exitCode=1;}}
module.exports={readConfig,prepareConfig,applySettings,run};
