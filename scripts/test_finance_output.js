import mongoose from "mongoose";
import { MONGO_URI } from "../src/config/env.js";
import { getFinancialReportService } from "../src/modules/admin/admin.service.js";

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log("Connected to MongoDB");

  const report = await getFinancialReportService();
  console.log("=== FINANCE REPORT OVERVIEW ===");
  console.log("totalPlatformGmv:", report.overview.totalPlatformGmv);
  console.log("totalPlatformRevenue:", report.overview.totalPlatformRevenue);
  console.log("netMarginPercent:", report.overview.netMarginPercent);
  console.log("lockedEscrowAmount:", report.overview.lockedEscrowAmount);
  console.log("totalDepositsRefunded:", report.overview.totalDepositsRefunded);

  console.log("\n=== RENT SECTOR ===");
  console.log(report.rentSector);

  console.log("\n=== THRIFT SECTOR ===");
  console.log(report.thriftSector);

  console.log("\n=== AI INSIGHTS ===");
  console.log(report.aiInsights);

  console.log("\n=== AUDIT TRANSACTIONS COUNT ===");
  console.log("Total audit transactions:", report.transactions.length);
  if (report.transactions.length > 0) {
    console.log("Sample transaction:", JSON.stringify(report.transactions[0], null, 2));
  }

  await mongoose.disconnect();
}

main().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
