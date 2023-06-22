import base from './base.js';
import xiuxianCfg from './Config.js';

export default class yijieHelp extends base {
  constructor(e) {
    super(e);
    this.model = 'yijiehelp';
  }

  static async yiijehelp(e) {
    let html = new yijieHelp(e);
    return await html.yijiehelp();
  }

  async yijiehelp() {
    let helpData = xiuxianCfg.getdefSet('help', 'yijiehelp');
    let versionData = xiuxianCfg.getdefSet('version', 'version');
    const version =
      (versionData && versionData.length && versionData[0].version) || '1.0.0';
    const version_name =
      (versionData && versionData.length && versionData[0].name) || '1.0.0';
    return {
      ...this.screenData,
      saveId: 'help',
      version: version,
      version_name: version_name,
      helpData,
    };
  }

}
