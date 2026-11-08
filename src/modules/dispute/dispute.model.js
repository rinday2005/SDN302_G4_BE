import mongoose from "mongoose";

const timelineItemSchema = new mongoose.Schema(
  {
    time: { type: String, default: "" },
    title: { type: String, required: true },
    desc: { type: String, default: "" },
    type: { type: String, enum: ["dispatch", "return", "claim", "dispute", "system"], default: "system" },
    highlight: { type: Boolean, default: false },
  },
  { _id: false }
);

const evidenceItemSchema = new mongoose.Schema(
  {
    tag: { type: String, default: "ĐỐI SOÁT" },
    badgeColor: { type: String, default: "#ba1a1a" },
    evidenceNumber: { type: String, default: "Evidence" },
    title: { type: String, required: true },
    desc: { type: String, default: "" },
    image: { type: String, default: "" },
    hash: { type: String, default: "SHA-256 A7B9..." },
    statusText: { type: String, default: "HỢP LỆ" },
  },
  { _id: false }
);

const dialogueItemSchema = new mongoose.Schema(
  {
    sender: { type: String, enum: ["SHOP", "CUSTOMER", "ADMIN"], required: true },
    senderName: { type: String, default: "" },
    senderRole: { type: String, default: "" },
    time: { type: String, default: "" },
    text: { type: String, required: true },
  },
  { _id: false }
);

const disputeSchema = new mongoose.Schema(
  {
    disputeCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    orderType: {
      type: String,
      enum: ["RENT", "THRIFT"],
      default: "RENT",
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "orderModel",
    },
    orderModel: {
      type: String,
      enum: ["RentalOrder", "ThriftOrder"],
      default: "RentalOrder",
    },
    orderCode: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["OPEN", "UNDER_REVIEW", "RESOLVED", "CLOSED"],
      default: "OPEN",
      index: true,
    },
    title: {
      type: String,
      required: true,
      default: "Khiếu nại khấu trừ cọc và chất lượng hiện vật sau hoàn trả",
    },
    categoryTag: {
      type: String,
      default: "RENT • DEPOSIT DISPUTE",
    },
    reason: {
      type: String,
      default: "",
    },
    slaDeadline: {
      type: String,
      default: "12:00 trưa hôm nay",
    },
    slaRemaining: {
      type: String,
      default: "SLA: CÒN 1H 45M",
    },
    labCode: {
      type: String,
      default: "LAB-TRIB-09",
    },
    escrowAmount: {
      type: Number,
      required: true,
      default: 0,
    },
    claimAmount: {
      type: Number,
      default: 0,
    },
    // Thông tin sản phẩm đối soát
    product: {
      id: { type: mongoose.Schema.Types.ObjectId, ref: "RentalProduct" },
      name: { type: String, required: true },
      image: { type: String, default: "" },
      sku: { type: String, default: "" },
      detail: { type: String, default: "" },
      rentalDuration: { type: String, default: "" },
      rentalFee: { type: Number, default: 0 },
      pricePerDay: { type: Number, default: 0 },
    },
    // Thông tin Người thuê (Renter)
    renter: {
      id: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      code: { type: String, default: "#USR-84192" },
      fullName: { type: String, required: true },
      email: { type: String, default: "" },
      phoneNumber: { type: String, default: "" },
      avatarUrl: { type: String, default: "" },
      trustScore: { type: String, default: "98.5%" },
      cleanOrdersText: { type: String, default: "14 đơn sạch, 0 vi phạm" },
      tier: { type: String, default: "Tier-2 Verified" },
      statement: { type: String, default: "" },
      statementTime: { type: String, default: "" },
      request: { type: String, default: "" },
    },
    // Thông tin Chủ Shop (Shop Owner)
    shopOwner: {
      id: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      code: { type: String, default: "#SHP-0418" },
      shopName: { type: String, required: true },
      representative: { type: String, default: "" },
      phoneNumber: { type: String, default: "" },
      rating: { type: String, default: "4.98 ★" },
      statsText: { type: String, default: "184 lượt thuê, tranh chấp 0.2%" },
      stationName: { type: String, default: "Trạm Hoàn Kiếm, HN" },
      stationDetail: { type: String, default: "Lab chuẩn quang học Cấp 1" },
      tier: { type: String, default: "Tier-3 Certified Partner" },
      claimStatement: { type: String, default: "" },
      claimTime: { type: String, default: "" },
      reportCode: { type: String, default: "RT-KHO-092" },
    },
    // Dòng thời gian đối soát
    timeline: [timelineItemSchema],
    // Bằng chứng đối soát phòng Lab
    evidences: [evidenceItemSchema],
    // Kết quả đo đạc giám định kỹ thuật (Bench Audit)
    benchAudit: {
      gaugePercent: { type: Number, default: 88 },
      gaugeLabel: { type: String, default: "Độ Nguyên Bản" },
      damageClassification: { type: String, default: "FAIR WEAR & TEAR" },
      title: { type: String, default: "Báo Cáo Phòng Kỹ Thuật ReUse Hub" },
      reportText: { type: String, default: "" },
      auditor: { type: String, default: "TECH-LAB-04" },
      conclusion: { type: String, default: "KHÔNG VI PHẠM" },
    },
    // Ngữ cảnh đối thoại 2 bên
    dialogue: [dialogueItemSchema],
    // Phán quyết của Trọng tài Admin
    arbitration: {
      selectedPreset: { type: String, default: "opt_1" },
      resolution: { type: String, default: "" },
      refundToRenter: { type: Number, default: 0 },
      payoutToShop: { type: Number, default: 0 },
      adminNotes: { type: String, default: "" },
      resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      resolvedAt: { type: Date },
      multiSigTxHash: { type: String, default: "" },
    },
  },
  {
    timestamps: true,
  }
);

// Virtual index
disputeSchema.index({ createdAt: -1 });

const Dispute = mongoose.models.Dispute || mongoose.model("Dispute", disputeSchema);

export default Dispute;

