import { withPluginApi } from "discourse/lib/plugin-api";
import { throttle } from "@ember/runloop";

function initializeTopicStartFromTop(api) {
  const settings = api.container.lookup("service:site-settings");
  
  if (!settings.enable_topic_start_from_top) {
    return;
  }

  const MIN_THROTTLE_INTERVAL = 1000;
  const throttleInterval = Math.max(settings.throttle_interval || 1000, MIN_THROTTLE_INTERVAL);
  
  const processedUrls = new Set();
  const urlCacheExpiry = 60000;
  
  setInterval(() => {
    processedUrls.clear();
  }, urlCacheExpiry);

  const throttledNavigation = throttle(function(url, options = {}) {
    performTopNavigation(url, options);
  }, throttleInterval);

  api.onPageChange((url, title) => {
    if (processedUrls.has(url)) {
      return;
    }
    
    if (shouldApplyTopStart(url)) {
      if (url.includes('#') && url.includes('/t/')) {
        processedUrls.add(url);
        throttledNavigation(url);
      }
    }
  });

  if (api.registerLastUnreadUrlCallback) {
    api.registerLastUnreadUrlCallback(function(topicTrackingState, topic) {
      if (shouldApplyToTopic(topic)) {
        return `/t/${topic.slug}/${topic.id}`;
      }
      return null;
    });
  }

  
  let lastScrollTime = 0;
  api.onAppEvent("topic:current-post-changed", function(args) {
    const now = Date.now();
    if (now - lastScrollTime < throttleInterval) {
      return;
    }
    
    if (shouldApplyTopStart(window.location.href)) {
      lastScrollTime = now;
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 100);
    }
  });

  function shouldApplyTopStart(url) {
    if (!url || typeof url !== 'string') return false;
    if (!/\/t\/[^\/]+\/\d+/.test(url)) return false;
    
    const currentUser = api.getCurrentUser();
    
    if (settings.exclude_user_groups && settings.exclude_user_groups.length > 0 && currentUser) {
      const userGroups = currentUser.groups || [];
      const excludedGroups = Array.isArray(settings.exclude_user_groups)
        ? settings.exclude_user_groups
        : settings.exclude_user_groups.split('|').filter(Boolean);
      
      for (let group of userGroups) {
        if (excludedGroups.includes(group.name)) {
          return false;
        }
      }
    }
    
    return true;
  }

  function shouldApplyToTopic(topic) {
    if (!topic) return false;
    
    if (!topic.last_read_post_number || topic.last_read_post_number <= 1) {
      return false;
    }
    
    if (topic.bookmarked && topic.bookmark_reminder_at) {
      return false;
    }
    
    return true;
  }

  function performTopNavigation(url, options = {}) {
    try {
      const cleanUrl = url.split('#')[0];
      
      if (window.location.pathname === new URL(cleanUrl, window.location.origin).pathname) {
        setTimeout(() => {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }, 100);
        return;
      }
      
      const DiscourseURL = require("discourse/lib/url").default;
      DiscourseURL.routeTo(cleanUrl);
      
    } catch (error) {
      console.warn("Topic Start From Top: Navigation failed", error);
      if (error.status !== 429) {
        window.location.href = url.split('#')[0];
      }
    }
  }
}

export default {
  name: "topic-start-from-top",
  initialize() {
    withPluginApi("0.11.1", initializeTopicStartFromTop);
  }
}; 