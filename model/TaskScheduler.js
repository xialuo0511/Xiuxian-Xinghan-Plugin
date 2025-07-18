import fs from 'fs';
import path from 'path';

const __dirname = path.resolve();

const tasksDir = path.join(__dirname, 'xiuxian-emulator-plugin', 'resources','tasks');

// Redis Key 定义
const TASK_POOL_KEY = 'xiuxian:task:pool'; // Sorted Set: 存储所有待执行任务, score为执行时间戳, member为taskKey
const TASK_DETAILS_KEY_PREFIX = 'xiuxian:task:details:'; // Hash: 存储任务具体信息

class TaskScheduler {
  constructor() {
    this.interval = null;
    this.isProcessing = false; // 防止并发处理的锁
    this.taskExecutors = new Map(); // 缓存任务执行逻辑
  }

  /**
   * 初始化调度器，加载所有任务逻辑并启动轮询
   */
  async start() {
    if (this.interval) {
      console.log('[修仙任务调度器] 已在运行中。');
      return;
    }

    console.log('[修仙任务调度器] 正在初始化...');
    await this.loadTaskExecutors();

    // 启动轮询，每秒检查一次
    this.interval = setInterval(() => this.processTasks(), 1000);

    console.log('[修仙任务调度器] 启动成功，开始监听任务池。');
  }

  /**
   * 停止调度器
   */
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      console.log('[修仙任务调度器] 已停止。');
    }
  }

  /**
   * 加载所有在 /tasks 目录下的任务执行文件
   */
  async loadTaskExecutors() {
    if (!fs.existsSync(tasksDir)) {
      fs.mkdirSync(tasksDir, { recursive: true });
    }

    const files = fs.readdirSync(tasksDir).filter(file => file.endsWith('.js'));
    for (const file of files) {
      const taskType = path.basename(file, '.js');
      try {
        const module = await import(`../tasks/${file}`);
        if (typeof module.execute === 'function') {
          this.taskExecutors.set(taskType, module.execute);
          console.log(`[修仙任务调度器] 已加载任务: ${taskType}`);
        }
      } catch (error) {
        console.error(`[修仙任务调度器] 加载任务 ${taskType} 失败:`, error);
      }
    }
  }

  /**
   * 添加一个新任务到任务池
   * @param {object} options - 任务选项
   * @param {string} options.taskType - 任务类型，对应/tasks/目录下的文件名
   * @param {string|number} options.userId - 玩家ID
   * @param {number} options.duration - 任务持续时间 (毫秒)
   * @param {object} options.data - 任务执行时需要的数据，如 { groupId, ... }
   * @returns {boolean} 是否添加成功
   */
  async addTask({ taskType, userId, duration, data = {} }) {
    const taskKey = `${userId}:${taskType}`;
    const endTime = Date.now() + duration;

    // 使用Redis事务确保原子性
    const multi = redis.multi();

    // 1. 将任务详情存入 Hash
    multi.hSet(`${TASK_DETAILS_KEY_PREFIX}${taskKey}`, {
      taskType,
      userId: String(userId),
      startTime: String(Date.now()),
      endTime: String(endTime),
      duration: String(duration),
      data: JSON.stringify(data),
    });

    // 2. 将任务加入 Sorted Set 任务池，并使用 NX 选项确保只有在成员不存在时才添加
    multi.zAdd(TASK_POOL_KEY, { score: endTime, value: taskKey }, { NX: true });

    const results = await multi.exec();

    // zAdd 的结果是 1 表示成功添加，0 表示成员已存在
    if (results && results[1] === 1) {
      console.log(`[修仙任务调度器] 成功添加任务: ${taskKey}, 执行时间: ${new Date(endTime).toLocaleString()}`);
      return true;
    } else {
      console.log(`[修仙任务调度器] 添加任务失败 (可能已存在): ${taskKey}`);
      // 如果zAdd失败，需要清理已存入的Hash数据
      await redis.del(`${TASK_DETAILS_KEY_PREFIX}${taskKey}`);
      return false;
    }
  }

  /**
   * 从任务池删除一个任务
   * @param {string} taskType - 任务类型
   * @param {string|number} userId - 玩家ID
   * @returns {boolean} 是否删除成功
   */
  async delTask(taskType, userId) {
    const taskKey = `${userId}:${taskType}`;
    const multi = redis.multi();

    multi.zRem(TASK_POOL_KEY, taskKey);
    multi.del(`${TASK_DETAILS_KEY_PREFIX}${taskKey}`);

    const results = await multi.exec();

    // zRem 的结果是 1 表示成功删除
    if (results && results[0] === 1) {
      console.log(`[修仙任务调度器] 成功删除任务: ${taskKey}`);
      return true;
    }
    return false;
  }

  /**
   * 核心处理函数：轮询并执行到期任务
   */
  async processTasks() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const now = Date.now();
      // 1. 从Sorted Set中获取所有到期的任务 (score <= now)
      const tasksToProcess = await redis.zRangeByScore(TASK_POOL_KEY, 0, now);

      if (tasksToProcess.length === 0) {
        return; // 没有到期任务，直接返回
      }

      console.log(`[修仙任务调度器] 发现 ${tasksToProcess.length} 个到期任务。`);

      for (const taskKey of tasksToProcess) {
        // 2. 尝试从任务池中移除任务，确保只有一个worker执行
        const removed = await redis.zRem(TASK_POOL_KEY, taskKey);

        if (removed) {
          // 3. 获取任务详情
          const taskDetails = await redis.hGetAll(`${TASK_DETAILS_KEY_PREFIX}${taskKey}`);

          if (taskDetails && taskDetails.taskType) {
            // 4. 执行任务
            const executor = this.taskExecutors.get(taskDetails.taskType);
            if (executor) {
              try {
                const data = JSON.parse(taskDetails.data);
                // 将Bot实例传入，以便任务可以发送消息
                // 注意：这里的Bot需要从你的主程序中获取
                await executor(Bot, taskDetails, data);
              } catch (err) {
                console.error(`[修仙任务调度器] 执行任务 ${taskKey} 失败:`, err);
              }
            } else {
              console.warn(`[修仙任务调度器] 找不到任务类型 ${taskDetails.taskType} 的执行器。`);
            }
          }

          // 5. 清理任务详情
          await redis.del(`${TASK_DETAILS_KEY_PREFIX}${taskKey}`);
        }
      }
    } catch (error) {
      console.error('[修仙任务调度器] 处理任务时发生错误:', error);
    } finally {
      this.isProcessing = false;
    }
  }
}

// 导出单例
export const taskScheduler = new TaskScheduler();
