'use strict';

var obsidian = require('obsidian');
var constants = require('./constants');
var modals = require('./modals');

// 定义独立的文件标记视图，用于在侧边栏集中展示所有已标记文件。
class FileMarkerView extends obsidian.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin; // 保存插件实例，便于读取数据和触发操作
  }

  // 返回视图类型，需与注册时保持一致。
  getViewType() {
    return constants.FILE_MARKER_VIEW_TYPE;
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
      new modals.GroupNameModal(this.app, async (groupName) => {
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

module.exports = {
  FileMarkerView
};
