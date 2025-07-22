import { withPluginApi } from "discourse/lib/plugin-api";
import { throttle } from "@ember/runloop";

function initializeTopicStartFromTop(api) {
  let settings;
  
  try {
    // 安全地獲取 site-settings
    if (api.container && api.container.lookup) {
      settings = api.container.lookup("service:site-settings");
    } else {
      // 備用方案：直接從全局對象獲取
      settings = window.SiteSettings || {};
    }
  } catch (error) {
    console.warn("Topic Start From Top: Failed to get settings, using defaults:", error);
    settings = {};
  }
  
  // 如果設置未啟用，則退出（預設為啟用）
  if (settings.enable_topic_start_from_top === false) {
    console.log("Topic Start From Top: Disabled via settings");
    return;
  }

  console.log("Topic Start From Top: Initializing...");

  const MIN_THROTTLE_INTERVAL = 1000;
  const throttleInterval = Math.max(settings.throttle_interval || 1000, MIN_THROTTLE_INTERVAL);
  
  const processedUrls = new Set();
  const urlCacheExpiry = 60000;
  
  setInterval(() => {
    processedUrls.clear();
  }, urlCacheExpiry);

  // 使用更早的事件捕獲階段攔截點擊
  document.addEventListener('click', function(event) {
    // 查找最接近的 topic 連結
    const link = event.target.closest('a[href*="/t/"]');
    if (!link) return;
    
    const href = link.getAttribute('href');
    console.log("Topic Start From Top: Detected link click:", href);
    
    if (!shouldApplyTopStart(href)) {
      console.log("Topic Start From Top: Skipping link (not applicable):", href);
      return;
    }
    
    // 匹配 topic URL：/t/topic-slug/topic-id/post-number
    const topicMatch = href.match(/\/t\/([^\/]+)\/(\d+)(?:\/(\d+))?/);
    if (!topicMatch) {
      console.log("Topic Start From Top: No topic match for:", href);
      return;
    }
    
    const [, slug, topicId, postNumber] = topicMatch;
    console.log("Topic Start From Top: Parsed:", { slug, topicId, postNumber });
    
    // 創建乾淨的 topic URL（沒有 post number）
    const cleanUrl = `/t/${slug}/${topicId}`;
    
    if (processedUrls.has(cleanUrl)) {
      console.log("Topic Start From Top: Already processed:", cleanUrl);
      return;
    }
    
    // 攔截點擊事件
    console.log("Topic Start From Top: Intercepting click, redirecting to:", cleanUrl);
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation(); // 阻止其他事件處理器
    
    processedUrls.add(cleanUrl);
    
    throttledNavigation(cleanUrl);
  }, true); // 使用捕獲階段

  // 也監聽冒泡階段作為備用
  document.addEventListener('click', function(event) {
    const link = event.target.closest('a[href*="/t/"].title');
    if (!link) return;
    
    const href = link.getAttribute('href');
    if (href && href.includes('/t/') && /\/\d+$/.test(href)) {
      console.log("Topic Start From Top: Backup interception for:", href);
      event.preventDefault();
      event.stopPropagation();
      
      const cleanUrl = href.replace(/\/\d+$/, '');
      throttledNavigation(cleanUrl);
    }
  }, false); // 冒泡階段

  const throttledNavigation = throttle(function(url) {
    console.log("Topic Start From Top: Performing navigation to:", url);
    performTopNavigation(url);
  }, throttleInterval);

  // 覆蓋 Discourse 的最後未讀 URL 回調
  if (api.registerLastUnreadUrlCallback) {
    console.log("Topic Start From Top: Registering last unread URL callback");
    api.registerLastUnreadUrlCallback(function(topicTrackingState, topic) {
      if (shouldApplyToTopic(topic)) {
        const cleanUrl = `/t/${topic.slug}/${topic.id}`;
        console.log("Topic Start From Top: Callback returning clean URL:", cleanUrl);
        return cleanUrl;
      }
      return null;
    });
  }

  function shouldApplyTopStart(url) {
    if (!/\/t\/[^\/]+\/\d+/.test(url)) return false;
    
    let currentUser;
    try {
      currentUser = api.getCurrentUser ? api.getCurrentUser() : null;
    } catch (error) {
      console.warn("Topic Start From Top: Failed to get current user:", error);
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

  function performTopNavigation(url) {
    try {
      console.log("Topic Start From Top: Starting navigation to:", url);
      
      // 檢查是否已經在目標頁面
      const currentPath = window.location.pathname;
      const targetPath = new URL(url, window.location.origin).pathname;
      
      if (currentPath === targetPath) {
        console.log("Topic Start From Top: Already on target page, scrolling to top");
        setTimeout(() => {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }, 100);
        return;
      }

      // 方案1：使用簡單的 window.location 導航（最可靠）
      console.log("Topic Start From Top: Using window.location.href for navigation");
      window.location.href = url;
      
    } catch (error) {
      console.error('Topic Start From Top: Navigation error:', error);
      // 降級到簡單導航
      window.location.href = url;
    }
  }
}

withPluginApi("0.11.1", initializeTopicStartFromTop); 