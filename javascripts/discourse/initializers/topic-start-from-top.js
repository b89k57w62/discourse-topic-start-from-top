import { withPluginApi } from "discourse/lib/plugin-api";

export default {
  name: "topic-start-from-top",
  
  initialize() {
    withPluginApi("0.11.1", (api) => {
      console.log("🚀 Topic Start From Top: Initializing plugin...");
      
      let siteSettings;
      let themeSettings = {};
      
      try {
        siteSettings = api.container.lookup("service:site-settings");
        console.log("📋 SiteSettings object:", siteSettings);
        
        // 嘗試多種方式讀取設置
        console.log("🔍 Method 1 - Direct siteSettings access:");
        console.log("  enable_topic_start_from_top:", siteSettings.enable_topic_start_from_top);
        console.log("  exclude_user_groups:", siteSettings.exclude_user_groups);
        console.log("  throttle_interval:", siteSettings.throttle_interval);
        
        // 方法2：嘗試從 window.SiteSettings 讀取
        console.log("🔍 Method 2 - window.SiteSettings:");
        if (window.SiteSettings) {
          console.log("  enable_topic_start_from_top:", window.SiteSettings.enable_topic_start_from_top);
          console.log("  exclude_user_groups:", window.SiteSettings.exclude_user_groups);
          console.log("  throttle_interval:", window.SiteSettings.throttle_interval);
        }
        
        // 方法3：嘗試從 theme settings 讀取
        console.log("🔍 Method 3 - theme settings check:");
        const themeService = api.container.lookup("service:theme-settings");
        if (themeService) {
          console.log("  themeService found:", themeService);
        }
        
        // 方法4：檢查所有可用的設置鍵
        console.log("🔍 Method 4 - All available settings keys:");
        const allKeys = Object.keys(siteSettings).filter(key => 
          key.includes('topic') || key.includes('start') || key.includes('enable')
        );
        console.log("  Matching keys:", allKeys);
        
        // 設置默認值並嘗試讀取
        themeSettings = {
          enable_topic_start_from_top: siteSettings.enable_topic_start_from_top ?? 
                                       window.SiteSettings?.enable_topic_start_from_top ?? 
                                       true, // 默認啟用
          exclude_user_groups: siteSettings.exclude_user_groups ?? 
                              window.SiteSettings?.exclude_user_groups ?? 
                              "",
          throttle_interval: siteSettings.throttle_interval ?? 
                            window.SiteSettings?.throttle_interval ?? 
                            1000
        };
        
        console.log("📋 Final theme settings:", themeSettings);
        
      } catch (error) {
        console.error("❌ Failed to get site settings:", error);
        // 使用默認設置
        themeSettings = {
          enable_topic_start_from_top: true,
          exclude_user_groups: "",
          throttle_interval: 1000
        };
        console.log("📋 Using fallback settings:", themeSettings);
      }
      
      // 強制啟用來測試功能
      if (!themeSettings.enable_topic_start_from_top) {
        console.log("❌ Settings show disabled, but forcing enable for testing...");
        themeSettings.enable_topic_start_from_top = true;
      }

      console.log("✅ Topic Start From Top: Plugin enabled and running!");

      if (api.registerLastUnreadUrlCallback) {
        api.registerLastUnreadUrlCallback(function(topicTrackingState, topic) {
          if (shouldApplyToTopic(topic, themeSettings, api)) {
            const cleanUrl = `/t/${topic.slug}/${topic.id}`;
            console.log("Topic Start From Top: Forcing clean URL:", cleanUrl);
            return cleanUrl;
          }
          return null;
        });
      }

      function cleanTopicLinks() {
        console.log("🔍 Topic Start From Top: Starting link cleaning process...");
        
        // 高優先級選擇器 - 最可能包含問題連結的
        const prioritySelectors = [
          'a.title.raw-link.raw-topic-link',  // 精確匹配標題連結
          'a[data-topic-id].title',           // 帶 topic-id 的標題
          'a.raw-topic-link',                 // 原始 topic 連結
          '.post-activity a'                  // 活動連結
        ];
        
        // 通用選擇器
        const generalSelectors = [
          'a[href*="/t/"]',
          '.topic-list a',
          '.topic-title a',
          '.title',
          'a.title',
          'a[data-topic-id]',
          '.badge-posts a'
        ];
        
        let totalCleaned = 0;
        
        // 先處理高優先級選擇器
        [...prioritySelectors, ...generalSelectors].forEach(selector => {
          const links = document.querySelectorAll(selector);
          if (links.length > 0) {
            console.log(`🔍 Found ${links.length} links with selector: "${selector}"`);
          }
          
          links.forEach((link, index) => {
            const href = link.getAttribute('href');
            if (!href) {
              return;
            }
            
            console.log(`🔗 Checking link ${index}: "${href}" (classes: ${link.className})`);
            
            // 檢查是否是我們要處理的 topic URL
            if (!href.includes('/t/')) {
              console.log(`⏭️  Skipping non-topic URL: ${href}`);
              return;
            }
            
            if (!shouldApplyTopStart(href, themeSettings, api)) {
              console.log(`⏭️  Skipping link (settings): ${href}`);
              return;
            }
            
            // 詳細的正則表達式匹配，包含調試
            console.log(`🎯 Processing topic URL: ${href}`);
            
            // 匹配 /t/slug/id/postNumber 格式
            const postNumberPattern = /^(\/t\/[^\/\?#]+\/\d+)\/(\d+)(.*)$/;
            const match = href.match(postNumberPattern);
            
            if (match) {
              const basePath = match[1];     // /t/topic/80
              const postNumber = match[2];   // 9
              const suffix = match[3] || ''; // 查詢參數或錨點
              
              console.log(`📝 URL breakdown: base="${basePath}", post="${postNumber}", suffix="${suffix}"`);
              
              // 如果 post number 不是 1，則清理它
              if (postNumber !== '1') {
                const cleanHref = basePath + suffix;
                link.setAttribute('href', cleanHref);
                totalCleaned++;
                
                console.log(`✅ CLEANED: ${href} -> ${cleanHref}`);
                console.log(`   Link classes: ${link.className}`);
                console.log(`   Data attributes:`, {
                  'data-topic-id': link.getAttribute('data-topic-id'),
                  'title': link.getAttribute('title')
                });
              } else {
                console.log(`📍 Post number is 1, keeping: ${href}`);
              }
            } else {
              console.log(`❌ No post number pattern matched for: ${href}`);
            }
          });
        });
        
        if (totalCleaned > 0) {
          console.log(`🎉 SUCCESS: Cleaned ${totalCleaned} topic links`);
        } else {
          console.log("ℹ️  No links needed cleaning this time");
        }
        
        // 檢查特定的問題連結
        const problemLinks = document.querySelectorAll('a[href*="/t/"][href$="/9"], a[href*="/t/"][href*="/9?"], a[href*="/t/"][href*="/9#"]');
        if (problemLinks.length > 0) {
          console.log(`🚨 FOUND ${problemLinks.length} problem links with post numbers:`);
          problemLinks.forEach((link, i) => {
            console.log(`   Problem link ${i}:`, {
              href: link.href,
              className: link.className,
              'data-topic-id': link.getAttribute('data-topic-id')
            });
          });
        }
      }

      // 立即清理
      console.log("🚀 Starting immediate cleanup");
      cleanTopicLinks();
      
      // 延遲清理
      [100, 500, 1000, 2000].forEach(delay => {
        setTimeout(() => {
          console.log(`⏰ Delayed cleanup after ${delay}ms`);
          cleanTopicLinks();
        }, delay);
      });

      const observer = new MutationObserver(function(mutations) {
        let shouldClean = false;
        
        mutations.forEach(function(mutation) {
          mutation.addedNodes.forEach(function(node) {
            if (node.nodeType === 1) {
              const hasTopicLinks = 
                (node.querySelector && node.querySelector('a[href*="/t/"]')) ||
                (node.tagName === 'A' && node.href && node.href.includes('/t/')) ||
                (node.classList && (
                  node.classList.contains('topic-list') ||
                  node.classList.contains('topic-title') ||
                  node.classList.contains('topic-list-item')
                )) ||
                (node.hasAttribute && node.hasAttribute('data-topic-id'));
              
              if (hasTopicLinks) {
                shouldClean = true;
              }
            }
          });
          
          // 檢查屬性變化
          if (mutation.type === 'attributes' && mutation.attributeName === 'href') {
            const target = mutation.target;
            if (target.href && target.href.includes('/t/')) {
              shouldClean = true;
            }
          }
        });
        
        if (shouldClean) {
          console.log("🔄 DOM mutation detected, cleaning links");
          setTimeout(cleanTopicLinks, 50);
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['href']
      });

      api.onPageChange(() => {
        console.log("📄 Page change detected");
        setTimeout(cleanTopicLinks, 100);
        setTimeout(cleanTopicLinks, 500);
      });

      // 定期清理
      setInterval(() => {
        console.log("⏲️  Periodic cleanup check");
        cleanTopicLinks();
      }, 10000);

      function shouldApplyTopStart(url, settings, api) {
        if (!/\/t\/[^\/\?#]+\/\d+/.test(url)) {
          return false;
        }
        
        let currentUser = null;
        try {
          currentUser = api.getCurrentUser();
        } catch (error) {
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
    });
  }
}; 