import mongoose from 'mongoose';
import RentalProduct from './product.model.js';

// Escape ký tự đặc biệt trước khi dùng RegExp
const escapeRegex = (value = '') => {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

// ======================================================
// BE-S2-05 - PUBLIC SEARCH + PAGINATION
// GET /api/rent/products
// ======================================================
export const getPublicProducts = async (query = {}) => {
  const {
    keyword,
    categoryId,
    minPrice,
    maxPrice,
    province,
    page = 1,
    limit = 12,
    sortBy = 'newest',
  } = query;

  const currentPage = Math.max(parseInt(page, 10) || 1, 1);
  const currentLimit = Math.min(
    Math.max(parseInt(limit, 10) || 12, 1),
    100
  );

  const filter = {
    // RentalProduct collection chỉ chứa sản phẩm RENT
    status: 'APPROVED',
  };

  // Search không phân biệt hoa thường
  if (keyword?.trim()) {
    const safeKeyword = escapeRegex(keyword.trim());

    filter.$or = [
      {
        name: {
          $regex: safeKeyword,
          $options: 'i',
        },
      },
      {
        description: {
          $regex: safeKeyword,
          $options: 'i',
        },
      },
    ];
  }

  // Category
  if (categoryId) {
    if (!mongoose.Types.ObjectId.isValid(categoryId)) {
      const error = new Error('categoryId không hợp lệ');
      error.statusCode = 400;
      error.errorCode = 'INVALID_CATEGORY_ID';
      throw error;
    }

    filter.categoryId = categoryId;
  }

  // Giá thuê
  if (minPrice !== undefined || maxPrice !== undefined) {
    filter.pricePerDay = {};

    if (minPrice !== undefined && minPrice !== '') {
      const parsedMin = Number(minPrice);

      if (Number.isNaN(parsedMin) || parsedMin < 0) {
        const error = new Error('minPrice không hợp lệ');
        error.statusCode = 400;
        error.errorCode = 'INVALID_MIN_PRICE';
        throw error;
      }

      filter.pricePerDay.$gte = parsedMin;
    }

    if (maxPrice !== undefined && maxPrice !== '') {
      const parsedMax = Number(maxPrice);

      if (Number.isNaN(parsedMax) || parsedMax < 0) {
        const error = new Error('maxPrice không hợp lệ');
        error.statusCode = 400;
        error.errorCode = 'INVALID_MAX_PRICE';
        throw error;
      }

      filter.pricePerDay.$lte = parsedMax;
    }

    if (
      minPrice !== undefined &&
      minPrice !== '' &&
      maxPrice !== undefined &&
      maxPrice !== '' &&
      Number(minPrice) > Number(maxPrice)
    ) {
      const error = new Error(
        'minPrice không được lớn hơn maxPrice'
      );
      error.statusCode = 400;
      error.errorCode = 'INVALID_PRICE_RANGE';
      throw error;
    }
  }

  // Schema hiện tại chỉ có location String,
  // nên province được match trong location.
  if (province?.trim()) {
    filter.location = {
      $regex: escapeRegex(province.trim()),
      $options: 'i',
    };
  }

  // Sorting
  let sort = {
    createdAt: -1,
  };

  switch (sortBy) {
    case 'price_asc':
      sort = {
        pricePerDay: 1,
      };
      break;

    case 'price_desc':
      sort = {
        pricePerDay: -1,
      };
      break;

    case 'name_asc':
      sort = {
        name: 1,
      };
      break;

    case 'name_desc':
      sort = {
        name: -1,
      };
      break;

    case 'oldest':
      sort = {
        createdAt: 1,
      };
      break;

    case 'newest':
    default:
      sort = {
        createdAt: -1,
      };
      break;
  }

  const skip = (currentPage - 1) * currentLimit;

  const [products, total] = await Promise.all([
    RentalProduct.find(filter)
      .populate(
        'ownerId',
        'fullName email phoneNumber address avatarUrl role'
      )
      .populate('categoryId', 'name slug type')
      .sort(sort)
      .skip(skip)
      .limit(currentLimit)
      .lean(),

    RentalProduct.countDocuments(filter),
  ]);

  const totalPages =
    total === 0 ? 0 : Math.ceil(total / currentLimit);

  return {
    products,
    pagination: {
      total,
      page: currentPage,
      totalPages,
      limit: currentLimit,
    },
  };
};

// ======================================================
// EXISTING SHOP OWNER FUNCTIONS
// ======================================================

export const createProduct = async (userId, data) => {
  const { ownerId, status, ...allowedData } = data;

  const product = new RentalProduct({
    ...allowedData,
    ownerId: userId,
    status: 'PENDING_APPROVAL',
  });

  return await product.save();
};

export const updateProduct = async (
  productId,
  userId,
  updateData
) => {
  const product = await RentalProduct.findById(productId);

  if (!product) {
    const error = new Error('Sản phẩm không tồn tại');
    error.statusCode = 404;
    throw error;
  }

  if (product.ownerId.toString() !== userId.toString()) {
    const error = new Error(
      'Bạn không có quyền chỉnh sửa sản phẩm này'
    );
    error.statusCode = 403;
    throw error;
  }

  const {
    ownerId,
    status,
    ...validUpdates
  } = updateData;

  Object.assign(product, validUpdates);

  return await product.save();
};

export const deleteProduct = async (
  productId,
  userId
) => {
  const product = await RentalProduct.findById(productId);

  if (!product) {
    const error = new Error('Sản phẩm không tồn tại');
    error.statusCode = 404;
    throw error;
  }

  if (product.ownerId.toString() !== userId.toString()) {
    const error = new Error(
      'Bạn không có quyền xóa sản phẩm này'
    );
    error.statusCode = 403;
    throw error;
  }

  await RentalProduct.findByIdAndDelete(productId);

  return {
    message: 'Xóa sản phẩm thành công',
  };
};

// ======================================================
// BE-S2-04 - ADMIN DUYỆT / TỪ CHỐI SẢN PHẨM CHO THUÊ
// PATCH /api/admin/rent/products/:id/status
// ======================================================
export const updateProductStatus = async (
  productId,
  { status, reason = '' }
) => {
  if (!mongoose.Types.ObjectId.isValid(productId)) {
    const error = new Error('ID sản phẩm không hợp lệ');
    error.statusCode = 400;
    error.errorCode = 'INVALID_PRODUCT_ID';
    throw error;
  }

  if (!status || !['APPROVED', 'REJECTED'].includes(status)) {
    const error = new Error(
      'Trạng thái duyệt không hợp lệ. Trạng thái hợp lệ: APPROVED, REJECTED'
    );
    error.statusCode = 400;
    error.errorCode = 'INVALID_STATUS';
    throw error;
  }

  if (reason !== undefined && typeof reason !== 'string') {
    const error = new Error('Lý do từ chối phải là chuỗi văn bản');
    error.statusCode = 400;
    error.errorCode = 'INVALID_REASON';
    throw error;
  }

  const product = await RentalProduct.findById(productId);

  if (!product) {
    const error = new Error('Sản phẩm không tồn tại');
    error.statusCode = 404;
    error.errorCode = 'PRODUCT_NOT_FOUND';
    throw error;
  }

  // AC: Chuyển PENDING_APPROVAL -> APPROVED / REJECTED
  product.status = status;

  if (status === 'REJECTED') {
    const trimmedReason = reason ? reason.trim() : '';
    product.rejectionReason = trimmedReason;
    product.reason = trimmedReason;
  } else if (status === 'APPROVED') {
    product.rejectionReason = '';
    product.reason = '';
  }

  return await product.save();
};