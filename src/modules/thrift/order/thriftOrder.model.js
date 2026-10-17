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
        size: {
          type: String,
          default: 'L',
        },
        imageUrl: {
          type: String,
          default: '',
        },
        condition: {
          type: String,
          default: 'Grade Mint (98%)',
        },
        vaultOrigin: {
          type: String,
          default: 'Provenance Vault Standard',
        },
        warranty: {
          type: String,
          default: 'Bảo hành cơ học 12 tháng',
        },
      },
    ],
    itemsSubtotal: {
      type: Number,
      default: 0,
    },
    shippingFee: {
      type: Number,
      default: 215000,
    },
    totalAmount: {
      type: Number,
      required: true,
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
    paymentMethod: {
      type: String,
      default: 'VNPAY',
    },
    trackingCode: {
      type: String,
      default: '',
    },
    courierName: {
      type: String,
      default: 'Bưu tá bảo hiểm bọc thép White-Glove Insured Secondhand Courier',
    },
    escrowStatus: {
      type: String,
      enum: ['PENDING', 'HELD_72H', 'RELEASED', 'REFUNDED'],
      default: 'PENDING',
    },
    escrowExpiresAt: {
      type: Date,
      default: null,
    },
    provenanceVaultCertId: {
      type: String,
      default: '',
    },
    cancelReason: {
      type: String,
      default: '',
    },
    disputeReason: {
      type: String,
      default: '',
    },
    note: {
      type: String,
      default: '',
    },
    
    reviews: [
      {
        rating: { type: Number, default: 5 },
        comment: { type: String, default: '' },
        images: [String],
        createdAt: { type: Date, default: Date.now },
      },
    ],
    benchInspection: {
      sealNumber: { type: String, default: '#RH-9021-SEAL' },
      shutterTest: { type: String, default: 'Sai lệch ±0.02ms (Chuẩn phòng Lab Leitz)' },
      alignment: { type: String, default: 'Điểm vàng trùng khớp 100% tại ∞ & 1.0m' },
      opticsCleanliness: { type: String, default: '9.9/10 (Không rễ tre, lớp phủ Nano vẹn nguyên)' },
      electronics: { type: String, default: 'Cảm biến quang học nhạy sáng chuẩn ISO 100' },
    },
    timeline: [
      {
        status: String,
        title: String,
        description: String,
        timestamp: { type: Date, default: Date.now },
      },
    ],
  },
  {
    timestamps: true,
    collection: 'thriftOrders',
  }
);

thriftOrderSchema.index({ buyerId: 1, status: 1 });
thriftOrderSchema.index({ shopOwnerId: 1, status: 1 });

export const ThriftOrder = mongoose.models.ThriftOrder || mongoose.model('ThriftOrder', thriftOrderSchema);
export default ThriftOrder;
