import { withPluginApi } from "discourse/lib/plugin-api";

function initializeTopicStartFromTop(api) {
  console.log("Topic Start From Top: Starting initialization...");
  
  // 延遲初始化，確保 Discourse 完全載入
  setTimeout(() => {
    try {
      doInitialize(api);
    } catch (error) {
      console.error("Topic Start From Top: Initialization failed:", error);
      // 再次嘗試延遲初始化
      setTimeout(() => {
        try {
          doInitialize(api);
        } catch (retryError) {
          console.error("Topic Start From Top: Retry initialization failed:", retryError);
        }
      }, 2000);
    }
  }, 1000);
}

function doInitialize(api) {
  let settings = {};
  
  // 多種方式嘗試獲取設置
  try {
    // 方式1：嘗試從 API container 獲取
    if (api && api.container && typeof api.container.lookup === 'function') {
      settings = api.container.lookup("service:site-settings") || {};
      console.log("Topic Start From Top: Got settings from api.container");
    }
  } catch (error) {
    console.warn("Topic Start From Top: api.container.lookup failed:", error);
  }
  
  // 方式2：從全局 SiteSettings 獲取
  if (Object.keys(settings).length === 0 && window.SiteSettings) {
    settings = window.SiteSettings;
    console.log("Topic Start From Top: Got settings from window.SiteSettings");
  }
  
  // 方式3：使用默認設置
  if (Object.keys(settings).length === 0) {
    settings = {
      enable_topic_start_from_top: true,
      exclude_user_groups: "",
      throttle_interval: 1000
    };
    console.log("Topic Start From Top: Using default settings");
  }
  
  // 檢查是否啟用
  if (settings.enable_topic_start_from_top === false) {
    console.log("Topic Start From Top: Disabled via settings");
    return;
  }

  console.log("Topic Start From Top: Initializing with settings:", settings);

  // 方法1：覆蓋 lastUnreadUrl 回調，強制返回不帶 post number 的 URL
  try {
    if (api && typeof api.registerLastUnreadUrlCallback === 'function') {
      console.log("Topic Start From Top: Registering last unread URL callback");
      api.registerLastUnreadUrlCallback(function(topicTrackingState, topic) {
        if (shouldApplyToTopic(topic, settings, api)) {
          const cleanUrl = `/t/${topic.slug}/${topic.id}`;
          console.log("Topic Start From Top: Forcing clean URL:", cleanUrl);
          return cleanUrl;
        }
        return null;
      });
    }
  } catch (error) {
    console.warn("Topic Start From Top: Failed to register callback:", error);
  }

  // 方法2：動態清理已渲染連結中的 post numbers
  function cleanTopicLinks() {
    const topicLinks = document.querySelectorAll('a[href*="/t/"]');
    let cleanedCount = 0;
    
    topicLinks.forEach(link => {
      const href = link.getAttribute('href');
      if (!href || !shouldApplyTopStart(href, settings, api)) return;
      
      // 匹配並移除 post number：/t/slug/id/postNumber -> /t/slug/id
      const cleanHref = href.replace(/^(\/t\/[^\/]+\/\d+)\/\d+$/, '$1');
      
      if (cleanHref !== href) {
        link.setAttribute('href', cleanHref);
        cleanedCount++;
        console.log(`Topic Start From Top: Cleaned link from ${href} to ${cleanHref}`);
      }
    });
    
    if (cleanedCount > 0) {
      console.log(`Topic Start From Top: Cleaned ${cleanedCount} topic links`);
    }
  }

  // 方法3：攔截 Discourse 的 URL 生成函數
  try {
    // 嘗試獲取並覆蓋 Discourse 的 topic URL 生成邏輯
    const originalGenerateTopicUrl = window.Discourse?.getURL;
    if (originalGenerateTopicUrl) {
      window.Discourse.getURL = function(url) {
        const result = originalGenerateTopicUrl.apply(this, arguments);
        
        // 如果是 topic URL 且包含 post number，移除它
        if (result && result.includes('/t/') && shouldApplyTopStart(result, settings, api)) {
          const cleanResult = result.replace(/^(\/t\/[^\/]+\/\d+)\/\d+$/, '$1');
          if (cleanResult !== result) {
            console.log(`Topic Start From Top: Intercepted URL generation from ${result} to ${cleanResult}`);
            return cleanResult;
          }
        }
        
        return result;
      };
    }
  } catch (error) {
    console.warn("Topic Start From Top: Could not intercept URL generation:", error);
  }

  // 初始清理
  setTimeout(cleanTopicLinks, 500);

  // 監聽 DOM 變化並清理新添加的連結
  try {
    const observer = new MutationObserver(function(mutations) {
      let shouldClean = false;
      
      mutations.forEach(function(mutation) {
        mutation.addedNodes.forEach(function(node) {
          if (node.nodeType === 1) { // Element node
            // 檢查是否添加了包含 topic 連結的內容
            if (node.querySelector && node.querySelector('a[href*="/t/"]')) {
              shouldClean = true;
            }
            // 檢查節點本身是否為 topic 連結
            if (node.tagName === 'A' && node.href && node.href.includes('/t/')) {
              shouldClean = true;
            }
          }
        });
      });
      
      if (shouldClean) {
        setTimeout(cleanTopicLinks, 100);
      }
    });

    // 開始觀察 DOM 變化
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  } catch (error) {
    console.warn("Topic Start From Top: Could not set up DOM observer:", error);
  }

  // 監聽路由變化
  try {
    if (api && typeof api.onPageChange === 'function') {
      api.onPageChange(() => {
        setTimeout(cleanTopicLinks, 200);
      });
    }
  } catch (error) {
    console.warn("Topic Start From Top: Could not set up page change listener:", error);
  }

  function shouldApplyTopStart(url, settings, api) {
    if (!/\/t\/[^\/]+\/\d+/.test(url)) return false;
    
    let currentUser = null;
    try {
      if (api && typeof api.getCurrentUser === 'function') {
        currentUser = api.getCurrentUser();
      }
    } catch (error) {
      // 靜默失敗，繼續使用 null
    }
    
    if (settings.exclude_user_groups && settings.exclude_user_groups.length > 0 && currentUser) {
      const userGroups = currentUser.groups || [];
      const excludedGroups = typeof settings.exclude_user_groups === 'string' 
        ? settings.exclude_user_groups.split('|').filter(g => g.trim())
        : settings.exclude_user_groups;
      
      for (let group of userGroups) {
        if (excludedGroups.includes(group.name)) {
          return false;
        }
      }
    }
    
    return true;
  }

  function shouldApplyToTopic(topic, settings, api) {
    if (!topic || !topic.slug || !topic.id) return false;
    return shouldApplyTopStart(`/t/${topic.slug}/${topic.id}`, settings, api);
  }
}

withPluginApi("0.11.1", initializeTopicStartFromTop); 