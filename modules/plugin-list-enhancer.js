'use strict';

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

module.exports = {
  PluginListEnhancer
};
