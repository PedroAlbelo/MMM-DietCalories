const path=require("node:path"),fs=require("node:fs"),{mirrorPath,mirrorRequire}=require("./mirror-path.cjs");
const ROOT=path.resolve(__dirname,".."),express=mirrorRequire()("express");
const {DietStore,BASE}=require("../diet-store.cjs"),C=require("../diet-core.js"),{registerRoutes}=require("../api.cjs");
const filename=process.env.DIET_DEMO_DATA||path.resolve(ROOT,".local/demo/diary.json"),fresh=!fs.existsSync(filename),store=new DietStore(filename);store.ready.catch(()=>{});
async function start(){
  await store.ready;
  if(fresh){const day=C.dayKey(),shift=n=>new Date(Date.parse(day+"T12:00:00Z")+n*86400000).toISOString().slice(0,10),food=prefix=>BASE.find(f=>f.name.startsWith(prefix)).id;for(const [date,kind,items]of [[shift(-2),"Lunch",[["taco-3",220],["taco-410",150],[food("Beans, carioca variety, cooked"),100]]],[shift(-1),"Snack",[["taco-7",40],[food("Banana, Nanica variety, raw"),120]]],[day,"Breakfast",[["taco-488",100],["taco-63",30]]]])await store.addMeal({day:date,kind,items:items.map(([foodId,grams])=>({foodId,grams}))});await store.addWater({day,ml:500});}
  const app=express();registerRoutes(app,store,express.json({limit:"32kb"}),()=>{});app.use("/MMM-DietCalories",express.static(path.join(ROOT,"public")));app.use("/modules/MMM-DietCalories",express.static(ROOT,{dotfiles:"deny"}));app.use("/magicmirror-css",express.static(path.join(mirrorPath(),"css")));app.get("/",(req,res)=>res.redirect("/modules/MMM-DietCalories/demo/mirror.html"));const port=Number(process.env.DIET_DEMO_PORT)||8094;app.listen(port,"127.0.0.1",()=>console.log(`Demo: http://localhost:${port}/ · Editor: http://localhost:${port}/MMM-DietCalories/ · example data only`));
}
start().catch(error=>{console.error(error.message);process.exitCode=1;});
