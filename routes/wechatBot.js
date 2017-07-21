var router = require('express').Router();
// 引用 wechat 库，详细请查看 https://github.com/node-webot/wechat
var wechat = require('wechat');
var config = {
  token: process.env.token,
  appid: process.env.appid,
  encodingAESKey: process.env.encodingAESKey
};

var WechatAPI = require('wechat-api');
var api = new WechatAPI(process.env.appid,
  process.env.appsecret);

var request = require('request');

var wechatMenu = require('../settings/menu');
var wechatReply = require('../settings/reply');


/**
 * Use this function to updateMenu
 *
 * @author Yitta
 * @see https://mp.weixin.qq.com/wiki/10/0234e39a2025342c17a7d23595c6b40a.html
 */
function updateMenu() {

  //1. Get Access token
  getAccessToken({
    success: function (accessToken) {

      //2. 创建表单并发送
      var menuRequestURL = "https://api.weixin.qq.com/cgi-bin/menu/create?access_token=" + accessToken;
      request.post({
            url: menuRequestURL,
            json: true,
            headers: {
              "content-type": "application/json"
            },
            body: {
              "button": wechatMenu.buttons
            }
          },
          function (err, httpResponse, body) {
            if (err != null) {
              console.log("菜单 EEEEEor ", err);
            } else {
              console.log("菜单 Success ");
            }
          })

    },
    error: function (error) {

      console.log("菜单更新 EEEEEor ", error);

    }
  });
}
updateMenu();

/**
 * Use this function to get AccessToken from WeChat
 *
 * @author Yitta
 * @see https://mp.weixin.qq.com/wiki/11/0e4b294685f817b95cbed85ba5e82b8f.html
 *
 * @param callback
 */
function getAccessToken(callback) {

  // Get Access token
  var requestURL = "https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=" + process.env.appid + "&secret=" + process.env.appsecret;
  console.log("requestURL", requestURL);
  request.get({
        url: requestURL,
        json: true,
        headers: {
          "Content-Type": "application/json"
        }
      },
      function (err, httpResponse, body) {
        if (err != null) {
          console.log('公众号授权 error:', err); // Print the error if one occurred
          callback.error(err);
        } else {
          console.log('公众号授权 success, token: ', body.access_token);
          callback.success(body.access_token);
        }
      });
}

router.use('/', wechat(config).text(function(message, req, res, next) {
  // message为文本内容
  // FromUserName: 'oPKu7jgOibOA-De4u8J2RuNKpZRw',
  // CreateTime: '1359125035',
  // MsgType: 'text',
  // Content: 'http',
  // MsgId: '5837397576500011341' }

    console.log("收到文字消息 ", message.Content);

    //关键词自动回复
    var keyword;

    for (keyword in wechatReply.keywords) {
        if (message.Content.search(keyword) != -1) {
            var reply = wechatReply.keywords[keyword].reply;
            res.reply(reply);

            return;
        }
    }

    res.reply("感谢亲的留言！！！\n我和你们一样，都是一个萌客Menger\n都在大土澳试图寻找一个梦想归宿/拥抱\n愿我们可以持续彼此分享观点\n告诉我你们的故事\n而我的故事，点击下方菜单即可阅读/爱心");
}).image(function(message, req, res, next) {
  // message为图片内容
  // { ToUserName: 'gh_d3e07d51b513',
  // FromUserName: 'oPKu7jgOibOA-De4u8J2RuNKpZRw',
  // CreateTime: '1359124971',
  // MsgType: 'image',
  // PicUrl: 'http://mmsns.qpic.cn/mmsns/bfc815ygvIWcaaZlEXJV7NzhmA3Y2fc4eBOxLjpPI60Q1Q6ibYicwg/0',
  // MediaId: 'media_id',
  // MsgId: '5837397301622104395' }}).voice(function(message, req, res, next) {
  // TODO
}).voice(function(message, req, res, next) {
  // message为音频内容
  // { ToUserName: 'gh_d3e07d51b513',
  // FromUserName: 'oPKu7jgOibOA-De4u8J2RuNKpZRw',
  // CreateTime: '1359125022',
  // MsgType: 'voice',
  // MediaId: 'OMYnpghh8fRfzHL8obuboDN9rmLig4s0xdpoNT6a5BoFZWufbE6srbCKc_bxduzS',
  // Format: 'amr',
  // MsgId: '5837397520665436492' }
}).video(function(message, req, res, next) {
  // message为视频内容
  // { ToUserName: 'gh_d3e07d51b513',
  // FromUserName: 'oPKu7jgOibOA-De4u8J2RuNKpZRw',
  // CreateTime: '1359125022',
  // MsgType: 'video',
  // MediaId: 'OMYnpghh8fRfzHL8obuboDN9rmLig4s0xdpoNT6a5BoFZWufbE6srbCKc_bxduzS',
  // ThumbMediaId: 'media_id',
  // MsgId: '5837397520665436492' }
  // TODO
}).shortvideo(function(message, req, res, next) {
  // message为短视频内容
  // { ToUserName: 'gh_d3e07d51b513',
  // FromUserName: 'oPKu7jgOibOA-De4u8J2RuNKpZRw',
  // CreateTime: '1359125022',
  // MsgType: 'shortvideo',
  // MediaId: 'OMYnpghh8fRfzHL8obuboDN9rmLig4s0xdpoNT6a5BoFZWufbE6srbCKc_bxduzS',
  // ThumbMediaId: 'media_id',
  // MsgId: '5837397520665436492' }
  // TODO
}).location(function(message, req, res, next) {
  // message为链接内容
  // { ToUserName: 'gh_d3e07d51b513',
  // FromUserName: 'oPKu7jgOibOA-De4u8J2RuNKpZRw',
  // CreateTime: '1359125022',
  // MsgType: 'link',
  // Title: '公众平台官网链接',
  // Description: '公众平台官网链接',
  // Url: 'http://1024.com/',
  // MsgId: '5837397520665436492' }
  // TODO
}).link(function(message, req, res, next) {
  // message为链接内容
  // { ToUserName: 'gh_d3e07d51b513',
  // FromUserName: 'oPKu7jgOibOA-De4u8J2RuNKpZRw',
  // CreateTime: '1359125022',
  // MsgType: 'link',
  // Title: '公众平台官网链接',
  // Description: '公众平台官网链接',
  // Url: 'http://1024.com/',
  // MsgId: '5837397520665436492' }
  // TODO
}).event(function(message, req, res, next) {
  // message为事件内容
  // { ToUserName: 'gh_d3e07d51b513',
  // FromUserName: 'oPKu7jgOibOA-De4u8J2RuNKpZRw',
  // CreateTime: '1359125022',
  // MsgType: 'event',
  // Event: 'LOCATION',
  // Latitude: '23.137466',
  // Longitude: '113.352425',
  // Precision: '119.385040',
  // MsgId: '5837397520665436492' }
    //CLICK事件响应
    //@author Yitta
    //@see https://mp.weixin.qq.com/wiki/7/9f89d962eba4c5924ed95b513ba69d9b.html
    if (message.Event == 'CLICK') {

        console.log("收到click事件 ", message.EventKey);

        var eventKey = message.EventKey;

        var primaryKey,
            secondaryKey;

        for (primaryKey in wechatMenu.buttons) {

            var primaryButton = wechatMenu.buttons[primaryKey];

            for (secondaryKey in primaryButton.sub_button) {

                var secondaryButton = primaryButton.sub_button[secondaryKey];

                if (eventKey == secondaryButton.key) {
                    res.reply(secondaryButton.reply);

                }
            }
        }
    }
}).device_text(function(message, req, res, next) {
  // message为设备文本消息内容
  // { ToUserName: 'gh_d3e07d51b513',
  // FromUserName: 'oPKu7jgOibOA-De4u8J2RuNKpZRw',
  // CreateTime: '1359125022',
  // MsgType: 'device_text',
  // DeviceType: 'gh_d3e07d51b513'
  // DeviceID: 'dev1234abcd',
  // Content: 'd2hvc3lvdXJkYWRkeQ==',
  // SessionID: '9394',
  // MsgId: '5837397520665436492',
  // OpenID: 'oPKu7jgOibOA-De4u8J2RuNKpZRw' }
  // TODO
}).device_event(function(message, req, res, next) {
  // message为设备事件内容
  // { ToUserName: 'gh_d3e07d51b513',
  // FromUserName: 'oPKu7jgOibOA-De4u8J2RuNKpZRw',
  // CreateTime: '1359125022',
  // MsgType: 'device_event',
  // Event: 'bind'
  // DeviceType: 'gh_d3e07d51b513'
  // DeviceID: 'dev1234abcd',
  // OpType : 0, //Event为subscribe_status/unsubscribe_status时存在
  // Content: 'd2hvc3lvdXJkYWRkeQ==', //Event不为subscribe_status/unsubscribe_status时存在
  // SessionID: '9394',
  // MsgId: '5837397520665436492',
  // OpenID: 'oPKu7jgOibOA-De4u8J2RuNKpZRw' }
  // TODO
}).middlewarify());

module.exports = router;