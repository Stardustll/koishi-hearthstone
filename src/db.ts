import Database from 'better-sqlite3';
import path from 'path';
import { json } from 'stream/consumers';

const db = new Database(path.resolve(__dirname,'../data/hearthstone_cards.db'));

export function searchCard_id(value){
    const row = db.prepare(`SELECT image_normal_data from cards WHERE id = ?`).get(`%${value}%`);
    return Buffer.from(row.image_normal_data).toString('base64');
}

export function searchCard_img(value){
    const row = db.prepare(`SELECT image_normal_data from cards WHERE id = ?`).get(value);
    return Buffer.from(row.image_normal_data).toString('base64');
}

export function searchCard(value){
    const row = db.prepare(`SELECT a.id, a.name, b.tag_value from card_names a JOIN card_tags b ON a.id = b.card_id WHERE a.name LIKE ? AND b.tag_id = 321`).all(`%${value}%`);
    // const result = '卡牌ID		卡牌名			可否收藏\n' + 
	// 				row.map(r => `${String(r.id).padEnd(7, ' ')}		${r.name.padEnd(15, ' ')}     ${r.tag_value === 1 ? '是' : '否'}`).join('\n');
    const result = row.map(r => `ID: ${r.id}\n名称: ${r.name}\n可收藏: ${r.tag_value === 1 ? '是' : '否'}`).join('\n---\n')
	return result;
}