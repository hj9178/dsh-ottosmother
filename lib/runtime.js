/**
 * dsh-ottosmother — 宿主侧 volatile 字段解引用。
 *
 * 设置页写入的字段带 `.volatile()` 时，schemastery ≥3.18.3 在解析期把它们包成
 * `{ get() }` 引用；profile patch 或手写配置里则是普通值。两种形态都得能当值用，
 * 否则设置页改完的档位会被静默忽略。宿主不支持 volatile 时字段就是普通值，同一
 * 函数原样返回。
 */

/**
 * 取出 volatile 字段当前值。
 * @param value - schema 解析后的字段值：普通值或 `{ get() }` 引用。
 * @returns 字段当前值。
 */
export function readVolatile(value) {
  if (value !== null && typeof value === 'object' && typeof value.get === 'function') {
    return value.get()
  }
  return value
}
