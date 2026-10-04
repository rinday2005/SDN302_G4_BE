import { register, login, logout } from "./auth.service.js";
import { successResponse } from "../../utils/response.js";

const registerController = async (req, res, next) => {
  try {
    const result = await register(req.body);

    return successResponse(
      res,
      "Register successful",
      result,
      201
    );
  } catch (error) {
    next(error);
  }
};

const loginController = async (req, res, next) => {
  try {
    const result = await login(req.body);

    return successResponse(
      res,
      "Login successful",
      result
    );
  } catch (error) {
    next(error);
  }
};

const logoutController = async (req, res, next) => {
  try {
    const result = await logout();

    return successResponse(
      res,
      result.message,
      null
    );
  } catch (error) {
    next(error);
  }
};

export {
  registerController,
  loginController,
  logoutController,
};