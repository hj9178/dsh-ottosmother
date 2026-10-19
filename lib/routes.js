/**
 * dsh-ottosmother 宿主侧 HTTP 路由（设置页用）。
 *
 * 两条 exact 路由挂在裸 webServer 上（`/api` 前缀的 fence 管不到 exact 注册），
 * 因此同源校验自己做：只接受 loopback 部署的浏览器请求，跨站请求一律 403。
 * 桌面代理会剥掉 origin/host，缺 origin 的请求放行（非浏览器客户端，且同样受
 * loopback host 限制）。
 *
 * 路由只读词表目录与打开文件夹，不写任何词表内容——词条由用户直接编辑 YAML。
 */
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { buildCatalog } from './config.js'

/** 词表快照路由。 */
export const CATALOG_PATH = '/dsh-ottosmother/catalog'
/** 打开词表文件夹路由。 */
export const REVEAL_PATH = '/dsh-ottosmother/reveal'

/**
 * 注册两条路由；webServer 服务就绪后执行，卸载时自动注销。
 * @param ctx - 宿主 cordis 上下文。
 * @param current - 现读配置（返回 resolveConfig 快照）。
 */
export function registerRoutes(ctx, current) {
  if (typeof ctx?.inject !== 'function') {
    ctx?.logger?.error?.('dsh-ottosmother: ctx.inject 不可用，设置页路由未注册。')
    return
  }
  ctx.inject(['webServer'], (webCtx) => {
    const server = webCtx?.webServer
    if (server === undefined || typeof server.register !== 'function') {
      webCtx?.logger?.error?.('dsh-ottosmother: webServer 服务不可用，设置页路由未注册。')
      return
    }
    try {
      const disposers = [
        server.register({
          kind: 'exact',
          path: CATALOG_PATH,
          handler: (request, response) => handleCatalog(request, response, current),
        }),
        server.register({
          kind: 'exact',
          path: REVEAL_PATH,
          handler: (request, response) => handleReveal(request, response, current),
        }),
      ]
      webCtx.effect(
        () => () => {
          for (const dispose of disposers) {
            try {
              dispose()
            } catch {
              // 卸载期的注销失败不影响进程
            }
          }
        },
        'dsh-ottosmother: settings routes',
      )
    } catch (error) {
      webCtx.logger?.error?.(`dsh-ottosmother: 注册设置页路由失败: ${String(error)}`)
    }
  })
}

/**
 * GET /dsh-ottosmother/catalog：词表文件清单 + 总开关 + 提醒强度。
 * @param request - 传入请求。
 * @param response - 传出响应。
 * @param current - 现读配置。
 */
function handleCatalog(request, response, current) {
  if (request.method !== 'GET') {
    response.writeHead(405, { allow: 'GET' })
    response.end()
    return
  }
  if (!sameOrigin(request)) {
    sendJson(response, 403, { error: 'untrusted origin' })
    return
  }
  try {
    sendJson(response, 200, buildCatalog(current()))
  } catch (error) {
    sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) })
  }
}

/**
 * POST /dsh-ottosmother/reveal：在系统文件管理器里打开词表目录。
 * body: `{ target?: 'user' | 'builtin' }`，缺省 user。
 * @param request - 传入请求。
 * @param response - 传出响应。
 * @param current - 现读配置。
 */
async function handleReveal(request, response, current) {
  if (request.method !== 'POST') {
    response.writeHead(405, { allow: 'POST' })
    response.end()
    return
  }
  if (!sameOrigin(request)) {
    sendJson(response, 403, { error: 'untrusted origin' })
    return
  }
  const body = await readJsonBody(request)
  const target = body?.target === 'builtin' ? 'builtin' : 'user'
  const resolved = current()
  const dir = target === 'builtin' ? resolved.builtinDir : resolved.userDir
  try {
    mkdirSync(dir, { recursive: true })
    revealDirectory(dir)
    sendJson(response, 200, { ok: true, dir })
  } catch (error) {
    sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) })
  }
}

/**
 * 写 JSON 响应（no-store：设置页每次都要拿到最新词表）。
 * @param response - 传出响应。
 * @param status - HTTP 状态码。
 * @param payload - 任意可 JSON 序列化的负载。
 */
export function sendJson(response, status, payload) {
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
  })
  response.end(JSON.stringify(payload))
}

/**
 * 同源校验：loopback host + 非跨站 + 有 origin 时必须与 host 相同。
 * @param request - 传入请求。
 * @returns 是否允许该请求。
 */
export function sameOrigin(request) {
  if (request.headers['sec-fetch-site'] === 'cross-site') return false
  const host = request.headers.host
  if (host !== undefined && !loopbackHost(host)) return false
  const origin = request.headers.origin
  if (origin === undefined) return true
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

/**
 * host 头是否指向 loopback（含端口）。
 * @param host - `Host` 头。
 */
export function loopbackHost(host) {
  const lower = String(host).toLowerCase()
  const name = lower.startsWith('[') ? lower.slice(0, lower.indexOf(']') + 1) : lower.split(':')[0]
  return name === '127.0.0.1' || name === 'localhost' || name === '[::1]'
}

/**
 * 读 JSON 请求体（上限 4 KiB，超出按空对象处理，避免拖死连接）。
 * @param request - 传入请求。
 * @param maxBytes - 上限字节数。
 */
export async function readJsonBody(request, maxBytes = 4096) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > maxBytes) return {}
    chunks.push(buffer)
  }
  if (chunks.length === 0) return {}
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    return parsed !== null && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

/**
 * 在系统文件管理器打开目录（不存在则创建）。
 * @param dir - 目录绝对路径。
 */
export function revealDirectory(dir) {
  const child =
    process.platform === 'win32'
      ? spawn('explorer.exe', [dir], { detached: true, stdio: 'ignore' })
      : process.platform === 'darwin'
        ? spawn('open', [dir], { detached: true, stdio: 'ignore' })
        : spawn('xdg-open', [dir], { detached: true, stdio: 'ignore' })
  child.on('error', () => {
    // 无文件管理器/被拒绝时静默：页面已经拿到 dir，用户可手动打开
  })
  child.unref()
}
