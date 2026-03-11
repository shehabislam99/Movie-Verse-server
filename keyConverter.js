const fs = require("fs");
const jsonData = fs.readFileSync("./movies-poka-pro-firebase-adminsdk.json", "utf-8");

const base64 = Buffer.from(jsonData).toString("base64");
// console.log(base64);
