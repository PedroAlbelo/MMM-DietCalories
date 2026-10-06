const NodeHelper=require("node_helper"),express=require("express"),os=require("node:os"),path=require("node:path");
const {DietStore}=require("./diet-store.cjs"),{registerRoutes}=require("./api.cjs");
module.exports=NodeHelper.create({
  requiresVersion:"2.38.0",
  start(){const config=this.getServerModuleConfig?.()||{};this.stopped=false;this.store=new DietStore(config.dataFile||path.join(os.homedir(),".magicmirror","MMM-DietCalories","diary.json"));this.store.ready.catch(()=>{});registerRoutes(this.expressApp,this.store,express.json({limit:"32kb"}),state=>{if(!this.stopped)this.sendSocketNotification("DIET_STATE",state);});},
  async socketNotificationReceived(notification){if(notification!=="DIET_SUBSCRIBE"||this.stopped)return;try{this.sendSocketNotification("DIET_STATE",await this.store.get());}catch(error){this.sendSocketNotification("DIET_ERROR",error.message);}},
  stop(){this.stopped=true;}
});
