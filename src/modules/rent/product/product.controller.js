import * as productService from './product.service.js';

// ======================================================
// BE-S2-05
// Public search & pagination
// ======================================================
export const getPublicProducts = async (
  req,
  res,
  next
) => {
  try {
    const result =
      await productService.getPublicProducts(req.query);

    return res.status(200).json({
      success: true,
      message:
        'Lấy danh sách sản phẩm cho thuê thành công',
      data: result.products,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
};

// ======================================================
// Existing Shop Owner APIs
// ======================================================
export const createProduct = async (
  req,
  res,
  next
) => {
  try {
    const product =
      await productService.createProduct(
        req.user._id,
        req.body
      );

    return res.status(201).json({
      success: true,
      message:
        'Tạo sản phẩm cho thuê thành công',
      data: product,
    });
  } catch (error) {
    next(error);
  }
};

export const updateProduct = async (
  req,
  res,
  next
) => {
  try {
    const updated =
      await productService.updateProduct(
        req.params.id,
        req.user._id,
        req.body
      );

    return res.status(200).json({
      success: true,
      message:
        'Cập nhật sản phẩm thành công',
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteProduct = async (
  req,
  res,
  next
) => {
  try {
    const result =
      await productService.deleteProduct(
        req.params.id,
        req.user._id
      );

    return res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    next(error);
  }
};