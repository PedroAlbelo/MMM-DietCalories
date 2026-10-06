const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const installer = require("../scripts/install.cjs");
const { DietStore } = require("../diet-store.cjs");
const { registerRoutes } = require("../api.cjs");
const { mirrorRequire } = require("../scripts/mirror-path.cjs");
const express = mirrorRequire()("express");
const root = () => {
  const parent = path.resolve(__dirname, "../.local/tests");
  fs.mkdirSync(parent, { recursive:true });
  return fs.mkdtempSync(path.join(parent, "diet-integration-"));
};

test("installer supports a standard configuration, preserves modules/network and does not duplicate", () => {
  const file = path.join(root(), "config.js");
  const config = { address:"0.0.0.0", port:8088, ipWhitelist:["127.0.0.1"], modules:[
    { module:"clock", position:"top_right" },
    { module:"weather", config:{ lat:-8.05, lon:-34.88 } }
  ] };
  const source = `const config=${JSON.stringify(config)};module.exports=config;`;
  const first = installer.prepareConfig(source, file);
  const second = installer.prepareConfig(first.updated, file);
  assert.equal(first.updated, second.updated);
  assert.deepEqual(JSON.parse(JSON.stringify(first.after.modules.slice(0, 2))), config.modules);
  assert.equal(first.after.modules.filter(m => m.module === "MMM-DietCalories").length, 1);
  assert.equal(first.after.modules.at(-1).position, "middle_center");
  assert.equal(first.after.address, config.address);
  assert.equal(first.after.port, config.port);
  assert.equal(first.after.ipWhitelist.join(","), config.ipWhitelist.join(","));
});

test("Express API saves meals and rejects foreign origins, oversized data and conflicts", async t => {
  const store = new DietStore(path.join(root(), "diary.json"), { clock:() => new Date("2026-10-05T14:00:00Z") });
  const app = express(), events = [];
  registerRoutes(app, store, express.json({ limit:"32kb" }), state => events.push(state));
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const api = `http://127.0.0.1:${server.address().port}/MMM-DietCalories/api`;
  const headers = { "Content-Type":"application/json", "X-Diet-Client":"MMM-DietCalories" };
  let response = await fetch(api + "/foods");
  assert.equal((await response.json()).length, 578);
  const body = { day:"2026-10-04", kind:"Lunch", items:[{ foodId:"taco-3", grams:200 }] };
  response = await fetch(api + "/meals", { method:"POST", headers, body:JSON.stringify(body) });
  assert.equal(response.status, 200);
  const state = await response.json(), meal = state.days[body.day].meals[0];
  response = await fetch(api + "/revision");
  assert.deepEqual(await response.json(), { revision:1 });
  response = await fetch(api + `/days/${body.day}/meals/${meal.id}`, { method:"PATCH", headers, body:JSON.stringify({ ...body, version:0 }) });
  assert.equal(response.status, 409);
  response = await fetch(api + "/water", { method:"POST", headers:{ ...headers, Origin:"https://foreign.example" }, body:JSON.stringify({ day:body.day, ml:250 }) });
  assert.equal(response.status, 403);
  response = await fetch(api + "/foods", { method:"POST", headers, body:"{" });
  assert.equal(response.status, 400);
  response = await fetch(api + "/foods", { method:"POST", headers, body:JSON.stringify({ name:"x".repeat(34000) }) });
  assert.equal(response.status, 413);
  assert.equal(events.length, 1);
});

test("full installation and update preserve diary, config and module options", () => {
  const mirror = path.join(root(), "Mirror");
  fs.mkdirSync(path.join(mirror, "config"), { recursive:true });
  fs.mkdirSync(path.join(mirror, "modules"), { recursive:true });
  const filename = path.join(mirror, "config", "config.js");
  const source = 'const config={address:"localhost",modules:[{module:"clock",position:"top_right"}]};module.exports=config;';
  fs.writeFileSync(filename, source);
  const diary = path.join(mirror, "diary.json");
  fs.writeFileSync(diary, "keep");
  const log = console.log;
  console.log = () => {};
  try { installer.run(mirror, true); installer.run(mirror, true); }
  finally { console.log = log; }
  assert.equal(fs.readFileSync(diary, "utf8"), "keep");
  assert.ok(fs.existsSync(path.join(mirror, "modules", "MMM-DietCalories", "data", "foods.json")));
  assert.ok(fs.existsSync(path.join(mirror, "modules", "MMM-DietCalories", "public", "index.html")));
  assert.ok(fs.readdirSync(path.join(mirror, "config")).some(file => file.endsWith(".bak") && fs.readFileSync(path.join(mirror, "config", file), "utf8") === source));
  const config = installer.readConfig(fs.readFileSync(filename, "utf8"), filename);
  assert.equal(config.modules.length, 2);
  assert.equal(config.modules[0].module, "clock");
  const edited = fs.readFileSync(filename, "utf8") + "\n// Personal adjustment preserved\n";
  fs.writeFileSync(filename, edited);
  const configFiles = fs.readdirSync(path.join(mirror, "config")).sort();
  console.log = () => {};
  try { installer.run(mirror, true, true); }
  finally { console.log = log; }
  assert.equal(fs.readFileSync(filename, "utf8"), edited);
  assert.equal(fs.readFileSync(diary, "utf8"), "keep");
  assert.deepEqual(fs.readdirSync(path.join(mirror, "config")).sort(), configFiles);
  assert.equal(JSON.parse(fs.readFileSync(path.join(mirror, "modules", "MMM-DietCalories", "package.json"), "utf8")).version, require("../package.json").version);
  const customSource = 'const config={modules:[{module:"MMM-DietCalories",position:"bottom_bar",disabled:true,config:{dataFile:"D:/PrivateData/diary.json"}}]};module.exports=config;';
  const custom = installer.prepareConfig(customSource, filename).after.modules[0];
  assert.equal(custom.position, "bottom_bar");
  assert.equal(custom.disabled, false);
  assert.equal(custom.config.dataFile, "D:/PrivateData/diary.json");
});
