import { describe, it } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import {
  submitKycApplication,
  reviewKycApplication,
} from "../../src/modules/kyc/kyc.service.js";
import { validateAdminReviewKyc } from "../../src/modules/kyc/kyc.validation.js";
import KycRecord, { KYC_STATUS } from "../../src/modules/kyc/kyc.model.js";
import User from "../../src/modules/user/user.model.js";
import { resolveDisputeService } from "../../src/modules/admin/admin.service.js";
import RentalOrder, { RENTAL_ORDER_STATUS } from "../../src/modules/rent/order/order.model.js";

describe("[TEST-S5-02] Unit Tests: Kiểm thử Luồng Phân xử Tranh chấp & Duyệt KYC", () => {
  const dummyUserId = new mongoose.Types.ObjectId();
  const dummyShopOwnerId = new mongoose.Types.ObjectId();
  const dummyAdminId = new mongoose.Types.ObjectId();
  const dummyOrderId = new mongoose.Types.ObjectId();
  const dummyKycId = new mongoose.Types.ObjectId();

  const mockAdminUser = {
    _id: dummyAdminId,
    role: "ADMIN",
    fullName: "Quản Trị Viên",
  };

  // ==========================================================================
  // PHẦN 1: KIỂM THỬ LUỒNG DUYỆT KYC (APPROVE / REJECT / RESUBMIT)
  // ==========================================================================
  describe("1. Luồng KYC: Nộp đơn, Duyệt (Approve), Từ chối (Reject), và Nộp lại (Resubmit)", () => {
    it("1.1. User nộp KYC -> Status bắt buộc là PENDING, không cho phép tự đặt APPROVED", async () => {
      const originalUserFindById = User.findById;
      const originalKycCreate = KycRecord.create;

      let savedUser = null;
      let createdKyc = null;

      const mockUser = {
        _id: dummyUserId,
        fullName: "Nguyễn Văn Thuê",
        kycStatus: null,
        kyc: {},
        save: async function () {
          savedUser = this;
          return this;
        },
      };

      User.findById = async () => mockUser;
      KycRecord.create = async (doc) => {
        createdKyc = { ...doc, _id: dummyKycId };
        return createdKyc;
      };

      try {
        const result = await submitKycApplication(dummyUserId, {
          idCardNumber: "079200001234",
          frontImageUrl: "https://res.cloudinary.com/demo/front.jpg",
          backImageUrl: "https://res.cloudinary.com/demo/back.jpg",
          status: "APPROVED", // Cố tình truyền APPROVED
        });

        // AC: Trạng thái luôn là PENDING
        assert.strictEqual(result.status, KYC_STATUS.PENDING);
        assert.strictEqual(savedUser.kycStatus, KYC_STATUS.PENDING);
        assert.strictEqual(savedUser.kyc.citizenId, "079200001234");
        assert.strictEqual(savedUser.kyc.rejectionReason, null);
      } finally {
        User.findById = originalUserFindById;
        KycRecord.create = originalKycCreate;
      }
    });

    it("1.2. Admin Từ chối (REJECTED) bắt buộc phải có rejectionReason", () => {
      const req = {
        body: { status: "REJECTED", rejectionReason: "" },
      };
      let capturedError = null;

      validateAdminReviewKyc(req, {}, (err) => {
        capturedError = err;
      });

      assert.ok(capturedError);
      assert.strictEqual(capturedError.statusCode, 400);
      assert.strictEqual(capturedError.errorCode, "REJECTION_REASON_REQUIRED");
    });

    it("1.3. Admin Từ chối (REJECTED) hợp lệ -> Cập nhật trạng thái REJECTED và lưu lý do từ chối", async () => {
      const originalKycFindById = KycRecord.findById;
      const originalUserFindById = User.findById;

      let savedKyc = null;
      let savedUser = null;

      const mockKycRecord = {
        _id: dummyKycId,
        userId: dummyUserId,
        status: KYC_STATUS.PENDING,
        save: async function () {
          savedKyc = this;
          return this;
        },
      };

      const mockUser = {
        _id: dummyUserId,
        kycStatus: KYC_STATUS.PENDING,
        kyc: {},
        save: async function () {
          savedUser = this;
          return this;
        },
      };

      KycRecord.findById = async () => mockKycRecord;
      User.findById = async () => mockUser;

      try {
        const reason = "Ảnh chụp CCCD bị mờ, lóa sáng góc trái";
        const result = await reviewKycApplication(dummyKycId, {
          status: "REJECTED",
          rejectionReason: reason,
        });

        assert.strictEqual(result.status, KYC_STATUS.REJECTED);
        assert.strictEqual(result.rejectionReason, reason);
        assert.strictEqual(savedUser.kycStatus, KYC_STATUS.REJECTED);
        assert.strictEqual(savedUser.kyc.rejectionReason, reason);
      } finally {
        KycRecord.findById = originalKycFindById;
        User.findById = originalUserFindById;
      }
    });

    it("1.4. User Nộp lại (Resubmit) sau khi bị từ chối -> Chuyển về PENDING và xóa lý do từ chối cũ", async () => {
      const originalUserFindById = User.findById;
      const originalKycCreate = KycRecord.create;

      let savedUser = null;

      const mockUser = {
        _id: dummyUserId,
        fullName: "Nguyễn Văn Thuê",
        kycStatus: KYC_STATUS.REJECTED,
        kyc: {
          citizenId: "079200001234",
          rejectionReason: "Ảnh chụp CCCD bị mờ, lóa sáng góc trái",
        },
        save: async function () {
          savedUser = this;
          return this;
        },
      };

      User.findById = async () => mockUser;
      KycRecord.create = async (doc) => ({ ...doc, _id: new mongoose.Types.ObjectId() });

      try {
        const newDoc = await submitKycApplication(dummyUserId, {
          idCardNumber: "079200001234",
          frontImageUrl: "https://res.cloudinary.com/demo/front_clear.jpg",
          backImageUrl: "https://res.cloudinary.com/demo/back_clear.jpg",
        });

        // AC: Trạng thái resubmit chuyển lại PENDING và xóa rejectionReason
        assert.strictEqual(newDoc.status, KYC_STATUS.PENDING);
        assert.strictEqual(newDoc.rejectionReason, null);
        assert.strictEqual(savedUser.kycStatus, KYC_STATUS.PENDING);
        assert.strictEqual(savedUser.kyc.rejectionReason, null);
      } finally {
        User.findById = originalUserFindById;
        KycRecord.create = originalKycCreate;
      }
    });

    it("1.5. Admin Phê duyệt (APPROVED) -> Cập nhật trạng thái APPROVED cho cả KYC record và User", async () => {
      const originalKycFindById = KycRecord.findById;
      const originalUserFindById = User.findById;

      const mockKycRecord = {
        _id: dummyKycId,
        userId: dummyUserId,
        status: KYC_STATUS.PENDING,
        save: async function () {
          return this;
        },
      };

      const mockUser = {
        _id: dummyUserId,
        kycStatus: KYC_STATUS.PENDING,
        kyc: {},
        save: async function () {
          return this;
        },
      };

      KycRecord.findById = async () => mockKycRecord;
      User.findById = async () => mockUser;

      try {
        const result = await reviewKycApplication(dummyKycId, { status: "APPROVED" });

        assert.strictEqual(result.status, KYC_STATUS.APPROVED);
        assert.strictEqual(mockUser.kycStatus, KYC_STATUS.APPROVED);
        assert.ok(mockUser.kyc.verifiedAt);
      } finally {
        KycRecord.findById = originalKycFindById;
        User.findById = originalUserFindById;
      }
    });
  });

  // ==========================================================================
  // PHẦN 2: KIỂM THỬ LUỒNG TRANH CHẤP ĐƠN THUÊ NHIỀU SẢN PHẨM & TÍNH TOÀN VẸN CỌC
  // ==========================================================================
  describe("2. Luồng Tranh chấp Đơn thuê nhiều sản phẩm & Bảo vệ số tiền cọc (Deposit Integrity)", () => {
    // Đơn thuê có 3 sản phẩm với số lượng và tiền cọc khác nhau
    const multiItems = [
      { productId: new mongoose.Types.ObjectId(), quantity: 2, depositAmount: 300000 }, // cọc: 600.000
      { productId: new mongoose.Types.ObjectId(), quantity: 1, depositAmount: 500000 }, // cọc: 500.000
      { productId: new mongoose.Types.ObjectId(), quantity: 3, depositAmount: 200000 }, // cọc: 600.000
    ];

    // Tổng tiền cọc ban đầu của đơn nhiều sản phẩm = 600.000 + 500.000 + 600.000 = 1.700.000 VND
    const expectedInitialDeposit = multiItems.reduce(
      (sum, item) => sum + item.depositAmount * item.quantity,
      0
    );

    it("2.1. Tính đúng tổng tiền cọc ban đầu của đơn thuê nhiều sản phẩm", () => {
      assert.strictEqual(expectedInitialDeposit, 1700000);
      assert.strictEqual(multiItems.length, 3);
    });

    it("2.2. Admin phân xử hợp lệ: Hoàn cọc Renter + Bồi thường Shop <= Tổng cọc ban đầu", async () => {
      const originalOrderFindById = RentalOrder.findById;
      const originalUserFindById = User.findById;

      const mockOrder = {
        _id: dummyOrderId,
        status: RENTAL_ORDER_STATUS.DISPUTED,
        depositAmount: expectedInitialDeposit, // 1.700.000
        renterId: dummyUserId,
        shopOwnerId: dummyShopOwnerId,
        items: multiItems,
        dispute: { status: "OPEN" },
        save: async function () {
          return this;
        },
      };

      const mockRenter = { _id: dummyUserId, walletBalance: 100000, save: async function () { return this; } };
      const mockShop = { _id: dummyShopOwnerId, walletBalance: 500000, save: async function () { return this; } };

      RentalOrder.findById = async () => mockOrder;
      User.findById = async (id) => (id.toString() === dummyUserId.toString() ? mockRenter : mockShop);

      try {
        // Phán quyết: Hoàn khách 1.000.000, Bồi thường Shop 700.000 (tổng 1.700.000 = 100% deposit)
        const result = await resolveDisputeService(
          dummyOrderId,
          {
            resolution: "Khách làm hỏng 1/3 thiết bị, đền bù một phần cọc cho shop",
            refundToRenter: 1000000,
            payoutToShop: 700000,
          },
          mockAdminUser
        );

        // AC: Trạng thái đơn và dispute chuyển đúng
        assert.strictEqual(mockOrder.status, RENTAL_ORDER_STATUS.COMPLETED);
        assert.strictEqual(mockOrder.dispute.status, "RESOLVED");
        assert.strictEqual(mockOrder.dispute.refundToRenter, 1000000);
        assert.strictEqual(mockOrder.dispute.payoutToShop, 700000);

        // AC: Dữ liệu tiền cọc không âm và không vượt ban đầu
        assert.ok(mockOrder.dispute.refundToRenter >= 0);
        assert.ok(mockOrder.dispute.payoutToShop >= 0);
        assert.strictEqual(
          mockOrder.dispute.refundToRenter + mockOrder.dispute.payoutToShop,
          expectedInitialDeposit
        );

        // AC: Ví tiền renter & shop owner được cập nhật chuẩn xác
        assert.strictEqual(mockRenter.walletBalance, 100000 + 1000000);
        assert.strictEqual(mockShop.walletBalance, 500000 + 700000);
      } finally {
        RentalOrder.findById = originalOrderFindById;
        User.findById = originalUserFindById;
      }
    });

    it("2.3. Admin phân xử theo Tỷ lệ %: Tổng phân bổ = 100% tiền cọc", async () => {
      const originalOrderFindById = RentalOrder.findById;
      const originalUserFindById = User.findById;

      const mockOrder = {
        _id: dummyOrderId,
        status: RENTAL_ORDER_STATUS.DISPUTED,
        depositAmount: expectedInitialDeposit, // 1.700.000
        renterId: dummyUserId,
        shopOwnerId: dummyShopOwnerId,
        items: multiItems,
        dispute: { status: "OPEN" },
        save: async function () { return this; },
      };

      RentalOrder.findById = async () => mockOrder;
      User.findById = async () => ({ walletBalance: 0, save: async function () { return this; } });

      try {
        // Hoàn khách 60% cọc (1.020.000), Đền shop 40% cọc (680.000)
        await resolveDisputeService(
          dummyOrderId,
          {
            refundPercent: 60,
            payoutPercent: 40,
          },
          mockAdminUser
        );

        assert.strictEqual(mockOrder.dispute.refundToRenter, 1020000);
        assert.strictEqual(mockOrder.dispute.payoutToShop, 680000);
        assert.strictEqual(
          mockOrder.dispute.refundToRenter + mockOrder.dispute.payoutToShop,
          expectedInitialDeposit
        );
      } finally {
        RentalOrder.findById = originalOrderFindById;
        User.findById = originalUserFindById;
      }
    });

    it("2.4. AC: Phán quyết vượt quá tiền cọc (refund + payout > deposit) -> Ném lỗi và KHÔNG làm sai tổng tiền cọc hoặc trạng thái order", async () => {
      const originalOrderFindById = RentalOrder.findById;

      const mockOrder = {
        _id: dummyOrderId,
        status: RENTAL_ORDER_STATUS.DISPUTED,
        depositAmount: expectedInitialDeposit, // 1.700.000
        renterId: dummyUserId,
        shopOwnerId: dummyShopOwnerId,
        items: multiItems,
        dispute: { status: "OPEN" },
        save: async function () {
          assert.fail("order.save không được phép gọi khi dữ liệu vượt cọc");
        },
      };

      RentalOrder.findById = async () => mockOrder;

      try {
        // Cố tình hoàn 1.500.000 + đền bù 500.000 = 2.000.000 > 1.700.000
        await assert.rejects(
          async () => {
            await resolveDisputeService(
              dummyOrderId,
              {
                refundToRenter: 1500000,
                payoutToShop: 500000,
              },
              mockAdminUser
            );
          },
          (err) => {
            assert.strictEqual(err.statusCode, 400);
            assert.strictEqual(err.errorCode, "DISPUTE_AMOUNT_EXCEEDS_DEPOSIT");
            return true;
          }
        );

        // AC BẢO VỆ DỮ LIỆU: Trạng thái và số tiền cọc ban đầu được bảo toàn nguyên vẹn
        assert.strictEqual(mockOrder.status, RENTAL_ORDER_STATUS.DISPUTED);
        assert.strictEqual(mockOrder.depositAmount, 1700000);
        assert.strictEqual(mockOrder.dispute.status, "OPEN");
      } finally {
        RentalOrder.findById = originalOrderFindById;
      }
    });

    it("2.5. AC: Không cho phép số tiền hoàn trả hoặc bồi thường bị âm", async () => {
      const originalOrderFindById = RentalOrder.findById;
      const originalUserFindById = User.findById;

      const mockOrder = {
        _id: dummyOrderId,
        status: RENTAL_ORDER_STATUS.DISPUTED,
        depositAmount: 500000,
        renterId: dummyUserId,
        shopOwnerId: dummyShopOwnerId,
        dispute: { status: "OPEN" },
        save: async function () { return this; },
      };

      RentalOrder.findById = async () => mockOrder;
      User.findById = async () => ({ walletBalance: 0, save: async function () { return this; } });

      try {
        // Truyền số âm: refundToRenter: -100000, payoutToShop: -50000
        await resolveDisputeService(
          dummyOrderId,
          {
            refundToRenter: -100000,
            payoutToShop: -50000,
          },
          mockAdminUser
        );

        // Hệ thống tự động chặn hoặc clamp về >= 0
        assert.ok(mockOrder.dispute.refundToRenter >= 0);
        assert.ok(mockOrder.dispute.payoutToShop >= 0);
        assert.strictEqual(mockOrder.dispute.refundToRenter, 0);
        assert.strictEqual(mockOrder.dispute.payoutToShop, 0);
      } finally {
        RentalOrder.findById = originalOrderFindById;
        User.findById = originalUserFindById;
      }
    });
  });
});
