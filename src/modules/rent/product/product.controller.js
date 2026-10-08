import {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
} from "./product.service.js";
import { successResponse } from "../../../utils/response.js";

const getProductsController = async (req, res, next) => {
  try {
    const result = await getProducts(req.query);
    return successResponse(res, "Products retrieved successfully", result);
  } catch (error) {
    next(error);
  }
};

const getProductByIdController = async (req, res, next) => {
  try {
    const product = await getProductById(req.params.id);
    return successResponse(res, "Product retrieved successfully", product);
  } catch (error) {
    next(error);
  }
};

const createProductController = async (req, res, next) => {
  try {
    const product = await createProduct(req.body);
    return successResponse(res, "Product created successfully", product, 201);
  } catch (error) {
    next(error);
  }
};

const updateProductController = async (req, res, next) => {
  try {
    const product = await updateProduct(req.params.id, req.body);
    return successResponse(res, "Product updated successfully", product);
  } catch (error) {
    next(error);
  }
};

const deleteProductController = async (req, res, next) => {
  try {
    const product = await deleteProduct(req.params.id);
    return successResponse(res, "Product deleted successfully", product);
  } catch (error) {
    next(error);
  }
};

export {
  getProductsController,
  getProductByIdController,
  createProductController,
  updateProductController,
  deleteProductController,
};
