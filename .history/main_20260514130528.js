'use strict';

var obsidian = require('obsidian');

/* ------------------------------ */
/* 常量分区 */
/* ------------------------------ */

// 定义文件标记面板的唯一视图类型，后续用于注册和激活侧边栏视图。
const FILE_MARKER_VIEW_TYPE = 'plugin-style-marker-file-panel';

// 定义默认分组的标识，所有未指定分组的文件都会归入该分组。
const DEFAULT_GROUP_ID = 'ungrouped';

// 定义可选状态列表，用于弹窗下拉框和面板颜色映射。
const STATUS_OPTIONS = [
  { value: 'pending', label: '未完成', color: 'var(--color-red)' },
  { value: 'in-progress', label: '进行中', color: 'var(--color-orange)' },
  { value: 'completed', label: '已完成', color: 'var(--color-green)' },
  { value: 'paused', label: '已搁置', color: 'var(--color-yellow)' }
];

// 定义插件持久化数据的默认结构，保证首次安装时也有可用数据。
const DEFAULT_SETTINGS = {
  marks: {},
  groups: [
    {
      id: DEFAULT_GROUP_ID,
      name: '未分组',
      collapsed: false
    }
  ]
};

// 统一维护文件扩展名与图标的映射，便于后续持续扩展更多文件类型。
const FILE_ICON_MAP = {
  md: 'file-text',
  canvas: 'layout-dashboard',
  pdf: 'file-text',
  txt: 'file-text',
  js: 'file-code-2',
  ts: 'file-code-2',
  jsx: 'file-code-2',
  tsx: 'file-code-2',
  json: 'braces',
  css: 'palette',
  scss: 'palette',
  less: 'palette',
  html: 'file-code-2',
  vue: 'file-code-2',
  py: 'file-code-2',
  java: 'file-code-2',
  sql: 'database',
  csv: 'file-spreadsheet',
  xlsx: 'file-spreadsheet',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  webp: 'image',
  svg: 'image',
  mp3: 'music-4',
  wav: 'music-4',
  m4a: 'music-4',
  mp4: 'video',
  mov: 'video',
  webm: 'video',
  zip: 'archive',
  rar: 'archive',
  '7z': 'archive'
};

/* ------------------------------ */
/* 数据仓库分区 */
/* ------------------------------ */

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
    const matchedStatus = STATUS_OPTIONS.find((status) => status.value === statusValue);
    return matchedStatus ? matchedStatus.label : STATUS_OPTIONS[0].label;
  }

  // 根据文件类型返回对应图标，未命中时统一回退到通用文件图标。
  getFileIcon(file) {
    const extension = (file.extension || '').toLowerCase();
    return FILE_ICON_MAP[extension] || 'file';
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
    return STATUS_OPTIONS.some((status) => status.value === statusValue);
  }

  // 归一化数据结构，防止旧数据或异常数据导致运行时报错。
  normalizeSettings(data) {
    const source = data || DEFAULT_SETTINGS;
    const normalizedMarks = {};
    const marks = source.marks || {};

    Object.entries(marks).forEach(([path, mark]) => {
      if (!path || !mark || typeof mark !== 'object') return;

      normalizedMarks[path] = {
        path,
        status: this.isValidStatus(mark.status) ? mark.status : STATUS_OPTIONS[0].value,
        note: typeof mark.note === 'string' ? mark.note : '',
        groupId: typeof mark.groupId === 'string' ? mark.groupId : DEFAULT_GROUP_ID,
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

    if (!addedGroupIds.has(DEFAULT_GROUP_ID)) {
      normalizedGroups.unshift({
        id: DEFAULT_GROUP_ID,
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
      status: this.isValidStatus(payload.status) ? payload.status : STATUS_OPTIONS[0].value,
      note: typeof payload.note === 'string' ? payload.note.trim() : '',
      groupId: this.getGroups().some((group) => group.id === payload.groupId) ? payload.groupId : DEFAULT_GROUP_ID,
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
        group: this.getGroups().find((group) => group.id === DEFAULT_GROUP_ID),
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

      const targetGroupId = groupedMap.has(mark.groupId) ? mark.groupId : DEFAULT_GROUP_ID;
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

/* ------------------------------ */
/* 弹窗分区 */
/* ------------------------------ */

// 定义新增分组弹窗，用于在面板和标记弹窗内快速创建新分组。
class GroupNameModal extends obsidian.Modal {
  constructor(app, onSubmit) {
    super(app);
    this.onSubmit = onSubmit; // 保存分组名称提交后的回调函数
  }

  // 打开弹窗时渲染输入界面。
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('file-marker-modal');

    contentEl.createEl('h2', { text: '新增分组' });

    const formEl = contentEl.createDiv({ cls: 'file-marker-modal-form' });
    const fieldEl = formEl.createDiv({ cls: 'file-marker-form-field' });
    fieldEl.createEl('label', {
      cls: 'file-marker-form-label',
      text: '分组名称'
    });

    const inputEl = fieldEl.createEl('input', {
      cls: 'file-marker-text-input',
      type: 'text',
      placeholder: '例如：高优先级、待整理'
    });
    inputEl.focus();

    const actionEl = formEl.createDiv({ cls: 'file-marker-modal-actions' });
    const cancelButton = actionEl.createEl('button', {
      cls: 'mod-muted',
      text: '取消'
    });
    const submitButton = actionEl.createEl('button', {
      cls: 'mod-cta',
      text: '保存'
    });

    cancelButton.addEventListener('click', () => {
      this.close();
    });

    submitButton.addEventListener('click', async () => {
      const result = await this.onSubmit(inputEl.value.trim());
      if (result && result.message) {
        new obsidian.Notice(result.message);
      }

      if (result && result.group) {
        this.close();
      }
    });

    inputEl.addEventListener('keydown', async (event) => {
      if (event.key !== 'Enter') return;

      event.preventDefault();
      submitButton.click();
    });
  }

  // 关闭弹窗时清空内容，避免重复挂载旧节点。
  onClose() {
    this.contentEl.empty();
  }
}

// 定义文件标记编辑弹窗，用于选择状态、填写备注和分配分组。
class FileMarkerModal extends obsidian.Modal {
  constructor(app, plugin, file) {
    super(app);
    this.plugin = plugin; // 保存插件实例，便于在弹窗内读写数据
    this.file = file; // 当前正在编辑标记的文件
  }

  // 打开弹窗时构建表单结构。
  onOpen() {
    const existingMark = this.plugin.getMark(this.file.path);
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('file-marker-modal');

    contentEl.createEl('h2', { text: '文件标记' });
    contentEl.createEl('div', {
      cls: 'file-marker-modal-path',
      text: this.file.path
    });

    const formEl = contentEl.createDiv({ cls: 'file-marker-modal-form' });

    const statusFieldEl = formEl.createDiv({ cls: 'file-marker-form-field' });
    statusFieldEl.createEl('label', {
      cls: 'file-marker-form-label',
      text: '状态'
    });
    const statusSelectEl = statusFieldEl.createEl('select', {
      cls: 'file-marker-select'
    });
    this.buildStatusOptions(statusSelectEl);
    statusSelectEl.value = existingMark?.status || STATUS_OPTIONS[0].value;

    const groupFieldEl = formEl.createDiv({ cls: 'file-marker-form-field' });
    groupFieldEl.createEl('label', {
      cls: 'file-marker-form-label',
      text: '分组'
    });
    const groupControlEl = groupFieldEl.createDiv({ cls: 'file-marker-inline-controls' });
    const groupSelectEl = groupControlEl.createEl('select', {
      cls: 'file-marker-select'
    });
    this.buildGroupOptions(groupSelectEl);
    groupSelectEl.value = existingMark?.groupId || DEFAULT_GROUP_ID;

    const addGroupButton = groupControlEl.createEl('button', {
      cls: 'mod-muted',
      text: '新增分组'
    });
    addGroupButton.addEventListener('click', () => {
      new GroupNameModal(this.app, async (groupName) => {
        const result = await this.plugin.addGroup(groupName);
        this.buildGroupOptions(groupSelectEl);
        if (result.group) {
          groupSelectEl.value = result.group.id;
        }
        return result;
      }).open();
    });

    const noteFieldEl = formEl.createDiv({ cls: 'file-marker-form-field' });
    noteFieldEl.createEl('label', {
      cls: 'file-marker-form-label',
      text: '备注'
    });
    const noteTextareaEl = noteFieldEl.createEl('textarea', {
      cls: 'file-marker-textarea',
      placeholder: '填写补充说明、下一步计划或关联信息'
    });
    noteTextareaEl.value = existingMark?.note || '';

    const actionEl = formEl.createDiv({ cls: 'file-marker-modal-actions' });

    if (existingMark) {
      const removeButton = actionEl.createEl('button', {
        cls: 'mod-warning',
        text: '移除标记'
      });

      removeButton.addEventListener('click', async () => {
        await this.plugin.removeMark(this.file.path);
        new obsidian.Notice('已移除文件标记');
        this.close();
      });
    }

    const cancelButton = actionEl.createEl('button', {
      cls: 'mod-muted',
      text: '取消'
    });
    const saveButton = actionEl.createEl('button', {
      cls: 'mod-cta',
      text: '保存'
    });

    cancelButton.addEventListener('click', () => {
      this.close();
    });

    saveButton.addEventListener('click', async () => {
      await this.plugin.saveMark(this.file, {
        status: statusSelectEl.value,
        note: noteTextareaEl.value,
        groupId: groupSelectEl.value
      });

      await this.plugin.activateFileMarkerView();
      new obsidian.Notice('文件标记已保存');
      this.close();
    });
  }

  // 关闭弹窗时清空容器内容。
  onClose() {
    this.contentEl.empty();
  }

  // 构建状态下拉框选项。
  buildStatusOptions(selectEl) {
    selectEl.empty();

    STATUS_OPTIONS.forEach((status) => {
      const optionEl = selectEl.createEl('option', { text: status.label });
      optionEl.value = status.value;
    });
  }

  // 构建分组下拉框选项。
  buildGroupOptions(selectEl) {
    selectEl.empty();

    this.plugin.getGroups().forEach((group) => {
      const optionEl = selectEl.createEl('option', { text: group.name });
      optionEl.value = group.id;
    });
  }
}

/* ------------------------------ */
/* 视图分区 */
/* ------------------------------ */

// 定义独立的文件标记视图，用于在侧边栏集中展示所有已标记文件。
class FileMarkerView extends obsidian.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin; // 保存插件实例，便于读取数据和触发操作
  }

  // 返回视图类型，需与注册时保持一致。
  getViewType() {
    return FILE_MARKER_VIEW_TYPE;
  }

  // 返回侧边栏显示标题。
  getDisplayText() {
    return '文件标记';
  }

  // 返回侧边栏图标名称。
  getIcon() {
    return 'tags';
  }

  // 视图打开时执行首次渲染。
  async onOpen() {
    this.render();
  }

  // 视图关闭时清空内容，释放已创建的节点。
  async onClose() {
    this.contentEl.empty();
  }

  // 根据最新数据重新绘制整个面板。
  render() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('file-marker-view');

    const headerEl = contentEl.createDiv({ cls: 'file-marker-view-header' });
    headerEl.createEl('div', {
      cls: 'file-marker-view-title',
      text: '文件标记'
    });

    const actionEl = headerEl.createDiv({ cls: 'file-marker-view-actions' });
    this.createHeaderButton(actionEl, 'plus', '新增分组', () => {
      new GroupNameModal(this.app, async (groupName) => {
        return this.plugin.addGroup(groupName);
      }).open();
    });
    this.createHeaderButton(actionEl, 'fold-vertical', '全部折叠', async () => {
      await this.plugin.setAllGroupsCollapsed(true);
    });
    this.createHeaderButton(actionEl, 'unfold-vertical', '全部展开', async () => {
      await this.plugin.setAllGroupsCollapsed(false);
    });

    const groupedMarks = this.plugin.getGroupedMarkedFiles();

    if (groupedMarks.every((section) => section.items.length === 0)) {
      const emptyEl = contentEl.createDiv({ cls: 'file-marker-empty' });
      emptyEl.createEl('div', { text: '当前还没有文件标记' });
      emptyEl.createEl('small', { text: '在文件管理器中右键任意文件，即可添加标记。' });
      return;
    }

    groupedMarks.forEach((section) => {
      const sectionEl = contentEl.createDiv({ cls: 'file-marker-group' });
      const groupHeaderEl = sectionEl.createDiv({ cls: 'file-marker-group-header' });
      const toggleEl = groupHeaderEl.createDiv({ cls: 'file-marker-group-toggle' });
      obsidian.setIcon(toggleEl, section.group.collapsed ? 'chevron-right' : 'chevron-down');

      const titleWrapEl = groupHeaderEl.createDiv({ cls: 'file-marker-group-title-wrap' });
      titleWrapEl.createEl('div', {
        cls: 'file-marker-group-title',
        text: section.group.name
      });
      titleWrapEl.createEl('div', {
        cls: 'file-marker-group-count',
        text: `${section.items.length} 个文件`
      });

      groupHeaderEl.addEventListener('click', async () => {
        await this.plugin.setGroupCollapsed(section.group.id, !section.group.collapsed);
      });

      if (section.group.collapsed) return;

      const listEl = sectionEl.createDiv({ cls: 'file-marker-group-list' });
      if (section.items.length === 0) {
        listEl.createEl('div', {
          cls: 'file-marker-empty-group',
          text: '该分组暂无已标记文件'
        });
        return;
      }

      section.items.forEach(({ file, mark }) => {
        const rowEl = listEl.createDiv({ cls: 'file-marker-item' });
        rowEl.setAttribute('tabindex', '0');

        const iconEl = rowEl.createDiv({ cls: 'file-marker-item-icon' });
        obsidian.setIcon(iconEl, this.plugin.getFileIcon(file));

        const bodyEl = rowEl.createDiv({ cls: 'file-marker-item-body' });
        const titleEl = bodyEl.createDiv({ cls: 'file-marker-item-title' });
        titleEl.createSpan({
          cls: 'file-marker-item-name',
          text: file.basename
        });

        const dotEl = titleEl.createSpan({ cls: 'file-marker-status-dot' });
        dotEl.setAttribute('data-status', mark.status);
        dotEl.setAttribute('aria-label', this.plugin.getStatusLabel(mark.status));

        bodyEl.createDiv({
          cls: 'file-marker-item-path',
          text: file.path
        });

        const metaEl = bodyEl.createDiv({ cls: 'file-marker-item-meta' });
        metaEl.createSpan({
          cls: 'file-marker-item-status-text',
          text: this.plugin.getStatusLabel(mark.status)
        });
        metaEl.createSpan({
          cls: 'file-marker-item-updated',
          text: `更新于 ${this.plugin.formatTime(mark.updatedAt)}`
        });

        if (mark.note) {
          bodyEl.createDiv({
            cls: 'file-marker-item-note',
            text: mark.note
          });
        }

        const itemActionEl = rowEl.createDiv({ cls: 'file-marker-item-actions' });
        this.createItemButton(itemActionEl, 'pencil', '编辑', async (event) => {
          event.stopPropagation();
          this.plugin.openFileMarkerModal(file);
        });
        this.createItemButton(itemActionEl, 'trash-2', '删除', async (event) => {
          event.stopPropagation();
          await this.plugin.removeMark(file.path);
          new obsidian.Notice('已删除文件标记');
        });

        rowEl.addEventListener('click', async () => {
          await this.plugin.openMarkedFile(file.path);
        });

        rowEl.addEventListener('keydown', async (event) => {
          if (event.key !== 'Enter') return;

          event.preventDefault();
          await this.plugin.openMarkedFile(file.path);
        });
      });
    });
  }

  // 创建面板头部按钮，统一交互和图标样式。
  createHeaderButton(containerEl, iconName, label, onClick) {
    const buttonEl = containerEl.createEl('button', {
      cls: 'clickable-icon file-marker-icon-button'
    });
    buttonEl.setAttribute('aria-label', label);
    buttonEl.setAttribute('title', label);
    obsidian.setIcon(buttonEl, iconName);
    buttonEl.addEventListener('click', async (event) => {
      event.stopPropagation();
      await onClick(event);
    });
  }

  // 创建单条文件记录的操作按钮。
  createItemButton(containerEl, iconName, label, onClick) {
    const buttonEl = containerEl.createEl('button', {
      cls: 'clickable-icon file-marker-icon-button'
    });
    buttonEl.setAttribute('aria-label', label);
    buttonEl.setAttribute('title', label);
    obsidian.setIcon(buttonEl, iconName);
    buttonEl.addEventListener('click', onClick);
  }
}

/* ------------------------------ */
/* 旧功能增强分区 */
/* ------------------------------ */

// 定义旧有插件列表增强模块，专门负责设置页第三方插件列表的 DOM 标记与样式注入。
class PluginListEnhancer {
  constructor(plugin) {
    this.plugin = plugin; // 保存插件实例，便于访问 app 和 manifest
    this.observer = null; // 保存 MutationObserver 实例，便于卸载时释放
    this.styleEl = null; // 保存动态样式节点，便于插件卸载时清理
  }

  // 启动插件列表增强能力，包括样式注入和 DOM 变化监听。
  start() {
    this.addBaseStyles();
    this.setupMutationObserver();
    this.processPluginList();
  }

  // 停止插件列表增强能力，清理动态注册资源。
  stop() {
    if (this.observer) this.observer.disconnect();
    if (this.styleEl) this.styleEl.remove();
  }

  // 设置 MutationObserver 以监听设置页面中插件列表的 DOM 变化。
  setupMutationObserver() {
    let debounceTimer = null; // 使用防抖减少重复扫描 DOM 的频率

    this.observer = new MutationObserver((mutations) => {
      let shouldProcess = false;

      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          const addedNodes = Array.from(mutation.addedNodes);
          const hasRelevantNodes = addedNodes.some((node) => {
            return node instanceof HTMLElement && (
              node.classList?.contains('community-plugin-item')
              || node.classList?.contains('setting-item')
              || node.classList?.contains('vertical-tab-nav-item')
              || node.querySelector?.('.community-plugin-item, .setting-item, .vertical-tab-nav-item')
            );
          });

          if (hasRelevantNodes) {
            shouldProcess = true;
            break;
          }
        } else if (
          mutation.type === 'attributes'
          && mutation.target instanceof HTMLElement
          && (
            mutation.target.classList.contains('vertical-tab-nav-item')
            || mutation.target.classList.contains('setting-item')
          )
        ) {
          shouldProcess = true;
          break;
        }
      }

      if (!shouldProcess) return;

      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        this.processPluginList();
        debounceTimer = null;
      }, 100);
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style']
    });
  }

  // 处理第三方插件列表，为原有功能补齐插件标识与启用状态属性。
  processPluginList() {
    const containers = document.querySelectorAll(
      '.installed-plugins-container, .vertical-tab-header-group-items'
    );
    if (containers.length === 0) return;

    const selectors = [
      '.vertical-tab-nav-item',
      '.setting-item:has(.setting-item-name)'
    ];
    const pluginItems = document.querySelectorAll(selectors.join(', '));

    pluginItems.forEach((item) => {
      let pluginId = item.getAttribute('data-plugin-id');

      if (!pluginId) {
        let nameEl = item.querySelector('.setting-item-name');
        if (!nameEl) nameEl = item;

        const pluginName = nameEl.textContent?.trim();
        if (!pluginName) return;

        pluginId = this.findPluginIdByName(pluginName);
        if (pluginId) {
          item.setAttribute('data-plugin-id', pluginId);
          item.setAttribute('data-plugin-name', pluginName);
          item.classList.add('marked-plugin-item');
        }
      }

      if (!pluginId) return;

      const isEnabled = pluginId === this.plugin.manifest.id || this.plugin.app.plugins.enabledPlugins.has(pluginId);
      item.setAttribute('data-plugin-enabled', isEnabled.toString());
    });
  }

  // 根据插件显示名称查找真实插件 ID。
  findPluginIdByName(name) {
    const manifests = this.plugin.app.plugins.manifests;

    for (const [id, manifest] of Object.entries(manifests)) {
      if (manifest.name === name) {
        return id;
      }
    }

    return null;
  }

  // 注入少量基础样式，保持原有插件列表标记功能继续生效。
  addBaseStyles() {
    this.styleEl = document.createElement('style');
    this.styleEl.id = 'plugin-style-marker-styles';
    this.styleEl.textContent = `
      .marked-plugin-item[data-plugin-id] {
        position: relative;
        transition: opacity 0.2s ease;
      }

      .marked-plugin-item[data-plugin-enabled="false"] {
        opacity: 0.72;
      }
    `;

    document.head.appendChild(this.styleEl);
  }
}

// 定义插件主类，作为模块装配层，统一协调数据、视图、弹窗和旧功能增强模块。
class PluginStyleMarker extends obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.store = new FileMarkerStore(this); // 管理文件标记业务数据
    this.pluginListEnhancer = new PluginListEnhancer(this); // 管理旧设置页增强逻辑
  }

  // 暴露只读设置访问入口，兼容后续模块对当前配置的读取。
  get settings() {
    return this.store.getSettings();
  }

  // 插件加载时执行初始化逻辑。
  async onload() {
    console.log('Loading Plugin Style Marker');

    await this.store.load(); // 先加载本地持久化数据
    await this.store.pruneMissingMarks(); // 清理已经不存在的文件标记

    this.registerFileMarkerView();
    this.registerFileMenu();
    this.registerVaultEvents();
    this.registerCommands();
    this.registerLayoutEvents();

    this.pluginListEnhancer.start();
  }

  // 插件卸载时清理动态资源和已打开视图。
  onunload() {
    console.log('Unloading Plugin Style Marker');
    this.pluginListEnhancer.stop();

    this.app.workspace.getLeavesOfType(FILE_MARKER_VIEW_TYPE).forEach((leaf) => {
      leaf.detach();
    });
  }

  // 注册侧边栏视图，用于集中展示所有文件标记。
  registerFileMarkerView() {
    this.registerView(FILE_MARKER_VIEW_TYPE, (leaf) => {
      return new FileMarkerView(leaf, this);
    });
  }

  // 注册文件资源管理器右键菜单项。
  registerFileMenu() {
    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, file) => {
        if (!(file instanceof obsidian.TFile)) return;

        const hasMark = Boolean(this.getMark(file.path));
        menu.addItem((item) => {
          item
            .setTitle(hasMark ? '编辑文件标记' : '添加文件标记')
            .setIcon('tag')
            .onClick(() => {
              this.openFileMarkerModal(file);
            });
        });
      })
    );
  }

  // 注册文件系统事件，保证文件改名或删除后标记数据同步更新。
  registerVaultEvents() {
    this.registerEvent(
      this.app.vault.on('rename', async (file, oldPath) => {
        if (!(file instanceof obsidian.TFile)) return;

        const hasChanged = await this.store.renameMark(file, oldPath);
        if (hasChanged) {
          this.refreshFileMarkerViews();
        }
      })
    );

    this.registerEvent(
      this.app.vault.on('delete', async (file) => {
        if (!(file instanceof obsidian.TFile)) return;

        const hasChanged = await this.store.removeMarkByFile(file);
        if (hasChanged) {
          this.refreshFileMarkerViews();
        }
      })
    );
  }

  // 注册命令入口，便于用户通过命令面板快速打开文件标记视图。
  registerCommands() {
    this.addCommand({
      id: 'open-file-marker-view',
      name: '打开文件标记面板',
      callback: async () => {
        await this.activateFileMarkerView();
      }
    });
  }

  // 注册布局变化监听，保留原有插件列表增强能力。
  registerLayoutEvents() {
    this.registerEvent(
      this.app.workspace.on('layout-change', () => {
        this.pluginListEnhancer.processPluginList();
      })
    );
  }

  // 返回指定路径的标记记录，未命中时返回空值。
  getMark(filePath) {
    return this.settings.marks[filePath] || null;
  }

  // 返回当前全部分组信息。
  getGroups() {
    return this.store.getGroups();
  }

  // 根据状态值获取显示名称。
  getStatusLabel(statusValue) {
    return this.store.getStatusLabel(statusValue);
  }

  // 根据文件类型返回图标名称。
  getFileIcon(file) {
    return this.store.getFileIcon(file);
  }

  // 返回格式化后的更新时间文本。
  formatTime(timestamp) {
    return this.store.formatTime(timestamp);
  }

  // 返回按分组整理后的文件标记数据。
  getGroupedMarkedFiles() {
    return this.store.getGroupedMarkedFiles();
  }

  // 打开文件标记编辑弹窗。
  openFileMarkerModal(file) {
    new FileMarkerModal(this.app, this, file).open();
  }

  // 保存单个文件的标记记录，并刷新视图。
  async saveMark(file, payload) {
    await this.store.saveMark(file, payload);
    this.refreshFileMarkerViews();
  }

  // 删除单个文件的标记记录，并刷新视图。
  async removeMark(filePath) {
    const hasChanged = await this.store.removeMark(filePath);
    if (hasChanged) {
      this.refreshFileMarkerViews();
    }

    return hasChanged;
  }

  // 新增分组，并在保存后刷新视图。
  async addGroup(groupName) {
    const result = await this.store.addGroup(groupName);
    this.refreshFileMarkerViews();
    return result;
  }

  // 切换指定分组的展开或折叠状态。
  async setGroupCollapsed(groupId, collapsed) {
    const hasChanged = await this.store.setGroupCollapsed(groupId, collapsed);
    if (hasChanged) {
      this.refreshFileMarkerViews();
    }

    return hasChanged;
  }

  // 一键展开或折叠全部分组。
  async setAllGroupsCollapsed(collapsed) {
    await this.store.setAllGroupsCollapsed(collapsed);
    this.refreshFileMarkerViews();
  }

  // 打开指定路径对应的文件，不存在时提示用户。
  async openMarkedFile(filePath) {
    const result = await this.store.openMarkedFile(filePath);
    if (!result.success && result.message) {
      new obsidian.Notice(result.message);
    }

    return result;
  }

  // 激活文件标记面板，若面板尚未创建则自动在右侧侧边栏打开。
  async activateFileMarkerView() {
    let leaf = this.app.workspace.getLeavesOfType(FILE_MARKER_VIEW_TYPE)[0];

    if (!leaf) {
      leaf = this.app.workspace.getRightLeaf(false);
      await leaf.setViewState({
        type: FILE_MARKER_VIEW_TYPE,
        active: true
      });
    }

    await this.app.workspace.revealLeaf(leaf);

    if (leaf.view instanceof FileMarkerView) {
      leaf.view.render();
    }
  }

  // 刷新所有已打开的文件标记视图，保证界面能实时反映最新数据。
  refreshFileMarkerViews() {
    this.app.workspace.getLeavesOfType(FILE_MARKER_VIEW_TYPE).forEach((leaf) => {
      if (leaf.view instanceof FileMarkerView) {
        leaf.view.render();
      }
    });
  }
}

module.exports = PluginStyleMarker; // 导出插件主类，供 Obsidian 加载
