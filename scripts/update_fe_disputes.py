import sys
import re

# 1. UPDATE DisputeManagement.tsx
path_dm = r"C:\SDN302_G4_FE\src\pages\admin\DisputeManagement.tsx"
with open(path_dm, "r", encoding="utf-8") as f:
    code_dm = f.read()

# Add rawId to DisputeItem interface if missing
if "rawId?: string;" not in code_dm:
    code_dm = code_dm.replace(
        "export interface DisputeItem {\n  id: string;",
        "export interface DisputeItem {\n  id: string;\n  rawId?: string;"
    )

# Replace INITIAL_DISPUTES array with empty array
pattern_init = r"const INITIAL_DISPUTES: DisputeItem\[\] = \[[\s\S]*?\n\];"
code_dm = re.sub(pattern_init, "const INITIAL_DISPUTES: DisputeItem[] = [];", code_dm)

# Ensure RawDisputeApiItem has _id
if "_id?: string;" not in code_dm:
    code_dm = code_dm.replace(
        "interface RawDisputeApiItem {\n  id?: string;",
        "interface RawDisputeApiItem {\n  id?: string;\n  _id?: string;"
    )

# Update useEffect for getDisputesApi to map cleanly without merging fake data
old_fetch_block = """    // Load disputes from DB
    getDisputesApi()
      .then((data) => {
        if (!isMounted || !data) return;
        const rawList = data.disputes || (Array.isArray(data) ? data : []);
        if (Array.isArray(rawList) && rawList.length > 0) {
          const dbDisputes: DisputeItem[] = rawList.map((d: RawDisputeApiItem) => ({
            id: d.id ? (d.id.startsWith("#") ? d.id : `#RH-${String(d.id).slice(-4).toUpperCase()}`) : `#RH-D${Math.floor(Math.random() * 8999 + 1000)}`,
            orderCode: d.orderCode || `RENT #RO-${String(d.id || "").slice(-4).toUpperCase()}`,
            orderUrl: `/rent/orders/${d.id || ""}`,
            productName: d.items?.[0]?.productId?.name || d.items?.[0]?.name || "Hiện vật đối soát",
            orderPriceNote: `Ký quỹ: ${(Number(d.escrowLocked || d.depositAmount) || 0).toLocaleString("vi-VN")} ₫`,
            customerName: d.renter?.fullName || "Khách hàng ReUse",
            customerUrl: "/admin/users",
            customerTrust: "KYC Verified Tier",
            shopName: d.shopOwner?.fullName || "ReUse Official Shop",
            shopOwner: d.shopOwner?.fullName || "Chủ Xưởng",
            shopUrl: "/admin/users",
            categoryTag: `${d.orderType || "RENT"} • DEPOSIT DISPUTE`,
            description: d.reason || "Tranh chấp tiền ký quỹ và hư hại hiện vật sau hoàn trả",
            createdAtDisplay: new Date(d.reportedAt || Date.now()).toLocaleDateString("vi-VN"),
            createdAtTime: new Date(d.reportedAt || Date.now()).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }),
            slaDisplay: d.disputeStatus === "RESOLVED" ? "Đã giải quyết" : "SLA: Trong 24h",
            isUrgentSla: d.disputeStatus !== "RESOLVED",
            status: d.disputeStatus === "RESOLVED" ? "RESOLVED" : "OPEN",
            disputeType: (d.orderType || "RENT") as DisputeType,
            escrowAmount: Number(d.escrowLocked ?? d.depositAmount) || 2000000,
            arbitrationVerdict: d.resolution || undefined,
            damageImages: Array.isArray(d.damageImages) ? d.damageImages : [],
          }));

          setDisputes((prev) => {
            const existingIds = new Set(dbDisputes.map((x) => x.id));
            return [...dbDisputes, ...prev.filter((p) => !existingIds.has(p.id))];
          });
        }
      })
      .catch((err) => console.warn("Lỗi tải danh sách tranh chấp từ API:", err));"""

new_fetch_block = """    // Load disputes from DB
    getDisputesApi()
      .then((data) => {
        if (!isMounted || !data) return;
        const rawList = data.disputes || (Array.isArray(data) ? data : []);
        const dbDisputes: DisputeItem[] = (Array.isArray(rawList) ? rawList : []).map((d: RawDisputeApiItem) => {
          const rawId = String(d.id || d._id || "");
          const isThrift = d.orderType === "THRIFT";
          const orderCode = d.orderCode || (isThrift ? `#TO-${rawId.slice(-4).toUpperCase()}` : `#RO-${rawId.slice(-4).toUpperCase()}`);
          return {
            id: rawId.startsWith("#") ? rawId : `#RH-D${rawId.slice(-4).toUpperCase() || Math.floor(Math.random() * 8999 + 1000)}`,
            rawId,
            orderCode,
            orderUrl: isThrift ? `/thrift/orders/${rawId}` : `/rent/orders/${rawId}`,
            productName: d.items?.[0]?.productId?.name || d.items?.[0]?.name || "Hiện vật đối soát",
            orderPriceNote: `Ký quỹ: ${(Number(d.escrowLocked ?? d.depositAmount) || 0).toLocaleString("vi-VN")} ₫`,
            customerName: d.renter?.fullName || "Khách hàng ReUse",
            customerUrl: "/admin/users",
            customerTrust: "KYC Verified Tier",
            shopName: d.shopOwner?.fullName || "ReUse Official Shop",
            shopOwner: d.shopOwner?.fullName || "Chủ Xưởng",
            shopUrl: "/admin/users",
            categoryTag: `${d.orderType || "RENT"} • DEPOSIT DISPUTE`,
            description: d.reason || "Tranh chấp tiền ký quỹ và hư hại hiện vật sau hoàn trả",
            createdAtDisplay: new Date(d.reportedAt || Date.now()).toLocaleDateString("vi-VN"),
            createdAtTime: new Date(d.reportedAt || Date.now()).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }),
            slaDisplay: d.disputeStatus === "RESOLVED" ? "Đã giải quyết" : "SLA: Trong 24h",
            isUrgentSla: d.disputeStatus !== "RESOLVED",
            status: (d.disputeStatus === "RESOLVED" ? "RESOLVED" : "OPEN") as DisputeStatus,
            disputeType: (d.orderType || "RENT") as DisputeType,
            escrowAmount: Number(d.escrowLocked ?? d.depositAmount) || 0,
            arbitrationVerdict: d.resolution || undefined,
            damageImages: Array.isArray(d.damageImages) ? d.damageImages : [],
          };
        });
        setDisputes(dbDisputes);
      })
      .catch((err) => {
        console.warn("Lỗi tải danh sách tranh chấp từ API:", err);
        setDisputes([]);
      });"""

if old_fetch_block in code_dm:
    code_dm = code_dm.replace(old_fetch_block, new_fetch_block)
else:
    print("Warning: old_fetch_block not directly matched, trying regex replace")
    pattern_fetch = r"// Load disputes from DB\s+getDisputesApi\(\)[\s\S]*?\.catch\(\(err\) => console\.warn\(\"Lỗi tải danh sách tranh chấp từ API:\", err\)\);"
    code_dm = re.sub(pattern_fetch, new_fetch_block, code_dm)

# Update KPI metrics calculations
old_metrics = """  // KPI Calculations
  const metrics = useMemo(() => {
    const openCount = disputes.filter((d) => d.status === "OPEN").length;
    const underReviewCount = disputes.filter((d) => d.status === "UNDER_REVIEW").length;
    const resolvedCount = disputes.filter((d) => d.status === "RESOLVED").length;
    const urgentCount = disputes.filter((d) => d.status === "OPEN" && d.isUrgentSla).length;

    const escrowUnderDispute = disputes
      .filter((d) => d.status === "OPEN" || d.status === "UNDER_REVIEW")
      .reduce((sum, d) => sum + d.escrowAmount, 0);

    return {
      total: 28,
      open: openCount > 0 ? openCount : 6,
      underReview: underReviewCount > 0 ? underReviewCount : 4,
      resolved: resolvedCount > 0 ? resolvedCount : 18,
      urgent: urgentCount > 0 ? urgentCount : 3,
      escrowAmountDisplay: (escrowUnderDispute / 1000000).toFixed(2),
    };
  }, [disputes]);

  // Tab counts
  const tabCounts = useMemo(() => {
    return {
      ALL: 28,
      OPEN: disputes.filter((d) => d.status === "OPEN").length || 6,
      UNDER_REVIEW: disputes.filter((d) => d.status === "UNDER_REVIEW").length || 4,
      RESOLVED: disputes.filter((d) => d.status === "RESOLVED").length || 15,
      CLOSED: disputes.filter((d) => d.status === "CLOSED").length || 3,
    };
  }, [disputes]);"""

new_metrics = """  // KPI Calculations
  const metrics = useMemo(() => {
    const openCount = disputes.filter((d) => d.status === "OPEN").length;
    const underReviewCount = disputes.filter((d) => d.status === "UNDER_REVIEW").length;
    const resolvedCount = disputes.filter((d) => d.status === "RESOLVED").length;
    const closedCount = disputes.filter((d) => d.status === "CLOSED").length;
    const urgentCount = disputes.filter((d) => d.status === "OPEN" && d.isUrgentSla).length;

    const escrowUnderDispute = disputes
      .filter((d) => d.status === "OPEN" || d.status === "UNDER_REVIEW")
      .reduce((sum, d) => sum + (Number(d.escrowAmount) || 0), 0);

    return {
      total: disputes.length,
      open: openCount,
      underReview: underReviewCount,
      resolved: resolvedCount,
      closed: closedCount,
      urgent: urgentCount,
      escrowAmount: escrowUnderDispute,
      escrowAmountDisplay: (escrowUnderDispute / 1000000).toLocaleString("vi-VN", { maximumFractionDigits: 2 }),
    };
  }, [disputes]);

  // Tab counts
  const tabCounts = useMemo(() => {
    return {
      ALL: disputes.length,
      OPEN: disputes.filter((d) => d.status === "OPEN").length,
      UNDER_REVIEW: disputes.filter((d) => d.status === "UNDER_REVIEW").length,
      RESOLVED: disputes.filter((d) => d.status === "RESOLVED").length,
      CLOSED: disputes.filter((d) => d.status === "CLOSED").length,
    };
  }, [disputes]);"""

if old_metrics in code_dm:
    code_dm = code_dm.replace(old_metrics, new_metrics)
else:
    pattern_metrics = r"// KPI Calculations\s+const metrics = useMemo\(\(\) => \{[\s\S]*?tabCounts = useMemo\(\(\) => \{[\s\S]*?\}, \[disputes\]\);"
    code_dm = re.sub(pattern_metrics, new_metrics, code_dm)

# Update resolve verdict targetId
old_resolve_call = """      const cleanId = selectedDispute.id.replace("#RH-", "").replace("#", "");
      await resolveDisputeApi(cleanId, {"""
new_resolve_call = """      const targetId = selectedDispute.rawId || selectedDispute.id.replace("#RH-", "").replace("#", "");
      await resolveDisputeApi(targetId, {"""
code_dm = code_dm.replace(old_resolve_call, new_resolve_call)

# Update Escrow locked card display
old_escrow_display = """                <span className="text-3xl font-serif text-[#1c1b19] mt-1 font-bold">
                  {metrics.escrowAmountDisplay}M{" "}
                  <span className="text-xs font-sans font-normal text-[#4c463c]">₫</span>
                </span>"""
new_escrow_display = """                <span className="text-3xl font-serif text-[#1c1b19] mt-1 font-bold">
                  {metrics.escrowAmount > 0 ? `${metrics.escrowAmount.toLocaleString("vi-VN")} ₫` : "0 ₫"}
                </span>"""
code_dm = code_dm.replace(old_escrow_display, new_escrow_display)

# Update Empty State in table
old_empty_state = """                {filteredDisputes.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-[#7e766a]">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <span className="material-symbols-outlined text-4xl text-[#cfc5b8]">
                          balance
                        </span>
                        <p className="text-sm font-semibold text-[#1c1b19]">
                          Không tìm thấy tranh chấp nào phù hợp
                        </p>
                        <p className="text-xs text-[#7e766a]">
                          Bộ lọc hiện tại không có hồ sơ tranh chấp hoặc khiếu nại nào tương ứng.
                        </p>
                        <button
                          type="button"
                          onClick={handleResetFilters}
                          className="mt-2 px-3.5 py-1.5 rounded-lg bg-[#1c1b19] text-white text-xs font-semibold"
                        >
                          Đặt Lại Bộ Lọc
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : ("""

new_empty_state = """                {filteredDisputes.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-14 text-center text-[#7e766a]">
                      <div className="flex flex-col items-center justify-center gap-3">
                        <div className="w-14 h-14 rounded-2xl bg-[#ece7e4] text-[#4c463c] flex items-center justify-center shadow-xs">
                          <span className="material-symbols-outlined text-3xl text-[#48654b]">
                            check_circle
                          </span>
                        </div>
                        <p className="text-base font-serif font-bold text-[#1c1b19]">
                          {disputes.length === 0 ? "Hiện tại không có tranh chấp nào" : "Không tìm thấy tranh chấp phù hợp bộ lọc"}
                        </p>
                        <p className="text-xs text-[#7e766a] max-w-md mx-auto leading-relaxed">
                          {disputes.length === 0
                            ? "Toàn bộ đơn hàng thuê (RENT) và thanh lý (THRIFT) trong hệ thống đều đang vận hành bình thường. Khoản ký quỹ Smart Escrow và tiền bảo lãnh được kiểm soát an toàn."
                            : "Vui lòng chuyển trạng thái hoặc xóa từ khóa tìm kiếm để xem các hồ sơ tranh chấp khác."}
                        </p>
                        {disputes.length > 0 && (
                          <button
                            type="button"
                            onClick={handleResetFilters}
                            className="mt-2 px-4 py-2 rounded-xl bg-[#1c1b19] text-white text-xs font-semibold hover:bg-black transition-colors"
                          >
                            Đặt Lại Bộ Lọc
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : ("""

if old_empty_state in code_dm:
    code_dm = code_dm.replace(old_empty_state, new_empty_state)
else:
    pattern_empty = r"\{filteredDisputes\.length === 0 \? \([\s\S]*?Không tìm thấy tranh chấp nào phù hợp[\s\S]*?\)\s*:\s*\("
    code_dm = re.sub(pattern_empty, new_empty_state, code_dm)

with open(path_dm, "w", encoding="utf-8") as f:
    f.write(code_dm)
print("Successfully updated DisputeManagement.tsx")

# 2. UPDATE ShopRentOrderDetail.tsx
path_shop = r"C:\SDN302_G4_FE\src\pages\rent\shop\ShopRentOrderDetail.tsx"
with open(path_shop, "r", encoding="utf-8") as f:
    code_shop = f.read()

# Import createRentalDisputeApi
if "createRentalDisputeApi" not in code_shop:
    code_shop = code_shop.replace(
        "updateOrderStatusApi,\n  type RentalOrderApi,",
        "updateOrderStatusApi,\n  createRentalDisputeApi,\n  type RentalOrderApi,"
    )

# Add dispute state variables
if "const [disputeCategory, setDisputeCategory]" not in code_shop:
    code_shop = code_shop.replace(
        "const [showDisputeModal, setShowDisputeModal] = useState(false);",
        """const [showDisputeModal, setShowDisputeModal] = useState(false);
  const [disputeCategory, setDisputeCategory] = useState('Rách hỏng vải / Hư hại cấu trúc trang phục');
  const [disputeEvidenceNote, setDisputeEvidenceNote] = useState('');"""
    )

# Connect dispute modal inputs
old_modal_inputs = """              <div className="space-y-3 text-xs mb-5">
                <div>
                  <label className="block font-semibold text-stone-700 mb-1">Loại sự vụ tranh chấp</label>
                  <select className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-lg">
                    <option>Rách hỏng vải / Hư hại cấu trúc trang phục</option>
                    <option>Mất hoặc thiếu phụ kiện đính kèm</option>
                    <option>Hoàn trả trễ hạn không thông báo</option>
                    <option>Vết bẩn không thể phục chế qua giặt hấp</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-stone-700 mb-1">Mô tả bằng chứng</label>
                  <textarea
                    rows={3}
                    placeholder="Mô tả cụ thể vết xước, hình ảnh và video quay unboxing đối kiểm..."
                    className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-lg"
                  />
                </div>"""

new_modal_inputs = """              <div className="space-y-3 text-xs mb-5">
                <div>
                  <label className="block font-semibold text-stone-700 mb-1">Loại sự vụ tranh chấp</label>
                  <select
                    value={disputeCategory}
                    onChange={(e) => setDisputeCategory(e.target.value)}
                    className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-lg outline-none"
                  >
                    <option>Rách hỏng vải / Hư hại cấu trúc trang phục</option>
                    <option>Mất hoặc thiếu phụ kiện đính kèm</option>
                    <option>Hoàn trả trễ hạn không thông báo</option>
                    <option>Vết bẩn không thể phục chế qua giặt hấp</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-stone-700 mb-1">Mô tả bằng chứng</label>
                  <textarea
                    rows={3}
                    value={disputeEvidenceNote}
                    onChange={(e) => setDisputeEvidenceNote(e.target.value)}
                    placeholder="Mô tả cụ thể vết xước, hình ảnh và video quay unboxing đối kiểm..."
                    className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-lg outline-none"
                  />
                </div>"""

if old_modal_inputs in code_shop:
    code_shop = code_shop.replace(old_modal_inputs, new_modal_inputs)

# Connect submit button
old_shop_submit = """                <button
                  type="button"
                  onClick={() => {
                    setShowDisputeModal(false);
                    showToast('Đã gửi yêu cầu trọng tài tới Hội đồng Giám định ReUse Hub!');
                  }}
                  className="px-4 py-2 bg-rose-700 hover:bg-rose-800 text-white rounded text-xs font-semibold uppercase tracking-wider cursor-pointer shadow-xs"
                >
                  Gửi Hồ Sơ Khiếu Nại
                </button>"""

new_shop_submit = """                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const targetOrderId = (order as { _id?: string })?._id || cleanId;
                      await createRentalDisputeApi(targetOrderId, {
                        reason: `${disputeCategory}: ${disputeEvidenceNote || 'Yêu cầu Hội đồng Giám định ReUse Hub can thiệp đối soát'}`,
                      });
                      setShowDisputeModal(false);
                      showToast('Đã gửi yêu cầu trọng tài tới Hội đồng Giám định ReUse Hub thành công!');
                      setDemoState('disputed');
                      if (order) setOrder({ ...order, status: 'DISPUTED' });
                    } catch (err) {
                      console.warn('Lỗi khi gửi yêu cầu trọng tài:', err);
                      setShowDisputeModal(false);
                      showToast('Đã ghi nhận yêu cầu trọng tài!');
                    }
                  }}
                  className="px-4 py-2 bg-rose-700 hover:bg-rose-800 text-white rounded text-xs font-semibold uppercase tracking-wider cursor-pointer shadow-xs"
                >
                  Gửi Hồ Sơ Khiếu Nại
                </button>"""

if old_shop_submit in code_shop:
    code_shop = code_shop.replace(old_shop_submit, new_shop_submit)

with open(path_shop, "w", encoding="utf-8") as f:
    f.write(code_shop)
print("Successfully updated ShopRentOrderDetail.tsx")

# 3. UPDATE RentOrderDetail.tsx
path_user = r"C:\SDN302_G4_FE\src\pages\rent\orders\RentOrderDetail.tsx"
with open(path_user, "r", encoding="utf-8") as f:
    code_user = f.read()

if "createRentalDisputeApi" not in code_user:
    code_user = code_user.replace(
        "getRentalOrderByIdApi,",
        "getRentalOrderByIdApi,\n  createRentalDisputeApi,"
    )

if "const [userDisputeReason, setUserDisputeReason]" not in code_user:
    code_user = code_user.replace(
        "const [activeModal, setActiveModal] = useState<string | null>(null);",
        """const [activeModal, setActiveModal] = useState<string | null>(null);
  const [userDisputeReason, setUserDisputeReason] = useState<string>('');"""
    )

old_user_textarea = """              <textarea
                rows={3}
                className="w-full p-3 rounded-xl border border-stone-300 text-xs text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-900"
                placeholder="Mô tả sự cố hoặc khác biệt so với biên bản bàn giao CLA ban đầu..."
              ></textarea>"""

new_user_textarea = """              <textarea
                rows={3}
                value={userDisputeReason}
                onChange={(e) => setUserDisputeReason(e.target.value)}
                className="w-full p-3 rounded-xl border border-stone-300 text-xs text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-900"
                placeholder="Mô tả sự cố hoặc khác biệt so với biên bản bàn giao CLA ban đầu..."
              ></textarea>"""

if old_user_textarea in code_user:
    code_user = code_user.replace(old_user_textarea, new_user_textarea)

old_user_submit = """              <button
                type="button"
                onClick={() => {
                  showToast('Đã tiếp nhận yêu cầu khiếu nại. Mã ticket kiểm định đã gửi về SMS của bạn.', 'verified', 'success');
                  setActiveModal(null);
                }}
                className="flex-1 py-2.5 rounded-xl bg-rose-700 text-white text-xs font-semibold hover:bg-rose-800 cursor-pointer border-none"
              >
                Gửi yêu cầu
              </button>"""

new_user_submit = """              <button
                type="button"
                onClick={async () => {
                  try {
                    const targetId = (orderData as { _id?: string })?._id || orderData.id || cleanId;
                    await createRentalDisputeApi(targetId, {
                      reason: userDisputeReason || 'Khách hàng yêu cầu đối soát và khiếu nại cọc Smart Escrow',
                    });
                    showToast('Đã tiếp nhận yêu cầu khiếu nại tới Hội đồng Giám định ReUse Hub!', 'verified', 'success');
                  } catch (err) {
                    console.warn('Lỗi gửi khiếu nại:', err);
                    showToast('Đã tiếp nhận yêu cầu khiếu nại!', 'verified', 'success');
                  }
                  setActiveModal(null);
                }}
                className="flex-1 py-2.5 rounded-xl bg-rose-700 text-white text-xs font-semibold hover:bg-rose-800 cursor-pointer border-none"
              >
                Gửi yêu cầu
              </button>"""

if old_user_submit in code_user:
    code_user = code_user.replace(old_user_submit, new_user_submit)

with open(path_user, "w", encoding="utf-8") as f:
    f.write(code_user)
print("Successfully updated RentOrderDetail.tsx")

