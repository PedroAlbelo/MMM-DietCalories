const fs=require("node:fs/promises"),path=require("node:path"),{randomUUID}=require("node:crypto");
const Core=require("./diet-core.js"),BASE=require("./data/foods.json");
// Translate built-in labels saved by the earlier Portuguese public release.
// Nutrient snapshots, weights and user-authored food names must remain intact.
const LEGACY_MEALS={"Caf\u00e9 da manh\u00e3":"Breakfast","Almo\u00e7o":"Lunch","Jantar":"Dinner","Lanche":"Snack","Ceia":"Late-night snack"};
const LEGACY_UNITS={"torrada pequena (aprox.)":"small toast slice (approx.)","banana m\u00e9dia sem casca (aprox.)":"medium peeled banana (approx.)","ovo m\u00e9dio (aprox.)":"medium egg (approx.)","unidade (peso informado)":"unit (entered weight)"};
const BASE_BY_ID=new Map(BASE.map(food=>[food.id,food]));
const translatedLabel=(labels,value)=>Object.hasOwn(labels,value)?labels[value]:value;
function translateSavedFood(food){
  if(!food||typeof food!=="object")return;
  const current=BASE_BY_ID.get(food.id);
  if(current){food.name=current.name;food.group=current.group;}
  else if(food.group==="Meus alimentos")food.group="Custom foods";
  if(food.source==="R\u00f3tulo cadastrado pelo usu\u00e1rio")food.source="User-entered nutrition label";
  if(Array.isArray(food.portions))for(const portion of food.portions)if(portion)portion.name=translatedLabel(LEGACY_UNITS,portion.name);
}
class DietError extends Error {constructor(message,status=400){super(message);this.status=status;}}
const text=(value,label,max=120)=>{if(typeof value!=="string"||!value.trim()||value.trim().length>max)throw new DietError(label+" is invalid.");return value.trim();};
const number=(value,label,min,max)=>{if(typeof value!=="number"||!Number.isFinite(value)||value<min||value>max)throw new DietError(label+" is invalid.");return value;};
function goals(value){
  if(!value||typeof value!=="object"||Object.keys(value).some(k=>!Core.KEYS.includes(k)))throw new DietError("Invalid goals.");
  return Object.fromEntries(Core.KEYS.map(k=>[k,number(value[k],"Goal for "+k,k==="kcal"?1200:k==="water"?100:1,k==="kcal"?6000:k==="water"?8000:1000)]));
}
function foodValid(food){
  if(!food||typeof food.id!=="string"||!food.id||!food.per100||!Array.isArray(food.portions))throw new DietError("Invalid food.");
  text(food.name,"Food name");text(food.group,"Category");
  for(const key of ["kcal","protein","carbs","fat"])number(food.per100[key],key,0,key==="kcal"?1000:100);
}
class DietStore {
  constructor(filename,{io=fs,clock=()=>new Date()}={}){
    this.filename=filename;this.io=io;this.clock=clock;this.queue=Promise.resolve();
    const initial=Core.estimate().goals,started=Core.dayKey(clock());
    this.state={version:1,revision:0,started,profile:{...Core.PROFILE},goals:initial,goalHistory:{[started]:{...initial}},days:{},customFoods:[],favorites:[]};
    this.ready=this.load();
  }
  async load(){
    try{
      const saved=JSON.parse(await this.io.readFile(this.filename,"utf8"));
      if(saved.version!==1||!Number.isInteger(saved.revision)||saved.revision<0||!Core.validDay(saved.started)||!saved.profile||!saved.days||Array.isArray(saved.days)||!Array.isArray(saved.customFoods)||!Array.isArray(saved.favorites))throw new Error("Invalid format");
      if(saved.profile.name==="Usu\u00e1rio")saved.profile.name="User";
      goals(saved.goals);
      if(!saved.goalHistory||Array.isArray(saved.goalHistory)||!Object.keys(saved.goalHistory).length)throw new Error("Missing goal history");
      for(const [date,value]of Object.entries(saved.goalHistory)){if(!Core.validDay(date))throw new Error("Invalid goal date");goals(value);}
      for(const food of saved.customFoods){translateSavedFood(food);foodValid(food);}
      const ids=new Set();
      for(const [key,day]of Object.entries(saved.days)){
        if(!Core.validDay(key)||key!==day.key||!Array.isArray(day.meals)||!Array.isArray(day.water))throw new Error("Invalid day");goals(day.goals);
        for(const meal of day.meals){
          meal.kind=translatedLabel(LEGACY_MEALS,meal.kind);
          if(typeof meal.id!=="string"||ids.has(meal.id)||!Core.MEALS.includes(meal.kind)||!Number.isInteger(meal.version)||!Array.isArray(meal.items)||!meal.items.length)throw new Error("Invalid meal");ids.add(meal.id);
          for(const item of meal.items){translateSavedFood(item.food);item.unit=translatedLabel(LEGACY_UNITS,item.unit);foodValid(item.food);number(item.grams,"Weight",0.1,5000);}
        }
        for(const entry of day.water){if(typeof entry.id!=="string"||ids.has(entry.id))throw new Error("Invalid water entry");ids.add(entry.id);number(entry.ml,"Water",1,5000);}
      }
      this.state=saved;
    }catch(error){if(error.code!=="ENOENT")throw new DietError("Could not read the diary. The original file was preserved.",500);}
  }
  async get(){await this.ready;return structuredClone(this.state);}
  async revision(){await this.ready;return{revision:this.state.revision};}
  async catalogue(){await this.ready;return [...BASE,...this.state.customFoods];}
  checkDay(key){if(!Core.validDay(key)||key>Core.dayKey(this.clock())||key<"2000-01-01")throw new DietError("Choose a valid date no later than the current nutrition day.");return key;}
  day(state,key){return state.days[key]??=(Core.emptyDay(key,Core.goalsForDay(state,key)));}
  mutate(change){
    const operation=this.queue.then(async()=>{
      await this.ready;const next=structuredClone(this.state);change(next);next.revision++;
      await this.io.mkdir(path.dirname(this.filename),{recursive:true});const pending=this.filename+"."+randomUUID()+".pending";
      try{await this.io.writeFile(pending,JSON.stringify(next)+"\n",{flag:"wx"});await this.io.rename(pending,this.filename);}
      catch{await this.io.unlink(pending).catch(()=>{});throw new DietError("Could not save. The previous diary was preserved.",500);}
      this.state=next;return structuredClone(next);
    });this.queue=operation.catch(()=>{});return operation;
  }
  items(body,state){
    if(!Array.isArray(body)||!body.length||body.length>40)throw new DietError("Choose between 1 and 40 food items per meal.");
    const foods=new Map([...BASE,...state.customFoods].map(f=>[f.id,f]));
    return body.map(item=>{
      const food=foods.get(item.foodId);if(!food)throw new DietError("Food not found.");
      const grams=number(item.grams,"Food weight",0.1,5000);
      const unit=item.unit===undefined?"g":text(item.unit,"Unit",60);
      const quantity=item.quantity===undefined?grams:number(item.quantity,"Quantity",0.01,5000);
      return {food:structuredClone(food),grams,unit,quantity};
    });
  }
  addMeal(body){
    const key=this.checkDay(body?.day),kind=body?.kind;if(!Core.MEALS.includes(kind))throw new DietError("Invalid meal.");
    return this.mutate(state=>{const day=this.day(state,key);if(day.meals.length>=100)throw new DietError("The meal limit for this day has been reached.");day.meals.push({id:randomUUID(),version:1,kind,createdAt:this.clock().toISOString(),items:this.items(body.items,state)});});
  }
  updateMeal(key,id,body){
    this.checkDay(key);if(!Core.MEALS.includes(body?.kind))throw new DietError("Invalid meal.");
    return this.mutate(state=>{const meal=state.days[key]?.meals.find(m=>m.id===id);if(!meal)throw new DietError("This meal no longer exists.",404);if(body.version!==meal.version)throw new DietError("This meal changed on another device. Reopen it before editing.",409);meal.kind=body.kind;meal.items=this.items(body.items,state);meal.version++;});
  }
  removeMeal(key,id,body){
    this.checkDay(key);return this.mutate(state=>{const day=state.days[key],index=day?.meals.findIndex(m=>m.id===id)??-1;if(index<0)throw new DietError("Meal not found.",404);if(body?.version!==day.meals[index].version)throw new DietError("This meal changed. Reopen it before deleting.",409);day.meals.splice(index,1);});
  }
  addWater(body){const key=this.checkDay(body?.day),ml=number(body.ml,"Water",1,5000);return this.mutate(state=>{const day=this.day(state,key);if(day.water.length>=100)throw new DietError("The water entry limit has been reached.");day.water.push({id:randomUUID(),ml});});}
  removeWater(key,id){this.checkDay(key);return this.mutate(state=>{const day=state.days[key],index=day?.water.findIndex(e=>e.id===id)??-1;if(index<0)throw new DietError("Water entry not found.",404);day.water.splice(index,1);});}
  setGoals(body){const value=goals(body?.goals);return this.mutate(state=>{state.goals=value;const today=Core.dayKey(this.clock());state.goalHistory[today]={...value};if(state.days[today])state.days[today].goals={...value};});}
  addFood(body){
    const food={id:"custom-"+randomUUID(),name:text(body?.name,"Food name"),group:"Custom foods",source:"User-entered nutrition label",per100:body?.per100,portions:[]};foodValid(food);
    return this.mutate(state=>{if(state.customFoods.length>=1000)throw new DietError("The custom food limit has been reached.");state.customFoods.push(food);});
  }
  favorite(body){if(typeof body?.selected!=="boolean"||typeof body?.foodId!=="string")throw new DietError("Invalid favorite.");return this.mutate(state=>{if(![...BASE,...state.customFoods].some(f=>f.id===body.foodId))throw new DietError("Food not found.");state.favorites=state.favorites.filter(id=>id!==body.foodId);if(body.selected)state.favorites.push(body.foodId);});}
}
module.exports={DietStore,DietError,BASE};
