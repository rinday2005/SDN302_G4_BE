import { Router } from "express";
import authMiddleware from "../../middleware/auth.middleware.js";
import {
  groupCheckoutController,
  getOrderGroupByIdController,
  getUserOrderGroupsController,
} from "./orderGroup.controller.js";

const orderGroupRouter = Router();

orderGroupRouter.use(authMiddleware);

// POST /api/orders/group-checkout
orderGroupRouter.post("/group-checkout", groupCheckoutController);

// GET /api/orders/group
orderGroupRouter.get("/group", getUserOrderGroupsController);

// GET /api/orders/group/:id
orderGroupRouter.get("/group/:id", getOrderGroupByIdController);

export default orderGroupRouter;

