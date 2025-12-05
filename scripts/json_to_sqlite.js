import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';

// --- 配置 ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sourceDir = path.join(__dirname, '..', 'resources', 'data', 'item');
const outputDir = path.join(__dirname, '..', 'resources', 'data', 'database');
const dbFilePath = path.join(outputDir, 'database.db');

// --- 主函数 ---
function main() {
    console.log('开始规范化迁移JSON数据到SQLite...');

        // 2. 初始化数据库
        const db = new Database(dbFilePath, { verbose: console.log });

    try {
        // 2. 优先处理 linggen (灵根)
        const linggenMap = processLinggen(db);
        console.log(`灵根数据处理完毕，共 ${linggenMap.size} 条。`);

        // 3. 处理 npc (势力与NPC)
        processNpcs(db, linggenMap);

        // 4. 通用处理剩余的JSON文件
        processRemainingFiles(db);

        console.log('\n✅ 数据库迁移成功完成！');
    } catch (error) {
        console.error('\n❌ 迁移过程中发生严重错误:', error);
    } finally {
        db.close();
        console.log('数据库连接已关闭。');
    }
}

// --- 灵根处理模块 ---
function processLinggen(db) {
    const filePath = path.join(sourceDir, '灵根列表.json');
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    db.exec(`
        CREATE TABLE linggen (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            type TEXT,
            eff REAL,
            法球倍率 REAL
        );
    `);

    const insert = db.prepare('INSERT OR IGNORE INTO linggen (name, type, eff, 法球倍率) VALUES (?, ?, ?, ?)');
    db.transaction((items) => {
        for (const item of items) {
            // 忽略JSON中的id，name必须唯一
            insert.run(item.name, item.type, item.eff, item.法球倍率);
        }
    })(data);

    // 创建 name -> id 的映射
    const linggenMap = new Map();
    const rows = db.prepare('SELECT id, name FROM linggen').all();
    for (const row of rows) {
        linggenMap.set(row.name, row.id);
    }
    return linggenMap;
}

// --- NPC处理模块 ---
function processNpcs(db, linggenMap) {
    const filePath = path.join(sourceDir, 'npc列表.json');
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    // 创建势力表和NPC表
    db.exec(`
        CREATE TABLE factions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE
        );
    `);
    db.exec(`
        CREATE TABLE npcs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            faction_id INTEGER,
            level_group TEXT NOT NULL,
            name TEXT NOT NULL,
            atk REAL,
            def REAL,
            blood REAL,
            baoji REAL,
            linggen_id INTEGER,
            FOREIGN KEY (faction_id) REFERENCES factions (id),
            FOREIGN KEY (linggen_id) REFERENCES linggen (id)
        );
    `);

    const insertFaction = db.prepare('INSERT INTO factions (name) VALUES (?)');
    const insertNpc = db.prepare('INSERT INTO npcs (faction_id, level_group, name, atk, def, blood, baoji, linggen_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');

    db.transaction((factions) => {
        for (const faction of factions) {
            // 插入势力并获取ID
            const info = insertFaction.run(faction.name);
            const faction_id = info.lastInsertRowid;
            console.log(`\n处理势力: ${faction.name} (ID: ${faction_id})`);

            // 遍历 one, two, three 等级的NPC
            for (const group of ['one', 'two', 'three']) {
                if (faction[group]) {
                    for (const npc of faction[group]) {
                        const linggen_id = npc.灵根 ? linggenMap.get(npc.灵根.name) : null;
                        if (npc.灵根 && !linggen_id) {
                            console.warn(`警告: NPC "${npc.name}" 的灵根 "${npc.灵根.name}" 在灵根列表中未找到，将设置为NULL。`);
                        }
                        insertNpc.run(faction_id, group, npc.name, npc.atk, npc.def, npc.blood, npc.baoji, linggen_id);
                    }
                }
            }
        }
    })(data);
    console.log(`NPC数据处理完毕。`);
}

// --- 通用文件处理模块 ---
function processRemainingFiles(db) {
    const processedFiles = ['灵根列表.json', 'npc列表.json'];
    const files = fs.readdirSync(sourceDir).filter(file => 
        path.extname(file).toLowerCase() === '.json' && 
        fs.statSync(path.join(sourceDir, file)).isFile() &&
        !processedFiles.includes(file)
    );

    console.log(`\n开始通用处理其余 ${files.length} 个文件...`);

    for (const file of files) {
        const filePath = path.join(sourceDir, file);
        const tableName = path.basename(file, '.json');
        console.log(`--- 正在处理: ${file} -> 表: "${tableName}" ---`);

        try {
            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            if (!Array.isArray(data) || data.length === 0) {
                console.log(`文件 ${file} 内容为空或格式不正确，已跳过。`);
                continue;
            }

            const sampleObject = data[0];
            const columns = Object.keys(sampleObject).filter(key => key !== 'id'); // 忽略原始id

            const createColumns = ['id INTEGER PRIMARY KEY AUTOINCREMENT']
                .concat(columns.map(key => `"${key}" ${inferType(sampleObject[key])}`))
                .join(', ');
            db.exec(`CREATE TABLE IF NOT EXISTS "${tableName}" (${createColumns});`);

            const insert = db.prepare(`INSERT INTO "${tableName}" (${columns.map(c => `"${c}"`).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`);
            
            db.transaction((items) => {
                for (const item of items) {
                    const values = columns.map(col => {
                        let val = item[col];
                        if (typeof val === 'boolean') val = val ? 1 : 0;
                        if (typeof val === 'object' && val !== null) val = JSON.stringify(val);
                        return val;
                    });
                    insert.run(values);
                }
            })(data);
            console.log(`成功将 ${data.length} 条记录插入到 "${tableName}" 表中。`);

        } catch (e) {
            console.error(`处理文件 ${file} 时出错:`, e.message);
        }
    }
}

// --- 辅助函数 ---
function inferType(value) {
    if (typeof value === 'number') {
        if (Number.isInteger(value)) return 'INTEGER';
        return 'REAL';
    }
    if (typeof value === 'boolean') return 'INTEGER';
    return 'TEXT';
}

main();