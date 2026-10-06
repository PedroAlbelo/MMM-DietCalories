/* global Module, DietUI */
Module.register("MMM-DietCalories",{
  requiresVersion:"2.38.0",
  getScripts(){return [this.file("diet-core.js"),this.file("diet-ui.js")];},
  getStyles(){return [this.file("diet.css")];},
  start(){this.app=null;this.root=null;},
  getDom(){if(!this.root){this.root=document.createElement("div");this.app=new DietUI.App({mount:this.root,mode:"mirror"});}return this.root;},
  notificationReceived(notification){if(notification==="DOM_OBJECTS_CREATED")this.sendSocketNotification("DIET_SUBSCRIBE");},
  socketNotificationReceived(notification,payload){if(notification==="DIET_STATE")this.app?.accept(payload);if(notification==="DIET_ERROR")this.app?.message(payload,true);},
  suspend(){this.app?.closeModal();}
});
