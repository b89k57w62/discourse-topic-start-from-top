import { withPluginApi } from "discourse/lib/plugin-api";

export default {
  name: "topic-start-from-top",
  
  initialize() {
    withPluginApi("0.11.1", (api) => {
      let siteSettings;
      let themeSettings = {};
      
      try {
        siteSettings = api.container.lookup("service:site-settings");
        themeSettings = {
          enable_topic_start_from_top: siteSettings.enable_topic_start_from_top ?? 
                                       window.SiteSettings?.enable_topic_start_from_top ?? 
                                       true,
          exclude_user_groups: siteSettings.exclude_user_groups ?? 
                              window.SiteSettings?.exclude_user_groups ?? 
                              "",
          throttle_interval: siteSettings.throttle_interval ?? 
                            window.SiteSettings?.throttle_interval ?? 
                            500
        };
      } catch (error) {
        themeSettings = {
          enable_topic_start_from_top: true,
          exclude_user_groups: "",
          throttle_interval: 500
        };
      }
      
      if (!themeSettings.enable_topic_start_from_top) {
        return;
      }

      const processedUrls = new Set();
      let lastCleanupTime = 0;
      let isProcessing = false;
      let mutationTimeout;
      let pageChangeTimeout;
      
      if (api.registerLastUnreadUrlCallback) {
        api.registerLastUnreadUrlCallback(function(topicTrackingState, topic) {
          if (shouldApplyToTopic(topic, themeSettings, api)) {
            return `/t/${topic.slug}/${topic.id}`;
          }
          return null;
        });
      }

      function cleanTopicLinks() {
        const now = Date.now();
        
        if (now - lastCleanupTime < themeSettings.throttle_interval || isProcessing) {
          return;
        }
        
        isProcessing = true;
        lastCleanupTime = now;
        
        try {
          const selectors = [
            'a.title.raw-link.raw-topic-link',
            'a[data-topic-id].title',
            'a.raw-topic-link',
            '.post-activity a'
          ];
          
          selectors.forEach(selector => {
            const links = document.querySelectorAll(selector);
            
            links.forEach(link => {
              const href = link.getAttribute('href');
              if (!href || !href.includes('/t/')) return;
              
              const cacheKey = `${href}-${link.className}`;
              if (processedUrls.has(cacheKey)) return;
              
              if (!shouldApplyTopStart(href, themeSettings, api)) return;
              
              const postNumberPattern = /^(\/t\/[^\/\?#]+\/\d+)\/(\d+)(.*)$/;
              const match = href.match(postNumberPattern);
              
              if (match && match[2] !== '1') {
                const cleanHref = match[1] + (match[3] || '');
                link.setAttribute('href', cleanHref);
                processedUrls.add(cacheKey);
                processedUrls.add(`${cleanHref}-${link.className}`);
              }
            });
          });
          
        } finally {
          isProcessing = false;
        }
        
        if (processedUrls.size > 500) {
          processedUrls.clear();
        }
      }

      setTimeout(cleanTopicLinks, 2000);

      const observer = new MutationObserver(function(mutations) {
        let shouldClean = false;
        
        clearTimeout(mutationTimeout);
        
        for (let mutation of mutations) {
          if (mutation.addedNodes.length > 0) {
            for (let node of mutation.addedNodes) {
              if (node.nodeType === 1 && 
                  (node.querySelector?.('a[href*="/t/"]') || 
                   (node.tagName === 'A' && node.href?.includes('/t/')) ||
                   node.classList?.contains('topic-list-item'))) {
                shouldClean = true;
                break;
              }
            }
          }
          if (shouldClean) break;
        }
        
        if (shouldClean) {
          mutationTimeout = setTimeout(cleanTopicLinks, 1000);
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true
      });

      api.onPageChange(() => {
        clearTimeout(pageChangeTimeout);
        pageChangeTimeout = setTimeout(() => {
          processedUrls.clear();
          cleanTopicLinks();
        }, 1500);
      });

      setInterval(cleanTopicLinks, 60000);

      function shouldApplyTopStart(url, settings, api) {
        if (!/\/t\/[^\/\?#]+\/\d+/.test(url)) {
          return false;
        }
        
        if (settings.exclude_user_groups && settings.exclude_user_groups.length > 0) {
          try {
            const currentUser = api.getCurrentUser();
            if (currentUser && currentUser.groups) {
              const userGroups = currentUser.groups;
              const excludedGroups = typeof settings.exclude_user_groups === 'string' 
                ? settings.exclude_user_groups.split('|').filter(g => g.trim())
                : settings.exclude_user_groups;
              
              for (let group of userGroups) {
                if (excludedGroups.includes(group.name)) {
                  return false;
                }
              }
            }
          } catch (error) {
            // Silent fail
          }
        }
        
        return true;
      }

      function shouldApplyToTopic(topic, settings, api) {
        if (!topic || !topic.slug || !topic.id) return false;
        return shouldApplyTopStart(`/t/${topic.slug}/${topic.id}`, settings, api);
      }
    });
  }
}; 