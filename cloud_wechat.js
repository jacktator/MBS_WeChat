'use strict';
const AV = require('leanengine');
const axios = require('axios');
const { config } = require('./globel');
const { generateRandomString, generateSign } = require('./routes/royalpay_utils');

const NEW_USER_ROLE = 'author';
const OAUTH2_ACCESS_TOKEN_BASE = 'https://api.weixin.qq.com/sns/oauth2/access_token?';
const GRANT_TYPE = 'authorization_code';
const NOTIFY_URL = 'http://mbs.leanapp.cn/royalpay/paymentCallback'

/**
 * 根据 OAuth2 获取的 code，进行 wp 登录并返回登录信息
 * 先尝试登录
 * 不成功则尝试注册后登录
 * 全部失败则返回失败信息
 */
AV.Cloud.define('fetchWeChatOpenId', async (request, response) => {
  // 转入Cloud脚本时启用
  // const currentUser = request.user
  // if (currentUser == undefined) {
  //   response.error('A logged in user is required.')
  //   return
  // }

  if (!request.params.code) {
    response.error('code not found');
    return;
  }

  const OAUTH2_ACCESS_TOKEN_URL = `${OAUTH2_ACCESS_TOKEN_BASE}appid=${process.env.wechat_app_id}&secret=${process.env.official_app_secret}&code=${request.params.code}&grant_type=${GRANT_TYPE}`;

  let openid;
  try {
    const res = await axios.get(OAUTH2_ACCESS_TOKEN_URL);
    openid = res.data.openid;
  } catch (error) {
    response.error(e);
    return;
  }

  // 尝试登录
  try {
    const res = await axios.post(`${config.auth_url}`, { username: openid, password: openid })
    response.success(res.data)
    return
  } catch (err) {
    // do nothing, 继续尝试注册
  }

  // 尝试注册, 注册成功则登录
  try {
    const data = {
      username: openid,
      password: openid,
      email: `${openid}@sk8.tech`,
      roles: [ NEW_USER_ROLE ],
      fields: {
        wechatopenid: openid
      }
    }
    const res = await axios.post(`${config.rest_url}/users`, data);
    const loginRes = await axios.post(`${config.auth_url}`, { username: openid, password: openid });
    response.success(loginRes.data);
  } catch (err) {
    response.error(err);
  }

})

/**
 * 创建 RoyalPay 订单
 */
AV.Cloud.define('createRoyalPayOrder', async (request, response) => {
  if (!request.params.token) {
    response.error('Token is required');
    return;
  }

  if (!request.params.orderId) {
    response.error('Order Id is required');
    return;
  }

  if (!request.params.redirect) {
    response.error('Redirect is required');
    return;
  }

  try {
    // transaction 相关验证
    // token 如果不正确，此处会直接抛异常
    const headers = { headers: { Authorization: request.params.token } };
    // 参考 JavaScript 特性 Rename & Destructure Variables, 即将第一个 response.data 重命名为 transaction,第二个同理
    const [{data: transaction}, { data: payer}] = await Promise.all([
      axios.get(`${config.rest_url}/transaction/${request.params.orderId}`, headers),
      axios.get(`${config.rest_url}/users/me?context=edit`, headers)
    ])

    const availableCouponInCent = payer.acf.accumulatedmbincent ? parseInt(payer.acf.accumulatedmbincent) : 0;
    const couponincent = transaction.acf.couponincent ? parseInt(transaction.acf.couponincent) : 0;
    if (couponincent < 0) {
      throw new Error('Coupon can be negative');
    }
    if (couponincent > availableCouponInCent) {
      throw new Error('Not enough MB');
    }

    // 最少扣费 2 元
    // let price = transaction.acf.amountincent - couponincent;
    // if (price < 200) {
    //   price = 200;
    // }

    // 访问 RoyalPay 创建订单
    const time = new Date().getTime();
    const nonce_str = generateRandomString(32);
    const valid_string = `${process.env.royalpay_partner_code}&${time}&${nonce_str}`;
    const sign = generateSign(valid_string);

    const req_data = {
      description: transaction.acf.deal.post_title,
      price: 10,
      // price: price,
      currency: 'CNY',
      notify_url: NOTIFY_URL,
      operator: 'lean_wechat'
    }

    const ROYALPAY_CREATE_ORDER_URL = `https://mpay.royalpay.com.au/api/v1.0/wechat_jsapi_gateway/partners/${process.env.royalpay_partner_code}/orders/${request.params.orderId}?time=${time}&nonce_str=${nonce_str}&sign=${sign}`;
    const royalOrderRes = await axios.put(ROYALPAY_CREATE_ORDER_URL, req_data, {});
    if (royalOrderRes.data.return_code === 'ORDER_PAID') {
      response.error(royalOrderRes.data.return_msg);
      return
    }

    // 组装 网页端 跳转链接
    const res_redirect = encodeURI(request.params.redirect);
    const res_directpay = false;
    const res_time = new Date().getTime();
    const res_nonce_str = generateRandomString(32)
    const res_valid_string = `${process.env.royalpay_partner_code}&${res_time}&${res_nonce_str}`
    const res_sign = generateSign(res_valid_string);

    const CLIENT_PAY_URL = `${royalOrderRes.data.pay_url}?redirect=${res_redirect}&directpay=${res_directpay}&time=${res_time}&nonce_str=${res_nonce_str}&sign=${res_sign}&valid_string=${res_valid_string}`;

    response.success({ pay_url: CLIENT_PAY_URL })
  } catch (err) {
    response.error(err)
  }
});

/**
 * 网页端进行查询支付结果
 */
AV.Cloud.define('queryRoyalPayResult', async (request, response) => {
  if (!request.params.token) {
    response.error('Token is required.');
    return;
  }

  if (!request.params.orderId) {
    response.error('Order Id is required.');
    return;
  }

  try {
    // token 会在此步验证是否合法
    const headers = { headers: { Authorization: request.params.token } };
    const { data: transaction } = await axios.get(`${config.rest_url}/transaction/${request.params.orderId}`, headers);

    console.log(transaction);
    if (transaction.status === 'publish') {
      response.success(transaction);
      return;
    }

    const updatedTransaction = await updateTransactionStatus(request.params.orderId);
    response.success(updatedTransaction);
  } catch (err) {
    response.error(err);
  }
});

/**
 * 可以重复调用
 * 默认不检查 token，此函数使用 wp 管理员账号进行操作
 * 错误以异常抛出,在调用函数处用 try...catch 进行处理
 * 如果成功，返回当前 transaction
 * 
 * @param {*} transactionId 
 */
async function updateTransactionStatus(transactionId) {
  const { data: transaction } = await axios.get(`${config.rest_url}/transaction/${transactionId}`);

  // 已付款成功，直接返回
  if (transaction.status === 'publish') {
    return transaction;
  }

  // 使用 RoyalPay 接口进行订单查询
  const time = new Date().getTime();
  const nonce_str = generateRandomString(32);
  const valid_string = `${process.env.royalpay_partner_code}&${time}&${nonce_str}`;
  const sign = generateSign(valid_string);
  const ROYALPAY_QUERY_URL = `https://mpay.royalpay.com.au/api/v1.0/gateway/partners/${process.env.royalpay_partner_code}/orders/${transactionId}?time=${time}&nonce_str=${nonce_str}&sign=${sign}&valid_string=${valid_string}`;

  // 对 RoyalPay 使用无 token header
  const { data: result } = await axios.get(ROYALPAY_QUERY_URL, {})

  if (result.return_code === 'SUCCESS' && result.result_code === 'PAY_SUCCESS') {
    // 开始更新 transaction
    const res = await axios.post(`${config.rest_url}/transaction/${transactionId}`, { status: 'publish' })
    return res.data;
  } else {
    throw new Error(`${result.return_code} ${result.result_code}`);
  }
}

module.exports = { updateTransactionStatus }