(function(root) {
  "use strict";
  const KEYS = ["kcal", "protein", "carbs", "fat", "water"];
  const MEALS = ["Breakfast", "Lunch", "Dinner", "Snack", "Late-night snack"];
  // Example distribution profile; an existing diary keeps its profile.
  const PROFILE = { name:"User", age:23, sex:"male", weight:70, height:179, targetWeight:72, months:5, trainingDays:5, trainingMinutes:100, activity:1.5, surplus:100 };
  const round = value => Math.round(value * 10) / 10;
  function estimate(profile = PROFILE) {
    const resting = 10 * profile.weight + 6.25 * profile.height - 5 * profile.age + (profile.sex === "female" ? -161 : 5);
    const maintenance = resting * profile.activity;
    const kcal = Math.round((maintenance + profile.surplus) / 50) * 50;
    const protein = Math.round(profile.weight * 2), fat = 75;
    return { resting:round(resting), maintenance:round(maintenance), goals:{kcal,protein,carbs:Math.round((kcal - protein * 4 - fat * 9) / 4),fat,water:2500} };
  }
  function localParts(now = new Date()) {
    return Object.fromEntries(new Intl.DateTimeFormat("en-CA",{timeZone:"America/Recife",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date(now)).filter(p=>p.type!=="literal").map(p=>[p.type,p.value]));
  }
  function dayKey(now = new Date()) {
    const p=localParts(now), date = new Date(Date.UTC(+p.year,+p.month-1,+p.day));
    if (+p.hour < 1) date.setUTCDate(date.getUTCDate()-1);
    return date.toISOString().slice(0,10);
  }
  function validDay(value) {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value+"T12:00:00Z")) && new Date(value+"T12:00:00Z").toISOString().slice(0,10) === value;
  }
  function foodTotals(food, grams) { return Object.fromEntries(["kcal","protein","carbs","fat"].map(key=>[key,food.per100[key]*grams/100])); }
  function summary(day) {
    const totals = {kcal:0,protein:0,carbs:0,fat:0,water:0};
    for (const meal of day.meals) for (const item of meal.items) {
      const values=foodTotals(item.food,item.grams); for (const key of Object.keys(values)) totals[key]+=values[key];
    }
    totals.water=day.water.reduce((total,entry)=>total+entry.ml,0);
    const met=Object.fromEntries(KEYS.map(key=>[key,totals[key]>=day.goals[key]]));
    const percent=Object.fromEntries(KEYS.map(key=>[key,met[key]?Math.round(totals[key]/day.goals[key]*100):Math.min(99,Math.round(totals[key]/day.goals[key]*100))]));
    const remaining=Object.fromEntries(KEYS.map(key=>[key,Math.max(0,day.goals[key]-totals[key])]));
    return {totals,percent,remaining,met,recorded:day.meals.length>0 || day.water.length>0};
  }
  function emptyDay(key,goals) { return {key,goals:{...goals},meals:[],water:[]}; }
  function goalsForDay(state,key) { const dates=Object.keys(state.goalHistory||{}).sort(); const effective=dates.filter(date=>date<=key).at(-1)||dates[0]; return effective ? state.goalHistory[effective] : state.goals; }
  function reminder(day, now = new Date(), name = "User") {
    if (day.key !== dayKey(now)) return null;
    const p=localParts(now), elapsed=(+p.hour*60 + +p.minute - 60 + 1440)%1440;
    const minutes=1440-elapsed, stats=summary(day);
    if (minutes > 60 || !stats.recorded || stats.percent.kcal >= 100) return null;
    return `${name}, ${minutes} min left in this nutrition day. ${stats.percent.kcal}% of your calorie goal logged. Check your meal entries.`;
  }
  function historyKeys(state,now=new Date(),limit=36525) {
    const today=dayKey(now), oldest=[state.started,...Object.keys(state.days)].sort()[0];
    const count=Math.min(limit, Math.max(1,Math.floor((Date.parse(today)-Date.parse(oldest))/86400000)+1));
    return Array.from({length:count},(_,index)=>new Date(Date.parse(today+"T12:00:00Z")-index*86400000).toISOString().slice(0,10));
  }
  const api={KEYS,MEALS,PROFILE,round,estimate,localParts,dayKey,validDay,foodTotals,summary,emptyDay,goalsForDay,reminder,historyKeys};
  root.DietCore=api; if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(globalThis);
