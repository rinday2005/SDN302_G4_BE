import mongoose from 'mongoose';

const thriftOrderSchema = new mongoose.Schema(
  {
    orderCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    buyerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    shopOwnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    items: [
      {
        listingId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'ThriftListing',
          required: true,
        },
        productName: {
          type: String,
          required: true,
        },
        price: {
          type: Number,
          required: true,
        },
        quantity: {
          type: Number,
          default: 1,
        },
        imageUrl: String,
      },
    ],
    totalAmount: {
      type: Number,
      required: true,
    },
    shippingFee: {
      type: Number,
      default: 25000,
    },
    shippingAddress: {
      recipientName: { type: String, required: true },
      recipientPhone: { type: String, required: true },
      province: { type: String, required: true },
      district: { type: String, required: true },
      ward: { type: String, default: '' },
      detail: { type: String, required: true },
    },
    status: {
      type: String,
      enum: [
        'PENDING_PAYMENT',
        'PAID',
        'PROCESSING',
        'SHIPPED',
        'DELIVERED',
        'COMPLETED',
        'CANCELLED',
        'DISPUTED',
      ],
      default: 'PENDING_PAYMENT',
      index: true,
    },
    paymentStatus: {
      type: String,
      enum: ['PENDING', 'PAID', 'FAILED', 'REFUNDED'],
      default: 'PENDING',
    },
    trackingCode: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
    collection: 'thriftOrders',
  }
);

thriftOrderSchema.index({ buyerId: 1, status: 1 });
thriftOrderSchema.index({ shopOwnerId: 1, status: 1 });

export const ThriftOrder = mongoose.model('ThriftOrder', thriftOrderSchema);
export default ThriftOrder;
