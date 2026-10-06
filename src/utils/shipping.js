const REGIONS = {
  NORTH: [
    'Hà Nội', 'Hải Phòng', 'Hải Dương', 'Hưng Yên', 'Bắc Ninh', 'Hà Nam', 'Nam Định',
    'Ninh Bình', 'Thái Bình', 'Vĩnh Phúc', 'Hà Giang', 'Cao Bằng', 'Bắc Kạn',
    'Lạng Sơn', 'Tuyên Quang', 'Thái Nguyên', 'Phú Thọ', 'Bắc Giang', 'Quảng Ninh',
    'Lào Cai', 'Yên Bái', 'Điện Biên', 'Hòa Bình', 'Lai Châu', 'Sơn La',
  ],
  CENTRAL: [
    'Thanh Hóa', 'Nghệ An', 'Hà Tĩnh', 'Quảng Bình', 'Quảng Trị', 'Thừa Thiên Huế', 'Huế',
    'Đà Nẵng', 'Quảng Nam', 'Quảng Ngãi', 'Bình Định', 'Phú Yên', 'Khánh Hòa',
    'Ninh Thuận', 'Bình Thuận', 'Kon Tum', 'Gia Lai', 'Đắk Lắk', 'Đắk Nông', 'Lâm Đồng',
  ],
  SOUTH: [
    'Hồ Chí Minh', 'TP Hồ Chí Minh', 'TP.HCM', 'Bình Dương', 'Bình Phước', 'Đồng Nai',
    'Tây Ninh', 'Bà Rịa - Vũng Tàu', 'Long An', 'Đồng Tháp', 'Tiền Giang', 'An Giang',
    'Bến Tre', 'Vĩnh Long', 'Trà Vinh', 'Hậu Giang', 'Kiên Giang', 'Sóc Trăng',
    'Bạc Liêu', 'Cà Mau', 'Cần Thơ',
  ],
};

const SHIPPING_RATES = {
  LOCAL: 25000,
  REGIONAL: 35000,
  INTER_REGION: 45000,
};

const normalizeString = (str) => {
  return str ? str.trim().toLowerCase() : '';
};

const getRegion = (province) => {
  const normProvince = normalizeString(province);

  for (const [region, provinces] of Object.entries(REGIONS)) {
    if (provinces.some((p) => normalizeString(p) === normProvince)) {
      return region;
    }
  }
  return null;
};

/**
 * Tính phí vận chuyển theo khu vực
 * @param {string} shopProvince - Tỉnh/Thành phố của shop
 * @param {string} userProvince - Tỉnh/Thành phố của người thuê/mua
 * @returns {number} Phí vận chuyển (VND)
 */
export const calculateShippingFee = (shopProvince, userProvince) => {
  if (!shopProvince || !userProvince) {
    throw new Error('Vui lòng cung cấp đầy đủ tỉnh/thành phố của shop và người nhận');
  }

  if (normalizeString(shopProvince) === normalizeString(userProvince)) {
    return SHIPPING_RATES.LOCAL;
  }

  const shopRegion = getRegion(shopProvince);
  const userRegion = getRegion(userProvince);

  if (!shopRegion || !userRegion) {
    throw new Error('Tỉnh/thành phố không hợp lệ hoặc chưa được hỗ trợ');
  }

  if (shopRegion === userRegion) {
    return SHIPPING_RATES.REGIONAL;
  }

  return SHIPPING_RATES.INTER_REGION;
};

export default calculateShippingFee;