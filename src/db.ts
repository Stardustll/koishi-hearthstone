import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_DIR = path.resolve(__dirname, '../data');
const DB_PATH = path.resolve(DB_DIR, 'hearthstone_cards.db');

// 确保 data 目录存在
fs.mkdirSync(DB_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// 自动创建表结构（无数据库时也能正常启动）
function ensureSchema() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS cards (
            id INTEGER PRIMARY KEY,
            card_id TEXT NOT NULL,
            dbfid INTEGER,
            artist_name TEXT,
            cost INTEGER,
            card_set INTEGER,
            card_class INTEGER,
            card_type INTEGER,
            collectible INTEGER,
            tech_level INTEGER,
            hidden INTEGER,
            hash TEXT,
            version TEXT,
            image_normal TEXT,
            image_normal_data BLOB,
            image_battlegrounds TEXT,
            image_battlegrounds_data BLOB,
            tile_image TEXT,
            tile_image_data BLOB,
            created_at TEXT,
            updated_at TEXT
        );

        CREATE TABLE IF NOT EXISTS card_names (
            id INTEGER PRIMARY KEY,
            card_id INTEGER NOT NULL,
            name TEXT,
            locale TEXT NOT NULL,
            FOREIGN KEY (card_id) REFERENCES cards(id)
        );

        CREATE TABLE IF NOT EXISTS card_texts (
            id INTEGER PRIMARY KEY,
            card_id INTEGER NOT NULL,
            text TEXT,
            plain_text TEXT,
            locale TEXT NOT NULL,
            FOREIGN KEY (card_id) REFERENCES cards(id)
        );

        CREATE TABLE IF NOT EXISTS card_flavor_texts (
            id INTEGER PRIMARY KEY,
            card_id INTEGER NOT NULL,
            flavor_text TEXT,
            locale TEXT NOT NULL,
            FOREIGN KEY (card_id) REFERENCES cards(id)
        );

        CREATE TABLE IF NOT EXISTS card_tags (
            card_id INTEGER NOT NULL,
            tag_id INTEGER NOT NULL,
            tag_name TEXT,
            display_name TEXT,
            tag_value INTEGER,
            PRIMARY KEY (card_id, tag_id),
            FOREIGN KEY (card_id) REFERENCES cards(id)
        );

        CREATE TABLE IF NOT EXISTS card_classes (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            display_name TEXT,
            hero_dbfid INTEGER,
            icon TEXT,
            can_diy INTEGER,
            can_build_deck INTEGER,
            enabled INTEGER,
            sort INTEGER
        );

        CREATE TABLE IF NOT EXISTS card_class_map (
            card_id INTEGER NOT NULL,
            class_id INTEGER NOT NULL,
            PRIMARY KEY (card_id, class_id),
            FOREIGN KEY (card_id) REFERENCES cards(id),
            FOREIGN KEY (class_id) REFERENCES card_classes(id)
        );

        CREATE TABLE IF NOT EXISTS card_sets (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            display_name TEXT,
            icon TEXT,
            has_mini INTEGER,
            mini_name TEXT,
            logo TEXT,
            reveal_date TEXT,
            enabled INTEGER,
            sort INTEGER
        );

        CREATE TABLE IF NOT EXISTS card_rarities (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            display_name TEXT,
            icon TEXT,
            enabled INTEGER,
            sort INTEGER
        );

        CREATE TABLE IF NOT EXISTS card_relations (
            card_id INTEGER NOT NULL,
            related_card_id INTEGER NOT NULL,
            direction TEXT NOT NULL,
            PRIMARY KEY (card_id, related_card_id, direction),
            FOREIGN KEY (card_id) REFERENCES cards(id)
        );

        CREATE TABLE IF NOT EXISTS card_how_to_earn (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            card_id INTEGER NOT NULL,
            description TEXT,
            locale TEXT,
            FOREIGN KEY (card_id) REFERENCES cards(id)
        );

        CREATE INDEX IF NOT EXISTS idx_cards_card_id ON cards(card_id);
        CREATE INDEX IF NOT EXISTS idx_cards_dbfid ON cards(dbfid);
        CREATE INDEX IF NOT EXISTS idx_card_names_card_id ON card_names(card_id);
        CREATE INDEX IF NOT EXISTS idx_card_names_locale ON card_names(locale);
        CREATE INDEX IF NOT EXISTS idx_card_texts_card_id ON card_texts(card_id);
        CREATE INDEX IF NOT EXISTS idx_card_tags_card_id ON card_tags(card_id);
        CREATE INDEX IF NOT EXISTS idx_cards_cost ON cards(cost);
        CREATE INDEX IF NOT EXISTS idx_cards_card_type ON cards(card_type);
        CREATE INDEX IF NOT EXISTS idx_cards_collectible ON cards(collectible);
    `);
}

ensureSchema();

// 查询函数

export function searchCard_id(value) {
    const row = db.prepare('SELECT image_normal_data FROM cards WHERE id = ?').get(value);
    if (!row?.image_normal_data) return null;
    return Buffer.from(row.image_normal_data).toString('base64');
}

export function searchCard_img(value) {
    const row = db.prepare('SELECT image_normal_data FROM cards WHERE id = ?').get(value);
    if (!row?.image_normal_data) return null;
    return Buffer.from(row.image_normal_data).toString('base64');
}

export interface CardSearchResult {
    id: number;
    name: string;
    collectible: boolean;
    image_normal_data: Buffer | null;
}

export function searchCard(value: string): CardSearchResult[] | null {
    const rows = db.prepare(
        `SELECT c.id, cn.name, ct.tag_value as collectible, c.image_normal_data
         FROM cards c
         JOIN card_names cn ON cn.card_id = c.id
         LEFT JOIN card_tags ct ON ct.card_id = c.id AND ct.tag_id = 321
         WHERE cn.name LIKE ?
         GROUP BY c.id`
    ).all(`%${value}%`) as any[];

    if (!rows.length) return null;

    return rows.map(r => ({
        id: r.id,
        name: r.name,
        collectible: r.collectible === 1,
        image_normal_data: r.image_normal_data ? Buffer.from(r.image_normal_data) : null,
    }));
}

// 辅助函数

export function getCardCount(): number {
    const row = db.prepare('SELECT COUNT(*) as count FROM cards').get();
    return row?.count || 0;
}

export function getCardImagePath(cardId: number): string | null {
    const row = db.prepare('SELECT image_normal FROM cards WHERE id = ?').get(cardId);
    return row?.image_normal || null;
}

export function updateCardImage(cardId: number, imageData: Buffer) {
    db.prepare('UPDATE cards SET image_normal_data = ? WHERE id = ?').run(imageData, cardId);
}

// 批量存储

/* 将一批 API 返回的卡牌数据存入本地数据库（使用事务加速） */
export const storeCardsFromApi = db.transaction((cards: any[]) => {
    for (const card of cards) {
        storeCardFromApi(card);
    }
});

/* 将单张 API 返回的卡牌数据存入本地数据库 */
export function storeCardFromApi(card: any) {
    const image = card.image || {};
    const tile = card.tile || {};

    db.prepare(`
        INSERT OR REPLACE INTO cards
        (id, card_id, dbfid, artist_name, cost, card_set, card_class, card_type,
         collectible, tech_level, hidden, hash, version, image_normal,
         image_battlegrounds, tile_image, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        card.id, card.card_id, card.dbfid,
        card.artist_name, card.cost, card.card_set,
        card.card_class, card.card_type, card.collectible,
        card.tech_level, card.hidden, card.hash,
        card.version,
        image.image_normal, image.image_battlegrounds,
        tile?.image,
        card.created_at, card.updated_at
    );

    const insertName = db.prepare(
        'INSERT OR REPLACE INTO card_names (id, card_id, name, locale) VALUES (?, ?, ?, ?)'
    );
    for (const name of (card.names || [])) {
        insertName.run(name.id, card.id, name.name, name.locale);
    }

    const insertText = db.prepare(
        'INSERT OR REPLACE INTO card_texts (id, card_id, text, plain_text, locale) VALUES (?, ?, ?, ?, ?)'
    );
    for (const text of (card.texts || [])) {
        insertText.run(text.id, card.id, text.text, text.plain_text, text.locale);
    }

    const insertFlavor = db.prepare(
        'INSERT OR REPLACE INTO card_flavor_texts (id, card_id, flavor_text, locale) VALUES (?, ?, ?, ?)'
    );
    for (const ft of (card.flavor_texts || [])) {
        insertFlavor.run(ft.id, card.id, ft.flavor_text, ft.locale);
    }

    const insertTag = db.prepare(
        'INSERT OR REPLACE INTO card_tags (card_id, tag_id, tag_name, display_name, tag_value) VALUES (?, ?, ?, ?, ?)'
    );
    for (const tag of (card.tags || [])) {
        const pivot = tag.pivot || {};
        insertTag.run(card.id, tag.id, tag.name, tag.display_name, pivot.game_tag_value);
    }

    const insertClass = db.prepare(`
        INSERT OR REPLACE INTO card_classes
        (id, name, display_name, hero_dbfid, icon, can_diy, can_build_deck, enabled, sort)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertClassMap = db.prepare(
        'INSERT OR IGNORE INTO card_class_map (card_id, class_id) VALUES (?, ?)'
    );
    for (const cls of (card.card_classes || [])) {
        insertClass.run(
            cls.id, cls.name, cls.display_name, cls.hero_dbfid,
            cls.icon, cls.can_diy, cls.can_build_deck, cls.enabled, cls.sort
        );
        insertClassMap.run(card.id, cls.id);
    }

    const insertSet = db.prepare(`
        INSERT OR REPLACE INTO card_sets
        (id, name, display_name, icon, has_mini, mini_name, logo, reveal_date, enabled, sort)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const cs of (card.card_sets || [])) {
        insertSet.run(
            cs.id, cs.name, cs.display_name, cs.icon,
            cs.has_mini, cs.mini_name, cs.logo, cs.reveal_date, cs.enabled, cs.sort
        );
    }

    const insertRarity = db.prepare(
        'INSERT OR REPLACE INTO card_rarities (id, name, display_name, icon, enabled, sort) VALUES (?, ?, ?, ?, ?, ?)'
    );
    for (const rarity of (card.card_rarities || [])) {
        insertRarity.run(rarity.id, rarity.name, rarity.display_name, rarity.icon, rarity.enabled, rarity.sort);
    }
}
