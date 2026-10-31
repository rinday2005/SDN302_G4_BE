import { describe, it } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import {
  createReview,
  getProductReviews,
  getOrderReviews,
  getProductReviewsForAI,
} from "../../src/modules/review/review.service.js";
import Review from "../../src/modules/review/review.model.js";
import RentalOrder from "../../src/modules/rent/order/order.model.js";
import RentalProduct from "../../src/modules/rent/product/product.model.js";
import ThriftOrder from "../../src/modules/thrift/order/thriftOrder.model.js";
import ThriftListing from "../../src/modules/thrift/listing/thriftListing.model.js";
import User from "../../src/modules/user/user.model.js";

describe("[REVIEW] Unit Tests: Đánh giá & Bình luận sản phẩm RENT và THRIFT", () => {
  const dummyUserId = new mongoose.Types.ObjectId();
  const dummyRenterId = new mongoose.Types.ObjectId();
  const dummyBuyerId = new mongoose.Types.ObjectId();
  const dummyOtherUserId = new mongoose.Types.ObjectId();
  const dummyRentProdId = new mongoose.Types.ObjectId();
  const dummyThriftProdId = new mongoose.Types.ObjectId();
  const dummyRentOrderId = new mongoose.Types.ObjectId();
  const dummyThriftOrderId = new mongoose.Types.ObjectId();

  const mockUser = {
    _id: dummyUserId,
    fullName: "Nguyễn Văn Người Dùng",
    avatarUrl: "https://example.com/avatar.jpg",
    role: "USER",
  };

  describe("1. Đánh giá & Bình luận trực tiếp tại trang Chi tiết sản phẩm (Product Detail)", () => {
    it("Cho phép User viết đánh giá + comment + upload ảnh trên RENT Detail mà không cần orderId", async () => {
      const origUserFindById = User.findById;
      const origRentProdFindById = RentalProduct.findById;
      const origThriftFindById = ThriftListing.findById;
      const origRentOrderFindOne = RentalOrder.findOne;
      const origReviewCreate = Review.create;
      const origReviewFindById = Review.findById;

      User.findById = () => ({
        select: () => ({
          lean: async () => mockUser,
        }),
      });

      RentalProduct.findById = () => ({
        select: () => ({
          lean: async () => ({ _id: dummyRentProdId, name: "Máy ảnh Sony A7" }),
        }),
      });

      ThriftListing.findById = () => ({
        select: () => ({
          lean: async () => null,
        }),
      });

      RentalOrder.findOne = () => ({
        select: () => ({
          lean: async () => null,
        }),
      });

      let createdDoc = null;
      Review.create = async (doc) => {
        createdDoc = { ...doc, _id: new mongoose.Types.ObjectId() };
        return createdDoc;
      };

      Review.findById = (id) => ({
        populate: () => ({
          lean: async () => ({
            ...createdDoc,
            _id: id,
            userId: mockUser,
          }),
        }),
      });

      try {
        const result = await createReview({
          productId: dummyRentProdId,
          userId: dummyUserId,
          rating: 5,
          comment: "Thiết bị chụp cực nét, pin dùng cả ngày rất tốt!",
          images: ["https://res.cloudinary.com/demo/image1.jpg", "https://res.cloudinary.com/demo/image2.jpg"],
        });

        assert.ok(result);
        assert.strictEqual(result.rating, 5);
        assert.strictEqual(result.comment, "Thiết bị chụp cực nét, pin dùng cả ngày rất tốt!");
        assert.strictEqual(result.images.length, 2);
        assert.strictEqual(result.productType, "RENT");
        assert.strictEqual(result.source, "PRODUCT_DETAIL");
        assert.strictEqual(result.orderId, null);
      } finally {
        User.findById = origUserFindById;
        RentalProduct.findById = origRentProdFindById;
        ThriftListing.findById = origThriftFindById;
        RentalOrder.findOne = origRentOrderFindOne;
        Review.create = origReviewCreate;
        Review.findById = origReviewFindById;
      }
    });

    it("Cho phép User viết đánh giá + comment + upload ảnh trên THRIFT Detail mà không cần orderId", async () => {
      const origUserFindById = User.findById;
      const origRentProdFindById = RentalProduct.findById;
      const origThriftFindById = ThriftListing.findById;
      const origThriftOrderFindOne = ThriftOrder.findOne;
      const origReviewCreate = Review.create;
      const origReviewFindById = Review.findById;

      User.findById = () => ({
        select: () => ({
          lean: async () => mockUser,
        }),
      });

      RentalProduct.findById = () => ({
        select: () => ({
          lean: async () => null,
        }),
      });

      ThriftListing.findById = () => ({
        select: () => ({
          lean: async () => ({ _id: dummyThriftProdId, name: "Áo sơ mi Vintage Oxford" }),
        }),
      });

      ThriftOrder.findOne = () => ({
        select: () => ({
          lean: async () => null,
        }),
      });

      let createdDoc = null;
      Review.create = async (doc) => {
        createdDoc = { ...doc, _id: new mongoose.Types.ObjectId() };
        return createdDoc;
      };

      Review.findById = (id) => ({
        populate: () => ({
          lean: async () => ({
            ...createdDoc,
            _id: id,
            userId: mockUser,
          }),
        }),
      });

      try {
        const result = await createReview({
          productId: dummyThriftProdId,
          userId: dummyUserId,
          rating: 4,
          comment: "Áo chất vải đẹp, đúng mô tả thanh lý độc bản!",
          images: ["https://res.cloudinary.com/demo/thrift1.jpg"],
          productType: "THRIFT",
        });

        assert.ok(result);
        assert.strictEqual(result.rating, 4);
        assert.strictEqual(result.productType, "THRIFT");
        assert.strictEqual(result.source, "PRODUCT_DETAIL");
      } finally {
        User.findById = origUserFindById;
        RentalProduct.findById = origRentProdFindById;
        ThriftListing.findById = origThriftFindById;
        ThriftOrder.findOne = origThriftOrderFindOne;
        Review.create = origReviewCreate;
        Review.findById = origReviewFindById;
      }
    });

    it("Báo lỗi khi rating không phải số nguyên từ 1 đến 5", async () => {
      await assert.rejects(
        async () => {
          await createReview({
            productId: dummyRentProdId,
            userId: dummyUserId,
            rating: 6, // Vượt quá 5
            comment: "Rating sai",
          });
        },
        (err) => {
          assert.strictEqual(err.statusCode, 400);
          assert.strictEqual(err.errorCode, "INVALID_RATING");
          return true;
        }
      );
    });

    it("Báo lỗi khi gửi vượt quá 5 hình ảnh trong 1 đánh giá", async () => {
      const origUserFindById = User.findById;
      User.findById = () => ({
        select: () => ({
          lean: async () => mockUser,
        }),
      });

      try {
        await assert.rejects(
          async () => {
            await createReview({
              productId: dummyRentProdId,
              userId: dummyUserId,
              rating: 5,
              images: ["img1", "img2", "img3", "img4", "img5", "img6"], // 6 ảnh
            });
          },
          (err) => {
            assert.strictEqual(err.statusCode, 400);
            assert.strictEqual(err.errorCode, "TOO_MANY_IMAGES");
            return true;
          }
        );
      } finally {
        User.findById = origUserFindById;
      }
    });
  });

  describe("2. Đánh giá sau khi trả hàng thành công ở trang RENT ORDER", () => {
    it("Cho phép đánh giá khi đơn thuê ở trạng thái RETURNED hoặc COMPLETED", async () => {
      const origUserFindById = User.findById;
      const origRentOrderFindById = RentalOrder.findById;
      const origReviewFindOne = Review.findOne;
      const origReviewCreate = Review.create;
      const origReviewFindById = Review.findById;
      const origRentProdFindById = RentalProduct.findById;
      const origThriftFindById = ThriftListing.findById;

      User.findById = () => ({
        select: () => ({ lean: async () => mockUser }),
      });

      RentalProduct.findById = () => ({
        select: () => ({ lean: async () => ({ _id: dummyRentProdId }) }),
      });
      ThriftListing.findById = () => ({
        select: () => ({ lean: async () => null }),
      });

      const mockRentOrder = {
        _id: dummyRentOrderId,
        renterId: dummyUserId,
        status: "RETURNED", // Sau khi trả đồ thành công
        items: [
          {
            productId: dummyRentProdId,
            productName: "Sony A7",
          },
        ],
      };

      RentalOrder.findById = async () => mockRentOrder;
      Review.findOne = async () => null; // Chưa đánh giá

      let createdDoc = null;
      Review.create = async (doc) => {
        createdDoc = { ...doc, _id: new mongoose.Types.ObjectId() };
        return createdDoc;
      };

      Review.findById = (id) => ({
        populate: () => ({
          lean: async () => ({ ...createdDoc, _id: id, userId: mockUser }),
        }),
      });

      try {
        const result = await createReview({
          orderId: dummyRentOrderId,
          productId: dummyRentProdId,
          userId: dummyUserId,
          rating: 5,
          comment: "Đã hoàn tất trả hàng, cọc hoàn về ví siêu nhanh!",
        });

        assert.ok(result);
        assert.strictEqual(result.source, "RENT_ORDER");
        assert.strictEqual(result.isVerifiedPurchase, true);
        assert.strictEqual(result.orderId.toString(), dummyRentOrderId.toString());
      } finally {
        User.findById = origUserFindById;
        RentalOrder.findById = origRentOrderFindById;
        Review.findOne = origReviewFindOne;
        Review.create = origReviewCreate;
        Review.findById = origReviewFindById;
        RentalProduct.findById = origRentProdFindById;
        ThriftListing.findById = origThriftFindById;
      }
    });

    it("Bị từ chối khi đơn thuê chưa hoàn tất trả hàng (ví dụ đang RENTING)", async () => {
      const origUserFindById = User.findById;
      const origRentOrderFindById = RentalOrder.findById;
      const origReviewFindOne = Review.findOne;
      const origRentProdFindById = RentalProduct.findById;
      const origThriftFindById = ThriftListing.findById;

      User.findById = () => ({
        select: () => ({ lean: async () => mockUser }),
      });
      RentalProduct.findById = () => ({
        select: () => ({ lean: async () => ({ _id: dummyRentProdId }) }),
      });
      ThriftListing.findById = () => ({
        select: () => ({ lean: async () => null }),
      });

      RentalOrder.findById = async () => ({
        _id: dummyRentOrderId,
        renterId: dummyUserId,
        status: "RENTING", // Chưa trả hàng
        items: [{ productId: dummyRentProdId }],
      });
      Review.findOne = async () => null;

      try {
        await assert.rejects(
          async () => {
            await createReview({
              orderId: dummyRentOrderId,
              productId: dummyRentProdId,
              userId: dummyUserId,
              rating: 5,
              comment: "Đánh giá sớm",
            });
          },
          (err) => {
            assert.strictEqual(err.statusCode, 400);
            assert.strictEqual(err.errorCode, "ORDER_NOT_COMPLETED");
            return true;
          }
        );
      } finally {
        User.findById = origUserFindById;
        RentalOrder.findById = origRentOrderFindById;
        Review.findOne = origReviewFindOne;
        RentalProduct.findById = origRentProdFindById;
        ThriftListing.findById = origThriftFindById;
      }
    });

    it("Bị từ chối khi User đánh giá đơn của người khác -> 403 REVIEW_FORBIDDEN", async () => {
      const origUserFindById = User.findById;
      const origRentOrderFindById = RentalOrder.findById;
      const origReviewFindOne = Review.findOne;
      const origRentProdFindById = RentalProduct.findById;
      const origThriftFindById = ThriftListing.findById;

      User.findById = () => ({
        select: () => ({ lean: async () => mockUser }),
      });
      RentalProduct.findById = () => ({
        select: () => ({ lean: async () => ({ _id: dummyRentProdId }) }),
      });
      ThriftListing.findById = () => ({
        select: () => ({ lean: async () => null }),
      });

      RentalOrder.findById = async () => ({
        _id: dummyRentOrderId,
        renterId: dummyOtherUserId, // Đơn của người khác
        status: "COMPLETED",
        items: [{ productId: dummyRentProdId }],
      });
      Review.findOne = async () => null;

      try {
        await assert.rejects(
          async () => {
            await createReview({
              orderId: dummyRentOrderId,
              productId: dummyRentProdId,
              userId: dummyUserId,
              rating: 5,
            });
          },
          (err) => {
            assert.strictEqual(err.statusCode, 403);
            assert.strictEqual(err.errorCode, "REVIEW_FORBIDDEN");
            return true;
          }
        );
      } finally {
        User.findById = origUserFindById;
        RentalOrder.findById = origRentOrderFindById;
        Review.findOne = origReviewFindOne;
        RentalProduct.findById = origRentProdFindById;
        ThriftListing.findById = origThriftFindById;
      }
    });
  });

  describe("3. Đánh giá sau khi nhận hàng thành công ở trang THRIFT ORDER", () => {
    it("Cho phép đánh giá khi đơn thanh lý ở trạng thái DELIVERED hoặc COMPLETED", async () => {
      const origUserFindById = User.findById;
      const origThriftOrderFindById = ThriftOrder.findById;
      const origReviewFindOne = Review.findOne;
      const origReviewCreate = Review.create;
      const origReviewFindById = Review.findById;
      const origRentProdFindById = RentalProduct.findById;
      const origThriftFindById = ThriftListing.findById;

      User.findById = () => ({
        select: () => ({ lean: async () => mockUser }),
      });
      RentalProduct.findById = () => ({
        select: () => ({ lean: async () => null }),
      });
      ThriftListing.findById = () => ({
        select: () => ({ lean: async () => ({ _id: dummyThriftProdId }) }),
      });

      const mockThriftOrder = {
        _id: dummyThriftOrderId,
        buyerId: dummyUserId,
        status: "DELIVERED", // Sau khi nhận hàng thành công
        items: [
          {
            listingId: dummyThriftProdId,
            name: "Áo khoác Vintage",
          },
        ],
      };

      ThriftOrder.findById = async () => mockThriftOrder;
      Review.findOne = async () => null;

      let createdDoc = null;
      Review.create = async (doc) => {
        createdDoc = { ...doc, _id: new mongoose.Types.ObjectId() };
        return createdDoc;
      };

      Review.findById = (id) => ({
        populate: () => ({
          lean: async () => ({ ...createdDoc, _id: id, userId: mockUser }),
        }),
      });

      try {
        const result = await createReview({
          orderId: dummyThriftOrderId,
          productId: dummyThriftProdId,
          userId: dummyUserId,
          rating: 5,
          comment: "Đã nhận hàng thành công, đóng gói hộp Nanuk cẩn thận!",
          productType: "THRIFT",
        });

        assert.ok(result);
        assert.strictEqual(result.source, "THRIFT_ORDER");
        assert.strictEqual(result.isVerifiedPurchase, true);
        assert.strictEqual(result.orderType, "THRIFT");
      } finally {
        User.findById = origUserFindById;
        ThriftOrder.findById = origThriftOrderFindById;
        Review.findOne = origReviewFindOne;
        Review.create = origReviewCreate;
        Review.findById = origReviewFindById;
        RentalProduct.findById = origRentProdFindById;
        ThriftListing.findById = origThriftFindById;
      }
    });

    it("Bị từ chối khi đơn thanh lý chưa nhận hàng (ví dụ đang SHIPPING)", async () => {
      const origUserFindById = User.findById;
      const origThriftOrderFindById = ThriftOrder.findById;
      const origReviewFindOne = Review.findOne;
      const origRentProdFindById = RentalProduct.findById;
      const origThriftFindById = ThriftListing.findById;

      User.findById = () => ({
        select: () => ({ lean: async () => mockUser }),
      });
      RentalProduct.findById = () => ({
        select: () => ({ lean: async () => null }),
      });
      ThriftListing.findById = () => ({
        select: () => ({ lean: async () => ({ _id: dummyThriftProdId }) }),
      });

      ThriftOrder.findById = async () => ({
        _id: dummyThriftOrderId,
        buyerId: dummyUserId,
        status: "SHIPPING", // Đang giao, chưa nhận hàng
        items: [{ listingId: dummyThriftProdId }],
      });
      Review.findOne = async () => null;

      try {
        await assert.rejects(
          async () => {
            await createReview({
              orderId: dummyThriftOrderId,
              productId: dummyThriftProdId,
              userId: dummyUserId,
              rating: 5,
              productType: "THRIFT",
            });
          },
          (err) => {
            assert.strictEqual(err.statusCode, 400);
            assert.strictEqual(err.errorCode, "ORDER_NOT_DELIVERED");
            return true;
          }
        );
      } finally {
        User.findById = origUserFindById;
        ThriftOrder.findById = origThriftOrderFindById;
        Review.findOne = origReviewFindOne;
        RentalProduct.findById = origRentProdFindById;
        ThriftListing.findById = origThriftFindById;
      }
    });
  });

  describe("4. Phân tích dữ liệu Đánh giá phục vụ AI (AI Review Analytics)", () => {
    it("Tổng hợp đầy đủ thống kê sao, tỷ lệ cảm xúc và câu trích dẫn cho AI phân tích", async () => {
      const origRentProdFindById = RentalProduct.findById;
      const origReviewFind = Review.find;
      const origReviewAgg = Review.aggregate;

      RentalProduct.findById = () => ({
        select: () => ({ lean: async () => ({ _id: dummyRentProdId }) }),
      });

      Review.find = () => ({
        select: () => ({
          populate: () => ({
            sort: () => ({
              limit: () => ({
                lean: async () => [
                  {
                    rating: 5,
                    comment: "Máy hoạt động xuất sắc",
                    userId: { fullName: "Khách 1" },
                    isVerifiedPurchase: true,
                    images: ["img1.jpg"],
                    createdAt: new Date(),
                  },
                  {
                    rating: 4,
                    comment: "Rất ổn áp",
                    userId: { fullName: "Khách 2" },
                    isVerifiedPurchase: false,
                    images: [],
                    createdAt: new Date(),
                  },
                ],
              }),
            }),
          }),
        }),
      });

      Review.aggregate = async () => [
        {
          _id: null,
          avgRating: 4.5,
          total: 2,
          positive: 2,
          neutral: 0,
          negative: 0,
        },
      ];

      try {
        const aiData = await getProductReviewsForAI(dummyRentProdId, "RENT");

        assert.ok(aiData);
        assert.strictEqual(aiData.summary.averageRating, 4.5);
        assert.strictEqual(aiData.summary.totalReviews, 2);
        assert.strictEqual(aiData.summary.sentimentDistribution.positivePercent, 100);
        assert.strictEqual(aiData.sampleComments.length, 2);
        assert.ok(aiData.aiPromptContext.includes("4.5/5"));
      } finally {
        RentalProduct.findById = origRentProdFindById;
        Review.find = origReviewFind;
        Review.aggregate = origReviewAgg;
      }
    });
  });
});
