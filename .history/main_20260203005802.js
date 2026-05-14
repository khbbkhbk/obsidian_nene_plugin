'use strict';

var obsidian = require('obsidian');

// 定义 PluginStyleMarker 类，继承自 obsidian.Plugin
class PluginStyleMarker extends obsidian.Plugin {
  constructor() {
    super(...arguments); // 调用父类构造函数
    this.observer = null; // 初始化观察者对象为空
    this.styleEl = null; // 初始化样式元素为空
  }

  // 插件加载时的生命周期方法
  async onload() {
    console.log('Loading Plugin Style Marker'); // 在控制台打印加载日志
    this.addBaseStyles(); // 添加插件的基础样式

    // 注册事件监听器，监听工作区的布局变化
    this.registerEvent(
      this.app.workspace.on('layout-change', () => {
        this.processPluginList(); // 当布局发生变化时，重新处理插件列表
      })
    );

    this.setupMutationObserver(); // 设置 DOM 变动观察者
    this.processPluginList(); // 初始加载时处理一次插件列表
  }

  // 插件卸载时的生命周期方法
  onunload() {
    console.log('Unloading Plugin Style Marker'); // 在控制台打印卸载日志
    if (this.observer) this.observer.disconnect(); // 如果观察者存在，则断开连接
    if (this.styleEl) this.styleEl.remove(); // 如果样式元素存在，则从 DOM 中移除
  }

  // 设置 MutationObserver 以监听 DOM 变化
  setupMutationObserver() {
    // 防抖计时器
    let debounceTimer = null;

    // 创建一个新的 MutationObserver 实例
    this.observer = new MutationObserver((mutations) => {
      let shouldProcess = false;

      // 遍历变动，检测是否需要处理
      for (const mutation of mutations) {
        // 1. 如果是子节点变化
        if (mutation.type === 'childList') {
          // 检查新增节点是否相关
          const addedNodes = Array.from(mutation.addedNodes);
          const hasRelevantNodes = addedNodes.some(node =>
            node instanceof HTMLElement &&
            (
              // 直接匹配关键类名
              node.classList?.contains('community-plugin-item') ||
              node.classList?.contains('setting-item') ||
              node.classList?.contains('vertical-tab-nav-item') ||
              // 或者查询内部是否有关键元素 (针对容器整体刷新的情况)
              node.querySelector?.('.community-plugin-item, .setting-item, .vertical-tab-nav-item')
            )
          );

          if (hasRelevantNodes) {
            shouldProcess = true;
            break; // 只要发现一个相关变动，就需要处理，无需继续遍历
          }
        }

        // 2. 如果是属性变化 (例如 class 变化，或者某些状态属性变化)
        // 有时候元素没被替换，只是类名变了（比如选中状态），也可能导致样式重置，保险起见也监听
        else if (mutation.type === 'attributes') {
          if (mutation.target instanceof HTMLElement &&
            (mutation.target.classList.contains('vertical-tab-nav-item') ||
              mutation.target.classList.contains('setting-item'))) {
            shouldProcess = true;
            break;
          }
        }
      }

      // 如果判定需要处理，则使用防抖调用
      if (shouldProcess) {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          this.processPluginList();
          debounceTimer = null;
        }, 100); // 100ms 的延迟，足以合并 React 的批量更新
      }
    });

    // 开始观察 document.body 的变化
    // 注意：观察 subtree 可能开销较大，配合防抖是必要的
    this.observer.observe(document.body, {
      childList: true, // 监听子节点的添加或移除
      subtree: true,   // 监听所有后代节点
      attributes: true, // 监听属性变化 (新增)
      attributeFilter: ['class', 'style'] // 只监听特定属性，减少开销
    });
  }

  // 处理插件列表的主要逻辑
  processPluginList() {
    // 查找所有可能的插件列表容器
    const containers = document.querySelectorAll(
      '.installed-plugins-container, .vertical-tab-header-group-items'
    );
    if (containers.length === 0) return; // 如果没有找到容器，直接返回

    // 定义用于定位插件项的 CSS 选择器数组
    const selectors = [
      '.vertical-tab-nav-item', // 第三方插件项列表
      '.setting-item:has(.setting-item-name)' // 包含设置项名称的设置项
    ];
    // 查询所有符合条件的插件项元素
    const pluginItems = document.querySelectorAll(selectors.join(', '));

    pluginItems.forEach((item) => { // 遍历每个插件项
      let pluginId = item.getAttribute('data-plugin-id'); // 尝试获取已有data-plugin-id属性的插件 ID

      if (!pluginId) {
        // 如果没有插件 ID，则通过名称查找
        // 查找显示插件名称的元素
        let nameEl = item.querySelector(
          '.setting-item-name'
        );

        // 针对没有找到名称元素的元素，说明单独包裹名称的元素不存在，直接将当前元素视为名称元素
        if (!nameEl) nameEl = item;

        const pluginName = nameEl.textContent?.trim(); // 获取并去除名称两端的空白字符
        if (!pluginName) return; // 如果名称为空，跳过

        // 根据插件名称查找对应的插件 ID
        pluginId = this.findPluginIdByName(pluginName);

        if (pluginId) {
          item.setAttribute('data-plugin-name', pluginName); // 设置 data-plugin-name 属性
          item.classList.add('marked-plugin-item'); // 添加标记类名
        }
      }

      if (pluginId) { // 如果找到了插件 ID (无论是新找到的还是已有的)
        // 检查该插件是否在已启用的插件列表中
        // 特殊处理：如果是当前插件自己，或者在 enabledPlugins 中，都视为启用
        const isEnabled = pluginId === this.manifest.id || this.app.plugins.enabledPlugins.has(pluginId);

        // 只有当状态发生变化时才更新 DOM，减少重绘（可选优化）
        if (item.getAttribute('data-plugin-enabled') !== isEnabled.toString()) {
          item.setAttribute('data-plugin-enabled', isEnabled.toString()); // 设置 data-plugin-enabled 属性
        }
      }
    });
  }

  // 通过名称查找插件 ID 的辅助方法
  findPluginIdByName(name) {
    const manifests = this.app.plugins.manifests; // 获取所有插件的清单信息
    for (const [id, manifest] of Object.entries(manifests)) { // 遍历清单条目
      if (manifest.name === name) { // 如果名称匹配
        return id; // 返回对应的 ID
      }
    }
    return null; // 如果未找到，返回 null
  }

  // 添加基础 CSS 样式的方法
  addBaseStyles() {
    this.styleEl = document.createElement('style'); // 创建 style 元素
    this.styleEl.id = 'plugin-style-marker-styles'; // 设置 style 元素的 ID
    this.styleEl.textContent = `
      /* 定义带有 data-plugin-id 的插件项的基本样式
      .marked-plugin-item[data-plugin-id] {
        position: relative; /* 相对定位，为伪元素定位做准备
        transition: all 0.2s ease; /* 添加平滑过渡效果 */
      }

      /* 定义未启用插件的样式 */
      .marked-plugin-item[data-plugin-enabled="false"] {
        opacity: 0.7; /* 降低不透明度以示区别 */
      }

      /* 定义鼠标悬停时显示的伪元素样式 */
      .marked-plugin-item[data-plugin-id]:hover::before {
        content: attr(data-plugin-id); /* 内容显示为插件 ID */
        position: absolute; /* 绝对定位 */
        right: 8px; /* 距离右侧 8px */
        top: 50%; /* 顶部距离 50% */
        transform: translateY(-50%); /* 垂直居中 */
        font-size: 10px; /* 字体大小 (Font size) */
        color: var(--text-muted); /* 使用主题定义的静音文字颜色 (Use theme-defined muted text color) */
        background: var(--background-primary-alt); /* 使用主题定义的替代背景色 (Use theme-defined alternate background color) */
        padding: 2px 6px; /* 内边距 (Padding) */
        border-radius: 4px; /* 圆角 */
        pointer-events: none; /* 禁用鼠标事件，防止遮挡交互 */
        z-index: 10; /* 设置层级 */
        border: 1px solid var(--background-modifier-border); /* 设置边框 */
      }
      */
    `;
    document.head.appendChild(this.styleEl); // 将 style 元素添加到文档头部
  }
}

module.exports = PluginStyleMarker; // 导出 PluginStyleMarker 类