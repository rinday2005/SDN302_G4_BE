import dotenv from "dotenv";
dotenv.config();

import { sendAccountUnlockEmail } from "../src/utils/email.js";

async function main() {
  console.log("Testing sendAccountUnlockEmail...");
  const res = await sendAccountUnlockEmail({
    to: "test.user@gmail.com",
    fullName: "Nguyễn Văn Hơn",
    lockReason: "Tài khoản có dấu hiệu đăng nhập từ vị trí bất thường",
    adminReply: "Quản trị viên đã kiểm tra địa chỉ IP và xác thực chính chủ thành công. Tài khoản đã được mở khóa.",
  });
  console.log("Result:", res);
}

main().catch(console.error);

