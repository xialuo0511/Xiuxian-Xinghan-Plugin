import path from 'path';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbFilePath = path.join(__dirname, '..', 'resources', 'data', 'database', 'database.db');

try {
    console.log(`正在连接并查询数据库: ${dbFilePath}`);
    const db = new Database(dbFilePath, { readonly: true });

    const rows = db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all();
    
    if (rows.length === 0) {
        console.log('数据库中没有找到任何表。');
    } else {
        console.log('数据库中的所有表:');
        rows.forEach(row => {
            console.log(`- ${row.name}`);
        });
    }

    db.close();

} catch (error) {
    console.error('查询数据库时发生错误:', error.message);
}
