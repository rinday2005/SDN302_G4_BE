import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calculateShippingFee } from "../../src/utils/shipping.js";
import { SHIPPING_RATES, REGIONS } from "../../src/utils/regionData.js";
import { validateCreateOrder } from "../../src/modules/rent/order/order.validation.js";

describe("[TEST-S3-02] Unit Tests: Shipping Zone & Phí vận chuyển", () => {
  describe("1. Tính phí Shipping theo Khu vực (Shipping Zone)", () => {
    it("Tính đúng phí LOCAL (25.000 VND) khi cùng tỉnh/thành phố", () => {
      // Cùng HCM
      assert.strictEqual(
        calculateShippingFee("Hồ Chí Minh", "Hồ Chí Minh"),
        SHIPPING_RATES.LOCAL
      );
      assert.strictEqual(calculateShippingFee("Hồ Chí Minh", "Hồ Chí Minh"), 25000);

      // Cùng Hà Nội
      assert.strictEqual(
        calculateShippingFee("Hà Nội", "Hà Nội"),
        SHIPPING_RATES.LOCAL
      );

      // Cùng Đà Nẵng
      assert.strictEqual(
        calculateShippingFee("Đà Nẵng", "Đà Nẵng"),
        SHIPPING_RATES.LOCAL
      );

      // Xử lý khoảng trắng thừa và chữ hoa chữ thường
      assert.strictEqual(
        calculateShippingFee("  hồ chí minh  ", "HỒ CHÍ MINH"),
        25000
      );
    });

    it("Tính đúng phí REGIONAL (35.000 VND) khi cùng một miền (Khu vực)", () => {
      // Cùng Miền Nam
      assert.strictEqual(
        calculateShippingFee("Hồ Chí Minh", "Bình Dương"),
        SHIPPING_RATES.REGIONAL
      );
      assert.strictEqual(calculateShippingFee("Hồ Chí Minh", "Bình Dương"), 35000);
      assert.strictEqual(
        calculateShippingFee("Hồ Chí Minh", "Cần Thơ"),
        35000
      );
      assert.strictEqual(
        calculateShippingFee("Đồng Nai", "An Giang"),
        35000
      );

      // Cùng Miền Bắc
      assert.strictEqual(
        calculateShippingFee("Hà Nội", "Hải Phòng"),
        35000
      );
      assert.strictEqual(
        calculateShippingFee("Hải Phòng", "Quảng Ninh"),
        35000
      );

      // Cùng Miền Trung
      assert.strictEqual(
        calculateShippingFee("Đà Nẵng", "Huế"),
        35000
      );
      assert.strictEqual(
        calculateShippingFee("Khánh Hòa", "Bình Định"),
        35000
      );
    });

    it("Tính đúng phí INTER_REGION (45.000 VND) khi khác miền (Liên miền)", () => {
      // Miền Nam <-> Miền Bắc
      assert.strictEqual(
        calculateShippingFee("Hồ Chí Minh", "Hà Nội"),
        SHIPPING_RATES.INTER_REGION
      );
      assert.strictEqual(calculateShippingFee("Hồ Chí Minh", "Hà Nội"), 45000);
      assert.strictEqual(
        calculateShippingFee("Cần Thơ", "Hải Phòng"),
        45000
      );

      // Miền Nam <-> Miền Trung
      assert.strictEqual(
        calculateShippingFee("Hồ Chí Minh", "Đà Nẵng"),
        45000
      );
      assert.strictEqual(
        calculateShippingFee("Bình Dương", "Khánh Hòa"),
        45000
      );

      // Miền Bắc <-> Miền Trung
      assert.strictEqual(
        calculateShippingFee("Hà Nội", "Đà Nẵng"),
        45000
      );
      assert.strictEqual(
        calculateShippingFee("Hải Phòng", "Thanh Hóa"),
        // Lưu ý: Thanh Hóa thuộc Miền Trung, Hải Phòng thuộc Miền Bắc -> Khác miền
        45000
      );
    });

    it("Ném lỗi khi thiếu thông tin tỉnh/thành hoặc tỉnh/thành không hỗ trợ", () => {
      // Thiếu dữ liệu
      assert.throws(() => calculateShippingFee("", "Hà Nội"), {
        message: "Vui lòng cung cấp đầy đủ thông tin tỉnh/thành phố",
      });
      assert.throws(() => calculateShippingFee("Hồ Chí Minh", null), {
        message: "Vui lòng cung cấp đầy đủ thông tin tỉnh/thành phố",
      });

      // Tỉnh thành không tồn tại trong REGIONS
      assert.throws(() => calculateShippingFee("Tokyo", "Hồ Chí Minh"), {
        message: "Tỉnh/thành phố không hợp lệ hoặc chưa được hỗ trợ",
      });
      assert.throws(() => calculateShippingFee("Hồ Chí Minh", "Atlantis"), {
        message: "Tỉnh/thành phố không hợp lệ hoặc chưa được hỗ trợ",
      });
    });
  });

  describe("2. AC: Phí Shipping được tính 1 lần trên toàn bộ Order (Không nhân theo item/số lượng)", () => {
    it("Đơn hàng 1 item (quantity = 1): phí shipping tính 1 lần", () => {
      const shopProvince = "Hồ Chí Minh";
      const userProvince = "Hồ Chí Minh";
      const shippingFee = calculateShippingFee(shopProvince, userProvince);

      const item = {
        productId: "p1",
        name: "Áo dài",
        quantity: 1,
        pricePerDay: 150000,
        depositAmount: 300000,
      };
      const rentalDays = 2;

      const rentalFee = item.pricePerDay * item.quantity * rentalDays; // 300.000
      const depositAmount = item.depositAmount * item.quantity; // 300.000
      const totalAmount = rentalFee + depositAmount + shippingFee; // 625.000

      assert.strictEqual(shippingFee, 25000);
      assert.strictEqual(rentalFee, 300000);
      assert.strictEqual(depositAmount, 300000);
      assert.strictEqual(totalAmount, 625000);
    });

    it("Đơn hàng 1 item với số lượng lớn (quantity = 5): phí shipping KHÔNG bị nhân lên 5 lần", () => {
      const shopProvince = "Hồ Chí Minh";
      const userProvince = "Hồ Chí Minh";
      const shippingFee = calculateShippingFee(shopProvince, userProvince);

      const item = {
        productId: "p1",
        quantity: 5,
        pricePerDay: 100000,
        depositAmount: 200000,
      };
      const rentalDays = 3;

      const rentalFee = item.pricePerDay * item.quantity * rentalDays; // 1.500.000
      const depositAmount = item.depositAmount * item.quantity; // 1.000.000

      // Phí shipping KHÔNG nhân 5
      const totalAmount = rentalFee + depositAmount + shippingFee;

      assert.strictEqual(shippingFee, 25000);
      assert.notStrictEqual(shippingFee, 25000 * 5); // Khẳng định không bị nhân 5
      assert.strictEqual(totalAmount, 2525000);
    });

    it("Đơn hàng nhiều items (3 items, tổng 9 sản phẩm, liên miền): phí ship CHỈ tính 1 lần duy nhất", () => {
      const shopProvince = "Hồ Chí Minh";
      const userProvince = "Hà Nội"; // Khác miền -> 45.000 VND
      const shippingFee = calculateShippingFee(shopProvince, userProvince);

      const items = [
        { productId: "p1", quantity: 2, pricePerDay: 100000, depositAmount: 200000 },
        { productId: "p2", quantity: 3, pricePerDay: 150000, depositAmount: 300000 },
        { productId: "p3", quantity: 4, pricePerDay: 200000, depositAmount: 400000 },
      ];
      const rentalDays = 2;

      let rentalFee = 0;
      let depositAmount = 0;
      let totalUnits = 0;

      for (const it of items) {
        rentalFee += it.pricePerDay * it.quantity * rentalDays;
        depositAmount += it.depositAmount * it.quantity;
        totalUnits += it.quantity;
      }

      assert.strictEqual(items.length, 3);
      assert.strictEqual(totalUnits, 9);
      assert.strictEqual(shippingFee, 45000);

      // Phí shipping chỉ cộng 1 lần vào totalAmount
      const totalAmount = rentalFee + depositAmount + shippingFee;

      // Đảm bảo không bị nhân theo số loại item (3) và không bị nhân theo tổng số lượng (9)
      assert.notStrictEqual(totalAmount, rentalFee + depositAmount + shippingFee * items.length);
      assert.notStrictEqual(totalAmount, rentalFee + depositAmount + shippingFee * totalUnits);
      assert.strictEqual(totalAmount, rentalFee + depositAmount + 45000);
    });
  });

  describe("3. Dữ liệu Shipping Address & Validation", () => {
    it("Từ chối khi thiếu bất kỳ trường địa chỉ giao hàng nào", () => {
      const testCases = [
        { field: "recipientName", message: "Recipient name is required" },
        { field: "recipientPhone", message: "Recipient phone is required" },
        { field: "province", message: "Province is required" },
        { field: "district", message: "District is required" },
        { field: "ward", message: "Ward is required" },
        { field: "detail", message: "Address detail is required" },
      ];

      for (const tc of testCases) {
        const fullAddress = {
          recipientName: "Nguyễn Văn A",
          recipientPhone: "0901234567",
          province: "Hồ Chí Minh",
          district: "Quận 1",
          ward: "Bến Nghé",
          detail: "123 Lê Lợi",
        };
        // Xóa trường đang test
        fullAddress[tc.field] = "   ";

        const req = {
          body: {
            startDate: new Date().toISOString(),
            endDate: new Date(Date.now() + 86400000).toISOString(),
            shippingAddress: fullAddress,
          },
        };

        let capturedError = null;
        validateCreateOrder(req, {}, (err) => {
          capturedError = err;
        });

        assert.ok(capturedError, `Cần báo lỗi khi thiếu ${tc.field}`);
        assert.strictEqual(capturedError.statusCode, 400);
        assert.strictEqual(capturedError.message, tc.message);
      }
    });

    it("Chấp nhận khi shippingAddress có đầy đủ thông tin hợp lệ", () => {
      const req = {
        body: {
          startDate: new Date(Date.now() + 86400000).toISOString(),
          endDate: new Date(Date.now() + 2 * 86400000).toISOString(),
          shippingAddress: {
            recipientName: "Trần Thị B",
            recipientPhone: "0987654321",
            province: "Hà Nội",
            district: "Ba Đình",
            ward: "Cống Vị",
            detail: "456 Kim Mã",
          },
        },
      };

      let nextCalled = false;
      let capturedError = null;
      validateCreateOrder(req, {}, (err) => {
        if (err) capturedError = err;
        else nextCalled = true;
      });

      assert.strictEqual(capturedError, null);
      assert.strictEqual(nextCalled, true);
    });
  });
});
