const {DietError}=require("./diet-store.cjs");
function checkWrite(headers){
  if(headers["x-diet-client"]!=="MMM-DietCalories"||!(headers["content-type"]||"").toLowerCase().startsWith("application/json"))throw new DietError("Invalid edit request.",403);
  if(headers.origin){let origin;try{origin=new URL(headers.origin);}catch{throw new DietError("Invalid origin.",403);}if(!["http:","https:"].includes(origin.protocol)||origin.host!==headers.host)throw new DietError("This origin is not allowed to edit the diary.",403);}
}
function registerRoutes(app,store,jsonParser,changed){
  const prefix="/MMM-DietCalories/api";app.use(prefix,jsonParser);
  const route=(method,url,action,write=true)=>app[method](prefix+url,async(req,res)=>{
    try{if(write)checkWrite(req.headers);const value=await action(req);if(write)changed(value);res.set("Cache-Control","no-store").json(value);}
    catch(error){res.status(error.status||500).json({error:error.status?error.message:"Could not access the diary."});}
  });
  route("get","/state",()=>store.get(),false);route("get","/revision",()=>store.revision(),false);route("get","/foods",()=>store.catalogue(),false);
  route("post","/meals",req=>store.addMeal(req.body));
  route("patch","/days/:day/meals/:id",req=>store.updateMeal(req.params.day,req.params.id,req.body));
  route("delete","/days/:day/meals/:id",req=>store.removeMeal(req.params.day,req.params.id,req.body));
  route("post","/water",req=>store.addWater(req.body));route("delete","/days/:day/water/:id",req=>store.removeWater(req.params.day,req.params.id));
  route("put","/goals",req=>store.setGoals(req.body));route("post","/foods",req=>store.addFood(req.body));route("put","/favorites",req=>store.favorite(req.body));
  app.use(prefix,(error,req,res,next)=>{if(error)res.status(error.status===413?413:400).json({error:"Invalid or oversized data."});else next();});
}
module.exports={registerRoutes,checkWrite};
