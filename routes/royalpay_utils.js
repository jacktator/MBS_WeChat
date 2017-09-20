'use strict';
const CryptoJS = require('crypto-js');

/**
 * 支付API接口协议中包含字段nonce_str，主要保证签名不可预测。
 * 我们推荐生成随机数算法如下：调用随机数函数生成，将得到的值转换为字符串。
 * Ref: https://pay.weixin.qq.com/wiki/doc/api/H5.php?chapter=4_3
 * 
 * @param {*} length 生成字符串的长度，范围： (0, 32]
 */
function generateRandomString(length) {
  if (length && length > 0 && length <= 32) {

  } else {
    console.warn('length不符，将自动设置为32')
    length = 32
  }

  var text = '';
  var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

  for (var i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

/**
 * 
 * Ref: https://mpay.royalpay.com.au/docs/cn/#api-JSApi-NewJSAPI
 */
function generateSign(source) {
  const target = `${source}&${process.env.royalpay_secret}`
  return CryptoJS.SHA256(target).toString(CryptoJS.enc.Hex).toLowerCase();
}

module.exports = { generateRandomString, generateSign }