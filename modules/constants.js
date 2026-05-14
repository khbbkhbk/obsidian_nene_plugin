'use strict';

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

module.exports = {
  DEFAULT_GROUP_ID,
  DEFAULT_SETTINGS,
  FILE_ICON_MAP,
  FILE_MARKER_VIEW_TYPE,
  STATUS_OPTIONS
};
