import { Context, Schema } from 'koishi'
import { searchCard } from './db'
import path from 'path'

export const name = 'hearthstone'

export interface Config {}

export const Config: Schema<Config> = Schema.object({})

export function apply(ctx: Context, config: Config) {
  // write your plugin here
  // 如果收到“天王盖地虎”，就回应“宝塔镇河妖”
  ctx.on('message', (session) => {
    if (session.content === '测试') {
      session.send(path.resolve(__dirname))
    }
  })

  ctx.command('卡牌查询 <message>')
    .action((_, message) => {
      return `<image url="data:image/png;base64,${searchCard(message)}"/>`
      
    })
}
