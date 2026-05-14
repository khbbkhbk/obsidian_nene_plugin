'use strict';

var obsidian = require('obsidian');
var constants = require('./constants');

// 定义文件标记数据仓库，统一管理配置读写、数据归一化和文件标记业务规则。
class FileMarkerStore {
  constructor(plugin) {
    this.plugin = plugin; // 保存插件实例，便于访问 app、loadData 和 saveData
    this.settings = this.normalizeSettings(); // 初始化默认配置，避免首次读取时报空
  }

  // 加载本地持久化数据，并在加载后统一归一化结构。
  async load() {
    const data = await this.plugin.loadData();
    this.settings = this.normalizeSettings(data);
  }

  // 保存当前配置数据到本地。
  async save() {
    this.settings = this.normalizeSettings(this.settings);
    await this.plugin.saveData(this.settings);
  }

  // 返回完整配置对象，便于上层做只读使用。
  getSettings() {
    return this.settings;
  }

  // 返回当前全部分组信息。
  getGroups() {
    return this.settings.groups;
  }

  // 根据状态值获取显示名称。
  getStatusLabel(statusValue) {
    const matchedStatus = constants.STATUS_OPTIONS.find((status) => status.value === statusValue);
    return matchedStatus ? matchedStatus.label : constants.STATUS_OPTIONS[0].label;
  }

  // 根据文件类型返回对应图标，未命中时统一回退到通用文件图标。
  getFileIcon(file) {
    const extension = (file.extension || '').toLowerCase();
    return constants.FILE_ICON_MAP[extension] || 'file';
  }

  // 将时间戳格式化为本地时间文本，便于在面板中展示更新时间。
  formatTime(timestamp) {
    if (!timestamp) return '刚刚';

    return new Date(timestamp).toLocaleString('zh-CN', {
      hour12: false
    });
  }

  // 判断状态值是否合法，避免界面读取未知状态。
  isValidStatus(statusValue) {
    return constants.STATUS_OPTIONS.some((status) => status.value === statusValue);
  }

  // 归一化数据结构，防止旧数据或异常数据导致运行时报错。
  normalizeSettings(data) {
    const source = data || constants.DEFAULT_SETTINGS;
    const normalizedMarks = {};
    const marks = source.marks || {};

    Object.entries(marks).forEach(([path, mark]) => {
      if (!path || !mark || typeof mark !== 'object') return;

      normalizedMarks[path] = {
        path,
        status: this.isValidStatus(mark.status) ? mark.status : constants.STATUS_OPTIONS[0].value,
        note: typeof mark.note === 'string' ? mark.note : '',
        groupId: typeof mark.groupId === 'string' ? mark.groupId : constants.DEFAULT_GROUP_ID,
        updatedAt: typeof mark.updatedAt === 'number' ? mark.updatedAt : Date.now()
      };
    });

    const rawGroups = Array.isArray(source.groups) ? source.groups : [];
    const normalizedGroups = [];
    const addedGroupIds = new Set();

    rawGroups.forEach((group) => {
      if (!group || typeof group !== 'object') return;
      if (typeof group.id !== 'string' || !group.id.trim()) return;
      if (typeof group.name !== 'string' || !group.name.trim()) return;
      if (addedGroupIds.has(group.id)) return;

      normalizedGroups.push({
        id: group.id,
        name: group.name.trim(),
        collapsed: Boolean(group.collapsed)
      });
      addedGroupIds.add(group.id);
    });

    if (!addedGroupIds.has(constants.DEFAULT_GROUP_ID)) {
      normalizedGroups.unshift({
        id: constants.DEFAULT_GROUP_ID,
        name: '未分组',
        collapsed: false
      });
    }

    return {
      marks: normalizedMarks,
      groups: normalizedGroups
    };
  }

  // 保存单个文件的标记记录。
  async saveMark(file, payload) {
    this.settings.marks[file.path] = {
      path: file.path,
      status: this.isValidStatus(payload.status) ? payload.status : constants.STATUS_OPTIONS[0].value,
      note: typeof payload.note === 'string' ? payload.note.trim() : '',
      groupId: this.getGroups().some((group) => group.id === payload.groupId) ? payload.groupId : constants.DEFAULT_GROUP_ID,
      updatedAt: Date.now()
    };

    await this.save();
  }

  // 删除单个文件的标记记录，并返回是否成功删除。
  async removeMark(filePath) {
    if (!this.settings.marks[filePath]) return false;

    delete this.settings.marks[filePath];
    await this.save();
    return true;
  }

  // 新增分组，并返回创建结果对象供上层界面决定提示文案。
  async addGroup(groupName) {
    const normalizedName = groupName.trim();
    if (!normalizedName) {
      return {
        created: false,
        group: this.getGroups().find((group) => group.id === constants.DEFAULT_GROUP_ID),
        message: '分组名称不能为空'
      };
    }

    const duplicatedGroup = this.getGroups().find((group) => group.name === normalizedName);
    if (duplicatedGroup) {
      return {
        created: false,
        group: duplicatedGroup,
        message: '同名分组已存在'
      };
    }

    const group = {
      id: `group-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      name: normalizedName,
      collapsed: false
    };

    this.settings.groups.push(group);
    await this.save();

    return {
      created: true,
      group,
      message: '分组已新增'
    };
  }

  // 切换指定分组的展开或折叠状态。
  async setGroupCollapsed(groupId, collapsed) {
    const targetGroup = this.getGroups().find((group) => group.id === groupId);
    if (!targetGroup) return false;

    targetGroup.collapsed = collapsed;
    await this.save();
    return true;
  }

  // 一键展开或折叠全部分组。
  async setAllGroupsCollapsed(collapsed) {
    this.getGroups().forEach((group) => {
      group.collapsed = collapsed;
    });

    await this.save();
  }

  // 获取按分组归类后的文件标记数据，供面板渲染使用。
  getGroupedMarkedFiles() {
    const groupedSections = this.getGroups().map((group) => ({
      group,
      items: []
    }));
    const groupedMap = new Map(groupedSections.map((section) => [section.group.id, section]));

    Object.entries(this.settings.marks).forEach(([path, mark]) => {
      const file = this.plugin.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof obsidian.TFile)) return;

      const targetGroupId = groupedMap.has(mark.groupId) ? mark.groupId : constants.DEFAULT_GROUP_ID;
      groupedMap.get(targetGroupId).items.push({ file, mark });
    });

    groupedSections.forEach((section) => {
      section.items.sort((left, right) => {
        return left.file.basename.localeCompare(right.file.basename, 'zh-CN');
      });
    });

    return groupedSections;
  }

  // 在文件被重命名时同步更新标记数据。
  async renameMark(file, oldPath) {
    const existingMark = this.settings.marks[oldPath];
    if (!existingMark) return false;

    delete this.settings.marks[oldPath];
    this.settings.marks[file.path] = Object.assign({}, existingMark, {
      path: file.path,
      updatedAt: Date.now()
    });

    await this.save();
    return true;
  }

  // 在文件被删除时清理对应标记数据。
  async removeMarkByFile(file) {
    return this.removeMark(file.path);
  }

  // 打开指定路径对应的文件，若文件不存在则返回失败结果。
  async openMarkedFile(filePath) {
    const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
    if (!(file instanceof obsidian.TFile)) {
      return {
        success: false,
        message: '目标文件不存在'
      };
    }

    await this.plugin.app.workspace.getLeaf(true).openFile(file);
    return {
      success: true,
      file
    };
  }

  // 清理已经不存在的文件标记，避免面板中残留失效数据。
  async pruneMissingMarks() {
    let hasChanged = false;

    Object.keys(this.settings.marks).forEach((path) => {
      const file = this.plugin.app.vault.getAbstractFileByPath(path);
      if (file instanceof obsidian.TFile) return;

      delete this.settings.marks[path];
      hasChanged = true;
    });

    if (hasChanged) {
      await this.save();
    }

    return hasChanged;
  }
}

module.exports = {
  FileMarkerStore
};
