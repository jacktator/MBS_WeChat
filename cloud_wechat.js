'use strict';
const AV = require('leanengine');
const axios = require('axios');
const { config } = require('./globel');

const OAUTH2_ACCESS_TOKEN_BASE = 'https://api.weixin.qq.com/sns/oauth2/access_token?';
const GRANT_TYPE = 'authorization_code';

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

  // 尝试注册
  try {
    const data = {
      username: openid,
      password: openid,
      email: `${openid}@sk8.tech`,
      roles: ['subscriber'],
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