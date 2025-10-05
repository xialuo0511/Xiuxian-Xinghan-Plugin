import fs from 'fs';
import YAML from 'yaml';
import path from 'path';

// 定义 itemConfig 文件夹的绝对路径
const configDir = path.join(process.cwd(), 'plugins', 'xiuxian-emulator-plugin', 'config', 'itemConfig');

/**
 * 加载并解析 itemConfig 目录下的指定 YAML 配置文件
 * @param {string} fileName YAML文件的名称 (例如 'gifts.yaml')
 * @returns {Array} 解析并转换后的数组。如果文件不存在或出错，则返回一个空数组。
 */
export function loadItemConfig(fileName) {
  try {
    const filePath = path.join(configDir, fileName);

    // 检查文件是否存在
    if (!fs.existsSync(filePath)) {
      logger.warn(`[配置加载] 配置文件不存在: ${filePath}`);
      return []; // 文件未找到，返回空数组
    }

    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const parsedData = YAML.parse(fileContent);

    // 如果解析结果为空或非对象，直接返回空数组
    if (!parsedData || typeof parsedData !== 'object') {
      logger.warn(`[配置加载] 配置文件 ${fileName} 内容为空或格式不正确。`);
      return [];
    }

    // 根据您的版本限制，解析器返回的是一个类数组对象，我们用 Object.values() 将其转换为真正的数组
    // 这种写法也兼容本身就是数组的情况
    if (!Array.isArray(parsedData)) {
      return Object.values(parsedData);
    }

    // 如果解析结果已经是数组，直接返回
    return parsedData;

  } catch (error) {
    logger.error(`[配置加载] 加载或解析配置文件 ${fileName} 时出错:`, error);
    return []; // 发生任何错误都返回空数组，保证程序健壮性
  }
}