import mongoose from "mongoose";

/**
 * Vòng đời đơn thuê (RentalOrder lifecycle)
 *
 * PENDING ──► CONFIRMED ──► PREPARING ──► SHIPPING ──► DELIVERED ──► RETURNING ──► RETURNED ──► COMPLETED
 *    │            │             │
 *    ├──► REJECTED │             │
 *    └──► CANCELLED ◄────────────┘
 */
export const RENTAL_ORDER_STATUS = Object.freeze({
  PENDING: "PENDING", // Renter vừa đặt, chờ Shop Owner duyệt
  WAITING_PAYMENT: "WAITING_PAYMENT", // Shop Owner đã duyệt, chờ thanh toán
  CONFIRMED: "CONFIRMED", // Đã xác nhận / thanh toán
  REJECTED: "REJECTED", // Shop Owner từ chối đơn
  PREPARING: "PREPARING", // Shop đang chuẩn bị hàng
  SHIPPING: "SHIPPING", // Đang giao hàng tới Renter
  DELIVERED: "DELIVERED", // Renter đã nhận hàng (đang trong thời gian thuê)
  RETURNING: "RETURNING", // Renter đang gửi trả hàng
  RETURNED: "RETURNED", // Shop đã nhận lại hàng, chờ kiểm tra / hoàn cọc
  COMPLETED: "COMPLETED", // Hoàn tất đơn thuê
  CANCELLED: "CANCELLED", // Đơn bị hủy
});

// Các bước chuyển trạng thái hợp lệ
export const RENTAL_ORDER_STATUS_TRANSITIONS = Object.freeze({
  PENDING: ["WAITING_PAYMENT", "CONFIRMED", "REJECTED", "CANCELLED"],
  WAITING_PAYMENT: ["CONFIRMED", "PREPARING", "CANCELLED"],
  CONFIRMED: ["PREPARING", "CANCELLED"],
  PREPARING: ["SHIPPING", "CANCELLED"],
  SHIPPING: ["DELIVERED"],
  DELIVERED: ["RETURNING"],
  RETURNING: ["RETURNED"],
  RETURNED: ["COMPLETED"],
  REJECTED: [],
  COMPLETED: [],
  CANCELLED: [],
});

export const canTransitionStatus = (from, to) =>
  (RENTAL_ORDER_STATUS_TRANSITIONS[from] || []).includes(to);

// Snapshot sản phẩm tại thời điểm đặt thuê
const rentalOrderItemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RentalProduct",
      required: [true, "productId là bắt buộc"],
    },
    productName: {
      type: String,
      required: [true, "productName là bắt buộc"],
      trim: true,
    },
    quantity: {
      type: Number,
      required: [true, "quantity là bắt buộc"],
      min: [1, "quantity phải từ 1 trở lên"],
    },
    pricePerDay: {
      type: Number,
      required: [true, "pricePerDay là bắt buộc"],
      min: [0, "pricePerDay phải lớn hơn hoặc bằng 0"],
    },
    depositAmount: {
      type: Number,
      required: [true, "depositAmount là bắt buộc"],
      min: [0, "depositAmount phải lớn hơn hoặc bằng 0"],
      default: 0,
    },
  },
  { _id: false }
);

const shippingAddressSchema = new mongoose.Schema(
  {
    recipientName: {
      type: String,
      required: [true, "Recipient name is required"],
      trim: true,
    },
    recipientPhone: {
      type: String,
      required: [true, "Recipient phone is required"],
      trim: true,
    },
    province: {
      type: String,
      required: [true, "Province is required"],
      trim: true,
    },
    district: {
      type: String,
      required: [true, "District is required"],
      trim: true,
    },
    ward: {
      type: String,
      required: [true, "Ward is required"],
      trim: true,
    },
    detail: {
      type: String,
      required: [true, "Address detail is required"],
      trim: true,
    },
  },
  { _id: false }
);

// Thông tin vận chuyển (giao đi & trả về)
const shippingDetailsSchema = new mongoose.Schema(
  {
    carrier: { type: String, trim: true, default: "" },
    trackingCode: { type: String, trim: true, default: "" },
    shippedAt: { type: Date, default: null },
    deliveredAt: { type: Date, default: null },
    returnCarrier: { type: String, trim: true, default: "" },
    returnTrackingCode: { type: String, trim: true, default: "" },
    returnShippedAt: { type: Date, default: null },
    returnedAt: { type: Date, default: null },
  },
  { _id: false }
);

const rentalOrderSchema = new mongoose.Schema(
  {
    orderCode: {
      type: String,
      required: [true, "orderCode là bắt buộc"],
      unique: true,
      trim: true,
    },
    renterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "renterId là bắt buộc"],
      index: true,
    },
    // AC: shopOwnerId luôn là Shop Owner duy nhất
    shopOwnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "shopOwnerId là bắt buộc"],
      index: true,
      validate: {
        validator: async function (value) {
          if (!value) return false;
          const User = mongoose.model("User");
          const user = await User.findById(value).select("role");
          return !!user && user.role === "SHOP_OWNER";
        },
        message: "shopOwnerId không hợp lệ hoặc tài khoản không có quyền SHOP_OWNER",
      },
    },
    // AC: một RentalOrder có thể chứa nhiều sản phẩm RENT
    items: {
      type: [rentalOrderItemSchema],
      validate: {
        validator: (items) => Array.isArray(items) && items.length > 0,
        message: "RentalOrder phải có ít nhất 1 sản phẩm",
      },
    },
    startDate: {
      type: Date,
      required: [true, "startDate là bắt buộc"],
    },
    endDate: {
      type: Date,
      required: [true, "endDate là bắt buộc"],
      validate: {
        validator: function (value) {
          return !this.startDate || value >= this.startDate;
        },
        message: "endDate phải sau hoặc bằng startDate",
      },
    },
    // Tổng tiền thuê = Σ(pricePerDay * quantity * rentalDays)
    rentalFee: {
      type: Number,
      required: true,
      min: 0,
    },
    // Tổng tiền cọc = Σ(depositAmount * quantity)
    depositAmount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    shippingFee: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    // totalAmount = rentalFee + depositAmount + shippingFee
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    shippingAddress: {
      type: shippingAddressSchema,
      required: [true, "shippingAddress là bắt buộc"],
    },
    status: {
      type: String,
      enum: {
        values: Object.values(RENTAL_ORDER_STATUS),
        message: "status không hợp lệ",
      },
      default: RENTAL_ORDER_STATUS.PENDING,
      index: true,
    },
    rejectionReason: {
      type: String,
      trim: true,
      default: "",
    },
    shippingDetails: {
      type: shippingDetailsSchema,
      default: () => ({}),
    },
  },
  {
    timestamps: true,
    collection: "rentalOrders",
  }
);

rentalOrderSchema.index({ renterId: 1, status: 1, createdAt: -1 });
rentalOrderSchema.index({ shopOwnerId: 1, status: 1, createdAt: -1 });
rentalOrderSchema.index({ "items.productId": 1, status: 1, startDate: 1, endDate: 1 });

const RentalOrder =
  mongoose.models.RentalOrder || mongoose.model("RentalOrder", rentalOrderSchema);

export { RentalOrder };
export default RentalOrder;
