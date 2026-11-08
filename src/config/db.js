import mongoose from "mongoose";
import bcrypt from "bcrypt";
import { MONGO_URI } from "./env.js";
import User from "../modules/user/user.model.js";
import Cart from "../modules/cart/cart.model.js";
import Wishlist from "../modules/wishlist/wishlist.model.js";
import RentalProduct from "../modules/rent/product/product.model.js";
import RentalOrder from "../modules/rent/order/order.model.js";
import ThriftListing from "../modules/thrift/listing/thriftListing.model.js";
import KycRecord from "../modules/kyc/kyc.model.js";
import { normalizeShopBranch, SHOP_BRANCHES, calculateShippingFee } from "../utils/shipping.js";
import { ensureSampleDisputes } from "../modules/dispute/dispute.seed.js";

export const syncUserCartsAndWishlists = async () => {
  const allUsers = await User.find({}).select("_id").lean();
  const validUserIds = allUsers.map((u) => u._id);

  // 1. Xóa các cart và wishlist mồ côi (userId không còn tồn tại trong collection users hoặc bị null)
  await Promise.all([
    Cart.deleteMany({ userId: { $nin: validUserIds } }),
    Wishlist.deleteMany({ userId: { $nin: validUserIds } }),
  ]);

  // 2. Đảm bảo mỗi user chỉ có đúng 1 Cart và 1 Wishlist (khử trùng lặp nếu có và khởi tạo nếu thiếu)
  for (const u of allUsers) {
    const userCarts = await Cart.find({ userId: u._id }).sort({ updatedAt: -1 }).lean();
    if (userCarts.length > 1) {
      const duplicateCartIds = userCarts.slice(1).map((c) => c._id);
      await Cart.deleteMany({ _id: { $in: duplicateCartIds } });
    } else if (userCarts.length === 0) {
      await Cart.findOneAndUpdate(
        { userId: u._id },
        { $setOnInsert: { userId: u._id, rentItems: [], thriftItems: [] } },
        { upsert: true }
      );
    }

    const userWishlists = await Wishlist.find({ userId: u._id }).sort({ updatedAt: -1 }).lean();
    if (userWishlists.length > 1) {
      const duplicateWishlistIds = userWishlists.slice(1).map((w) => w._id);
      await Wishlist.deleteMany({ _id: { $in: duplicateWishlistIds } });
    } else if (userWishlists.length === 0) {
      await Wishlist.findOneAndUpdate(
        { userId: u._id },
        { $setOnInsert: { userId: u._id, items: [] } },
        { upsert: true }
      );
    }
  }

  console.log(
    `[DB Sync] 1 User - 1 Cart - 1 Wishlist verified for all ${allUsers.length} users`
  );
};

const syncLocalUsersAndEnsureDefaults = async () => {
  try {
    const defaultPasswordHash = await bcrypt.hash("Password123!", 10);

    // 1. Ensure single SHOP_OWNER exists and is KYC verified
    let shopOwner = (await User.findOne({ email: "shopowner@reuse.vn" })) || (await User.findOne({ role: "SHOP_OWNER" }));
    if (!shopOwner) {
      shopOwner = await User.findOneAndUpdate(
        { email: "shopowner@reuse.vn" },
        {
          $setOnInsert: {
            email: "shopowner@reuse.vn",
            passwordHash: defaultPasswordHash,
            fullName: "ReUse Official Shop",
            phoneNumber: "0901234567",
            role: "SHOP_OWNER",
            kycStatus: "APPROVED",
            address: {
              province: "Thành phố Đà Nẵng",
              district: "Quận Hải Châu",
              ward: "Phường Hải Châu 1",
              detail: "48 Bạch Đằng",
            },
          },
        },
        { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
      );
    }
    if (shopOwner) {
      const existingKyc = await KycRecord.findOne({ userId: shopOwner._id });
      if (!existingKyc) {
        await KycRecord.create({
          userId: shopOwner._id,
          fullName: shopOwner.fullName || "ReUse Official Shop",
          idCardNumber: "048096001234",
          frontImageUrl: "https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=500&auto=format&fit=crop&q=80",
          backImageUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=500&auto=format&fit=crop&q=80",
          dob: "1990-01-15",
          residentAddress: "Quận Hải Châu, TP. Đà Nẵng",
          status: "APPROVED",
        });
      }
    }

    // 2. Ensure core ADMIN and sample USER accounts exist
    const coreUsers = [
      {
        email: "admin@reuse.vn",
        passwordHash: defaultPasswordHash,
        fullName: "System Admin",
        phoneNumber: "0909999999",
        role: "ADMIN",
        kycStatus: "APPROVED",
      },
      {
        email: "user@reuse.vn",
        passwordHash: defaultPasswordHash,
        fullName: "Khách hàng mẫu",
        phoneNumber: "0988776655",
        role: "USER",
        kycStatus: "APPROVED",
        address: {
          province: "Hồ Chí Minh",
          district: "Quận 3",
          ward: "Võ Thị Sáu",
          detail: "456 Nam Kỳ Khởi Nghĩa",
        },
      },
      {
        email: "hon@gmail.com",
        passwordHash: defaultPasswordHash,
        fullName: "Nguyễn Hơn",
        phoneNumber: "0987364578",
        role: "USER",
        kycStatus: "APPROVED",
        address: {
          province: "Thành phố Đà Nẵng",
          district: "Quận Hải Châu",
          ward: "Phường Hải Châu 1",
          detail: "48 Bạch Đằng",
        },
      },
    ];

    for (const item of coreUsers) {
      await User.findOneAndUpdate(
        { email: item.email },
        { $setOnInsert: item },
        { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
      );
    }

    // 3. Strictly enforce 1 User = 1 Cart & 1 Wishlist in MongoDB
    await syncUserCartsAndWishlists();

    // 4. Chuẩn hóa chi nhánh sản phẩm (RENT & THRIFT) về 3 chi nhánh: Đà Nẵng, Hà Nội, TP. Hồ Chí Minh
    const allRentOrders = await RentalOrder.find({}).populate("items.productId", "location").lean();
    for (const ro of allRentOrders) {
      const firstItem = Array.isArray(ro.items) ? ro.items[0] : null;
      const prodLoc = firstItem && typeof firstItem.productId === "object" && firstItem.productId !== null ? firstItem.productId.location : firstItem?.location;
      const branch = normalizeShopBranch(prodLoc || "Đà Nẵng");
      const custProv = ro.shippingAddress?.province || ro.shippingAddress?.detail || "Đà Nẵng";
      let expectedShip = 25000;
      try { expectedShip = calculateShippingFee(branch, custProv); } catch { expectedShip = 35000; }
      const rFee = Number(ro.rentalFee) || 0;
      const dFee = Number(ro.depositAmount) || 0;
      if (rFee > 0 || dFee > 0) {
        const expectedTotal = rFee + dFee + expectedShip;
        if (ro.shippingFee !== expectedShip || ro.totalAmount !== expectedTotal) {
          await RentalOrder.updateOne({ _id: ro._id }, { $set: { shippingFee: expectedShip, totalAmount: expectedTotal } });
        }
      }
    }

    const [rentDocs, thriftDocs] = await Promise.all([
      RentalProduct.find({ location: { $nin: SHOP_BRANCHES } }).select("_id location").lean(),
      ThriftListing.find({ location: { $nin: SHOP_BRANCHES } }).select("_id location").lean(),
    ]);

    for (const rp of rentDocs) {
      await RentalProduct.updateOne(
        { _id: rp._id },
        { $set: { location: normalizeShopBranch(rp.location) } }
      );
    }
    for (const tl of thriftDocs) {
      await ThriftListing.updateOne(
        { _id: tl._id },
        { $set: { location: normalizeShopBranch(tl.location) } }
      );
    }
  } catch (err) {
    console.warn("User bootstrap warning:", err.message);
  }
};

const connectDB = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("MongoDB connected");
    // Run maintenance & bootstrap in background without delaying server listening
    syncLocalUsersAndEnsureDefaults().catch((err) => {
      console.warn("User bootstrap warning:", err.message);
    });
    ensureSampleDisputes().catch((err) => {
      console.warn("Dispute collection init warning:", err.message);
    });
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    throw error;
  }
};

export default connectDB;
