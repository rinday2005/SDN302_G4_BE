import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import User from "../../src/modules/user/user.model.js";
import KycRecord, { KYC_STATUS } from "../../src/modules/kyc/kyc.model.js";
import RentalOrder, { RENTAL_ORDER_STATUS } from "../../src/modules/rent/order/order.model.js";
import {
  generateTestToken,
  connectTestDb,
  disconnectTestDb,
  createTestServer,
  isMongoAvailable,
} from "../helpers/testUtils.js";

describe("[TEST-S5-02] Integration Tests: Luồng Phân xử Tranh chấp Đơn nhiều sản phẩm & Duyệt KYC", async () => {
  const mongoOk = await isMongoAvailable();
  if (!mongoOk) {
    it.skip("Bỏ qua Integration Tests vì MongoDB không khả dụng", () => {});
    return;
  }

  let serverHelper;
  let renterUser, shopOwnerUser, adminUser;
  let renterToken, adminToken;
  let createdKycRecordId;
  let multiItemDisputedOrderId;

  // Tiền cọc cấu hình cho đơn thuê nhiều sản phẩm
  // Item 1: quantity 2, cọc 250.000 = 500.000
  // Item 2: quantity 3, cọc 300.000 = 900.000
  // => Tổng cọc ban đầu: 1.400.000 VND
  const initialTotalDeposit = 1400000;

  before(async () => {
    await connectTestDb();
    serverHelper = await createTestServer();

    const passwordHash = await bcrypt.hash("Password123!", 10);

    // 1. Tạo Khách thuê (Renter)
    renterUser = await User.findOneAndUpdate(
      { email: "s502_test_renter@reuse.vn" },
      {
        email: "s502_test_renter@reuse.vn",
        passwordHash,
        fullName: "Khách Thuê S502 Test",
        phoneNumber: "0901112233",
        role: "USER",
        kycStatus: null,
        walletBalance: 0,
      },
      { upsert: true, returnDocument: "after" }
    );

    // 2. Tìm hoặc tạo Shop Owner duy nhất
    shopOwnerUser = await User.findOne({ role: "SHOP_OWNER" });
    if (!shopOwnerUser) {
      shopOwnerUser = await User.create({
        email: "s502_test_shopowner@reuse.vn",
        passwordHash,
        fullName: "Shop Owner S502 Test",
        phoneNumber: "0909998877",
        role: "SHOP_OWNER",
        walletBalance: 0,
      });
    }

    // 3. Tạo Admin
    adminUser = await User.findOneAndUpdate(
      { email: "s502_test_admin@reuse.vn" },
      {
        email: "s502_test_admin@reuse.vn",
        passwordHash,
        fullName: "Admin S502 Test",
        phoneNumber: "0905556677",
        role: "ADMIN",
      },
      { upsert: true, returnDocument: "after" }
    );

    renterToken = generateTestToken(renterUser);
    adminToken = generateTestToken(adminUser);

    // 4. Tạo đơn thuê nhiều sản phẩm ở trạng thái DISPUTED
    const now = new Date();
    const orderDoc = await RentalOrder.create({
      orderCode: `RH-S502-${Date.now().toString().slice(-6)}`,
      renterId: renterUser._id,
      shopOwnerId: shopOwnerUser._id,
      items: [
        {
          productId: new mongoose.Types.ObjectId(),
          productName: "Máy ảnh Mirrorless Sony A7",
          rentalDays: 3,
          pricePerDay: 200000,
          depositAmount: 250000,
          quantity: 2,
        },
        {
          productId: new mongoose.Types.ObjectId(),
          productName: "Ống kính Sony GM 24-70mm",
          rentalDays: 3,
          pricePerDay: 150000,
          depositAmount: 300000,
          quantity: 3,
        },
      ],
      rentalDays: 3,
      rentalFee: 1300000,
      depositAmount: initialTotalDeposit, // 1.400.000
      shippingFee: 35000,
      totalAmount: 1300000 + initialTotalDeposit + 35000,
      startDate: now,
      endDate: new Date(now.getTime() + 3 * 86400000),
      shippingAddress: {
        recipientName: "Khách Thuê S502 Test",
        recipientPhone: "0901112233",
        province: "Thành phố Hồ Chí Minh",
        district: "Quận 1",
        ward: "Phường Bến Nghé",
        detail: "Số 10 Lê Duẩn",
      },
      status: RENTAL_ORDER_STATUS.DISPUTED,
      dispute: {
        status: "OPEN",
        reason: "Sản phẩm bị nứt thân ống kính khi hoàn trả",
        reportedAt: now,
      },
    });

    multiItemDisputedOrderId = orderDoc._id.toString();
  });

  after(async () => {
    if (serverHelper) {
      await serverHelper.close();
    }
    await disconnectTestDb();
  });

  // ==========================================================================
  // 1. LUỒNG KYC END-TO-END
  // ==========================================================================
  describe("1. Kiểm thử luồng KYC: Submit -> Reject thiếu lý do -> Reject có lý do -> Resubmit -> Approve", () => {
    it("1.1. User gửi yêu cầu KYC -> Tạo hồ sơ PENDING và cập nhật user.kycStatus là PENDING", async () => {
      const payload = {
        idCardNumber: "079205009988",
        frontImageUrl: "https://res.cloudinary.com/demo/image/upload/kyc_front.jpg",
        backImageUrl: "https://res.cloudinary.com/demo/image/upload/kyc_back.jpg",
        fullName: "Khách Thuê S502 Test",
        dob: "2000-01-01",
      };

      const res = await serverHelper.request("/api/kyc/submit", {
        method: "POST",
        token: renterToken,
        body: payload,
      });

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.data.success, true);
      assert.strictEqual(res.data.data.status, "PENDING");
      createdKycRecordId = res.data.data._id;

      // Kiểm tra trong DB: User model được đồng bộ sang PENDING
      const updatedUser = await User.findById(renterUser._id);
      assert.strictEqual(updatedUser.kycStatus, "PENDING");
      assert.strictEqual(updatedUser.kyc.citizenId, "079205009988");
    });

    it("1.2. Admin Từ chối (REJECTED) nhưng không kèm lý do -> Bị chặn 400 REJECTION_REASON_REQUIRED", async () => {
      const res = await serverHelper.request(`/api/admin/kyc/${createdKycRecordId}`, {
        method: "PATCH",
        token: adminToken,
        body: {
          status: "REJECTED",
          rejectionReason: "", // Rỗng
        },
      });

      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.data.errorCode, "REJECTION_REASON_REQUIRED");
    });

    it("1.3. Admin Từ chối (REJECTED) kèm lý do rõ ràng -> Cập nhật REJECTED và lưu rejectionReason", async () => {
      const reason = "Ảnh chụp mặt trước mờ không thấy số CCCD";
      const res = await serverHelper.request(`/api/admin/kyc/${createdKycRecordId}`, {
        method: "PATCH",
        token: adminToken,
        body: {
          status: "REJECTED",
          rejectionReason: reason,
        },
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);
      assert.strictEqual(res.data.data.status, "REJECTED");
      assert.strictEqual(res.data.data.rejectionReason, reason);

      // Đồng bộ trong User model
      const updatedUser = await User.findById(renterUser._id);
      assert.strictEqual(updatedUser.kycStatus, "REJECTED");
      assert.strictEqual(updatedUser.kyc.rejectionReason, reason);
    });

    it("1.4. User Nộp lại (Resubmit) hồ sơ KYC sau khi bị từ chối -> Status chuyển lại PENDING", async () => {
      const payload = {
        idCardNumber: "079205009988",
        frontImageUrl: "https://res.cloudinary.com/demo/image/upload/kyc_front_sharp.jpg",
        backImageUrl: "https://res.cloudinary.com/demo/image/upload/kyc_back_sharp.jpg",
      };

      const res = await serverHelper.request("/api/kyc/submit", {
        method: "POST",
        token: renterToken,
        body: payload,
      });

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.data.data.status, "PENDING");
      assert.strictEqual(res.data.data.rejectionReason, null);
      createdKycRecordId = res.data.data._id;

      // Đồng bộ User model sang PENDING và xóa rejectionReason
      const updatedUser = await User.findById(renterUser._id);
      assert.strictEqual(updatedUser.kycStatus, "PENDING");
      assert.strictEqual(updatedUser.kyc.rejectionReason, null);
    });

    it("1.5. Admin Duyệt (APPROVED) -> Cập nhật hồ sơ APPROVED và user.kycStatus là APPROVED", async () => {
      const res = await serverHelper.request(`/api/admin/kyc/${createdKycRecordId}`, {
        method: "PATCH",
        token: adminToken,
        body: {
          status: "APPROVED",
        },
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.data.status, "APPROVED");

      const updatedUser = await User.findById(renterUser._id);
      assert.strictEqual(updatedUser.kycStatus, "APPROVED");
      assert.ok(updatedUser.kyc.verifiedAt);
    });
  });

  // ==========================================================================
  // 2. LUỒNG PHÂN XỬ TRANH CHẤP ĐƠN THUÊ NHIỀU SẢN PHẨM & BẢO VỆ TIỀN CỌC
  // ==========================================================================
  describe("2. Kiểm thử Phân xử tranh chấp đơn nhiều sản phẩm: Bảo vệ tổng tiền cọc và trạng thái đơn", () => {
    it("2.1. Admin phán quyết vượt quá tiền cọc đơn (refund + payout > deposit) -> 400 DISPUTE_AMOUNT_EXCEEDS_DEPOSIT và KHÔNG làm sai tổng tiền cọc hay trạng thái order", async () => {
      // Đơn có cọc là 1.400.000. Cố tình gửi hoàn 1.000.000 + bồi thường 600.000 = 1.600.000 > 1.400.000
      const res = await serverHelper.request(
        `/api/admin/disputes/${multiItemDisputedOrderId}/resolve`,
        {
          method: "POST",
          token: adminToken,
          body: {
            resolution: "SPLIT",
            refundToRenter: 1000000,
            payoutToShop: 600000,
            adminNotes: "Admin phân xử thử vượt tiền cọc",
          },
        }
      );

      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.data.errorCode, "DISPUTE_AMOUNT_EXCEEDS_DEPOSIT");

      // AC KIỂM TRA ĐẢM BẢO: Quyết định lỗi KHÔNG được làm thay đổi tiền cọc hoặc trạng thái order
      const orderInDb = await RentalOrder.findById(multiItemDisputedOrderId);
      assert.strictEqual(orderInDb.status, RENTAL_ORDER_STATUS.DISPUTED);
      assert.strictEqual(orderInDb.depositAmount, initialTotalDeposit);
      assert.strictEqual(orderInDb.dispute.status, "OPEN");
    });

    it("2.2. Admin phân xử hợp lệ (refund + payout <= deposit) -> Order COMPLETED, Dispute RESOLVED, Tiền cọc không âm và cộng ví chính xác", async () => {
      const initialRenterWallet = (await User.findById(renterUser._id)).walletBalance || 0;
      const initialShopWallet = (await User.findById(shopOwnerUser._id)).walletBalance || 0;

      // Phán quyết hợp lệ: Khách nhận lại 800.000 cọc, Shop được đền bù 600.000 cọc (tổng = 1.400.000 = đúng 100% deposit)
      const res = await serverHelper.request(
        `/api/admin/disputes/${multiItemDisputedOrderId}/resolve`,
        {
          method: "POST",
          token: adminToken,
          body: {
            resolution: "SPLIT",
            refundToRenter: 800000,
            payoutToShop: 600000,
            adminNotes: "Khách bồi thường 600.000 do làm nứt thân ống kính, hoàn 800.000 còn lại",
          },
        }
      );

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);

      // AC: Kiểm tra trạng thái đơn hàng và phân xử
      const resolvedOrder = await RentalOrder.findById(multiItemDisputedOrderId);
      assert.strictEqual(resolvedOrder.status, RENTAL_ORDER_STATUS.COMPLETED);
      assert.strictEqual(resolvedOrder.dispute.status, "RESOLVED");
      assert.strictEqual(resolvedOrder.dispute.refundToRenter, 800000);
      assert.strictEqual(resolvedOrder.dispute.payoutToShop, 600000);

      // AC: Tiền cọc không âm và không vượt giá trị ban đầu
      assert.ok(resolvedOrder.dispute.refundToRenter >= 0);
      assert.ok(resolvedOrder.dispute.payoutToShop >= 0);
      assert.strictEqual(
        resolvedOrder.dispute.refundToRenter + resolvedOrder.dispute.payoutToShop,
        initialTotalDeposit
      );

      // AC: Tiền ví của Renter và Shop Owner được cộng đúng
      const updatedRenter = await User.findById(renterUser._id);
      const updatedShop = await User.findById(shopOwnerUser._id);
      assert.strictEqual(updatedRenter.walletBalance, initialRenterWallet + 800000);
      assert.strictEqual(updatedShop.walletBalance, initialShopWallet + 600000);
    });
  });
});
