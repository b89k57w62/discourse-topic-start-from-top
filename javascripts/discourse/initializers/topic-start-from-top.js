import { withPluginApi } from "discourse/lib/plugin-api";

export default {
  name: "topic-start-from-top",
  
  initialize() {
    withPluginApi("0.11.1", (api) => {
      const siteSettings = api.container.lookup("service:site-settings");
      if (!siteSettings.enable_topic_start_from_top) {
        console.log("Topic Start From Top: Disabled via settings");
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
              console.log(`⚠️  Link ${index} has no href attribute`);
              return;
            }
            
            console.log(`🔗 Checking link ${index}: "${href}" (classes: ${link.className})`);
            
            // 檢查是否是我們要處理的 topic URL
            if (!href.includes('/t/')) {
              console.log(`⏭️  Skipping non-topic URL: ${href}`);
              return;
            }
            
            if (!shouldApplyTopStart(href, siteSettings, api)) {
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
        const problemLinks = document.querySelectorAll('a[href="/t/topic/80/9"]');
        if (problemLinks.length > 0) {
          console.log(`🚨 FOUND ${problemLinks.length} problem links still pointing to /t/topic/80/9:`);
          problemLinks.forEach((link, i) => {
            console.log(`   Problem link ${i}:`, {
              href: link.href,
              className: link.className,
              'data-topic-id': link.getAttribute('data-topic-id'),
              outerHTML: link.outerHTML.substring(0, 200)
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
        let mutationInfo = [];
        
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
                mutationInfo.push({
                  type: 'added',
                  tagName: node.tagName,
                  className: node.className,
                  hasTopicLinks: true
                });
              }
            }
          });
          
          // 檢查屬性變化
          if (mutation.type === 'attributes' && mutation.attributeName === 'href') {
            const target = mutation.target;
            if (target.href && target.href.includes('/t/')) {
              shouldClean = true;
              mutationInfo.push({
                type: 'href_changed',
                href: target.href,
                className: target.className
              });
            }
          }
        });
        
        if (shouldClean) {
          console.log("🔄 DOM mutation detected:", mutationInfo);
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

      // 定期清理（調試用）
      setInterval(() => {
        console.log("⏲️  Periodic cleanup check");
        cleanTopicLinks();
      }, 10000);

      function shouldApplyTopStart(url, siteSettings, api) {
        if (!/\/t\/[^\/\?#]+\/\d+/.test(url)) {
          return false;
        }
        
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