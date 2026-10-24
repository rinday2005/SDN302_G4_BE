import mongoose from "mongoose";

/**
 * Trạng thái đơn hàng THRIFT (ThriftOrder lifecycle)
 * PENDING / WAITING_PAYMENT ──► PAID ──► PREPARING ──► SHIPPING ──► DELIVERED ──► COMPLETED
 *    │
 *    └──► CANCELLED
 */
export const THRIFT_ORDER_STATUS = Object.freeze({
  PENDING: "PENDING", // Khách vừa đặt mua, chờ thanh toán
  WAITING_PAYMENT: "WAITING_PAYMENT", // Chờ thanh toán
  PAID: "PAID", // Khách đã thanh toán thành công, sản phẩm đã bị khóa SOLD
  CONFIRMED: "CONFIRMED", // Đã xác nhận
  PREPARING: "PREPARING", // Shop đang đóng gói sản phẩm độc bản
  SHIPPING: "SHIPPING", // Đang giao hàng tới người mua
  DELIVERED: "DELIVERED", // Hàng đã được giao tới địa chỉ
  COMPLETED: "COMPLETED", // Hoàn tất đơn hàng
  CANCELLED: "CANCELLED", // Đơn bị hủy
});

// Snapshot sản phẩm thanh lý tại thời điểm đặt mua
const thriftOrderItemSchema = new mongoose.Schema(
  {
    listingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ThriftListing",
      required: [true, "listingId là bắt buộc"],
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ThriftListing",
    },
    name: {
      type: String,
      required: [true, "Tên sản phẩm là bắt buộc"],
      trim: true,
    },
    price: {
      type: Number,
      required: [true, "Giá sản phẩm là bắt buộc"],
      min: [0, "Giá sản phẩm không được âm"],
    },
    quantity: {
      type: Number,
      required: true,
      default: 1,
      min: [1, "quantity phải từ 1 trở lên"],
      max: [1, "Mỗi sản phẩm thanh lý độc bản chỉ có số lượng là 1"],
    },
    condition: {
      type: String,
      trim: true,
      default: "",
    },
    images: {
      type: [String],
      default: [],
    },
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { _id: false }
);

const shippingAddressSchema = new mongoose.Schema(
  {
    recipientName: {
      type: String,
      required: [true, "Tên người nhận là bắt buộc"],
      trim: true,
    },
    recipientPhone: {
      type: String,
      required: [true, "Số điện thoại người nhận là bắt buộc"],
      trim: true,
    },
    province: {
      type: String,
      required: [true, "Tỉnh/Thành phố là bắt buộc"],
      trim: true,
    },
    district: {
      type: String,
      required: [true, "Quận/Huyện là bắt buộc"],
      trim: true,
    },
    ward: {
      type: String,
      required: [true, "Phường/Xã là bắt buộc"],
      trim: true,
    },
    detail: {
      type: String,
      required: [true, "Địa chỉ chi tiết là bắt buộc"],
      trim: true,
    },
  },
  { _id: false }
);

const thriftOrderSchema = new mongoose.Schema(
  {
    orderCode: {
      type: String,
      required: [true, "orderCode là bắt buộc"],
      unique: true,
      trim: true,
    },
    buyerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "buyerId là bắt buộc"],
      index: true,
    },
    shopOwnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    // AC: Một ThriftOrder có thể chứa nhiều THRIFT listings
    items: {
      type: [thriftOrderItemSchema],
      validate: {
        validator: (items) => Array.isArray(items) && items.length > 0,
        message: "ThriftOrder phải có ít nhất 1 sản phẩm thanh lý",
      },
    },
    // Tổng giá sản phẩm = Σ(item.price * item.quantity)
    itemsTotal: {
      type: Number,
      required: true,
      min: [0, "Tổng giá sản phẩm không được âm"],
    },
    subtotal: {
      type: Number,
      min: 0,
    },
    // AC: Phí shipping chỉ tính một lần/order
    shippingFee: {
      type: Number,
      required: true,
      min: [0, "Phí shipping không được âm"],
      default: 0,
    },
    // totalAmount = itemsTotal + shippingFee
    totalAmount: {
      type: Number,
      required: true,
      min: [0, "Tổng tiền thanh toán không được âm"],
    },
    shippingAddress: {
      type: shippingAddressSchema,
      required: [true, "shippingAddress là bắt buộc"],
    },
    status: {
      type: String,
      enum: {
        values: Object.values(THRIFT_ORDER_STATUS),
        message: "status không hợp lệ",
      },
      default: THRIFT_ORDER_STATUS.PENDING,
      index: true,
    },
    paymentStatus: {
      type: String,
      enum: ["PENDING", "PAID", "FAILED"],
      default: "PENDING",
      index: true,
    },
    paymentMethod: {
      type: String,
      enum: ["VNPAY", "COD", "MOMO", "BANK_TRANSFER"],
      default: "VNPAY",
    },
    paidAt: {
      type: Date,
      default: null,
    },
    transactionNo: {
      type: String,
      default: "",
      trim: true,
    },
    bankCode: {
      type: String,
      default: "",
      trim: true,
    },
    note: {
      type: String,
      trim: true,
      default: "",
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
    cancellationReason: {
      type: String,
      trim: true,
      default: "",
    },
  },
  {
    timestamps: true,
    collection: "thriftOrders",
  }
);

thriftOrderSchema.index({ buyerId: 1, status: 1, createdAt: -1 });
thriftOrderSchema.index({ "items.listingId": 1, status: 1 });

const ThriftOrder =
  mongoose.models.ThriftOrder || mongoose.model("ThriftOrder", thriftOrderSchema);

export { ThriftOrder };
export default ThriftOrder;
