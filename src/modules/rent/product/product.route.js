import express from 'express';
import * as productController from './product.controller.js';
import authMiddleware from '../../../middleware/auth.middleware.js';

const router = express.Router();

// Middleware chặn User/Admin tạo hoặc thao tác với tư cách Shop Owner
const requireShopOwner = (req, res, next) => {
  if (!req.user || req.user.role !== 'SHOP_OWNER') {
    const error = new Error('Chỉ Shop Owner mới có quyền thực hiện thao tác này');
    error.statusCode = 403;
    error.errorCode = 'FORBIDDEN';
    return next(error);
  }
  next();
};

router.use(authMiddleware);
router.use(requireShopOwner);

router.post('/', productController.createProduct);
router.put('/:id', productController.updateProduct);
router.delete('/:id', productController.deleteProduct);

export default router;