import mongoose from 'mongoose';

const thriftListingSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'ownerId là bắt buộc'],
      index: true,
    },
    sourceType: {
      type: String,
      enum: {
        values: ['NEW', 'RENTAL_PRODUCT', 'USED_DIRECT'],
        message: 'sourceType không hợp lệ',
      },
      default: 'NEW',
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: [0, 'Số lượng tồn kho không được âm'],
      default: 10,
    },
    sizes: {
      type: [String],
      default: ['S', 'M', 'L', 'XL'],
    },
    size: {
      type: String,
      default: 'L',
    },
    sourceRentalProductId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RentalProduct',
      default: null,
    },
    name: {
      type: String,
      required: [true, 'Tên sản phẩm thanh lý là bắt buộc'],
      trim: true,
      index: true,
    },
    slug: {
      type: String,
      trim: true,
      index: true,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: [true, 'categoryId là bắt buộc'],
      index: true,
    },
    price: {
      type: Number,
      required: [true, 'Giá bán thanh lý là bắt buộc'],
      min: [0, 'Giá bán phải lớn hơn hoặc bằng 0'],
    },
    condition: {
      type: String,
      required: [true, 'Tình trạng đồ cũ là bắt buộc'],
      trim: true,
      default: 'Rất tốt (95%)',
    },
    images: {
      type: [String],
      validate: {
        validator: function (val) {
          return Array.isArray(val) && val.length > 0;
        },
        message: 'Sản phẩm phải có ít nhất 1 hình ảnh',
      },
    },
    location: {
      type: String,
      required: [true, 'Địa chỉ shop/kho là bắt buộc'],
      trim: true,
      default: 'Đà Nẵng',
    },
    status: {
      type: String,
      enum: {
        values: ['DRAFT', 'PENDING', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'SOLD', 'HIDDEN'],
        message: 'status không hợp lệ',
      },
      default: 'APPROVED',
      index: true,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    rejectionReason: {
      type: String,
      trim: true,
      default: '',
    },
  },
  {
    timestamps: true,
    collection: 'thriftListings',
  }
);

thriftListingSchema.index({ ownerId: 1, status: 1 });
thriftListingSchema.index({ categoryId: 1, status: 1 });
thriftListingSchema.index({ name: 'text' });

export const ThriftListing = mongoose.model('ThriftListing', thriftListingSchema);
export default ThriftListing;
