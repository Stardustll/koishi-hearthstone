/**
 * 炉石传说卡牌在线搜索模块
 * 从 fbigame.com API 搜索卡牌并下载图片
 */
import * as https from 'https'

const API_URL = 'https://fbigame.com/card/search'
const PAGE_URL = 'https://fbigame.com/card'
const OSS_BASE = 'https://fbigame.oss-cn-beijing.aliyuncs.com/'

const agent = new https.Agent()

interface Session {
  csrf: string
  cookies: string
  xsrf: string
}

let cachedSession: Session | null = null

/** 基础 HTTPS 请求封装 */
function httpsRequest(
  method: string,
  url: string,
  headers?: Record<string, string>,
  body?: string
): Promise<{ statusCode: number; headers: Record<string, string | string[] | undefined>; body: string }> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url)
    const req = https.request(
      {
        method,
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
          ...headers,
        },
        agent,
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode || 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf-8'),
          })
        })
      }
    )
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

/** 下载二进制数据 */
function downloadBuffer(url: string): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const urlObj = new URL(url)
    https
      .get(
        {
          hostname: urlObj.hostname,
          path: urlObj.pathname + urlObj.search,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
          agent,
        },
        (res) => {
          if (res.statusCode !== 200) {
            resolve(null)
            return
          }
          const chunks: Buffer[] = []
          res.on('data', (chunk: Buffer) => chunks.push(chunk))
          res.on('end', () => resolve(Buffer.concat(chunks)))
        }
      )
      .on('error', () => resolve(null))
  })
}

/** 获取 CSRF Token 和 Session Cookies */
async function initSession(): Promise<Session> {
  if (cachedSession) return cachedSession

  const resp = await httpsRequest('GET', PAGE_URL)

  const csrfMatch = resp.body.match(/<meta name="csrf-token" content="([^"]+)"/)
  if (!csrfMatch) throw new Error('无法获取CSRF token')

  const setCookies = resp.headers['set-cookie']
  const cookieStr = Array.isArray(setCookies)
    ? setCookies.map((c) => c.split(';')[0]).join('; ')
    : setCookies?.split(';')[0] || ''

  const xsrfMatch = cookieStr.match(/XSRF-TOKEN=([^;,]+)/)
  const xsrf = xsrfMatch ? decodeURIComponent(xsrfMatch[1]) : ''

  cachedSession = { csrf: csrfMatch[1], cookies: cookieStr, xsrf }
  return cachedSession
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

const MAX_RETRIES = 5

/** 调用搜索 API 的通用方法 */
async function postSearchApi(searchQuery: string, page: number, retries = 0): Promise<any | null> {
  try {
    const session = await initSession()

    const payload = JSON.stringify({
      searchQuery,
      page,
      mode: 'list',
      zilliaxSearch: 0,
      sideboardType: 0,
      touristClassId: 0,
    })

    const resp = await httpsRequest(
      'POST',
      API_URL,
      {
        'Content-Type': 'application/json',
        'Content-Length': String(Buffer.byteLength(payload)),
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        'X-CSRF-TOKEN': session.csrf,
        'X-XSRF-TOKEN': session.xsrf,
        Cookie: session.cookies,
        Referer: PAGE_URL,
        Origin: 'https://fbigame.com',
      },
      payload
    )

    if (resp.statusCode === 419 && retries < MAX_RETRIES) {
      cachedSession = null
      return postSearchApi(searchQuery, page, retries + 1)
    }

    if (resp.statusCode === 429 && retries < MAX_RETRIES) {
      const wait = Math.min(30 + retries * 15, 90) * 1000
      await sleep(wait)
      return postSearchApi(searchQuery, page, retries + 1)
    }

    if (resp.statusCode !== 200) return null

    return JSON.parse(resp.body)
  } catch {
    if (retries < MAX_RETRIES) {
      cachedSession = null
      await sleep((retries + 1) * 3000)
      return postSearchApi(searchQuery, page, retries + 1)
    }
    return null
  }
}

/** 在线搜索卡牌，返回 API 原始数据数组 */
export async function searchCardOnline(name: string): Promise<any[] | null> {
  const data = await postSearchApi(name, 1)
  return data?.data || null
}

/** 分页抓取全部卡牌，返回 { total, lastPage, data } */
export async function fetchCardPage(page: number): Promise<{ total: number; lastPage: number; data: any[] } | null> {
  const data = await postSearchApi('', page)
  if (!data) return null
  return {
    total: data.total,
    lastPage: data.last_page,
    data: data.data || [],
  }
}

/** 从 OSS 下载卡牌图片 */
export async function downloadCardImage(relativePath: string): Promise<Buffer | null> {
  if (!relativePath) return null
  const url = OSS_BASE + relativePath + '?x-oss-process=style/hearthstone-image'
  return downloadBuffer(url)
}
