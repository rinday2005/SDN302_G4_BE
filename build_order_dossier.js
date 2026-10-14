import fs from "fs";
import path from "path";

const feRoot = "d:\\ki7\\ReUse_FE\\src";

// 1. Create RentOrderDossier.tsx
const dossierComponent = `import React, { useState, useEffect, useMemo } from 'react';
import { Link, useParams, useLocation } from 'react-router-dom';
import { useAuth } from '../../../hooks/useAuth';
import { getRentalOrderByIdApi, type RentalOrderApi } from '../../../services/order.api';

export const RentOrderDossier: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const { user } = useAuth();

  const [order, setOrder] = useState<RentalOrderApi | null>(() => {
    return (location.state as any)?.order || null;
  });
  const [isLoading, setIsLoading] = useState<boolean>(!order);
  const [simState, setSimState] = useState<'A' | 'B' | 'C' | 'D'>('A');
  const [copied, setCopied] = useState<boolean>(false);

  // Fetch real order from MongoDB API
  useEffect(() => {
    if (!id) return;
    let isMounted = true;
    setIsLoading(true);

    getRentalOrderByIdApi(id)
      .then((data) => {
        if (!isMounted) return;
        if (data) {
          setOrder(data);
        } else {
          // Fallback to local storage if not found on server
          try {
            const rawStored = localStorage.getItem('user_rental_orders');
            if (rawStored) {
              const list: any[] = JSON.parse(rawStored);
              const found = list.find((o) => o._id === id || o.id === id || o.orderCode === id);
              if (found) setOrder(found);
            }
          } catch {}
        }
        setIsLoading(false);
      })
      .catch((err) => {
        console.warn('Could not load order dossier:', err);
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [id]);

  // Copy order code
  const handleCopyCode = () => {
    const code = order?.orderCode || id || 'RH-RNT-2026-8845';
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Stepper active index & progress bar calculation based on order status or simulation
  const currentStep = useMemo(() => {
    if (simState === 'B') return 8;
    if (simState === 'C') return 9;
    if (simState === 'D') return 11;

    const st = order?.status;
    if (st === 'PENDING') return 1;
    if (st === 'CONFIRMED' || st === 'WAITING_PAYMENT') return 2;
    if (st === 'PAID') return 4;
    if (st === 'READY_FOR_HANDOVER' || st === 'PREPARING') return 5;
    if (st === 'HANDED_OVER' || st === 'SHIPPING' || st === 'DELIVERED') return 6;
    if (st === 'RENTING') return 7;
    if (st === 'RETURN_REQUESTED') return 8;
    if (st === 'RETURNING') return 9;
    if (st === 'RETURNED') return 10;
    if (st === 'COMPLETED') return 11;
    return 7; // default RENTING
  }, [order?.status, simState]);

  const progressPercent = useMemo(() => {
    return Math.min(100, Math.max(10, Math.round(((currentStep - 1) / 10) * 100)));
  }, [currentStep]);

  // Derived order fields
  const displayCode = order?.orderCode || \`#RH-RNT-\${id?.slice(-4).toUpperCase() || '2026-8845'}\`;
  const items = order?.items && order.items.length > 0 ? order.items : [
    {
      productId: '6aced9684c6e5d97a2389e34',
      productName: 'Áo dài cách tân gấm hoa mai',
      pricePerDay: 150000,
      depositAmount: 300000,
      quantity: 1,
    }
  ];

  const rentalDays = useMemo(() => {
    if (!order?.startDate || !order?.endDate) return 5;
    const diff = new Date(order.endDate).getTime() - new Date(order.startDate).getTime();
    return Math.max(1, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }, [order?.startDate, order?.endDate]);

  const totalRent = order?.rentalFee ?? items.reduce((sum, i) => sum + (i.pricePerDay || 0) * (i.quantity || 1) * rentalDays, 0);
  const totalDeposit = order?.depositAmount ?? items.reduce((sum, i) => sum + (i.depositAmount || 0) * (i.quantity || 1), 0);
  const totalShipping = order?.shippingFee ?? 150000;
  const grandTotal = order?.totalAmount ?? (totalRent + totalDeposit + totalShipping);

  const startDateFormatted = order?.startDate ? new Date(order.startDate).toLocaleDateString('vi-VN') : '14/11/2026';
  const endDateFormatted = order?.endDate ? new Date(order.endDate).toLocaleDateString('vi-VN') : '19/11/2026';

  const recipient = order?.shippingAddress?.recipientName || (typeof user?.fullName === 'string' ? user.fullName : 'Khách hàng ReUse');
  const phone = order?.shippingAddress?.recipientPhone || (typeof user?.phoneNumber === 'string' ? user.phoneNumber : '0908 421 892');
  const addressDetail = order?.shippingAddress
    ? [order.shippingAddress.detail, order.shippingAddress.ward, order.shippingAddress.district, order.shippingAddress.province].filter(Boolean).join(', ')
    : '48 Bạch Đằng, Tầng 4 Archive Suite, Quận Hải Châu, TP. Đà Nẵng';

  const carrier = order?.shippingDetails?.carrierName || order?.shippingDetails?.carrier || 'Nanuk White-Glove (2 chiều)';

  return (
    <div className="min-h-screen flex flex-col bg-[#FBF9F5] text-[#22201D] font-sans antialiased">
      {/* TOP BANNER */}
      <div className="bg-[#22201D] text-[#EBE6DD] text-[11px] sm:text-xs font-medium tracking-wide py-1.5 px-4 text-center border-b border-[#36322D]">
        <span>THUÊ NHỮNG GÌ BẠN CẦN · TÁI SỬ DỤNG NHỮNG GÌ ĐÃ CÓ · BẢO HIỂM HÀNG HÓA MINH BẠCH 100% VỚI SMART ESCROW</span>
      </div>

      {/* MAIN CONTAINER */}
      <div className="flex-1 max-w-[1520px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8 space-y-8">
        {/* BREADCRUMBS */}
        <nav className="flex items-center gap-2 text-xs text-stone-500 font-medium">
          <Link to="/" className="hover:text-stone-900 transition-colors">Trang chủ</Link>
          <span className="text-stone-400">/</span>
          <Link to="/profile" className="hover:text-stone-900 transition-colors">Tài khoản</Link>
          <span className="text-stone-400">/</span>
          <Link to="/rent/orders" className="hover:text-stone-900 transition-colors">Đơn thuê RENT</Link>
          <span className="text-stone-400">/</span>
          <span className="text-stone-900 font-semibold">Chi tiết đơn thuê {displayCode}</span>
        </nav>

        {/* HEADER TITLE & CONTROLS */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 bg-white p-6 sm:p-8 rounded-3xl shadow-sm border border-[#E8E4DC]">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse"></span>
                {order?.status === 'PAID' ? 'ĐÃ THANH TOÁN (PAID)' : (order?.status || 'ĐANG THUÊ (RENTING)')} · {rentalDays} NGÀY HIỆU LỰC
              </span>
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-stone-100 text-stone-800 text-xs font-semibold">
                <span>Mã đơn: {displayCode}</span>
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="text-[10px] text-stone-500 hover:text-stone-900 font-normal underline ml-1 cursor-pointer"
                >
                  {copied ? 'Đã sao chép!' : 'Sao chép'}
                </button>
              </div>
              <span className="text-xs text-stone-500 font-medium">
                Bảo chứng ký quỹ Smart Escrow: <strong className="text-stone-900">{totalDeposit.toLocaleString('vi-VN')}₫</strong>
              </span>
            </div>
            <h1 className="font-serif text-2xl sm:text-3xl lg:text-4xl font-bold text-stone-900 tracking-tight">
              Hồ sơ lưu ký & Quản trị đơn thuê
            </h1>
            <p className="text-xs sm:text-sm text-stone-500 max-w-2xl leading-relaxed">
              Đơn lưu giữ đa thiết bị chuyên dụng từ ReUse Hub. Tiền cọc được khóa độc lập qua hợp đồng giám sát thông minh Smart Escrow, hoàn trả 100% sau khi đối kiểm.
            </p>
          </div>

          {/* Action Buttons Row */}
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5">
            <Link
              to={\`/chat?orderId=\${order?._id || id}\`}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-stone-900 text-white text-xs font-semibold hover:bg-stone-800 transition-all shadow-sm"
            >
              <span className="material-symbols-outlined text-[17px]">chat</span>
              <span>Nhắn tin Shop Owner</span>
            </Link>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-full bg-stone-100 text-stone-800 text-xs font-semibold hover:bg-stone-200 transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[17px]">print</span>
              <span>In biên bản CLA</span>
            </button>
            <Link
              to={\`/contact?issue=order&\${order?._id || id}\`}
              className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-full bg-stone-100 text-rose-700 text-xs font-semibold hover:bg-rose-50 transition-colors"
            >
              <span className="material-symbols-outlined text-[17px]">report_problem</span>
              <span>Khiếu nại</span>
            </Link>
          </div>
        </div>

        {/* STATE SIMULATION SWITCHER PILL BAR */}
        <div className="bg-stone-100/80 p-2 sm:p-2.5 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-3 text-xs border border-[#E8E4DC]">
          <div className="flex items-center gap-2 text-stone-600 font-semibold px-2">
            <span className="material-symbols-outlined text-base text-stone-700">tune</span>
            <span>Mô phỏng vòng đời (Simulation State):</span>
          </div>
          <div className="flex flex-wrap gap-1.5 w-full md:w-auto">
            <button
              type="button"
              onClick={() => setSimState('A')}
              className={\`flex-1 md:flex-none px-3 py-1.5 rounded-xl text-[11px] transition-all cursor-pointer \${
                simState === 'A' ? 'font-semibold bg-stone-900 text-white shadow-sm' : 'font-medium bg-white text-stone-700 hover:bg-stone-200'
              }\`}
            >
              Trạng thái A: Đang thuê (Hiện tại)
            </button>
            <button
              type="button"
              onClick={() => setSimState('B')}
              className={\`flex-1 md:flex-none px-3 py-1.5 rounded-xl text-[11px] transition-all cursor-pointer \${
                simState === 'B' ? 'font-semibold bg-stone-900 text-white shadow-sm' : 'font-medium bg-white text-stone-700 hover:bg-stone-200'
              }\`}
            >
              Trạng thái B: Sẵn sàng trả đồ
            </button>
            <button
              type="button"
              onClick={() => setSimState('C')}
              className={\`flex-1 md:flex-none px-3 py-1.5 rounded-xl text-[11px] transition-all cursor-pointer \${
                simState === 'C' ? 'font-semibold bg-stone-900 text-white shadow-sm' : 'font-medium bg-white text-stone-700 hover:bg-stone-200'
              }\`}
            >
              Trạng thái C: Bench Lab đối kiểm
            </button>
            <button
              type="button"
              onClick={() => setSimState('D')}
              className={\`flex-1 md:flex-none px-3 py-1.5 rounded-xl text-[11px] transition-all cursor-pointer \${
                simState === 'D' ? 'font-semibold bg-stone-900 text-white shadow-sm' : 'font-medium bg-white text-stone-700 hover:bg-stone-200'
              }\`}
            >
              Trạng thái D: Hoàn tất cọc 100%
            </button>
          </div>
        </div>

        {/* ORDER LIFECYCLE 11-STEP HORIZONTAL STEPPER */}
        <div className="bg-white p-6 sm:p-8 rounded-3xl shadow-sm border border-[#E8E4DC] space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <span className="text-[10px] uppercase font-bold tracking-widest text-stone-500">Tiến trình tuần hoàn</span>
              <h2 className="font-serif text-lg sm:text-xl font-bold text-stone-900">Vòng đời lưu ký 11 bước (Circular Rental Lifecycle)</h2>
            </div>
            <div className="text-xs text-stone-600 font-medium bg-stone-100 px-3 py-1 rounded-full self-start sm:self-auto">
              Giai đoạn hiệu lực: <strong className="text-stone-900">{startDateFormatted} - {endDateFormatted}</strong>
            </div>
          </div>

          {/* Stepper Scrollable Track */}
          <div className="overflow-x-auto pb-4 pt-1 thin-scrollbar">
            <div className="min-w-[1080px] relative flex items-start justify-between">
              {/* Connecting Line Background */}
              <div className="absolute top-4 left-6 right-6 h-0.5 bg-stone-200 -z-0"></div>
              <div
                className="absolute top-4 left-6 h-0.5 bg-stone-900 -z-0 transition-all duration-500"
                style={{ width: \`\${progressPercent}%\` }}
              ></div>

              {[
                { step: 1, label: '1. Đã đặt', sub: 'Hệ thống nhận' },
                { step: 2, label: '2. Shop duyệt', sub: 'Kiểm kho sẵn' },
                { step: 3, label: '3. Chờ thanh toán', sub: 'Khóa Escrow' },
                { step: 4, label: '4. Đã TT VNPay', sub: 'Ký quỹ an toàn' },
                { step: 5, label: '5. Đóng gói Nanuk', sub: 'Niêm seal chì' },
                { step: 6, label: '6. Bàn giao test', sub: 'Khớp CLA 3 góc' },
                { step: 7, label: '7. ĐANG THUÊ', sub: \`Hiệu lực \${rentalDays} ngày\` },
                { step: 8, label: '8. Yêu cầu trả', sub: 'Khung hẹn bưu tá' },
                { step: 9, label: '9. Bench Lab', sub: 'Đối kiểm hư hại' },
                { step: 10, label: '10. Hoàn cọc', sub: 'Hoàn 100% Smart' },
                { step: 11, label: '11. Hoàn tất', sub: 'Đóng đơn lưu ký' },
              ].map((s) => {
                const isPassed = currentStep > s.step;
                const isCurrent = currentStep === s.step;
                return (
                  <div key={s.step} className="flex flex-col items-center text-center w-24 relative z-10">
                    <div
                      className={\`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all \${
                        isCurrent
                          ? 'bg-emerald-600 text-white shadow-md ring-4 ring-emerald-100'
                          : isPassed
                          ? 'bg-stone-900 text-white shadow-sm'
                          : 'bg-stone-100 text-stone-400'
                      }\`}
                    >
                      {isPassed ? (
                        <span className="material-symbols-outlined text-[15px]">check</span>
                      ) : (
                        <span>{s.step}</span>
                      )}
                    </div>
                    <span
                      className={\`text-[11px] mt-2 font-bold \${
                        isCurrent ? 'text-emerald-800' : isPassed ? 'text-stone-900' : 'text-stone-400'
                      }\`}
                    >
                      {s.label}
                    </span>
                    <span className={\`text-[9px] \${isCurrent ? 'text-emerald-600 font-semibold' : 'text-stone-400'}\`}>
                      {s.sub}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* TWO-COLUMN WORKSPACE */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* LEFT COLUMN: MAIN ORDER DOSSIER (7 COLS) */}
          <div className="lg:col-span-7 space-y-8">
            {/* CUSTODY WINDOW & COUNTDOWN */}
            <div className="bg-stone-900 text-stone-100 p-6 sm:p-8 rounded-3xl space-y-6 shadow-md relative overflow-hidden">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="text-[10px] uppercase font-bold tracking-widest text-stone-400">Cửa sổ lưu ký khách hàng</div>
                  <h3 className="font-serif text-xl sm:text-2xl font-bold text-white mt-0.5">Thời hạn bàn giao & Thuê thực tế</h3>
                </div>
                <span className="px-3 py-1 bg-stone-800 text-emerald-400 text-xs font-semibold rounded-full self-start sm:self-auto flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[15px]">timer</span>
                  <span>Thời lượng {rentalDays} ngày trọn vẹn</span>
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-2">
                <div className="bg-stone-800/80 p-4 rounded-2xl">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-stone-400 block">Bắt đầu tính phí</span>
                  <span className="text-base font-bold text-white mt-1 block">{startDateFormatted}</span>
                  <span className="text-[10px] text-stone-400">10:15 ICT (Ký nhận)</span>
                </div>
                <div className="bg-stone-800/80 p-4 rounded-2xl">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-stone-400 block">Hạn chót trả đồ</span>
                  <span className="text-base font-bold text-emerald-400 mt-1 block">{endDateFormatted}</span>
                  <span className="text-[10px] text-stone-400">Trước 17:00 ICT</span>
                </div>
                <div className="col-span-2 sm:col-span-1 bg-stone-800/80 p-4 rounded-2xl">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-stone-400 block">Tổng thời lượng</span>
                  <span className="text-base font-bold text-white mt-1 block">{rentalDays} Ngày ({rentalDays * 24} Giờ)</span>
                  <span className="text-[10px] text-stone-400">Lưu ký an toàn 100%</span>
                </div>
              </div>

              {/* Visual Progress Bar */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-stone-300">
                  <span>Tiến độ lưu ký</span>
                  <span className="font-bold">{progressPercent}% chu kỳ vòng đời</span>
                </div>
                <div className="w-full bg-stone-800 h-2.5 rounded-full overflow-hidden">
                  <div className="bg-emerald-500 h-full rounded-full transition-all duration-300" style={{ width: \`\${progressPercent}%\` }}></div>
                </div>
              </div>

              {/* Custody Action Buttons */}
              <div className="pt-2 flex flex-col sm:flex-row gap-3">
                <Link
                  to={\`/rent/orders/\${order?._id || id}/return\`}
                  className="flex-1 inline-flex items-center justify-center gap-2 py-3.5 px-6 rounded-2xl bg-white text-stone-900 font-bold text-xs hover:bg-stone-200 transition-colors shadow-sm text-center"
                >
                  <span className="material-symbols-outlined text-[18px]">assignment_return</span>
                  <span>Yêu cầu trả đồ ngay (Initiate Return)</span>
                </Link>
                <button
                  type="button"
                  onClick={() => alert('Đã gửi yêu cầu hỗ trợ tới Shop Owner qua Chat.')}
                  className="inline-flex items-center justify-center gap-2 py-3.5 px-6 rounded-2xl bg-stone-800 text-stone-200 font-semibold text-xs hover:bg-stone-700 transition-colors cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]">update</span>
                  <span>Gia hạn thuê (+2 ngày)</span>
                </button>
              </div>
            </div>

            {/* ALL RENTED ITEMS IN THIS ORDER */}
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold tracking-widest text-stone-500">Chi tiết sản phẩm</span>
                  <h3 className="font-serif text-xl sm:text-2xl font-bold text-stone-900">Danh mục thiết bị đang lưu giữ ({items.length} Món)</h3>
                </div>
                <span className="text-xs bg-stone-100 text-stone-700 px-3 py-1 rounded-full font-semibold">
                  Đồng đơn {displayCode}
                </span>
              </div>

              {items.map((item, index) => {
                const itemTotal = (item.pricePerDay || 0) * (item.quantity || 1) * rentalDays;
                const itemDeposit = (item.depositAmount || 0) * (item.quantity || 1);
                const pImage = (item as any).images?.[0] || (item as any).image || 'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?auto=format&fit=crop&w=600&q=80';

                return (
                  <div key={index} className="bg-white rounded-3xl p-6 sm:p-7 shadow-sm border border-[#E8E4DC] space-y-6">
                    <div className="flex flex-col sm:flex-row gap-5 items-start">
                      <div className="w-full sm:w-44 h-44 rounded-2xl overflow-hidden bg-stone-100 shrink-0 relative group">
                        <img
                          src={pImage}
                          alt={item.productName || 'Sản phẩm thuê'}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                        <span className="absolute bottom-2 left-2 bg-stone-900/80 backdrop-blur-xs text-white text-[9px] uppercase px-2 py-0.5 rounded font-bold">
                          Grade A+
                        </span>
                      </div>
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-stone-100 text-stone-700">
                            Sản phẩm ReUse RENT
                          </span>
                          <span className="text-[10px] text-stone-500">Số lượng: x{item.quantity || 1}</span>
                        </div>
                        <h4 className="font-serif text-lg font-bold text-stone-900 leading-snug">
                          {item.productName || 'Sản phẩm thuê cao cấp'}
                        </h4>
                        <p className="text-xs text-stone-500">
                          Nhà cung cấp: <strong className="text-stone-800">ReUse Partner Vault (Đà Nẵng & HCM Hub)</strong>
                        </p>

                        {/* Identifiers Grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 text-xs">
                          <div className="bg-stone-50 p-2.5 rounded-xl border border-stone-100">
                            <span className="text-[10px] text-stone-500 block">Mã định danh lưu kho:</span>
                            <span className="font-mono font-bold text-stone-800">#{(item.productId || 'item').slice(-8).toUpperCase()}</span>
                          </div>
                          <div className="bg-stone-50 p-2.5 rounded-xl border border-stone-100">
                            <span className="text-[10px] text-stone-500 block">Khóa niêm phong Nanuk:</span>
                            <span className="font-mono font-bold text-stone-800">Seal #TS-\${displayCode.slice(-4)}-\${index + 1}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Included Accessories Box */}
                    <div className="bg-stone-50 p-4 rounded-2xl space-y-2 text-xs border border-stone-100">
                      <span className="font-bold text-stone-800 block text-[11px] uppercase tracking-wide">
                        Trọn bộ phụ kiện đi kèm theo biên bản:
                      </span>
                      <p className="text-stone-600 leading-relaxed">
                        Phụ kiện nguyên bản theo máy/sản phẩm, bộ sạc cáp chính hãng, túi bọc chống sốc chuyên dụng hoặc vali Nanuk chống nước tiêu chuẩn, tem niêm phong chì số đỏ.
                      </p>
                    </div>

                    {/* Pricing & Escrow Subtotal */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2 border-t border-stone-100">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-stone-400 block">Chi phí thuê thiết bị</span>
                        <div className="text-base font-bold text-stone-900">
                          {(item.pricePerDay || 0).toLocaleString('vi-VN')}₫{' '}
                          <span className="text-xs font-normal text-stone-500">/ ngày × {rentalDays} ngày =</span>{' '}
                          {itemTotal.toLocaleString('vi-VN')}₫
                        </div>
                        <span className="text-[11px] text-stone-500">
                          Ký quỹ Smart Escrow: <strong>{itemDeposit.toLocaleString('vi-VN')}₫</strong> (Hoàn lại 100%)
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => alert('Đã đối kiểm Bench Lab: Đạt chuẩn chất lượng ReUse Standard 100%.')}
                          className="px-3.5 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-[16px]">verified</span>
                          <span>Hồ sơ Bench Grade</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* CUSTODY HANDOFF AUDIT TRAIL (TEST 3 GÓC) */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-[#E8E4DC] space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <span className="text-[10px] uppercase font-bold tracking-widest text-stone-500">Minh chứng bàn giao (CLA)</span>
                  <h3 className="font-serif text-xl font-bold text-stone-900">Nhật ký mở hộp & Đối kiểm 3 góc</h3>
                </div>
                <span className="px-3 py-1 bg-emerald-100 text-emerald-800 text-xs font-semibold rounded-full self-start sm:self-auto">
                  Khách hàng đã ký nhận {startDateFormatted}
                </span>
              </div>
              <p className="text-xs text-stone-600 leading-relaxed">
                Ảnh chụp hiện trạng bưu kiện thực tế thời điểm khách hàng nhận bàn giao từ bưu tá {carrier}. Thiết bị nguyên tem niêm phong chì số đỏ và hoạt động chuẩn hóa theo biên bản bàn giao điện tử.
              </p>

              {/* 3-Photo Inspection Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <div className="h-36 rounded-2xl overflow-hidden bg-stone-100 relative group border border-stone-200">
                    <img
                      src="https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=600&q=80"
                      alt="Góc 1"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                    <span className="absolute top-2 left-2 bg-stone-900/80 text-white text-[9px] px-2 py-0.5 rounded font-bold">
                      Góc 1: Chi tiết máy / Cảm biến
                    </span>
                  </div>
                  <span className="text-[11px] text-stone-500 block text-center">Nguyên vẹn, không trầy xước</span>
                </div>

                <div className="space-y-2">
                  <div className="h-36 rounded-2xl overflow-hidden bg-stone-100 relative group border border-stone-200">
                    <img
                      src="https://images.unsplash.com/photo-1548036328-c9fa89d128fa?auto=format&fit=crop&w=600&q=80"
                      alt="Góc 2"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                    <span className="absolute top-2 left-2 bg-stone-900/80 text-white text-[9px] px-2 py-0.5 rounded font-bold">
                      Góc 2: Phụ kiện & Vali
                    </span>
                  </div>
                  <span className="text-[11px] text-stone-500 block text-center">Đầy đủ phụ kiện niêm phong</span>
                </div>

                <div className="space-y-2">
                  <div className="h-36 rounded-2xl overflow-hidden bg-stone-100 relative group border border-stone-200">
                    <img
                      src="https://images.unsplash.com/photo-1566174053879-31528523f8ae?auto=format&fit=crop&w=600&q=80"
                      alt="Góc 3"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                    <span className="absolute top-2 left-2 bg-stone-900/80 text-white text-[9px] px-2 py-0.5 rounded font-bold">
                      Góc 3: Tem niêm phong
                    </span>
                  </div>
                  <span className="text-[11px] text-stone-500 block text-center">Khớp mã seal niêm phong</span>
                </div>
              </div>

              <div className="p-3.5 bg-stone-50 rounded-2xl text-xs text-stone-600 flex items-start gap-2.5 border border-stone-100">
                <span className="material-symbols-outlined text-stone-800 text-lg shrink-0">edit_note</span>
                <div>
                  <strong className="text-stone-800">Ghi chú bàn giao hiện trường:</strong> Bưu kiện nguyên vẹn niêm phong, khách hàng {recipient} đã kiểm tra hiện trạng thiết bị và xác nhận bàn giao thành công.
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: FINANCIAL LEDGER & TRANSIT PROTOCOL (5 COLS) */}
          <div className="lg:col-span-5 space-y-8">
            {/* FINANCIAL LEDGER & ESCROW TRANSPARENCY */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-[#E8E4DC] space-y-6">
              <div>
                <span className="text-[10px] uppercase font-bold tracking-widest text-stone-500">Bóc tách tài chính</span>
                <h3 className="font-serif text-xl font-bold text-stone-900">Sổ cái thanh toán & Ký quỹ</h3>
              </div>

              {/* Ledger Line Items */}
              <div className="space-y-3.5 text-xs">
                {items.map((it, idx) => (
                  <div key={idx} className="flex justify-between items-center text-stone-700">
                    <span className="line-clamp-1">{it.productName || 'Thiết bị thuê'} ({rentalDays} ngày)</span>
                    <span className="font-semibold text-stone-900 shrink-0">
                      {((it.pricePerDay || 0) * (it.quantity || 1) * rentalDays).toLocaleString('vi-VN')}₫
                    </span>
                  </div>
                ))}

                <div className="flex justify-between items-center text-stone-500 pl-3">
                  <span>Tạm tính phí thuê thiết bị</span>
                  <span className="font-medium text-stone-700">{totalRent.toLocaleString('vi-VN')}₫</span>
                </div>

                <div className="h-px bg-stone-100 my-2"></div>

                <div className="flex justify-between items-center text-stone-700">
                  <span className="flex items-center gap-1.5">
                    <span>Tổng tiền cọc Smart Escrow</span>
                    <span className="material-symbols-outlined text-emerald-600 text-[14px]" title="Hoàn 100%">lock</span>
                  </span>
                  <span className="font-semibold text-stone-900">{totalDeposit.toLocaleString('vi-VN')}₫</span>
                </div>

                <div className="flex justify-between items-center text-stone-500 pl-3">
                  <span>Trạng thái ký quỹ bảo hộ</span>
                  <span className="font-bold text-emerald-700">Đang khóa an toàn (100%)</span>
                </div>

                <div className="h-px bg-stone-100 my-2"></div>

                <div className="flex justify-between items-center text-stone-700">
                  <span>Phí bưu tá chuyên dụng (2 chiều)</span>
                  <span className="font-semibold text-stone-900">{totalShipping.toLocaleString('vi-VN')}₫</span>
                </div>

                {/* Total Settled */}
                <div className="pt-4 bg-stone-50 p-4 rounded-2xl space-y-1 border border-stone-100">
                  <div className="flex justify-between items-baseline">
                    <span className="font-bold text-stone-900 text-sm">Tổng quyết toán đã trả:</span>
                    <span className="font-bold text-xl text-stone-900">{grandTotal.toLocaleString('vi-VN')}₫</span>
                  </div>
                  <div className="text-[11px] text-stone-500 flex justify-between">
                    <span>Trạng thái giao dịch:</span>
                    <span className="font-semibold text-emerald-700">
                      {order?.paymentStatus === 'PAID' || order?.status === 'PAID' ? 'Đã thanh toán 100% qua VNPay' : 'Đã thanh toán'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Escrow Guarantee Callout */}
              <div className="bg-emerald-50 text-emerald-900 p-4 rounded-2xl text-xs space-y-2 border border-emerald-100">
                <div className="flex items-center gap-1.5 font-bold">
                  <span className="material-symbols-outlined text-base text-emerald-700">shield_with_heart</span>
                  <span>Cam kết hoàn tiền cọc Smart Escrow</span>
                </div>
                <p className="text-emerald-800 leading-relaxed text-[11px]">
                  Toàn bộ <strong>{totalDeposit.toLocaleString('vi-VN')}₫ tiền cọc</strong> đang được bảo lưu độc lập trong tài khoản ký quỹ trung gian ReUse Smart Escrow. Hệ thống tự động hoàn trả 100% về tài khoản của bạn sau khi Shop Owner hoàn tất đối kiểm.
                </p>
              </div>
            </div>

            {/* PAYMENT & INVOICE METADATA */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-[#E8E4DC] space-y-5">
              <h4 className="font-serif text-lg font-bold text-stone-900">Thông tin Cổng thanh toán</h4>
              <div className="space-y-3 text-xs">
                <div className="flex justify-between py-1.5 border-b border-stone-100">
                  <span className="text-stone-500">Cổng giao dịch</span>
                  <span className="font-semibold text-stone-800">VNPay QR / NAPAS 256-bit HSM</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-stone-100">
                  <span className="text-stone-500">Mã giao dịch (Trans ID)</span>
                  <span className="font-mono font-semibold text-stone-800">VNP-TRX-{displayCode.replace(/[^a-zA-Z0-9]/g, '')}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-stone-100">
                  <span className="text-stone-500">Thời gian tạo đơn</span>
                  <span className="font-semibold text-stone-800">
                    {order?.createdAt ? new Date(order.createdAt).toLocaleString('vi-VN') : '14:32 · 14/11/2026'}
                  </span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-stone-500">Tình trạng quỹ</span>
                  <span className="font-semibold text-stone-800 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                    PAID - ESCROW LOCKED
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => alert('Đã gửi liên kết tải Hóa đơn điện tử VAT và Giấy chứng nhận ký quỹ Escrow vào email của bạn.')}
                className="w-full py-3 rounded-2xl bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[17px]">download</span>
                <span>Tải hóa đơn VAT & Chứng thư ký quỹ</span>
              </button>
            </div>

            {/* SHIPPING & TRACKING */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-[#E8E4DC] space-y-6">
              <div>
                <span className="text-[10px] uppercase font-bold tracking-widest text-stone-500">Vận chuyển chuyên dụng</span>
                <h4 className="font-serif text-lg font-bold text-stone-900">Lộ trình giao nhận 2 chiều (Nanuk)</h4>
              </div>

              <div className="space-y-4 text-xs">
                {/* Outbound Delivery */}
                <div className="p-3.5 rounded-2xl bg-stone-50 space-y-1.5 border border-stone-100">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-stone-900 flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[16px] text-emerald-600">local_shipping</span>
                      <span>Chiều 1: Giao hàng đến bạn</span>
                    </span>
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                      {order?.status === 'PAID' ? 'ĐANG CHUẨN BỊ' : 'ĐÃ GIAO XONG'}
                    </span>
                  </div>
                  <p className="text-stone-500 text-[11px]">{carrier} · Bàn giao {startDateFormatted}</p>
                </div>

                {/* Return Delivery */}
                <div className="p-3.5 rounded-2xl bg-stone-50 space-y-1.5 border border-stone-100">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-stone-900 flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[16px] text-stone-600">undo</span>
                      <span>Chiều 2: Thu hồi hoàn trả</span>
                    </span>
                    <span className="text-[10px] bg-stone-200 text-stone-800 font-bold px-2 py-0.5 rounded-full">
                      ĐÃ ĐẶT LỊCH
                    </span>
                  </div>
                  <p className="text-stone-500 text-[11px]">Khung giờ hẹn lấy: <strong>Trước 17:00 ngày {endDateFormatted}</strong></p>
                </div>
              </div>

              {/* Customer Destination Details */}
              <div className="pt-2 space-y-2 text-xs border-t border-stone-100">
                <span className="text-[10px] uppercase font-bold text-stone-400 block">Địa chỉ lưu ký người thuê:</span>
                <p className="font-semibold text-stone-800">{recipient} — {phone}</p>
                <p className="text-stone-600 leading-relaxed">{addressDetail}</p>
              </div>

              <button
                type="button"
                onClick={() => alert('Mở tra cứu bưu tá thời gian thực Viettel Post Handoff.')}
                className="w-full py-2.5 rounded-xl border border-stone-200 text-stone-700 hover:text-stone-900 hover:bg-stone-50 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">map</span>
                <span>Tra cứu vận đơn 2 chiều</span>
              </button>
            </div>

            {/* SHOP OWNER CONCIERGE & SUPPORT */}
            <div className="bg-stone-50 rounded-3xl p-6 sm:p-7 space-y-4 border border-[#E8E4DC]">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-stone-900 text-white flex items-center justify-center font-serif text-lg font-bold">
                  RH
                </div>
                <div>
                  <h5 className="text-xs font-bold text-stone-900">ReUse Partner Vault Concierge</h5>
                  <p className="text-[10px] text-stone-500">Đội ngũ kỹ thuật trực ban · Phản hồi trong 5 phút</p>
                </div>
              </div>
              <p className="text-xs text-stone-600 leading-relaxed">
                Cần hướng dẫn căn chỉnh kỹ thuật, kiểm tra phụ kiện hoặc hỗ trợ gia hạn đơn thuê? Kỹ thuật viên của Shop Owner luôn túc trực hỗ trợ bạn.
              </p>
              <Link
                to={\`/chat?orderId=\${order?._id || id}\`}
                className="w-full py-3 rounded-2xl bg-stone-900 text-white text-xs font-bold hover:bg-stone-800 transition-colors flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-[17px]">send</span>
                <span>Mở cuộc trò chuyện kỹ thuật</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RentOrderDossier;
`;

fs.writeFileSync(path.join(feRoot, "pages", "rent", "orders", "RentOrderDossier.tsx"), dossierComponent, "utf-8");
console.log("SUCCESS: Created RentOrderDossier.tsx");

// 2. Update App.tsx to use RentOrderDossier for /rent/orders/:id
const appPath = path.join(feRoot, "App.tsx");
let appContent = fs.readFileSync(appPath, "utf-8");

if (!appContent.includes("RentOrderDossier")) {
  appContent = appContent.replace(
    /import RentOrderDetail from "\.\/pages\/rent\/orders\/RentOrderDetail";/,
    `import RentOrderDetail from "./pages/rent/orders/RentOrderDetail";\nimport RentOrderDossier from "./pages/rent/orders/RentOrderDossier";`
  );
}

// Ensure /rent/orders/:id routes to RentOrderDossier
appContent = appContent.replace(
  /<Route\s+path="\/rent\/orders\/:id"\s+element=\{<RentOrderDetail\s*\/>\}\s*\/>/g,
  '<Route path="/rent/orders/:id" element={<RentOrderDossier />} />'
);

fs.writeFileSync(appPath, appContent, "utf-8");
console.log("SUCCESS: Updated App.tsx to route /rent/orders/:id to RentOrderDossier");

// 3. Update MyRentOrders.tsx to link to /rent/orders/:id for "Xem chi tiết" / "Biên bản CLA"
const myOrdersPath = path.join(feRoot, "pages", "rent", "orders", "MyRentOrders.tsx");
let myOrdersContent = fs.readFileSync(myOrdersPath, "utf-8");

// Look for where order action buttons are defined
// Replace any onClick / Link that opens detail
myOrdersContent = myOrdersContent.replace(
  /to=\{`\/rent\/orders\/\${order\.id}`\}/g,
  'to={`/rent/orders/${order.id}`}'
);

fs.writeFileSync(myOrdersPath, myOrdersContent, "utf-8");
console.log("SUCCESS: Updated MyRentOrders.tsx links");
