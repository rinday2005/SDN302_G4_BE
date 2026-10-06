import { REGIONS, SHIPPING_RATES } from './regionData.js';

const normalizeProvince = (province) => {
  return province ? province.trim().toLowerCase() : '';
};

const getRegion = (province) => {
  const normalized = normalizeProvince(province);

  for (const [region, provinces] of Object.entries(REGIONS)) {
    if (provinces.some((p) => normalizeProvince(p) === normalized)) {
      return region;
    }
  }
  return null;
};

/**
 * Tính phí shipping theo khu vực giữa shop và người dùng
 * @param {string} shopProvince - Tỉnh/Thành của shop
 * @param {string} userProvince - Tỉnh/Thành của người dùng
 * @returns {number} Phí vận chuyển (VND)
 */
export const calculateShippingFee = (shopProvince, userProvince) => {
  if (!shopProvince || !userProvince) {
    throw new Error('Vui lòng cung cấp đầy đủ thông tin tỉnh/thành phố');
  }

  if (normalizeProvince(shopProvince) === normalizeProvince(userProvince)) {
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