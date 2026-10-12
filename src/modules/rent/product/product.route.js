import express from 'express';
import * as productController from './product.controller.js';
import authMiddleware from '../../../middleware/auth.middleware.js';
import authorize from '../../../middleware/role.middleware.js';
import { validateUpdateProductStatus } from './product.validation.js';

const router = express.Router();
const adminProductRouter = express.Router();

// ======================================================
// BE-S2-04
// ADMIN ROUTE - Duyệt / Từ chối sản phẩm cho thuê
// PATCH /api/admin/rent/products/:id/status
// ======================================================
adminProductRouter.use(
  authMiddleware,
  authorize(['ADMIN'])
);

adminProductRouter.patch(
  '/:id/status',
  validateUpdateProductStatus,
  productController.updateProductStatus
);

// ======================================================
// BE-S2-05
// PUBLIC
// Guest/User đều xem được.
// Route này PHẢI đặt trước authMiddleware.
// ======================================================
router.get(
  '/',
  productController.getPublicProducts
);

// ======================================================
// SHOP OWNER PROTECTED ROUTES
// ======================================================

const requireShopOwner = (
  req,
  res,
  next
) => {
  if (
    !req.user ||
    req.user.role !== 'SHOP_OWNER'
  ) {
    const error = new Error(
      'Chỉ Shop Owner mới có quyền thực hiện thao tác này'
    );

    error.statusCode = 403;
    error.errorCode = 'FORBIDDEN';

    return next(error);
  }

  next();
};

// Các route phía dưới bắt buộc login SHOP_OWNER
router.use(authMiddleware);
router.use(requireShopOwner);

router.post(
  '/',
  productController.createProduct
);

router.put(
  '/:id',
  productController.updateProduct
);

router.delete(
  '/:id',
  productController.deleteProduct
);

export { adminProductRouter };
export default router;