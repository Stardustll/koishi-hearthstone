import { Context, Schema } from 'koishi'
import { searchCard_id,searchCard_img,searchCard } from './db'
import path from 'path'

export const name = 'hearthstone'

export interface Config {}

export const Config: Schema<Config> = Schema.object({})

export function apply(ctx: Context, config: Config) {
  // write your plugin here

  ctx.command('卡牌查询 <message>')
    .action((_, message) => {
      const result = searchCard(message);
      if(result){
        return result;
      }
      else{
        return '未找到相关卡牌';
      }
      // return `<image url="data:image/png;base64,${searchCard(message)}"/>`
    })
  
  ctx.command('id查询卡牌 <message>').alias('id查询')
    .action((_, message) => {
      const result = searchCard_id(message);
      if(result){
      return `<image url="data:image/png;base64,${result}"/>`}
      else{
        return '未找到相关卡牌';
      }
    })
}
