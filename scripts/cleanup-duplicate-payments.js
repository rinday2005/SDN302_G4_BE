import mongoose from "mongoose";
import { MONGO_URI } from "../src/config/env.js";

await mongoose.connect(MONGO_URI);
const col = mongoose.connection.db.collection("payments");

const paid = await col.find({ status: "PAID" }).sort({ createdAt: 1 }).toArray();
const seen = new Set();
const toDelete = [];
for (const p of paid) {
  const key = String(p.orderId);
  if (seen.has(key)) toDelete.push(p._id);
  else seen.add(key);
}

const res = toDelete.length ? await col.deleteMany({ _id: { $in: toDelete } }) : { deletedCount: 0 };
console.log("Deleted duplicate PAID payments:", res.deletedCount);
await mongoose.disconnect();
