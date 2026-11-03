import nodemailer from "nodemailer";
import { FRONTEND_URL } from "../config/env.js";

/**
 * Gửi email thông báo mở khóa tài khoản thành công đến Gmail của User
 * Tự động dùng Gmail SMTP khi có EMAIL_USER (hoặc GMAIL_USER) và EMAIL_PASS (hoặc GMAIL_PASS)
 */
export const sendAccountUnlockEmail = async ({ to, fullName, lockReason, adminReply }) => {
  const user = process.env.EMAIL_USER || process.env.GMAIL_USER;
  const pass = process.env.EMAIL_PASS || process.env.GMAIL_PASS || process.env.GMAIL_APP_PASSWORD;
  const senderEmail = user || "cskh.reusehub@gmail.com";
  const loginUrl = `${FRONTEND_URL || "http://localhost:3000"}/login`;

  const htmlContent = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <title>Thông Báo Mở Khóa Tài Khoản ReUse Hub</title>
  </head>
  <body style="margin: 0; padding: 0; background-color: #f7f3ec; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1c1c18;">
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f7f3ec; padding: 40px 20px;">
      <tr>
        <td align="center">
          <table width="600" border="0" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06); border: 1px solid #e6e2db;">
            
            <!-- HEADER -->
            <tr>
              <td style="background-color: #141310; padding: 32px 40px; text-align: left;">
                <div style="font-size: 22px; font-weight: bold; color: #fdf9f2; letter-spacing: 1px; font-family: Georgia, serif;">
                  REUSE HUB
                </div>
                <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #bfcab6; margin-top: 4px;">
                  Circular Fashion Ecosystem • Trust &amp; Safety Division
                </div>
              </td>
            </tr>

            <!-- HERO STATUS BANNER -->
            <tr>
              <td style="background-color: #d8e3ce; padding: 18px 40px; text-align: left; border-bottom: 1px solid #bfcab6;">
                <table width="100%" border="0" cellspacing="0" cellpadding="0">
                  <tr>
                    <td width="30" valign="middle">
                      <span style="display: inline-block; width: 14px; height: 14px; background-color: #576151; border-radius: 50%;"></span>
                    </td>
                    <td valign="middle" style="font-size: 13px; font-weight: bold; color: #2e352b; letter-spacing: 0.5px; text-transform: uppercase;">
                      Xác Nhận Kiểm Tra &amp; Mở Khóa Tài Khoản Thành Công
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- CONTENT BODY -->
            <tr>
              <td style="padding: 36px 40px;">
                <p style="font-size: 16px; font-weight: 600; color: #141310; margin-top: 0; margin-bottom: 16px;">
                  Kính gửi ${fullName || "Quý khách"},
                </p>
                <p style="font-size: 14px; line-height: 1.6; color: #4a463f; margin-bottom: 24px;">
                  Ban Quản Trị và Bộ Phận Kiểm Soát Tuân Thủ ReUse Hub xin thông báo: Đề nghị xem xét của bạn đối với tài khoản <strong>${to}</strong> đã được chúng tôi thẩm định kỹ lưỡng. Tài khoản của bạn hiện đã được <strong>phục hồi trạng thái hoạt động bình thường (ACTIVE)</strong>.
                </p>

                <!-- DETAILS BOX -->
                <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #fdf9f2; border: 1px solid #e6e2db; border-radius: 12px; margin-bottom: 28px;">
                  <tr>
                    <td style="padding: 20px;">
                      <div style="font-size: 11px; font-weight: bold; text-transform: uppercase; color: #7b766f; letter-spacing: 1px; margin-bottom: 6px;">
                        1. Lý do tài khoản từng bị tạm khóa:
                      </div>
                      <div style="font-size: 13px; color: #ba1a1a; font-weight: 500; margin-bottom: 16px; background-color: #ffdad6; padding: 10px 14px; border-radius: 8px;">
                        ${lockReason || "Tạm khóa tự động để rà soát an toàn hoặc kiểm tra hoạt động bất thường."}
                      </div>

                      <div style="font-size: 11px; font-weight: bold; text-transform: uppercase; color: #7b766f; letter-spacing: 1px; margin-bottom: 6px;">
                        2. Phản hồi và Kết luận từ Quản trị viên:
                      </div>
                      <div style="font-size: 13px; color: #1c1c18; line-height: 1.6; background-color: #ffffff; padding: 12px 14px; border-radius: 8px; border: 1px solid #ccc5bc;">
                        ${adminReply || "Đội ngũ Quản trị viên đã kiểm tra lại thông tin, xác thực lịch sử giao dịch và đối chiếu hiện trạng tài khoản hoàn toàn hợp lệ. Chúng tôi đã tiến hành mở khóa toàn diện."}
                      </div>
                    </td>
                  </tr>
                </table>

                <!-- ACTION BUTTON -->
                <div style="text-align: center; margin-bottom: 30px;">
                  <a href="${loginUrl}" style="display: inline-block; background-color: #141310; color: #fdf9f2; padding: 14px 32px; border-radius: 10px; font-size: 14px; font-weight: bold; text-decoration: none; letter-spacing: 0.5px;">
                    Đăng Nhập Lại Vào ReUse Hub ↗
                  </a>
                </div>

                <p style="font-size: 12px; line-height: 1.6; color: #7b766f; margin-bottom: 0;">
                  Nếu bạn cần thêm bất kỳ sự trợ giúp nào hoặc có thắc mắc về các giao dịch ký quỹ (Smart Escrow) hay đơn hàng, vui lòng phản hồi trực tiếp email này hoặc liên hệ hotline: <strong>1900 8821</strong>.
                </p>
              </td>
            </tr>

            <!-- FOOTER -->
            <tr>
              <td style="background-color: #f7f3ec; padding: 24px 40px; text-align: center; border-top: 1px solid #e6e2db;">
                <div style="font-size: 12px; font-weight: 600; color: #1c1c18; margin-bottom: 4px;">
                  ReUse Hub Vietnam Co., Ltd.
                </div>
                <div style="font-size: 11px; color: #7b766f;">
                  B-Corp Certified Circular Economy Fashion Platform • Hồ Chí Minh, Việt Nam
                </div>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
  </html>
  `;

  const mailOptions = {
    from: `"ReUse Hub Security" <${senderEmail}>`,
    to,
    subject: `[ReUse Hub] Tài khoản của bạn đã được mở khóa thành công - #${Date.now().toString().slice(-6)}`,
    html: htmlContent,
  };

  if (!user || !pass) {
    console.log(`[Email Service Notice] Chưa có EMAIL_USER và EMAIL_PASS trong .env. Email mẫu đã được tạo sẵn sàng cho: ${to}`);
    return {
      success: true,
      simulated: true,
      message: `Đã chuẩn bị nội dung email mở khóa cho ${to}. Để gửi trực tiếp qua Google SMTP, vui lòng thêm EMAIL_USER và EMAIL_PASS vào .env.`,
    };
  }

  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user, pass },
      tls: { rejectUnauthorized: false },
    });

    const info = await transporter.sendMail(mailOptions);
    console.log(`[Email] Đã gửi thành công email mở khóa tới ${to}. MessageId: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.warn(`[Email Error] Lỗi khi gửi qua Gmail SMTP: ${err.message}`);
    return { success: false, error: err.message };
  }
};
