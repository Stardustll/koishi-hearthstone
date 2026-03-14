import Database from 'better-sqlite3';
import path from 'path';

const db = new Database(path.resolve(__dirname,'../data/hearthstone_cards.db'));

export function searchCard(value){
    const rows = db.prepare(`SELECT * from card_names WHERE name LIKE ?`).all(`%${value}%`);
    const row = db.prepare(`SELECT image_normal_data from cards WHERE id = ?`).all(rows[0].id);
    // return JSON.stringify(row);
    // return rows.map(r => r.name).join('\n');
    return Buffer.from(row[0].image_normal_data).toString('base64');
}