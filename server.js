'use strict';
var AV = require('leanengine');
const axios = require('axios');
const { config } = require('./globel');

AV.init({
  appId: process.env.LEANCLOUD_APP_ID,
  appKey: process.env.LEANCLOUD_APP_KEY,
  masterKey: process.env.LEANCLOUD_APP_MASTER_KEY
});

// 如果不希望使用 masterKey 权限，可以将下面一行删除
AV.Cloud.useMasterKey();

var app = require('./app');

// 端口一定要从环境变量 `LEANCLOUD_APP_PORT` 中获取。
// LeanEngine 运行时会分配端口并赋值到该变量。
var PORT = parseInt(process.env.LEANCLOUD_APP_PORT || process.env.PORT || 3000);

app.listen(PORT, function (err) {
  console.log('Node app is running on port:', PORT);

  // 注册全局未捕获异常处理器
  process.on('uncaughtException', function (err) {
    console.error("Caught exception:", err.stack);
  });
  process.on('unhandledRejection', function (reason, p) {
    console.error("Unhandled Rejection at: Promise ", p, " reason: ", reason.stack);
  });
});

// 初始化 axios 管理员 token
const username = process.env.wp_username;
const password = process.env.wp_password;
axios.post(`${config.auth_url}`, { username, password })
  .then(res => {
    axios.defaults.headers.common['Authorization'] = `Bearer ${res.data.token}`
    console.log('WP administrator login success.');
  })
  .catch(err => {
    console.log('Fatal error, WP administrator login fail.');
    console.log(err);
  })
