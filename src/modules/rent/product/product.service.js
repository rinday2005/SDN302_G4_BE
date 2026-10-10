import RentalProduct from './product.model.js';

export const createProduct = async (userId, data) => {
  // AC: Loại bỏ ownerId và status nếu client gửi lên
  const { ownerId, status, ...allowedData } = data;

  const product = new RentalProduct({
    ...allowedData,
    ownerId: userId,
    status: 'PENDING_APPROVAL',
  });

  return await product.save();
};

export const updateProduct = async (productId, userId, updateData) => {
  const product = await RentalProduct.findById(productId);
  if (!product) {
    const error = new Error('Sản phẩm không tồn tại');
    error.statusCode = 404;
    throw error;
  }

  // AC: Chỉ Shop Owner sở hữu sản phẩm mới được sửa
  if (product.ownerId.toString() !== userId.toString()) {
    const error = new Error('Bạn không có quyền chỉnh sửa sản phẩm này');
    error.statusCode = 403;
    throw error;
  }

  const { ownerId, status, ...validUpdates } = updateData;
  Object.assign(product, validUpdates);

  return await product.save();
};

export const deleteProduct = async (productId, userId) => {
  const product = await RentalProduct.findById(productId);
  if (!product) {
    const error = new Error('Sản phẩm không tồn tại');
    error.statusCode = 404;
    throw error;
  }

  // AC: Chỉ Shop Owner sở hữu sản phẩm mới được xóa
  if (product.ownerId.toString() !== userId.toString()) {
    const error = new Error('Bạn không có quyền xóa sản phẩm này');
    error.statusCode = 403;
    throw error;
  }

  await RentalProduct.findByIdAndDelete(productId);
  return { message: 'Xóa sản phẩm thành công' };
};