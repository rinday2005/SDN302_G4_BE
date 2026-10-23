import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import User from "../../src/modules/user/user.model.js";
import KycRecord from "../../src/modules/kyc/kyc.model.js";
import {
  generateTestToken,
  connectTestDb,
  disconnectTestDb,
  createTestServer,
  isMongoAvailable,
} from "../helpers/testUtils.js";

describe("[KYC] Integration Tests: Schema & API Gửi Hồ sơ Xác thực Danh tính (KYC)", async () => {
  const mongoOk = await isMongoAvailable();
  if (!mongoOk) {
    it.skip("Bỏ qua Integration Tests vì MongoDB không khả dụng", () => {});
    return;
  }

  let serverHelper;
  let regularUser, shopOwnerUser, adminUser;
  let userToken, shopOwnerToken, adminToken;
  let submittedKycId;

  before(async () => {
    await connectTestDb();
    serverHelper = await createTestServer();

    const passwordHash = await bcrypt.hash("Password123!", 10);

    // 1. Tạo Regular User
    regularUser = await User.findOneAndUpdate(
      { email: "kyc_user_test@reuse.vn" },
      {
        email: "kyc_user_test@reuse.vn",
        passwordHash,
        fullName: "Nguyễn Văn KYC",
        phoneNumber: "0912345678",
        role: "USER",
        kycStatus: null,
      },
      { upsert: true, returnDocument: "after" }
    );

    // 2. Lấy hoặc tạo Shop Owner duy nhất của hệ thống
    shopOwnerUser = await User.findOne({ role: "SHOP_OWNER" });
    if (!shopOwnerUser) {
      shopOwnerUser = await User.create({
        email: "kyc_shopowner_test@reuse.vn",
        passwordHash,
        fullName: "Shop Chủ Test",
        phoneNumber: "0987654321",
        role: "SHOP_OWNER",
        kycStatus: "APPROVED",
      });
    }

    // 3. Tạo Admin User
    adminUser = await User.findOneAndUpdate(
      { email: "kyc_admin_test@reuse.vn" },
      {
        email: "kyc_admin_test@reuse.vn",
        passwordHash,
        fullName: "Admin KYC Reviewer",
        phoneNumber: "0999888777",
        role: "ADMIN",
        kycStatus: "APPROVED",
      },
      { upsert: true, returnDocument: "after" }
    );

    // Tạo JWT Token cho từng role
    userToken = generateTestToken(regularUser);
    shopOwnerToken = generateTestToken(shopOwnerUser);
    adminToken = generateTestToken(adminUser);

    // Xóa các KYC records cũ của test user nếu có
    await KycRecord.deleteMany({ userId: regularUser._id });
  });

  after(async () => {
    if (serverHelper?.close) {
      await serverHelper.close();
    }
    if (regularUser) {
      await KycRecord.deleteMany({ userId: regularUser._id });
      await User.deleteOne({ _id: regularUser._id });
      await User.deleteOne({ email: "kyc_admin_test@reuse.vn" });
    }
    await disconnectTestDb();
  });

  describe("1. Gửi hồ sơ KYC (POST /api/kyc/submit)", () => {
    it("Chưa đăng nhập gọi POST /api/kyc/submit -> 401 UNAUTHORIZED", async () => {
      const res = await serverHelper.request("/api/kyc/submit", {
        method: "POST",
        body: {
          idCardNumber: "079201009999",
          frontImageUrl: "https://cloud.com/front.jpg",
          backImageUrl: "https://cloud.com/back.jpg",
        },
      });

      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.data.errorCode, "UNAUTHORIZED");
    });

    it("User gửi thiếu thông tin bắt buộc -> 400 Bad Request", async () => {
      const res = await serverHelper.request("/api/kyc/submit", {
        method: "POST",
        token: userToken,
        body: {
          idCardNumber: "079201009999",
          // Thiếu frontImageUrl và backImageUrl
        },
      });

      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.data.errorCode, "FRONT_IMAGE_URL_REQUIRED");
    });

    it("AC: User gửi hồ sơ thành công & KHÔNG THỂ tự đặt trạng thái APPROVED", async () => {
      // User cố tình gửi status: "APPROVED" trong request body
      const res = await serverHelper.request("/api/kyc/submit", {
        method: "POST",
        token: userToken,
        body: {
          idCardNumber: "079201008888",
          frontImageUrl: "https://cloud.com/cccd-front.jpg",
          backImageUrl: "https://cloud.com/cccd-back.jpg",
          status: "APPROVED", // Cố tình bypass
        },
      });

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.data.success, true);
      assert.ok(res.data.data._id);

      submittedKycId = res.data.data._id;

      // AC: User không thể tự đặt KYC thành APPROVED -> status phải là PENDING
      assert.strictEqual(res.data.data.status, "PENDING");
      assert.strictEqual(res.data.data.rejectionReason, null);
      assert.strictEqual(res.data.data.idCardNumber, "079201008888");

      // AC: Trạng thái User và KYC record đồng bộ
      const updatedUser = await User.findById(regularUser._id);
      assert.strictEqual(updatedUser.kycStatus, "PENDING");
      assert.strictEqual(updatedUser.role, "USER"); // Role không đổi
    });

    it("User có thể tra cứu thông tin KYC của mình qua GET /api/kyc/me", async () => {
      const res = await serverHelper.request("/api/kyc/me", {
        method: "GET",
        token: userToken,
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);
      assert.strictEqual(res.data.data.kycRecord._id, submittedKycId);
      assert.strictEqual(res.data.data.kycRecord.status, "PENDING");
      assert.strictEqual(res.data.data.user.kycStatus, "PENDING");
    });
  });

  describe("2. Phân quyền Admin Xử lý KYC (PATCH /api/admin/kyc/:id)", () => {
    it("AC: User thường gọi PATCH /api/admin/kyc/:id -> 403 FORBIDDEN", async () => {
      const res = await serverHelper.request(`/api/admin/kyc/${submittedKycId}`, {
        method: "PATCH",
        token: userToken,
        body: { status: "APPROVED" },
      });

      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.data.errorCode, "FORBIDDEN");
    });

    it("AC: Shop Owner gọi PATCH /api/admin/kyc/:id -> 403 FORBIDDEN", async () => {
      const res = await serverHelper.request(`/api/admin/kyc/${submittedKycId}`, {
        method: "PATCH",
        token: shopOwnerToken,
        body: { status: "APPROVED" },
      });

      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.data.errorCode, "FORBIDDEN");
    });
  });

  describe("3. Admin Từ chối KYC (Reject) - Yêu cầu Lý do & Đồng bộ Trạng thái", () => {
    it("AC: Admin từ chối KYC nhưng KHÔNG có lý do -> 400 REJECTION_REASON_REQUIRED", async () => {
      const res = await serverHelper.request(`/api/admin/kyc/${submittedKycId}`, {
        method: "PATCH",
        token: adminToken,
        body: {
          status: "REJECTED",
          // Không truyền rejectionReason
        },
      });

      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.data.errorCode, "REJECTION_REASON_REQUIRED");
    });

    it("AC: Admin từ chối KYC với lý do rỗng -> 400 REJECTION_REASON_REQUIRED", async () => {
      const res = await serverHelper.request(`/api/admin/kyc/${submittedKycId}`, {
        method: "PATCH",
        token: adminToken,
        body: {
          status: "REJECTED",
          rejectionReason: "   ",
        },
      });

      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.data.errorCode, "REJECTION_REASON_REQUIRED");
    });

    it("AC: Admin từ chối KYC hợp lệ -> Đồng bộ trạng thái REJECTED cho cả KYC record & User", async () => {
      const rejectReason = "Ảnh mặt trước CCCD bị lóa đèn flash, không thấy rõ số định danh";
      const res = await serverHelper.request(`/api/admin/kyc/${submittedKycId}`, {
        method: "PATCH",
        token: adminToken,
        body: {
          status: "REJECTED",
          rejectionReason: rejectReason,
        },
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);
      assert.strictEqual(res.data.data.status, "REJECTED");
      assert.strictEqual(res.data.data.rejectionReason, rejectReason);

      // AC: Trạng thái User và KYC record đồng bộ
      const updatedUser = await User.findById(regularUser._id);
      assert.strictEqual(updatedUser.kycStatus, "REJECTED");
      assert.strictEqual(updatedUser.kyc.rejectionReason, rejectReason);
      assert.strictEqual(updatedUser.role, "USER"); // Role không đổi
    });
  });

  describe("4. Admin Phê duyệt KYC (Approve) - Không đổi Role & Đồng bộ Trạng thái", () => {
    let secondKycId;

    it("User gửi lại hồ sơ KYC mới sau khi bị từ chối -> Trở về PENDING", async () => {
      const res = await serverHelper.request("/api/kyc/submit", {
        method: "POST",
        token: userToken,
        body: {
          idCardNumber: "079201008888",
          frontImageUrl: "https://cloud.com/cccd-front-hd.jpg",
          backImageUrl: "https://cloud.com/cccd-back-hd.jpg",
        },
      });

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.data.data.status, "PENDING");
      secondKycId = res.data.data._id;

      // User state đồng bộ
      const userDoc = await User.findById(regularUser._id);
      assert.strictEqual(userDoc.kycStatus, "PENDING");
    });

    it("AC: Admin phê duyệt KYC -> kycStatus = APPROVED, KHÔNG THAY ĐỔI ROLE của User", async () => {
      // Trước khi duyệt, kiểm tra role hiện tại của user là "USER"
      const beforeUser = await User.findById(regularUser._id);
      assert.strictEqual(beforeUser.role, "USER");

      const res = await serverHelper.request(`/api/admin/kyc/${secondKycId}`, {
        method: "PATCH",
        token: adminToken,
        body: {
          status: "APPROVED",
        },
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);
      assert.strictEqual(res.data.data.status, "APPROVED");
      assert.strictEqual(res.data.data.rejectionReason, null);

      // AC: Duyệt KYC chỉ cập nhật user.kycStatus = APPROVED, không thay đổi role
      const afterUser = await User.findById(regularUser._id);
      assert.strictEqual(afterUser.kycStatus, "APPROVED");
      assert.strictEqual(afterUser.role, "USER"); // AC: ROLE TUYỆT ĐỐI KHÔNG THAY ĐỔI!

      // AC: Trạng thái User và KYC record đồng bộ
      assert.strictEqual(afterUser.kycStatus, res.data.data.status);
    });

    it("Admin có thể xem danh sách tất cả hồ sơ KYC qua GET /api/admin/kyc", async () => {
      const res = await serverHelper.request("/api/admin/kyc", {
        method: "GET",
        token: adminToken,
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);
      assert.ok(Array.isArray(res.data.data.records));
      assert.ok(res.data.data.records.length >= 2);
      assert.ok(res.data.data.pagination);
    });

    it("Admin có thể xem chi tiết hồ sơ KYC qua GET /api/admin/kyc/:id", async () => {
      const res = await serverHelper.request(`/api/admin/kyc/${secondKycId}`, {
        method: "GET",
        token: adminToken,
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);
      assert.strictEqual(res.data.data._id, secondKycId);
      assert.strictEqual(res.data.data.status, "APPROVED");
      assert.ok(res.data.data.userId);
      assert.strictEqual(res.data.data.userId.email, "kyc_user_test@reuse.vn");
    });
  });
});
