import mongoose from "mongoose";

const orderItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      default: null,
    },
    productName: {
      type: String,
      required: [true, "Product name is required"],
      trim: true,
    },
    productImage: {
      type: String,
      default: "",
    },
    orderType: {
      type: String,
      enum: ["RENT", "THRIFT"],
      default: "RENT",
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: [1, "Quantity must be at least 1"],
      default: 1,
    },
    size: {
      type: String,
      default: "FreeSize",
    },
    // Dành cho đồ thuê (RENT)
    rentalStartDate: {
      type: Date,
      default: null,
    },
    rentalEndDate: {
      type: Date,
      default: null,
    },
    rentalDays: {
      type: Number,
      default: 1,
      min: 1,
    },
    // Đơn giá: giá thuê theo ngày (RENT) hoặc giá bán (THRIFT)
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    // Tiền cọc trên 1 sản phẩm thuê (đối với THRIFT thì = 0)
    deposit: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Tổng tiền thuê/mua cho món đồ này = (price * rentalDays * quantity) hoặc (price * quantity)
    itemSubtotal: {
      type: Number,
      required: true,
      min: 0,
    },
    // Tổng tiền cọc cho món đồ này = deposit * quantity
    itemDeposit: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { _id: true }
);

const orderAddressSchema = new mongoose.Schema(
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

const orderSchema = new mongoose.Schema(
  {
    orderCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // Danh sách nhiều món đồ trong 1 đơn hàng (Multi-item order)
    items: {
      type: [orderItemSchema],
      required: true,
      validate: {
        validator: function (items) {
          return Array.isArray(items) && items.length > 0;
        },
        message: "Order must contain at least one item",
      },
    },
    shippingAddress: {
      type: orderAddressSchema,
      required: true,
    },
    // Tổng tiền thuê/mua của tất cả các món đồ
    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },
    // Tổng tiền cọc của tất cả các món đồ thuê
    totalDeposit: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Phí vận chuyển
    shippingFee: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Tổng số tiền thanh toán 1 lần cho đơn hàng: subtotal + totalDeposit + shippingFee
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    paymentMethod: {
      type: String,
      enum: ["COD", "VNPAY", "MOMO", "BANK_TRANSFER"],
      default: "COD",
    },
    paymentStatus: {
      type: String,
      enum: ["PENDING", "PAID", "FAILED", "REFUNDED"],
      default: "PENDING",
    },
    orderStatus: {
      type: String,
      enum: [
        "PENDING",
        "CONFIRMED",
        "PREPARING",
        "SHIPPING",
        "DELIVERED",
        "COMPLETED",
        "CANCELLED",
      ],
      default: "PENDING",
    },
    note: {
      type: String,
      default: "",
      trim: true,
    },
  },
  {
    timestamps: true,
    collection: "orders",
  }
);

const Order = mongoose.model("Order", orderSchema);

export default Order;
