'use strict';

var obsidian = require('obsidian');
var constants = require('./constants');

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
    statusSelectEl.value = existingMark?.status || constants.STATUS_OPTIONS[0].value;

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
    groupSelectEl.value = existingMark?.groupId || constants.DEFAULT_GROUP_ID;

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

    constants.STATUS_OPTIONS.forEach((status) => {
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

module.exports = {
  FileMarkerModal,
  GroupNameModal
};
