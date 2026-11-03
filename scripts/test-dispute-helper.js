import connectDB from "../src/config/db.js";
import RentalOrder from "../src/modules/rent/order/order.model.js";
import User from "../src/modules/user/user.model.js";
import { getDisputesService, getPlatformFeeService, resolveDisputeService } from "../src/modules/admin/admin.service.js";

const run = async () => {
  await connectDB();
  const action = process.argv[2] || "status";

  if (action === "status") {
    console.log("=== KIỂM TRA TRẠNG THÁI HIỆN TẠI TRONG DB ===");
    const res = await getDisputesService();
    const fee = await getPlatformFeeService();
    console.log("Số lượng tranh chấp:", res.disputes.length);
    console.log("Chỉ số KPI:", res.metrics);
    console.log("Cấu hình phí sàn:", {
      rentFeePercent: fee.rentFeePercent + "%",
      thriftFeePercent: fee.thriftFeePercent + "%",
    });
    if (res.disputes.length > 0) {
      console.log("\nDanh sách đơn tranh chấp:");
      res.disputes.forEach((d, idx) => {
        console.log(` ${idx + 1}. Mã đơn: ${d.orderCode} | Ký quỹ: ${d.escrowLocked.toLocaleString("vi-VN")} ₫ | Trạng thái: ${d.disputeStatus} | Lý do: ${d.reason}`);
      });
    } else {
      console.log("-> DB không có tranh chấp (sẽ hiển thị 0 và bảng trống trên Web)");
    }
  } else if (action === "trigger") {
    console.log("=== TẠO TRANH CHẤP MẪU TRÊN DB THẬT ===");
    const order = await RentalOrder.findOne({ status: { $in: ["RETURN_REQUESTED", "RETURNED", "RENTING"] } });
    if (!order) {
      console.log("Không tìm thấy đơn thuê phù hợp để tạo tranh chấp.");
      process.exit(0);
    }
    const admin = await User.findOne({ role: "ADMIN" });
    order.status = "DISPUTED";
    order.dispute = {
      status: "OPEN",
      reason: "Chủ xưởng phát hiện vết xước thấu kính và yêu cầu Giám định viên ReUse Hub can thiệp đối soát",
      damageImages: ["https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=800&q=80"],
      reportedBy: order.shopOwnerId || admin?._id,
      reportedAt: new Date(),
    };
    await order.save();
    console.log(`✅ Đã chuyển đơn hàng [${order.orderCode}] sang trạng thái DISPUTED!`);
    console.log(`Số tiền cọc bị phong tỏa: ${(order.depositAmount || 0).toLocaleString("vi-VN")} ₫`);
    console.log("👉 Bây giờ bạn hãy mở web vào trang /admin/disputes để xem số lượng nhảy từ 0 lên 1!");
  } else if (action === "resolve") {
    console.log("=== THỰC HIỆN PHÂN XỬ TRANH CHẤP MẪU BẰNG ADMIN SERVICE ===");
    const disputedOrder = await RentalOrder.findOne({ status: "DISPUTED" });
    if (!disputedOrder) {
      console.log("Không có đơn hàng nào đang DISPUTED để phân xử.");
      process.exit(0);
    }
    const admin = await User.findOne({ role: "ADMIN" });
    const deposit = disputedOrder.depositAmount || 0;
    const payout = Math.round(deposit * 0.3); // 30% cho Shop
    const refund = deposit - payout; // 70% hoàn khách
    const result = await resolveDisputeService(
      disputedOrder._id,
      {
        resolution: `Hội đồng Trọng tài quyết định: Bồi thường ${payout.toLocaleString("vi-VN")} ₫ cho Shop, hoàn trả ${refund.toLocaleString("vi-VN")} ₫ cho Khách hàng.`,
        refundToRenter: refund,
        payoutToShop: payout,
        adminNotes: "Đã kiểm định vi sai quang học hoàn tất.",
      },
      admin
    );
    console.log(`✅ Đã phân xử thành công đơn hàng [${disputedOrder.orderCode}]!`);
    console.log(`Trạng thái đơn mới: ${result.status}`);
    console.log("Cập nhật ví:", result.walletUpdates);
    console.log("👉 Bây giờ bạn hãy mở web vào trang /admin/disputes để xem vụ việc đã chuyển sang tab 'Đã Hòa Giải'!");
  } else if (action === "reset") {
    console.log("=== RESET TOÀN BỘ TRANH CHẤP TRÊN DB THẬT VỀ 0 ===");
    const updated = await RentalOrder.updateMany(
      { status: "DISPUTED" },
      { $set: { status: "RETURN_REQUESTED" }, $unset: { dispute: "" } }
    );
    console.log(`✅ Đã reset ${updated.modifiedCount} đơn hàng về trạng thái bình thường (0 tranh chấp).`);
  }

  process.exit(0);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

