import fs from "fs";

// 1. Inspect MyRentOrders.tsx links
const myOrdersPath = "d:\\ki7\\ReUse_FE\\src\\pages\\rent\\orders\\MyRentOrders.tsx";
const myOrdersContent = fs.readFileSync(myOrdersPath, "utf-8");
const links = myOrdersContent.split("\n").filter(l => /href|to=|navigate/i.test(l));
console.log("=== MyRentOrders.tsx links ===");
console.log(links.slice(0, 30).join("\n"));

// 2. Inspect App.tsx rent routes
const appPath = "d:\\ki7\\ReUse_FE\\src\\App.tsx";
const appContent = fs.readFileSync(appPath, "utf-8");
const appRoutes = appContent.split("\n").filter(l => /rent/i.test(l));
console.log("=== App.tsx rent routes ===");
console.log(appRoutes.join("\n"));
