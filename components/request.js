import fetch from "node-fetch"

class Request {
  /**
   * 创建请求选项配置
   * @param {string} method - HTTP方法 (GET, POST等)
   * @param {Object} [options={}] - 请求选项
   * @param {Object} [options.headers={}] - 自定义请求头
   * @param {Object} [options.body] - 请求体数据
   * @returns {Object} 配置完成的请求选项对象
   */
  createOptions(method, options = {}) {
    const { headers = {}, body } = options
    const Headers = body ? { "Content-Type": "application/json", ...headers } : { ...headers }

    const requestOptions = {
      method,
      headers: Headers,
      body: body ? JSON.stringify(body) : undefined
    }

    return requestOptions
  }

  /**
   * 处理不同格式的响应
   * @param {Response} response - 原始响应对象
   * @param {"json"|"text"|"raw"} [responseType="json"] - 期望的响应格式
   * @returns {Promise<any>} 处理后的响应数据
   */
  async handleRequest(response, responseType) {
    if (responseType === "raw") return response
    try {
      return responseType === "json" ? await response.json() : await response.text()
    } catch (error) {
      logger.error("[GamePush-Plugin] 响应解析失败:", error)
      return false
    }
  }

  /**
   * 核心请求方法
   * @param {string} method - HTTP方法
   * @param {string} url - 请求URL
   * @param {Object} [options={}] - 请求选项
   * @param {Object} [options.body] - 请求体数据（POST用）
   * @param {"json"|"text"|"raw"} [options.responseType="json"] - 响应数据类型
   * @param {Object} [options.headers={}] - 自定义请求头
   * @param {boolean} [options.log=true] - 是否记录请求日志
   * @param {string} [options.gameName] - 游戏名称（用于日志前缀）
   * @returns {Promise<any|boolean>} 成功返回响应数据，失败返回false
   */
  async request(method, url, options = {}) {
    const { body, responseType = "json", headers = {}, log = true, gameName } = options
    const requestOptions = this.createOptions(method, { body, headers })
    const gamePrefix = gameName ? `[GamePush-Plugin][${gameName}]` : "[GamePush-Plugin]"
    try {
      if (log) {
        logger.debug(`${gamePrefix} ${method}请求URL:`, url)
      }
      const response = await fetch(url, requestOptions)
      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`HTTP ${response.status}: ${errorText}`)
      }

      return await this.handleRequest(response, responseType)
    } catch (error) {
      const gamePrefix = gameName ? `[GamePush-Plugin][${gameName}]` : "[GamePush-Plugin]"
      if (log) logger.error(`${gamePrefix} ${method}请求失败:`, error.message)
      return false
    }
  }

  /**
   * 发送GET请求
   * @param {string} url - 请求URL
   * @param {Object} [options] - 高级选项
   * @param {Object} [options.headers] - 自定义请求头
   * @param {"json"|"text"|"raw"} [options.responseType] - 响应数据类型
   * @param {boolean} [options.log] - 是否记录日志
   * @param {string} [options.gameName] - 游戏名称
   * @returns {Promise<any|boolean>} 响应数据或false
   */
  async get(url, options = {}) {
    return this.request("GET", url, options)
  }

  /**
   * 发送POST请求
   * @param {string} url - 请求URL
   * @param {Object} body - 请求体内容
   * @param {Object} [options] - 高级选项
   * @param {Object} [options.headers] - 自定义请求头
   * @param {"json"|"text"|"raw"} [options.responseType] - 响应数据类型
   * @param {boolean} [options.log] - 是否记录日志
   * @param {string} [options.gameName] - 游戏名称
   * @returns {Promise<any|boolean>} 响应数据或false
   */
  async post(url, body, options = {}) {
    return this.request("POST", url, { ...options, body })
  }
}

export default new Request()
