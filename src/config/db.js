import mongoose from "mongoose";
import bcrypt from "bcrypt";
import { MONGO_URI } from "./env.js";
import User from "../modules/user/user.model.js";
import Cart from "../modules/cart/cart.model.js";
import Wishlist from "../modules/wishlist/wishlist.model.js";
import RentalProduct from "../modules/rent/product/product.model.js";
import RentalOrder from "../modules/rent/order/order.model.js";
import ThriftListing from "../modules/thrift/listing/thriftListing.model.js";
import { normalizeShopBranch, SHOP_BRANCHES, calculateShippingFee } from "../utils/shipping.js";

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

    // 1. Ensure single SHOP_OWNER exists
    let shopOwner = await User.findOne({ role: "SHOP_OWNER" });
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
              province: "Hồ Chí Minh",
              district: "Quận 1",
              ward: "Bến Nghé",
              detail: "123 Lê Lợi, Phường Bến Nghé",
            },
          },
        },
        { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
      );
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

    // 3. If connected to Atlas (mongodb+srv), attempt non-blocking sync of users from local MongoDB
    if (MONGO_URI && MONGO_URI.startsWith("mongodb+srv://")) {
      const localDbNames = ["reuse_hub", "reuse-hub"];
      for (const dbName of localDbNames) {
        let localConn = null;
        try {
          localConn = await mongoose
            .createConnection(`mongodb://127.0.0.1:27017/${dbName}`, {
              serverSelectionTimeoutMS: 1200,
            })
            .asPromise();

          const localUsers = await localConn.db
            .collection("users")
            .find({})
            .toArray();

          for (const lu of localUsers) {
            if (!lu.email) continue;
            const normalizedEmail = String(lu.email).toLowerCase().trim();
            const existing = await User.findOne({ email: normalizedEmail });
            if (!existing) {
              const roleToAssign =
                lu.role === "SHOP_OWNER" && shopOwner
                  ? "USER"
                  : lu.role || "USER";
              await User.create({
                email: normalizedEmail,
                passwordHash: lu.passwordHash || defaultPasswordHash,
                fullName: lu.fullName || normalizedEmail.split("@")[0],
                phoneNumber: lu.phoneNumber || "0901234567",
                role: roleToAssign,
                kycStatus: lu.kycStatus || "APPROVED",
                avatarUrl: lu.avatarUrl || null,
                address: lu.address || null,
                walletBalance: Number(lu.walletBalance) || 0,
              });
            }
          }
        } catch {
          // Local MongoDB not running or unreachable; safely ignore
        } finally {
          if (localConn) {
            try {
              await localConn.close();
            } catch {
              // ignore
            }
          }
        }
      }
    }

    // 4. Strictly enforce 1 User = 1 Cart & 1 Wishlist in MongoDB
    await syncUserCartsAndWishlists();

    // 5. Chuẩn hóa chi nhánh sản phẩm (RENT & THRIFT) về 3 chi nhánh: Đà Nẵng, Hà Nội, TP. Hồ Chí Minh
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
    await syncLocalUsersAndEnsureDefaults();
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    throw error;
  }
};

export default connectDB;
