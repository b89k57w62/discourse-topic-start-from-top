import { withPluginApi } from "discourse/lib/plugin-api";

export default {
  name: "topic-start-from-top",
  
  initialize() {
    withPluginApi("0.11.1", (api) => {
      const siteSettings = api.container.lookup("service:site-settings");
      if (!siteSettings.enable_topic_start_from_top) {
        return;
      }

      console.log("Topic Start From Top: Plugin initialized");

      if (api.registerLastUnreadUrlCallback) {
        api.registerLastUnreadUrlCallback(function(topicTrackingState, topic) {
          if (shouldApplyToTopic(topic, siteSettings, api)) {
            const cleanUrl = `/t/${topic.slug}/${topic.id}`;
            console.log("Topic Start From Top: Forcing clean URL:", cleanUrl);
            return cleanUrl;
          }
          return null;
        });
      }

      function cleanTopicLinks() {
        const topicLinks = document.querySelectorAll('a[href*="/t/"]');
        let cleanedCount = 0;
        
        topicLinks.forEach(link => {
          const href = link.getAttribute('href');
          if (!href || !shouldApplyTopStart(href, siteSettings, api)) return;
          
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

      setTimeout(cleanTopicLinks, 500);

      const observer = new MutationObserver(function(mutations) {
        let shouldClean = false;
        
        mutations.forEach(function(mutation) {
          mutation.addedNodes.forEach(function(node) {
            if (node.nodeType === 1) {
              if (node.querySelector && node.querySelector('a[href*="/t/"]')) {
                shouldClean = true;
              }
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

      observer.observe(document.body, {
        childList: true,
        subtree: true
      });

      api.onPageChange(() => {
        setTimeout(cleanTopicLinks, 200);
      });

      function shouldApplyTopStart(url, siteSettings, api) {
        if (!/\/t\/[^\/]+\/\d+/.test(url)) return false;
        
        let currentUser = null;
        try {
          currentUser = api.getCurrentUser();
        } catch (error) {
        }
        
        if (siteSettings.exclude_user_groups && siteSettings.exclude_user_groups.length > 0 && currentUser) {
          const userGroups = currentUser.groups || [];
          const excludedGroups = typeof siteSettings.exclude_user_groups === 'string' 
            ? siteSettings.exclude_user_groups.split('|').filter(g => g.trim())
            : siteSettings.exclude_user_groups;
          
          for (let group of userGroups) {
            if (excludedGroups.includes(group.name)) {
              return false;
            }
          }
        }
        
        return true;
      }

      function shouldApplyToTopic(topic, siteSettings, api) {
        if (!topic || !topic.slug || !topic.id) return false;
        return shouldApplyTopStart(`/t/${topic.slug}/${topic.id}`, siteSettings, api);
      }
    });
  }
}; 