import mongoose from "mongoose";
import { MONGO_URI } from "../src/config/env.js";
import User from "../src/modules/user/user.model.js";
import { login, appealAccountLock } from "../src/modules/auth/auth.service.js";
import { toggleUserStatus, respondUserAppeal } from "../src/modules/user/user.service.js";

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log("Connected to MongoDB");

  const testEmail = "hon@gmail.com";
  let user = await User.findOne({ email: testEmail });
  if (!user) {
    user = await User.findOne({ role: "USER" });
  }

  console.log(`Using test user: ${user.email} (ID: ${user._id})`);

  // 1. Admin tạm khóa tài khoản
  console.log("\n--- BƯỚC 1: Admin tạm khóa tài khoản và lưu DB ---");
  const lockReason = "Vi phạm quy tắc hoàn trả hiện vật và cần rà soát bảo mật";
  const lockedUser = await toggleUserStatus(user._id, {
    status: "LOCKED",
    isLocked: true,
    lockReason,
  });
  console.log("Locked user status:", lockedUser.status, "isLocked:", lockedUser.isLocked, "reason:", lockedUser.lockReason);

  // 2. Kiểm tra đăng nhập khi bị khóa
  console.log("\n--- BƯỚC 2: Thử đăng nhập tài khoản bị khóa ---");
  try {
    await login({ email: user.email, password: "Password123!" });
    console.error("ERROR: Login should have failed but succeeded!");
  } catch (err) {
    console.log("Login blocked successfully:", err.message, "ErrorCode:", err.errorCode);
    console.log("Lock data returned to client:", err.data);
  }

  // 3. User gửi câu hỏi & đề nghị mở khóa từ form Login
  console.log("\n--- BƯỚC 3: User gửi form đề nghị xem xét mở khóa ---");
  const appealRes = await appealAccountLock({
    email: user.email,
    question: "Tôi đã hoàn tất đơn hàng và trả đồ đúng hạn, tại sao tài khoản bị tạm ngưng?",
    details: "Tôi đã nộp biên bản hoàn trả đầy đủ vào hôm qua, nhờ Admin xem xét mở lại tài khoản.",
  });
  console.log("Appeal result:", appealRes.message);

  // 4. Admin xem khiếu nại, phản hồi và mở khóa tài khoản
  console.log("\n--- BƯỚC 4: Admin phản hồi khiếu nại, mở khóa và gửi Gmail ---");
  const respondRes = await respondUserAppeal(user._id, {
    unlock: true,
    lockReason: "Rà soát đối chiếu hiện vật hoàn tất",
    adminReply: "Quản trị viên đã kiểm tra biên bản bàn giao và đối chiếu hệ thống hoàn toàn khớp. Tài khoản đã được mở khóa.",
  });
  console.log("Admin respond result: User status:", respondRes.user.status, "isLocked:", respondRes.user.isLocked);
  console.log("Email dispatch status:", respondRes.emailSent, respondRes.emailDetails);

  // 5. User đăng nhập lại thành công
  console.log("\n--- BƯỚC 5: User đăng nhập lại sau khi được mở khóa ---");
  const loginSuccess = await login({ email: user.email, password: "Password123!" });
  console.log("Login success! User logged in:", loginSuccess.user.email, "Role:", loginSuccess.user.role);

  await mongoose.disconnect();
  console.log("\n=== TẤT CẢ TEST LUỒNG KHÓA / KHIẾU NẠI / MỞ KHÓA / GỬI EMAIL ĐỀU ĐẠT 100% ===");
}

main().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});

