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

  document.addEventListener('click', function(event) {
    const link = event.target.closest('a[href*="/t/"]');
    if (!link) return;
    
    const href = link.getAttribute('href');
    if (!shouldApplyTopStart(href)) return;
    
    const topicMatch = href.match(/\/t\/([^\/]+)\/(\d+)(?:\/(\d+))?/);
    if (!topicMatch) return;
    
    const [, slug, topicId, postNumber] = topicMatch;
    
    if (!postNumber || postNumber === '1') return;
    
    const cleanUrl = `/t/${slug}/${topicId}`;
    if (processedUrls.has(cleanUrl)) return;
    
    event.preventDefault();
    event.stopPropagation();
    
    processedUrls.add(cleanUrl);
    
    throttledNavigation(cleanUrl);
  }, true);

  const throttledNavigation = throttle(function(url) {
    performTopNavigation(url);
  }, throttleInterval);

  if (api.registerLastUnreadUrlCallback) {
    api.registerLastUnreadUrlCallback(function(topicTrackingState, topic) {
      if (shouldApplyToTopic(topic)) {
        return `/t/${topic.slug}/${topic.id}`;
      }
      return null;
    });
  }

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

  function performTopNavigation(url) {
    try {
      const DiscourseURL = require("discourse/lib/url").default;
      DiscourseURL.routeTo(url);
      
    } catch (error) {
      console.warn("Topic Start From Top: Navigation failed", error);
      if (error.status !== 429) {
        window.location.href = url;
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