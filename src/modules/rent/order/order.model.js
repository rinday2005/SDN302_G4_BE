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
  PAID: "PAID", // Renter đã thanh toán thành công
  READY_FOR_HANDOVER: "READY_FOR_HANDOVER", // Chuẩn bị xong, sẵn sàng bàn giao cho đơn vị vận chuyển
  HANDED_OVER: "HANDED_OVER", // Đã bàn giao cho đơn vị vận chuyển
  CONFIRMED: "CONFIRMED", // Đã xác nhận
  REJECTED: "REJECTED", // Shop Owner từ chối đơn
  PREPARING: "PREPARING", // Shop đang chuẩn bị hàng
  SHIPPING: "SHIPPING", // Đang giao hàng tới Renter
  DELIVERED: "DELIVERED", // Hàng đã được giao tới địa chỉ
  RENTING: "RENTING", // Renter đã nhận đồ và bắt đầu tính thời gian thuê
  RETURN_REQUESTED: "RETURN_REQUESTED", // Renter gửi yêu cầu trả đồ kèm ảnh hiện trạng
  RETURNING: "RETURNING", // Renter đang gửi trả hàng
  RETURNED: "RETURNED", // Shop đã nhận lại hàng, chờ kiểm tra / hoàn cọc
  DISPUTED: "DISPUTED", // Đơn có tranh chấp giữa Renter và Shop Owner
  COMPLETED: "COMPLETED", // Hoàn tất đơn thuê
  CANCELLED: "CANCELLED", // Đơn bị hủy
});

// Các bước chuyển trạng thái hợp lệ
export const RENTAL_ORDER_STATUS_TRANSITIONS = Object.freeze({
  PENDING: ["WAITING_PAYMENT", "CONFIRMED", "REJECTED", "CANCELLED"],
  WAITING_PAYMENT: ["PAID", "CONFIRMED", "CANCELLED"],
  PAID: ["READY_FOR_HANDOVER", "HANDED_OVER", "CONFIRMED", "PREPARING", "CANCELLED", "DELIVERED", "RENTING"],
  READY_FOR_HANDOVER: ["HANDED_OVER", "SHIPPING", "CANCELLED"],
  HANDED_OVER: ["SHIPPING", "DELIVERED", "RENTING", "CANCELLED"],
  CONFIRMED: ["PREPARING", "READY_FOR_HANDOVER", "HANDED_OVER", "CANCELLED"],
  PREPARING: ["READY_FOR_HANDOVER", "HANDED_OVER", "SHIPPING", "CANCELLED"],
  SHIPPING: ["DELIVERED", "RENTING"],
  DELIVERED: ["RENTING", "RETURN_REQUESTED", "RETURNING"],
  RENTING: ["RETURN_REQUESTED", "RETURNING", "COMPLETED", "DISPUTED"],
  RETURN_REQUESTED: ["RETURNING", "RETURNED", "COMPLETED", "CANCELLED", "DISPUTED"],
  RETURNING: ["RETURNED", "COMPLETED", "DISPUTED"],
  RETURNED: ["COMPLETED", "DISPUTED"],
  DISPUTED: ["COMPLETED", "CANCELLED"],
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
    location: { type: String, trim: true, default: "Đà Nẵng" },
    imageUrl: {
      type: String,
      trim: true,
      default: "",
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
    carrierName: { type: String, trim: true, default: "" },
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

// Minh chứng bàn giao CLA (Nhật ký mở hộp & đối kiểm 3 góc của khách khi nhận đồ)
const claProofSchema = new mongoose.Schema(
  {
    isSigned: { type: Boolean, default: false },
    signedAt: { type: Date, default: null },
    signerName: { type: String, trim: true, default: "" },
    signerPhone: { type: String, trim: true, default: "" },
    note: { type: String, trim: true, default: "" },
    photos: {
      slot1: { type: String, default: "" }, // Mặt trước & Tổng thể
      slot2: { type: String, default: "" }, // Góc cạnh & Phụ kiện
      slot3: { type: String, default: "" }, // Tem niêm phong Nanuk
    },
    images: {
      type: [String],
      default: [],
    },
  },
  { _id: false }
);

// Thông tin yêu cầu trả đồ và ảnh hiện trạng (cấp order)
const returnRequestSchema = new mongoose.Schema(
  {
    images: {
      type: [String],
      required: [true, "Danh sách ảnh hiện trạng là bắt buộc"],
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0,
        message: "Bắt buộc phải có ít nhất một ảnh hiện trạng",
      },
    },
    note: {
      type: String,
      trim: true,
      default: "",
    },
    requestedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

// Chi tiết kiểm định từng item trong đơn (nếu có hư hại)
const itemInspectionSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RentalProduct",
      required: true,
    },
    condition: {
      type: String,
      enum: ["GOOD", "MINOR_DAMAGE", "DAMAGED", "LOST"],
      default: "GOOD",
    },
    damageNote: {
      type: String,
      trim: true,
      default: "",
    },
    penaltyAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { _id: false }
);

// Kết quả kiểm định hư hại và quyết định hoàn cọc (cấp order)
const inspectionResultSchema = new mongoose.Schema(
  {
    damagePenaltyAmount: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    refundAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    reason: {
      type: String,
      trim: true,
      default: "",
    },
    damageImages: {
      type: [String],
      default: [],
    },
    itemInspections: {
      type: [itemInspectionSchema],
      default: [],
    },
    inspectedAt: {
      type: Date,
      default: Date.now,
    },
    inspectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { _id: false }
);

// Tranh chấp giữa Renter và Shop Owner
const disputeSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ["NONE", "OPEN", "RESOLVED"],
      default: "NONE",
    },
    reason: {
      type: String,
      trim: true,
      default: "",
    },
    damageImages: {
      type: [String],
      default: [],
    },
    reportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    reportedAt: {
      type: Date,
      default: null,
    },
    resolution: {
      type: String,
      enum: ["REFUND_RENTER", "PAY_SHOP_OWNER", "SPLIT", "DISMISSED"],
      default: null,
    },
    refundToRenter: {
      type: Number,
      default: 0,
      min: 0,
    },
    payoutToShop: {
      type: Number,
      default: 0,
      min: 0,
    },
    adminNotes: {
      type: String,
      trim: true,
      default: "",
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
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
    paymentStatus: {
      type: String,
      enum: ["PENDING", "PAID", "FAILED"],
      default: "PENDING",
      index: true,
    },
    rejectionReason: {
      type: String,
      trim: true,
      default: "",
    },
    receivedAt: {
      type: Date,
      default: null,
    },
    shippingDetails: {
      type: shippingDetailsSchema,
      default: () => ({}),
    },
    claProof: {
      type: claProofSchema,
      default: null,
    },
    returnRequest: {
      type: returnRequestSchema,
      default: null,
    },
    inspectionResult: {
      type: inspectionResultSchema,
      default: null,
    },
    dispute: {
      type: disputeSchema,
      default: () => ({ status: "NONE" }),
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
