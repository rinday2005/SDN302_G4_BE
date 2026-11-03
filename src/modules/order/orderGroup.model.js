import mongoose from "mongoose";

const childOrderRefSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: "childOrders.orderModel",
    },
    orderModel: {
      type: String,
      required: true,
      enum: ["RentalOrder", "ThriftOrder"],
    },
    orderType: {
      type: String,
      required: true,
      enum: ["RENT", "THRIFT"],
    },
    shopId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    shopName: {
      type: String,
      trim: true,
      default: "",
    },
    orderCode: {
      type: String,
      trim: true,
    },
    subtotal: {
      type: Number,
      default: 0,
    },
    shippingFee: {
      type: Number,
      default: 0,
    },
    depositAmount: {
      type: Number,
      default: 0,
    },
    totalAmount: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      default: "PENDING",
    },
  },
  { _id: false }
);

const shippingAddressSchema = new mongoose.Schema(
  {
    recipientName: {
      type: String,
      trim: true,
      default: "",
    },
    recipientPhone: {
      type: String,
      trim: true,
      default: "",
    },
    province: {
      type: String,
      trim: true,
      required: true,
    },
    district: {
      type: String,
      trim: true,
      default: "",
    },
    ward: {
      type: String,
      trim: true,
      default: "",
    },
    detail: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { _id: false }
);

const orderGroupSchema = new mongoose.Schema(
  {
    orderCode: {
      type: String,
      required: [true, "orderCode là bắt buộc"],
      unique: true,
      trim: true,
      index: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "customerId là bắt buộc"],
      index: true,
    },
    childOrders: {
      type: [childOrderRefSchema],
      default: [],
    },
    shippingAddress: {
      type: shippingAddressSchema,
      required: true,
    },
    subtotal: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    totalShippingFee: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    totalDeposit: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    discount: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    paymentMethod: {
      type: String,
      enum: ["VNPAY", "COD", "MOMO", "BANK_TRANSFER"],
      default: "VNPAY",
    },
    paymentStatus: {
      type: String,
      enum: ["PENDING", "PAID", "FAILED"],
      default: "PENDING",
      index: true,
    },
    status: {
      type: String,
      enum: ["PENDING", "PROCESSING", "PARTIAL_COMPLETED", "COMPLETED", "CANCELLED"],
      default: "PENDING",
      index: true,
    },
    paidAt: {
      type: Date,
      default: null,
    },
    transactionNo: {
      type: String,
      trim: true,
      default: "",
    },
    bankCode: {
      type: String,
      trim: true,
      default: "",
    },
    note: {
      type: String,
      trim: true,
      default: "",
    },
  },
  {
    timestamps: true,
    collection: "orderGroups",
  }
);

export const OrderGroup = mongoose.models.OrderGroup || mongoose.model("OrderGroup", orderGroupSchema);
export default OrderGroup;

