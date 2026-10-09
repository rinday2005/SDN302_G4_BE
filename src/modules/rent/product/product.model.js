import mongoose from 'mongoose';

const rentalProductSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'ownerId là bắt buộc'],
      validate: {
        validator: async function (value) {
          if (!value) return false;
          const User = mongoose.model('User');
          const user = await User.findById(value);
          // AC: ownerId phải tham chiếu đến User có role SHOP_OWNER
          return user && user.role === 'SHOP_OWNER';
        },
        message: 'ownerId không hợp lệ hoặc tài khoản không có quyền SHOP_OWNER',
      },
    },
    name: {
      type: String,
      required: [true, 'Tên sản phẩm là bắt buộc'],
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
    pricePerDay: {
      type: Number,
      required: [true, 'Giá thuê mỗi ngày là bắt buộc'],
      // AC: pricePerDay > 0
      validate: {
        validator: function (val) {
          return val > 0;
        },
        message: 'pricePerDay phải lớn hơn 0',
      },
    },
    depositAmount: {
      type: Number,
      required: [true, 'Tiền cọc là bắt buộc'],
      min: [0, 'depositAmount phải lớn hơn hoặc bằng 0'], // AC: depositAmount >= 0
      default: 0,
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
    condition: {
      type: String,
      enum: {
        values: ['NEW', 'LIKE_NEW', 'GOOD'],
        message: 'condition chỉ nhận các giá trị: NEW, LIKE_NEW, GOOD',
      },
      required: [true, 'Tình trạng sản phẩm là bắt buộc'],
    },
    rentalRules: {
      type: String,
      trim: true,
      default: '',
    },
    location: {
      type: String,
      required: [true, 'Địa chỉ kho/shop là bắt buộc'],
      trim: true,
    },
    status: {
      type: String,
      enum: {
        values: ['PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'HIDDEN'],
        message: 'status không hợp lệ',
      },
      default: 'PENDING_APPROVAL',
      index: true,
    },
    totalQuantity: {
      type: Number,
      required: [true, 'Số lượng sản phẩm là bắt buộc'],
      min: [1, 'totalQuantity phải từ 1 trở lên'], // AC: totalQuantity >= 1
      default: 1,
    },
  },
  {
    timestamps: true, // Tự động sinh createdAt, updatedAt
    collection: 'rentalProducts', // AC: collection rentalProducts
  }
);

// Tạo index cho các field tìm kiếm thường xuyên
rentalProductSchema.index({ ownerId: 1, status: 1 });
rentalProductSchema.index({ categoryId: 1, status: 1 });
rentalProductSchema.index({ name: 'text' });

export const RentalProduct = mongoose.model('RentalProduct', rentalProductSchema);
export default RentalProduct;