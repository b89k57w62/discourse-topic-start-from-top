import { withPluginApi } from "discourse/lib/plugin-api";

function initializeTopicStartFromTop(api) {
  let settings;
  
  try {
    if (api.container && api.container.lookup) {
      settings = api.container.lookup("service:site-settings");
    } else {
      settings = window.SiteSettings || {};
    }
  } catch (error) {
    console.warn("Topic Start From Top: Failed to get settings, using defaults:", error);
    settings = {};
  }
  
  if (settings.enable_topic_start_from_top === false) {
    console.log("Topic Start From Top: Disabled via settings");
    return;
  }

  console.log("Topic Start From Top: Initializing...");

  // 方法1：覆蓋 lastUnreadUrl 回調，強制返回不帶 post number 的 URL
  if (api.registerLastUnreadUrlCallback) {
    console.log("Topic Start From Top: Registering last unread URL callback");
    api.registerLastUnreadUrlCallback(function(topicTrackingState, topic) {
      if (shouldApplyToTopic(topic)) {
        const cleanUrl = `/t/${topic.slug}/${topic.id}`;
        console.log("Topic Start From Top: Forcing clean URL:", cleanUrl);
        return cleanUrl;
      }
      return null;
    });
  }

  // 方法2：動態清理已渲染連結中的 post numbers
  function cleanTopicLinks() {
    const topicLinks = document.querySelectorAll('a[href*="/t/"]');
    let cleanedCount = 0;
    
    topicLinks.forEach(link => {
      const href = link.getAttribute('href');
      if (!href || !shouldApplyTopStart(href)) return;
      
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
        if (result && result.includes('/t/') && shouldApplyTopStart(result)) {
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

  // 監聽路由變化
  api.onPageChange(() => {
    setTimeout(cleanTopicLinks, 200);
  });

  function shouldApplyTopStart(url) {
    if (!/\/t\/[^\/]+\/\d+/.test(url)) return false;
    
    let currentUser;
    try {
      currentUser = api.getCurrentUser ? api.getCurrentUser() : null;
    } catch (error) {
      currentUser = null;
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

  function shouldApplyToTopic(topic) {
    if (!topic || !topic.slug || !topic.id) return false;
    return shouldApplyTopStart(`/t/${topic.slug}/${topic.id}`);
  }
}

withPluginApi("0.11.1", initializeTopicStartFromTop); 