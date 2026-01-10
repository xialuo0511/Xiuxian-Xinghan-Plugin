/**
 * Redis 备份逻辑模块
 * 提供备份、还原、列表等功能
 */

import { redisClient } from '../api/data-access.js';
import fs from 'fs';
import path from 'path';
import YAML from 'yaml';

// 配置路径
const BACKUP_CONFIG_PATH = path.join(process.cwd(), 'plugins', 'xiuxian-emulator-plugin', 'config', 'backup.yaml');
const BACKUP_DIR = path.join(process.cwd(), 'plugins', 'xiuxian-emulator-plugin', 'backups');

// 默认配置
const DEFAULT_CONFIG = {
    schedule: {
        enabled: true,
        cron: '0 4 * * *'  // 默认每天 4:00
    },
    maxBackups: 30,
    keyPatterns: ['xiuxian:*', 'XinghanXiuxian:*']
};

/**
 * 获取备份配置
 * @returns {object}
 */
export function GetBackupConfig() {
    try {
        if (fs.existsSync(BACKUP_CONFIG_PATH)) {
            const content = fs.readFileSync(BACKUP_CONFIG_PATH, 'utf8');
            return { ...DEFAULT_CONFIG, ...YAML.parse(content) };
        }
    } catch (error) {
        console.error('[备份] 读取配置失败:', error.message);
    }
    return DEFAULT_CONFIG;
}

/**
 * 保存备份配置
 * @param {object} config 配置对象
 */
export function SaveBackupConfig(config) {
    try {
        const dir = path.dirname(BACKUP_CONFIG_PATH);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(BACKUP_CONFIG_PATH, YAML.stringify(config), 'utf8');
        return true;
    } catch (error) {
        console.error('[备份] 保存配置失败:', error.message);
        return false;
    }
}

/**
 * 确保备份目录存在
 */
function EnsureBackupDir() {
    if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }
}

/**
 * 生成备份文件名（使用本地时间）
 * @returns {string}
 */
function GenerateBackupFilename() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `xiuxian_backup_${year}${month}${day}_${hours}${minutes}${seconds}.json`;
}

/**
 * 创建备份
 * @returns {Promise<{success: boolean, message: string, filename?: string}>}
 */
export async function CreateBackup() {
    try {
        EnsureBackupDir();

        const config = GetBackupConfig();
        // 支持多个键模式
        const patterns = config.keyPatterns || config.keyPattern
            ? (Array.isArray(config.keyPatterns) ? config.keyPatterns : [config.keyPattern])
            : ['xiuxian:*', 'XinghanXiuxian:*'];

        // 获取所有匹配的键
        let allKeys = [];
        for (const pattern of patterns) {
            const keys = await redisClient.keys(pattern);
            allKeys = allKeys.concat(keys);
        }

        // 去重
        allKeys = [...new Set(allKeys)];

        if (allKeys.length === 0) {
            return { success: false, message: '没有找到需要备份的数据' };
        }

        // 备份数据
        const backupData = {
            version: '1.0',
            timestamp: new Date().toISOString(),
            keyCount: allKeys.length,
            data: {}
        };

        for (const key of allKeys) {
            try {
                // 获取键的类型
                const type = await redisClient.type(key);

                let value;
                switch (type) {
                    case 'string':
                        value = await redisClient.get(key);
                        break;
                    case 'hash':
                        value = await redisClient.hGetAll(key);
                        break;
                    case 'list':
                        value = await redisClient.lRange(key, 0, -1);
                        break;
                    case 'set':
                        value = await redisClient.sMembers(key);
                        break;
                    case 'zset':
                        value = await redisClient.zRangeWithScores(key, 0, -1);
                        break;
                    default:
                        console.warn(`[备份] 未知类型 ${type} 跳过键: ${key}`);
                        continue;
                }

                backupData.data[key] = { type, value };
            } catch (err) {
                console.error(`[备份] 读取键 ${key} 失败:`, err.message);
            }
        }

        // 保存备份文件
        const filename = GenerateBackupFilename();
        const filepath = path.join(BACKUP_DIR, filename);
        fs.writeFileSync(filepath, JSON.stringify(backupData, null, 2), 'utf8');

        // 清理旧备份
        await CleanOldBackups(config.maxBackups || 30);

        const stats = fs.statSync(filepath);
        const sizeKB = (stats.size / 1024).toFixed(2);

        return {
            success: true,
            message: `备份成功！共 ${allKeys.length} 个键，文件大小 ${sizeKB} KB`,
            filename
        };

    } catch (error) {
        console.error('[备份] 创建备份失败:', error);
        return { success: false, message: `备份失败: ${error.message}` };
    }
}

/**
 * 清理旧备份
 * @param {number} maxBackups 最大保留数量
 */
async function CleanOldBackups(maxBackups) {
    try {
        const backups = ListBackupsSync();
        if (backups.length > maxBackups) {
            // 按时间排序，删除最早的
            const toDelete = backups.slice(maxBackups);
            for (const backup of toDelete) {
                const filepath = path.join(BACKUP_DIR, backup.filename);
                if (fs.existsSync(filepath)) {
                    fs.unlinkSync(filepath);
                    console.log(`[备份] 清理旧备份: ${backup.filename}`);
                }
            }
        }
    } catch (error) {
        console.error('[备份] 清理旧备份失败:', error.message);
    }
}

/**
 * 同步获取备份列表
 * @returns {Array<{id: number, filename: string, timestamp: string, size: string}>}
 */
function ListBackupsSync() {
    EnsureBackupDir();

    const files = fs.readdirSync(BACKUP_DIR)
        .filter(f => f.startsWith('xiuxian_backup_') && f.endsWith('.json'));

    const backups = files.map(filename => {
        const filepath = path.join(BACKUP_DIR, filename);
        const stats = fs.statSync(filepath);

        // 从文件名解析时间
        const match = filename.match(/xiuxian_backup_(\d{8})_(\d{6})\.json/);
        let timestamp = stats.mtime.toISOString();
        if (match) {
            const dateStr = match[1];
            const timeStr = match[2];
            timestamp = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)} ${timeStr.slice(0, 2)}:${timeStr.slice(2, 4)}:${timeStr.slice(4, 6)}`;
        }

        return {
            filename,
            timestamp,
            size: `${(stats.size / 1024).toFixed(2)} KB`,
            mtime: stats.mtime.getTime()
        };
    });

    // 按时间降序排序（最新的在前）
    backups.sort((a, b) => b.mtime - a.mtime);

    // 添加编号
    return backups.map((b, i) => ({ id: i + 1, ...b }));
}

/**
 * 获取备份列表
 * @returns {Array<{id: number, filename: string, timestamp: string, size: string}>}
 */
export function ListBackups() {
    return ListBackupsSync();
}

/**
 * 还原备份
 * @param {number} backupId 备份编号
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function RestoreBackup(backupId) {
    try {
        const backups = ListBackupsSync();
        const backup = backups.find(b => b.id === backupId);

        if (!backup) {
            return { success: false, message: `未找到编号为 ${backupId} 的备份` };
        }

        const filepath = path.join(BACKUP_DIR, backup.filename);
        if (!fs.existsSync(filepath)) {
            return { success: false, message: '备份文件不存在' };
        }

        const content = fs.readFileSync(filepath, 'utf8');
        const backupData = JSON.parse(content);

        if (!backupData.data) {
            return { success: false, message: '备份文件格式错误' };
        }

        let restoredCount = 0;
        let errorCount = 0;

        const entries = Object.entries(backupData.data);
        const total = entries.length;
        const BATCH_SIZE = 50;  // 每批处理 50 个键
        const DELAY_MS = 100;   // 每批之间延迟 100ms

        console.log(`[备份] 开始还原 ${total} 个键，分批处理...`);

        for (let i = 0; i < entries.length; i += BATCH_SIZE) {
            const batch = entries.slice(i, i + BATCH_SIZE);

            for (const [key, data] of batch) {
                try {
                    const { type, value } = data;

                    // 先删除现有键
                    await redisClient.del(key);

                    // 根据类型还原
                    switch (type) {
                        case 'string':
                            await redisClient.set(key, value);
                            break;
                        case 'hash':
                            if (value && Object.keys(value).length > 0) {
                                await redisClient.hSet(key, value);
                            }
                            break;
                        case 'list':
                            if (value && value.length > 0) {
                                await redisClient.rPush(key, value);
                            }
                            break;
                        case 'set':
                            if (value && value.length > 0) {
                                await redisClient.sAdd(key, value);
                            }
                            break;
                        case 'zset':
                            if (value && value.length > 0) {
                                const items = value.map(v => ({ score: v.score, value: v.value }));
                                await redisClient.zAdd(key, items);
                            }
                            break;
                    }

                    restoredCount++;
                } catch (err) {
                    console.error(`[备份] 还原键 ${key} 失败:`, err.message);
                    errorCount++;
                }
            }

            // 批次间延迟，防止内存压力
            if (i + BATCH_SIZE < entries.length) {
                await new Promise(resolve => setTimeout(resolve, DELAY_MS));
            }

            // 每 500 个键输出进度
            if ((i + BATCH_SIZE) % 500 === 0 || i + BATCH_SIZE >= entries.length) {
                console.log(`[备份] 还原进度: ${Math.min(i + BATCH_SIZE, total)}/${total}`);
            }
        }

        return {
            success: true,
            message: `还原完成！成功 ${restoredCount} 个键${errorCount > 0 ? `，失败 ${errorCount} 个` : ''}`
        };

    } catch (error) {
        console.error('[备份] 还原失败:', error);
        return { success: false, message: `还原失败: ${error.message}` };
    }
}

/**
 * 删除备份
 * @param {number} backupId 备份编号
 * @returns {{success: boolean, message: string}}
 */
export function DeleteBackup(backupId) {
    try {
        const backups = ListBackupsSync();
        const backup = backups.find(b => b.id === backupId);

        if (!backup) {
            return { success: false, message: `未找到编号为 ${backupId} 的备份` };
        }

        const filepath = path.join(BACKUP_DIR, backup.filename);
        if (fs.existsSync(filepath)) {
            fs.unlinkSync(filepath);
            return { success: true, message: `已删除备份: ${backup.filename}` };
        }

        return { success: false, message: '备份文件不存在' };
    } catch (error) {
        return { success: false, message: `删除失败: ${error.message}` };
    }
}
