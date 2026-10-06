const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const C=require("../diet-core.js"),{DietStore,BASE}=require("../diet-store.cjs");
const directory=()=>{const root=path.resolve(__dirname,"../.local/tests");fs.mkdirSync(root,{recursive:true});return fs.mkdtempSync(path.join(root,"diet-test-"));};
const meal=(day="2026-10-04",grams=100)=>({day,kind:"Breakfast",items:[{foodId:"taco-488",grams,quantity:grams,unit:"g"}]});
test("nutrition day changes at 01:00 Recife time, including month/year boundaries",()=>{
  assert.equal(C.dayKey("2026-10-05T03:59:59Z"),"2026-10-04");assert.equal(C.dayKey("2026-10-05T04:00:00Z"),"2026-10-05");
  assert.equal(C.dayKey("2027-01-01T03:30:00Z"),"2026-12-31");assert.equal(C.dayKey("2026-11-01T03:00:00Z"),"2026-10-31");assert.equal(C.validDay("2026-02-30"),false);
});
test("estimate uses the profile and catalogue contains hundreds of valid foods",()=>{
  const result=C.estimate();assert.equal(result.resting,1708.8);assert.deepEqual(result.goals,{kcal:2650,protein:140,carbs:354,fat:75,water:2500});assert.ok(BASE.length>=550);
  assert.equal(new Set(BASE.map(f=>f.id)).size,BASE.length);for(const food of BASE)for(const key of ["kcal","protein","carbs","fat"])assert.ok(Number.isFinite(food.per100[key])&&food.per100[key]>=0);
  const egg=BASE.find(f=>f.id==="taco-488");assert.ok(Math.abs(egg.per100.kcal-145.70017)<.001);assert.ok(Math.abs(egg.per100.protein-13.29375)<.001);assert.equal(egg.portions[0].grams,50);
});
test("meal and water changes persist after restart and recalculate totals",async()=>{
  const file=path.join(directory(),"diary.json"),clock=()=>new Date("2026-10-05T14:00:00Z"),store=new DietStore(file,{clock});
  let state=await store.addMeal(meal());const id=state.days["2026-10-04"].meals[0].id;assert.equal(C.summary(state.days["2026-10-04"]).totals.protein,13.29375);
  state=await store.updateMeal("2026-10-04",id,{...meal("2026-10-04",200),version:1});assert.equal(C.summary(state.days["2026-10-04"]).totals.protein,26.5875);
  state=await store.addWater({day:"2026-10-04",ml:250});assert.equal(C.summary(state.days["2026-10-04"]).totals.water,250);
  const restart=new DietStore(file,{clock});assert.deepEqual(await restart.get(),state);
  state=await restart.removeWater("2026-10-04",state.days["2026-10-04"].water[0].id);state=await restart.removeMeal("2026-10-04",id,{version:2});assert.equal(C.summary(state.days["2026-10-04"]).recorded,false);
});
test("historical goals are preserved when correcting an earlier day",async()=>{
  let now=new Date("2026-10-04T14:00:00Z");const store=new DietStore(path.join(directory(),"diary.json"),{clock:()=>now});let state=await store.addMeal(meal());
  now=new Date("2026-10-05T14:00:00Z");const oldGoals=state.goals;state=await store.setGoals({goals:{...oldGoals,kcal:3000,protein:180}});
  const id=state.days["2026-10-04"].meals[0].id;state=await store.updateMeal("2026-10-04",id,{...meal("2026-10-04",200),version:1});assert.equal(state.days["2026-10-04"].goals.kcal,2650);
  state=await store.addMeal(meal("2026-10-05"));assert.equal(state.days["2026-10-05"].goals.kcal,3000);assert.equal(C.goalsForDay(state,"2026-10-04").protein,140);
});
test("concurrent changes preserve meals and reject stale edits to the same meal",async()=>{
  const store=new DietStore(path.join(directory(),"diary.json"),{clock:()=>new Date("2026-10-05T14:00:00Z")});await Promise.all(Array.from({length:8},()=>store.addMeal(meal())));let state=await store.get();assert.equal(state.days["2026-10-04"].meals.length,8);const id=state.days["2026-10-04"].meals[0].id;
  const results=await Promise.allSettled([store.updateMeal("2026-10-04",id,{...meal("2026-10-04",200),version:1}),store.updateMeal("2026-10-04",id,{...meal("2026-10-04",300),version:1})]);assert.equal(results.filter(r=>r.status==="fulfilled").length,1);assert.equal(results.find(r=>r.status==="rejected").reason.status,409);
});
test("invalid data, future dates and corrupt files are rejected without deleting the diary",async()=>{
  const file=path.join(directory(),"diary.json"),store=new DietStore(file,{clock:()=>new Date("2026-10-05T14:00:00Z")});await assert.rejects(()=>store.addMeal({...meal(),items:[{foodId:"x",grams:100}]}));assert.throws(()=>store.addMeal(meal("2026-10-06")));await store.addMeal(meal());const before=fs.readFileSync(file,"utf8");await assert.rejects(()=>store.updateMeal("2026-10-04","missing",{...meal(),version:1}));assert.equal(fs.readFileSync(file,"utf8"),before);
  fs.writeFileSync(file,"{invalid");const bad=new DietStore(file);await assert.rejects(()=>bad.get(),/preserved/);assert.equal(fs.readFileSync(file,"utf8"),"{invalid");
});
test("disk failure preserves the previous state and file",async()=>{
  const file=path.join(directory(),"diary.json"),clock=()=>new Date("2026-10-05T14:00:00Z"),store=new DietStore(file,{clock});await store.addMeal(meal());const before=fs.readFileSync(file,"utf8"),io={...require("node:fs/promises"),rename:async()=>{throw new Error("disk");}},failure=new DietStore(file,{clock,io});await assert.rejects(()=>failure.addWater({day:"2026-10-04",ml:250}),/preserved/);assert.equal(fs.readFileSync(file,"utf8"),before);assert.equal((await failure.get()).revision,1);
});
test("history includes unrecorded days and reminders appear only in the last hour",()=>{
  const goals=C.estimate().goals,state={started:"2026-10-01",days:{},goals,goalHistory:{"2026-10-01":goals}};assert.equal(C.historyKeys(state,new Date("2026-10-05T14:00:00Z")).length,5);
  const day=C.emptyDay("2026-10-04",goals);assert.equal(C.reminder(day,new Date("2026-10-05T03:30:00Z")),null);day.meals=[{items:[{food:BASE.find(f=>f.id==="taco-488"),grams:100}]}];assert.match(C.reminder(day,new Date("2026-10-05T03:30:00Z")),/30 min/);assert.equal(C.reminder(day,new Date("2026-10-05T02:00:00Z")),null);
});
test("custom foods are available and meal nutrition snapshots are preserved",async()=>{
  const store=new DietStore(path.join(directory(),"diary.json"),{clock:()=>new Date("2026-10-05T14:00:00Z")});let state=await store.addFood({name:"My toast",per100:{kcal:400,protein:10,carbs:70,fat:9}});const food=state.customFoods[0];state=await store.addMeal({day:"2026-10-04",kind:"Snack",items:[{foodId:food.id,grams:30}]});assert.equal(C.summary(state.days["2026-10-04"]).totals.kcal,120);assert.notEqual(state.days["2026-10-04"].meals[0].items[0].food,food);
});
test("percentage rounding does not report a goal before it is reached",()=>{
  const day=C.emptyDay("2026-10-04",{...C.estimate().goals,protein:13.3});day.meals=[{items:[{food:BASE.find(f=>f.id==="taco-488"),grams:100}]}];const result=C.summary(day);assert.equal(result.met.protein,false);assert.equal(result.percent.protein,99);
});
test("the public catalogue provides English food, category and serving labels",()=>{
  assert.equal(BASE.length,578);
  assert.equal(new Set(BASE.map(food=>food.group)).size,15);
  assert.equal(BASE.find(food=>food.id==="taco-488").name,"Egg, chicken, whole, boiled (10 min)");
  assert.equal(BASE.find(food=>food.id==="taco-488").portions[0].name,"medium egg (approx.)");
  assert.equal(BASE.find(food=>food.id==="taco-540").name,"Feijoada (Brazilian black bean stew)");
  for(const food of BASE){assert.ok(food.name.length<=120);assert.doesNotMatch(food.name,/\b(?:cru|crua|cozido|cozida|grelhado|frito|farinha|integral)\b/i);}
  assert.deepEqual(C.MEALS,["Breakfast","Lunch","Dinner","Snack","Late-night snack"]);
});
test("legacy public diaries translate built-in labels without changing nutrition or user data",async()=>{
  const file=path.join(directory(),"diary.json"),clock=()=>new Date("2026-10-05T14:00:00Z"),store=new DietStore(file,{clock});
  await store.addMeal(meal());
  const saved=await store.addFood({name:"My handmade granola",per100:{kcal:450,protein:12,carbs:58,fat:18}});
  const entry=saved.days["2026-10-04"].meals[0],item=entry.items[0];
  entry.kind="Caf\u00e9 da manh\u00e3";item.food.name="Ovo, de galinha, inteiro, cozido (10 minutos)";
  item.food.group="Ovos e derivados";item.food.portions[0]={name:"ovo m\u00e9dio (aprox.)",grams:52};
  item.food.per100.kcal=140;item.unit="ovo m\u00e9dio (aprox.)";item.quantity=2;
  saved.profile.name="Usu\u00e1rio";saved.customFoods[0].group="Meus alimentos";
  saved.customFoods[0].source="R\u00f3tulo cadastrado pelo usu\u00e1rio";
  const original=JSON.stringify(saved);fs.writeFileSync(file,original);
  const restart=new DietStore(file,{clock}),translated=await restart.get(),translatedItem=translated.days["2026-10-04"].meals[0].items[0];
  assert.equal(fs.readFileSync(file,"utf8"),original);
  assert.equal(translated.days["2026-10-04"].meals[0].kind,"Breakfast");
  assert.equal(translated.profile.name,"User");assert.equal(translatedItem.food.name,BASE.find(food=>food.id==="taco-488").name);
  assert.deepEqual(translatedItem.food.per100,item.food.per100);assert.equal(translatedItem.food.portions[0].grams,52);
  assert.equal(translatedItem.unit,"medium egg (approx.)");assert.equal(translatedItem.grams,item.grams);assert.equal(translatedItem.quantity,2);
  assert.equal(translated.customFoods[0].name,"My handmade granola");assert.equal(translated.customFoods[0].group,"Custom foods");
  assert.deepEqual(translated.goalHistory,saved.goalHistory);assert.deepEqual(translated.favorites,saved.favorites);assert.equal(translated.revision,saved.revision);
  const updated=await restart.addWater({day:"2026-10-04",ml:250});
  assert.deepEqual(await new DietStore(file,{clock}).get(),updated);
  assert.equal(C.summary(updated.days["2026-10-04"]).totals.kcal,140);
});
