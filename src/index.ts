import { Context, Schema, h } from 'koishi'
import { searchCard_id, searchCard, storeCardFromApi, storeCardsFromApi, getCardCount, getCardImagePath, updateCardImage } from './db'
import { searchCardOnline, downloadCardImage, fetchCardPage } from './api'

export const name = 'hearthstone'

export interface Config {}

export const Config: Schema<Config> = Schema.object({})

const PER_PAGE = 50
let isDownloading = false

export function apply(ctx: Context, config: Config) {

  ctx.command('卡牌查询 <message>')
    .action(async (argv, message) => {
      let results = searchCard(message);

      if (!results) {
        const onlineCards = await searchCardOnline(message);
        if (!onlineCards?.length) return '未找到相关卡牌';
        for (const card of onlineCards) {
          storeCardFromApi(card);
        }
        results = searchCard(message);
      }

      if (!results?.length) return '未找到相关卡牌';

      // 每张卡牌构建一条子消息
      const messages = await Promise.all(results.map(async (card) => {
        let imageData = card.image_normal_data;

        if (!imageData) {
          const imagePath = getCardImagePath(card.id);
          if (imagePath) {
            const buf = await downloadCardImage(imagePath);
            if (buf) {
              updateCardImage(card.id, buf);
              imageData = buf;
            }
          }
        }

        const children: any[] = [
          `【${card.name}】\nID: ${card.id}\n可收藏: ${card.collectible ? '是' : '否'}`,
        ];

        if (imageData) {
          children.push('\n');
          children.push(h('image', { url: `data:image/png;base64,${imageData.toString('base64')}` }));
        }

        return h('message', {}, ...children);
      }));

      await argv.session.send(h('message', { forward: true }, ...messages));
      return;
    })

  ctx.command('id查询卡牌 <message>').alias('id查询')
    .action(async (_, message) => {
      const localResult = searchCard_id(message);
      if (localResult) {
        return `<image url="data:image/png;base64,${localResult}"/>`;
      }

      const imagePath = getCardImagePath(Number(message));
      if (imagePath) {
        const imageData = await downloadCardImage(imagePath);
        if (imageData) {
          updateCardImage(Number(message), imageData);
          return `<image url="data:image/png;base64,${imageData.toString('base64')}"/>`;
        }
      }

      return '未找到相关卡牌';
    })

  ctx.command('下载卡牌数据')
    .action(async (argv) => {
      if (isDownloading) return '⏳ 正在下载中，请耐心等待...';
      isDownloading = true;

      try {
        const existingCount = getCardCount();

        // 获取第一页，确认总量
        const firstPage = await fetchCardPage(1);
        if (!firstPage) {
          isDownloading = false;
          return '❌ 连接服务器失败，请稍后重试';
        }

        const { total, lastPage } = firstPage;
        let startPage = 1;
        let stored = existingCount;

        if (existingCount > 0) {
          startPage = Math.floor(existingCount / PER_PAGE) + 1;
          if (startPage > lastPage) {
            isDownloading = false;
            return `✅ 数据库已包含全部 ${existingCount} 张卡牌，无需下载`;
          }
          await argv.session.send(
            `📦 数据库已有 ${existingCount} 张卡牌，从第 ${startPage}/${lastPage} 页继续下载...`
          );
        } else {
          await argv.session.send(
            `📦 开始下载卡牌数据，共 ${total} 张卡牌（${lastPage} 页）...\n⏱ 预计需要几分钟，期间可正常使用其他命令`
          );
          // 存储第一页
          storeCardsFromApi(firstPage.data);
          stored = firstPage.data.length;
          startPage = 2;
        }

        let failedPages = 0;

        for (let page = startPage; page <= lastPage; page++) {
          const pageData = await fetchCardPage(page);
          if (pageData?.data?.length) {
            storeCardsFromApi(pageData.data);
            stored += pageData.data.length;
          } else {
            failedPages++;
          }

          // 每 100 页报告一次进度
          if (page % 100 === 0) {
            const pct = Math.round((page / lastPage) * 100);
            await argv.session.send(
              `📥 下载进度: ${page}/${lastPage}（${pct}%）- 已存储 ${stored} 张`
            );
          }

          // 请求间隔，避免触发限速
          await new Promise(r => setTimeout(r, 1000));
        }

        isDownloading = false;

        const summary = [`✅ 卡牌数据下载完成！共 ${stored} 张卡牌`];
        if (failedPages > 0) {
          summary.push(`⚠ ${failedPages} 页下载失败，可重新执行命令补全`);
        }
        summary.push('💡 卡牌图片将在使用查询功能时按需下载');
        return summary.join('\n');

      } catch (e) {
        isDownloading = false;
        return `❌ 下载失败: ${e.message}`;
      }
    })
}
