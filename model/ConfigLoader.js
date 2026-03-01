import fs from 'fs';
import YAML from 'yaml';
import path from 'path';

const configDir = path.join(process.cwd(), 'plugins', 'xiuxian-emulator-plugin', 'config', 'itemConfig');

/**
 * 加载并解析 itemConfig 目录下的指定 YAML 配置文件
 * @param {string} fileName YAML文件的名称
 * @returns {object | Array | null} 解析后的数据，或在失败时返回null
 */
function loadYaml(fileName) {
  try {
    const filePath = path.join(configDir, fileName);
    if (!fs.existsSync(filePath)) {
      console.warn(`[配置加载] 配置文件不存在: ${filePath}`);
      return null;
    }
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    return YAML.parse(fileContent);
  } catch (error) {
    console.error(`[配置加载] 加载或解析配置文件 ${fileName} 时出错:`, error);
    return null;
  }
}

/**
 * 专门加载需要转换为数组的配置
 * @param {string} fileName YAML文件的名称
 * @returns {Array} 解析并转换后的数组
 */
export function loadItemConfig(fileName) {
  const parsedData = loadYaml(fileName);

  if (!parsedData || typeof parsedData !== 'object') {
    return [];
  }

  if (!Array.isArray(parsedData)) {
    return Object.values(parsedData);
  }

  return parsedData;
}

/**
 * 专门加载通用对象配置的函数
 * @param {string} fileName YAML文件的名称
 * @returns {object} 解析后的对象
 */
export function loadSystemConfig(fileName) {
  return loadYaml(fileName) || {}; // 如果加载失败，返回一个空对象防止报错
}