'use strict';
const AV = require('leanengine');
const axios = require('axios');
const { config } = require('./globel');
const { generateRandomString, generateSign } = require('./routes/royalpay_utils');

const NEW_USER_ROLE = 'author';
const OAUTH2_ACCESS_TOKEN_BASE = 'https://api.weixin.qq.com/sns/oauth2/access_token?';
const GRANT_TYPE = 'authorization_code';
const NOTIFY_URL = 'http://mbs.leanapp.cn/royalpay/paymentCallback'
const CURRENCY_TYPE = 'AUD'

const TransactionCategoryType = {
  Spending: 13,
  Withdrawal: 14,
  Debit: 28,
  Accumulate: 15,
  TopUp: 12,
}

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
      email: `${openid}@aaaaaask8.tech`,
      roles: [NEW_USER_ROLE],
      // fields: {
      //   wechatopenid: openid,
      //   accumulatedmbincent:10000
      // }
    }
    var authOptions = {
      method: 'POST',
      url: `${config.rest_url}/users`,
      data: data,
      json: true
    };
    const res = await axios(authOptions).then(response=>{
      console.log("res###################",response)
      console.log("res.body ###################",response.body)
      console.log("res.josn ###################",reponse.id,"aaaa:",response.body.id);
      axios.post(`${config.acf_url}/users/${response.id}`, { fields: { wechatopenid: openid, accumulatedmbincent: 10000 } });  
    })
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
    const [{ data: transaction }, { data: payer }] = await Promise.all([
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

    //最少扣费 2 元
    let price = parseInt(transaction.acf.amountincent ? transaction.acf.amountincent : 0);
    if (price < 200) {
      price = 200;
    }

    // 访问 RoyalPay 创建订单
    const time = new Date().getTime();
    const nonce_str = generateRandomString(32);
    const valid_string = `${process.env.royalpay_partner_code}&${time}&${nonce_str}`;
    const sign = generateSign(valid_string);

    const req_data = {
      description: transaction.acf.deal.post_title,
      // price: 1,
      price: price,
      currency: CURRENCY_TYPE,
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
 * 如果用现金支付，更新订单状态
 */
AV.Cloud.define('cashPay', async (request, response) => {
  if (!request.params.token) {
    response.error('Token is required.');
    return;
  }

  if (!request.params.orderId) {
    response.error('Order Id is required.');
    return;
  }

  try {
    // 验证 token 合法性
    const headers = { headers: { Authorization: request.params.token } };
    const { data: transaction } = await axios.get(`${config.rest_url}/transaction/${request.params.orderId}`, headers);

    // 已经支付过了，直接返回
    if (transaction.status === 'publish') {
      response.success(transaction);
      return;
    }

    // 更新订单
    const updatedTransaction = await _updateTransactionStatusImplementation(transaction);
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
    const finalTransaction = await _updateTransactionStatusImplementation(transaction);
    return finalTransaction;
  } else {
    throw new Error(`${result.return_code} ${result.result_code}`);
  }
}

/**
 * 不可以重复调用！！！
 * 因为 cash 不经过 RoyalPay 查询，因此把真正修改 transaction 跟 coupon 部分分离出来
 * 先进行 transaction 操作
 * 再修改用户 mb
 * 最后更新订单
 * @param {*} transactionId 
 */
async function _updateTransactionStatusImplementation(transaction) {
  const { data: payer } = await axios.get(`${config.rest_url}/users/${transaction.acf.payer.ID}`);
  const originalCouponInCent = parseInt(payer.acf.accumulatedmbincent ? payer.acf.accumulatedmbincent : 0);

  // 花费 mb 的 transaction 生成
  const subedCouponInCent = originalCouponInCent - parseInt(transaction.couponincent ? transaction.couponincent : 0);

  const spendingTransactionFields = {
    payer: payer.id,
    balancebefore: parseInt(originalCouponInCent),
    balanceafter: parseInt(subedCouponInCent),
    recipient: transaction.recipient,
    totalincent: 0,
    couponincent: 0,
    amountincent: 0,
    paymenttype: transaction.paymenttype,
    deal: transaction.acf.deal.ID,
    vendor: transaction.acf.vendor.ID,
    order: transaction.id,
  }
  
  // 特别注意 acf 更新后并不返回 user 而是 { acf: {} }
  const [{ data: spendingTransaction }, { data: acfObject }] = await Promise.all([
    axios.post(`${config.rest_url}/transaction`, {
      title: `${transaction.title.rendered} 扣除萌币`,
      status: 'publish', 
      categories: [TransactionCategoryType.Spending], 
      fields: spendingTransactionFields 
    }),
    axios.post(`${config.acf_url}/users/${payer.id}`, { fields: { accumulatedmbincent: subedCouponInCent } })
  ])
  
  // 增加 mb 的 transaction 生成
  const subedOriginalCouponInCent = parseInt(acfObject.acf.accumulatedmbincent ? acfObject.acf.accumulatedmbincent : 0);
  const amountincent = parseInt(transaction.amountincent ? transaction.amountincent : 0);
  const addedCouponInCent = subedOriginalCouponInCent + Math.floor(amountincent / 10);

  const accumulatingTransactionFields = {
    payer: payer.id,
    balancebefore: parseInt(subedOriginalCouponInCent),
    balanceafter: parseInt(addedCouponInCent),
    recipient: transaction.recipient,
    totalincent: 0,
    couponincent: 0,
    amountincent: 0,
    paymenttype: transaction.paymenttype,
    deal: transaction.acf.deal.ID,
    vendor: transaction.acf.vendor.ID,
    order: transaction.id,
  }
  const [{ data: accumulatingTransaction }, { data: addedAcfObject }] = await Promise.all([
    axios.post(`${config.rest_url}/transaction`, {
      title: `${transaction.title.rendered} 奖励萌币`,
      status: 'publish', 
      categories: [TransactionCategoryType.Accumulate], 
      fields: accumulatingTransactionFields 
    }),
    axios.post(`${config.acf_url}/users/${payer.id}`, { fields: { accumulatedmbincent: addedCouponInCent }})
  ]);

  // 更新 vendor 或 deal 相关信息
  if (transaction.paymenttype === 'cash') {
    const { data: vendor } = await axios.get(`${config.rest_url}/vendor/${transaction.acf.vendor.ID}`);
    const monthNum = new Date().getMonth();
    const monthString = getMonthName(monthNum)
    const monthKey = `${monthString}cashincent`
    const originalVendorCashInCent = parseInt(vendor.acf[monthKey] ? vendor.acf[monthKey] : 0);
    const addedVendorCashInCent = originalVendorCashInCent + amountincent;
    let data = { fields: {} };
    data.fields[monthKey] = addedVendorCashInCent;
    await axios.post(`${config.acf_url}/vendor/${transaction.acf.vendor.ID}`, data);
  } else if (transaction.paymenttype === 'wechat') {
    const { data: deal } = await axios.get(`${config.rest_url}/deal/${transaction.acf.deal.ID}`);
    const originalDealAccumulatedTotalInCent = parseInt(deal.accumulatedtotalincent ? deal.accumulatedtotalincent : 0);
    const originalDealAccumulatedCouponInCent = parseInt(deal.accumulatedcouponincent ? deal.accumulatedcouponincent : 0);
    const originalDealAccumulatedAmountInCent = parseInt(deal.accumulatedamountincent ? deal.accumulatedamountincent : 0);
    
    const addedDealAccumulatedTotalInCent = originalDealAccumulatedTotalInCent + parseInt(transaction.totalincent ? transaction.totalincent : 0);
    const addedDealAccumulatedCouponInCent = originalDealAccumulatedCouponInCent + parseInt(transaction.couponincent ? transaction.couponincent : 0);
    const addedDealAccumulatedAmountInCent = originalDealAccumulatedAmountInCent + parseInt(transaction.amountincent ? transaction.amountincent : 0);

    let data = { 
      fields: {
        accumulatedtotalincent: addedDealAccumulatedTotalInCent,
        accumulatedcouponincent: addedDealAccumulatedCouponInCent,
        accumulatedamountincent: addedDealAccumulatedAmountInCent,
      }
    }
    await axios.post(`${config.acf_url}/deal/${transaction.acf.deal.ID}`, data);
  }

  // 开始更新 transaction
  const res = await axios.post(`${config.rest_url}/transaction/${transaction.id}`, { status: 'publish' })

  return res.data;
}

function getMonthName(num) {
  switch (num) {
    case 0: return 'january';
    case 1: return 'february';
    case 2: return 'march';
    case 3: return 'april';
    case 4: return 'may';
    case 5: return 'june';
    case 6: return 'july';
    case 7: return 'august';
    case 8: return 'september';
    case 9: return 'october';
    case 10: return 'november';
    case 11: return 'december';
    default: throw new Error('Invalide month number');
  }
}

module.exports = { updateTransactionStatus }