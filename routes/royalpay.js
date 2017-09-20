'use strict';
const router = require('express').Router();
const { generateSign } = require('./royalpay_utils');
const { updateTransactionStatus } = require('../cloud_wechat');

/**
 * 
 * 经实际测试，典型的回调参数如下，请勿删除！！！
 * const post_response_body = {
 *   partner_order_id: '3707',
 *   nonce_str: 'dXm3DS4O1z1n2WM',
 *   create_time: '2017-09-20 14:00:19',
 *   rate: 5.2892,
 *   real_fee: 10,
 *   total_fee: 10,
 *   sign: '8765b8a28815aa98f3bdfade39b3d2490dafbe36a39448aa7ae56ef2ccc88659',
 *   channel: 'Wechat',
 *   currency: 'CNY',
 *   time: '1505880049006',
 *   order_id: 'DRME-20170920040019202-FJ2F9ZOAU',
 *   pay_time: '2017-09-20 14:00:48'
 * }
 */

router.post('/paymentCallback', async function (req, res, next) {
  // 检查签名是否正确
  const valid_string = `${process.env.royalpay_partner_code}&${req.body.time}&${req.body.nonce_str}`;
  const expectSign = generateSign(valid_string);

  if (req.body.sign !== expectSign) {
    console.log('Fatal err: sign mis matched');
    res.send('Fatal err: sign mis matched');
    return;
  }

  // 接收异常信息
  try {
    const transaction = await updateTransactionStatus(req.body.partner_order_id);
  } catch (err) {
    res.send(err.message);
    return;
  }

  res.send('Ok')
})

module.exports = router;
