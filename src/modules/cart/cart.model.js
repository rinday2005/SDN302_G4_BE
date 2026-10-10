import mongoose from "mongoose";

// Mỗi item trong giỏ chỉ lưu productId và quantity
const createCartItemSchema = (refModel) =>
  new mongoose.Schema(
    {
      productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: refModel,
        required: [true, "productId là bắt buộc"],
      },
      quantity: {
        type: Number,
        required: [true, "quantity là bắt buộc"],
        min: [1, "quantity phải từ 1 trở lên"],
        default: 1,
      },
    },
    { _id: false }
  );

const cartSchema = new mongoose.Schema(
  {
    // Mỗi User chỉ có 1 Cart
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "userId là bắt buộc"],
      unique: true,
    },
    // AC: một Cart có thể chứa nhiều RENT items
    rentItems: {
      type: [createCartItemSchema("RentalProduct")],
      default: [],
    },
    thriftItems: {
      type: [createCartItemSchema("ThriftListing")],
      default: [],
    },
  },
  {
    timestamps: true,
    collection: "carts",
  }
);

const Cart = mongoose.models.Cart || mongoose.model("Cart", cartSchema);

export { Cart };
export default Cart;
