// 通知服务模块（WxPusher 等）
// 分钟缠论侧通过 INTRADAY_WECHAT_PUSH_ENABLED 控制是否启用；恢复推送时改该开关并配置 token/uid。

class NotificationServiceClass {
  constructor() {
    this.config = {
      strategyName: '交易策略',
      wxPusherTokens: ['AT_dMjPttrnlSqU9uKlpW7oxkGzVynM2RkD'],
      wxPusherUids: ['UID_fG02ooNJzDTHmyv4Lhh0JFAPPBC4', 'UID_MB31nZrc9wG0D9baIFdQuZshiRLU'],
      topicIds: []
    }

    this.lastNotificationType = {}
    this.notificationMessages = []
  }

  setConfig(config) {
    this.config = {
      ...this.config,
      ...config
    }
  }

  addNotification(message, signalType, indexSymbol) {
    try {
      if (this.lastNotificationType[indexSymbol] === signalType) {
        console.log(`信号类型未变化，跳过通知: ${signalType} for ${indexSymbol}`)
        return
      }

      this.notificationMessages.push(message)
      this.lastNotificationType[indexSymbol] = signalType
    } catch (error) {
      console.error('添加通知消息失败:', error)
    }
  }

  async sendAllNotifications() {
    if (this.notificationMessages.length === 0) {
      console.log('没有新的通知需要发送')
      return { messageCount: 0, sentCount: 0, failedCount: 0 }
    }

    const combinedMessage = this.notificationMessages.join('\n\n')
    const messageCount = this.notificationMessages.length
    let result = { sentCount: 0, failedCount: 0 }

    if (this.config.wxPusherTokens && this.config.wxPusherTokens.length > 0) {
      result = await this.sendWxPusherNotifications(combinedMessage)
    }

    this.notificationMessages = []
    return { messageCount, ...result }
  }

  async sendWxPusherNotifications(message) {
    let sentCount = 0
    let failedCount = 0

    for (let i = 0; i < this.config.wxPusherTokens.length; i++) {
      const token = this.config.wxPusherTokens[i]
      if (token) {
        try {
          const response = await fetch('https://wxpusher.zjiecode.com/api/send/message', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              appToken: token,
              content: `## ${this.config.strategyName}通知\n\n${message}`,
              contentType: 3,
              uids: this.config.wxPusherUids,
              topicIds: this.config.topicIds
            })
          })
          const data = await response.json()
          if (!response.ok || (data.code && data.code !== 1000)) {
            failedCount += 1
          } else {
            sentCount += 1
          }
          console.log(`WxPusher通知发送结果 [用户${i + 1}]:`, data)
        } catch (error) {
          failedCount += 1
          console.error(`WxPusher通知发送失败 [用户${i + 1}]:`, error)
        }
      }
    }

    return { sentCount, failedCount }
  }
}

const NotificationService = new NotificationServiceClass()

if (typeof module !== 'undefined' && module.exports) {
  module.exports = NotificationService
} else if (typeof window !== 'undefined') {
  window.NotificationService = NotificationService
}

export default NotificationService
