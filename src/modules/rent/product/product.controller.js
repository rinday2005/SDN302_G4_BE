import {
  createProduct,
  updateProduct,
  deleteProduct,
  getPublicProducts,
  getPublicProductDetail,
  getShopProducts,
} from "./product.service.js";

/**
 * SHOP_OWNER tạo sản phẩm RENT
 */
const createProductController = async (req, res, next) => {
  try {
    const product = await createProduct(
      req.body,
      req.user._id
    );

    return res.status(201).json({
      success: true,
      message: "Tạo sản phẩm cho thuê thành công",
      data: product,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * SHOP_OWNER cập nhật sản phẩm RENT của mình
 */
const updateProductController = async (req, res, next) => {
  try {
    const product = await updateProduct(
      req.params.id,
      req.user._id,
      req.body
    );

    return res.status(200).json({
      success: true,
      message: "Cập nhật sản phẩm cho thuê thành công",
      data: product,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * SHOP_OWNER xóa sản phẩm RENT của mình
 */
const deleteProductController = async (req, res, next) => {
  try {
    const product = await deleteProduct(
      req.params.id,
      req.user._id
    );

    return res.status(200).json({
      success: true,
      message: "Xóa sản phẩm cho thuê thành công",
      data: product,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * [BE-S2-05]
 * Public API:
 * GET /api/rent/products
 *
 * Search + filter + sort + pagination
 */
const getPublicProductsController = async (
  req,
  res,
  next
) => {
  try {
    const result = await getPublicProducts(
      req.query
    );

    return res.status(200).json({
      success: true,
      message:
        "Lấy danh sách sản phẩm cho thuê thành công",

      data: result.products,

      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * [BE-S2-06]
 * Public API:
 * GET /api/rent/products/:id
 *
 * Trả về:
 * - chi tiết sản phẩm APPROVED
 * - Shop Owner
 * - Category
 * - Availability Calendar
 */
const getPublicProductDetailController = async (
  req,
  res,
  next
) => {
  try {
    const result =
      await getPublicProductDetail(
        req.params.id
      );

    return res.status(200).json({
      success: true,

      message:
        "Lấy chi tiết sản phẩm cho thuê thành công",

      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * SHOP_OWNER lấy danh sách tất cả sản phẩm của shop mình từ MongoDB
 */
const getShopProductsController = async (req, res, next) => {
  try {
    const ownerId = req.user?._id || req.user?.id;
    const products = await getShopProducts(ownerId);

    return res.status(200).json({
      success: true,
      message: "Lấy danh sách sản phẩm của shop thành công",
      data: products,
    });
  } catch (error) {
    next(error);
  }
};

export {
  createProductController,
  updateProductController,
  deleteProductController,
  getPublicProductsController,
  getPublicProductDetailController,
  getShopProductsController,
};