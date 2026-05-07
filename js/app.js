/**
 * app.js - 主应用逻辑控制器
 */

(function() {
    // 页面栈
    var pageStack = [];
    var currentStationId = '';
    var currentStationType = ''; // 'central' | 'dispersed'
    var currentSurveyData = {}; // 当前调查数据缓存（按步骤）
    var currentStep = 1;
    var totalSteps = 6;
    var isEditing = false; // 是否是编辑模式
    var editingStation = null; // 当前编辑的站点

    // 登录配置
    var LOGIN_USER = 'admin';
    var LOGIN_PASS = '123456';

    // ===== 登录相关 =====
    
    // 检查是否已登录
    function checkLogin() {
        var isLoggedIn = Storage.get('is_logged_in');
        var loginPage = document.getElementById('loginPage');
        var app = document.getElementById('app');
        
        if (!isLoggedIn) {
            // 未登录，显示登录页
            if (loginPage) loginPage.style.display = 'flex';
            if (app) app.style.display = 'none';
            
            // 添加回车键登录支持
            setupLoginEnterKey();
            
            // 聚焦密码输入框
            setTimeout(function() {
                var pwdInput = document.getElementById('loginPassword');
                if (pwdInput) pwdInput.focus();
            }, 100);
            
            return false;
        } else {
            // 已登录，显示主页
            if (loginPage) loginPage.style.display = 'none';
            if (app) app.style.display = 'block';
            return true;
        }
    }
    
    // 设置登录页回车键支持
    function setupLoginEnterKey() {
        var usernameInput = document.getElementById('loginUsername');
        var passwordInput = document.getElementById('loginPassword');
        
        function handleEnter(e) {
            if (e.key === 'Enter') {
                doLogin();
            }
        }
        
        if (usernameInput) usernameInput.addEventListener('keypress', handleEnter);
        if (passwordInput) passwordInput.addEventListener('keypress', handleEnter);
    }
    
    // 登录
    window.doLogin = function() {
        var username = document.getElementById('loginUsername');
        var password = document.getElementById('loginPassword');
        var errorDiv = document.getElementById('loginError');
        
        var user = username ? username.value.trim() : '';
        var pass = password ? password.value.trim() : '';
        
        if (!user) {
            if (errorDiv) errorDiv.textContent = '请输入用户名';
            return;
        }
        if (!pass) {
            if (errorDiv) errorDiv.textContent = '请输入密码';
            return;
        }
        
        if (user === LOGIN_USER && pass === LOGIN_PASS) {
            // 登录成功
            Storage.set('is_logged_in', true);
            Storage.set('login_user', user);
            Storage.set('login_time', new Date().toISOString());
            
            if (errorDiv) errorDiv.textContent = '';
            checkLogin();
            
            // 初始化数据
            refreshStats();
            renderRecentList();
            
            // 登录成功后不自动同步，避免覆盖本地数据
            // 用户可手动点击"同步数据"按钮进行双向同步
            
            Utils.showToast('登录成功，欢迎！');
        } else {
            // 登录失败
            if (errorDiv) errorDiv.textContent = '用户名或密码错误';
        }
    };
    
    // 退出登录
    window.doLogout = function() {
        Storage.remove('is_logged_in');
        Storage.remove('login_user');
        Storage.remove('login_time');
        checkLogin();
        Utils.showToast('已退出登录');
    };

    // ===== 初始化 =====
    document.addEventListener('DOMContentLoaded', function() {
        if (checkLogin()) {
            init();
        }
    });
    // 5+App 环境
    document.addEventListener('plusready', function() {
        if (checkLogin()) {
            init();
        }
    });

    function init() {
        refreshStats();
        renderRecentList();
        
        // 预加载 SheetJS 和 docx.js
        if (typeof ImportManager !== 'undefined') {
            ImportManager.loadSheetJS(function(){});
        }
        
        // 不再自动从云端同步，避免覆盖本地数据
        // 用户可手动点击"☁️ 同步数据"按钮进行双向同步
    }
    
    // 自动从云端同步（已禁用，改为手动同步）
    async function autoSyncFromCloud() {
        console.log('自动同步已禁用，请使用手动同步');
        // 不再自动执行，保留函数供兼容
    }
    
    // 双向同步按钮 - 本地↔云端
    // 同步数据到云端（快速模式：只同步调查和草稿，跳过站点）
    window.syncWithCloud = async function(skipStations) {
        if (typeof SupabaseClient === 'undefined') {
            Utils.showToast('云端同步功能未启用');
            return;
        }
        
        // 同步前清理存储空间
        try {
            console.log('同步前清理存储空间...');
            // 清理地理编码缓存等非关键数据
            localStorage.removeItem('amap_geocode_cache_v2');
            localStorage.removeItem('amap_geocode_cache');
            // 清理过期的临时数据
            for (var i = localStorage.length - 1; i >= 0; i--) {
                var key = localStorage.key(i);
                if (key && (key.indexOf('cache') >= 0 || key.indexOf('temp') >= 0)) {
                    localStorage.removeItem(key);
                }
            }
        } catch(e) {
            console.log('清理存储空间失败:', e);
        }
        
        var central = Storage.getCentralStations().length;
        var dispersed = Storage.getDispersedStations().length;
        var surveys = Object.keys(Storage.getSurveys()).length;
        var localTotal = central + dispersed;
        
        // 默认快速模式，跳过站点同步
        skipStations = skipStations !== false;
        
        Utils.showToast(skipStations ? '正在快速同步（仅调查数据）...' : '正在完整同步...');
        console.log('开始同步，本地站点数:', localTotal, '调查记录:', surveys, '跳过站点:', skipStations);
        
        try {
            var pushCount = 0;
            var surveyPushCount = 0;
            var pullCount = 0;
            
            // 步骤1：先推送本地数据到云端（确保本地照片上传到 Storage）
            if (localTotal > 0 || surveys > 0) {
                Utils.showToast('正在推送本地数据...');
                console.log('推送本地数据到云端...');
                var pushResult = await SupabaseClient.pushLocalToCloud(skipStations);
                if (pushResult.success) {
                    pushCount = pushResult.pushCount || 0;
                    surveyPushCount = pushResult.surveyCount || 0;
                    console.log('推送完成: 站点', pushCount, '条, 调查', surveyPushCount, '条');
                    if (skipStations) {
                        Utils.showToast('已推送调查' + surveyPushCount + '条');
                    } else {
                        Utils.showToast('已推送站点' + pushCount + '条, 调查' + surveyPushCount + '条');
                    }
                } else {
                    console.error('推送失败:', pushResult.error);
                    Utils.showToast('推送失败: ' + (pushResult.error || '未知错误'));
                }
            }
            
            // 步骤2：从云端拉取最新数据（获取其他设备上传的数据）
            Utils.showToast('正在从云端拉取...');
            console.log('从云端拉取数据...');
            var pullResult = await SupabaseClient.pullFromCloud(skipStations);
            
            if (!pullResult) {
                Utils.showToast('拉取数据失败');
                return;
            }
            
            // 重置 IndexedDB 缓存，强制重新加载（获取最新照片）
            if (Storage.resetIndexedDBCache) {
                Storage.resetIndexedDBCache();
            }
            
            // 刷新页面显示
            refreshStats();
            renderRecentList();
            
            // 如果当前在列表页，刷新列表
            var centralPage = document.getElementById('centralPage');
            var dispersedPage = document.getElementById('dispersedPage');
            if (centralPage && centralPage.style.display !== 'none') {
                loadCentralList();
            }
            if (dispersedPage && dispersedPage.style.display !== 'none') {
                loadDispersedList();
            }
            
            // 刷新地图
            if (typeof AmapManager !== 'undefined' && AmapManager.refreshMarkers) {
                AmapManager.refreshMarkers();
            }
            
            // 如果当前在详情页，刷新详情
            var detailPage = document.getElementById('detailPage');
            if (detailPage && detailPage.style.display !== 'none' && currentStationId) {
                console.log('刷新站点详情:', currentStationId);
                viewStationDetail(currentStationId, currentStationType);
            }
            
            var stats = Storage.getStats();
            var finalSurveys = Object.keys(Storage.getSurveys()).length;
            if (skipStations) {
                Utils.showToast('同步完成！已同步调查' + surveyPushCount + '条');
            } else {
                Utils.showToast('同步完成！站点' + pushCount + '+调查' + surveyPushCount + '条');
            }
            console.log('同步完成：推送站点', pushCount, '条, 调查', surveyPushCount, '条, 本地共站点', stats.total, '条, 调查', finalSurveys, '条');
        } catch(e) {
            console.error('同步失败:', e);
            var errorMsg = e.message || '未知错误';
            
            // 检测存储空间不足错误
            if (e.name === 'QuotaExceededError' || 
                (errorMsg && errorMsg.toLowerCase().includes('quota')) ||
                (errorMsg && errorMsg.includes('存储'))) {
                alert('同步失败：本地存储空间不足\n\n' +
                    '解决方案：\n' +
                    '1. 点击右上角菜单 "🧽 清理缓存"\n' +
                    '2. 或者点击 "🗑️ 清空数据" 后重新同步\n' +
                    '3. 在手机设置中清除应用缓存后重试\n\n' +
                    '提示：使用 "快速同步" 模式可减少存储占用');
            } else {
                Utils.showToast('同步失败: ' + errorMsg);
            }
        }
    };
    
    // 完整同步（包含站点）
    window.syncWithCloudFull = async function() {
        return window.syncWithCloud(false);
    };

    // 清空所有本地数据（彻底清理版）
    window.clearAllData = async function() {
        var central = Storage.getCentralStations().length;
        var dispersed = Storage.getDispersedStations().length;
        var total = central + dispersed;
        
        if (total === 0) {
            Utils.showToast('本地没有数据');
            return;
        }
        
        var confirmed = confirm(
            '⚠️ 警告：确定要清空本地所有数据吗？\n\n' +
            '当前数据：\n' +
            '- 集中式站点：' + central + ' 个\n' +
            '- 分散式站点：' + dispersed + ' 个\n' +
            '- 总站点数：' + total + ' 个\n\n' +
            '此操作将删除所有本地数据，不可恢复！\n' +
            '清空后请重新点击"同步数据"从云端获取最新数据。'
        );
        if (!confirmed) return;
        
        // 彻底清空所有 localStorage 数据
        try {
            // 使用 clear() 彻底清空，比逐个 removeItem 更彻底
            localStorage.clear();
            console.log('已彻底清空所有本地数据');
        } catch(e) {
            console.error('清空数据失败:', e);
        }
        
        // 同时清空 IndexedDB
        if (typeof IndexedDBStorage !== 'undefined' && IndexedDBStorage.isAvailable()) {
            try {
                await IndexedDBStorage.clearAll();
                console.log('已清空 IndexedDB 数据');
            } catch(e) {
                console.error('清空 IndexedDB 失败:', e);
            }
        }
        
        // 重置 IndexedDB 缓存
        if (Storage.resetIndexedDBCache) {
            Storage.resetIndexedDBCache();
        }
        
        // 刷新显示
        refreshStats();
        renderRecentList();
        
        Utils.showToast('已清空 ' + total + ' 个站点，请重新同步');
        console.log('已清空本地数据:', total, '个站点');
        
        // 提示重新同步
        setTimeout(function() {
            var shouldSync = confirm('数据已清空，是否立即从云端同步最新数据？');
            if (shouldSync) {
                syncWithCloud();
            }
        }, 500);
    };
    
    // 清理缓存
    window.clearCacheData = function() {
        try {
            // 方法1：使用 Storage 模块的清理功能
            var result = Storage.clearCache();
            if (result.success) {
                console.log('Storage.clearCache 完成，释放 ' + result.freed + 'KB');
            }
            
            // 方法2：直接清理地理编码缓存
            localStorage.removeItem('amap_geocode_cache_v2');
            localStorage.removeItem('amap_geocode_cache');
            
            // 方法3：清理所有包含 cache/temp 的键
            var freed = 0;
            var keysToRemove = [];
            for (var i = localStorage.length - 1; i >= 0; i--) {
                var key = localStorage.key(i);
                if (key && (key.indexOf('cache') >= 0 || key.indexOf('temp') >= 0)) {
                    var item = localStorage.getItem(key);
                    if (item) {
                        freed += item.length * 2;
                    }
                    keysToRemove.push(key);
                }
            }
            keysToRemove.forEach(function(k) {
                localStorage.removeItem(k);
            });
            
            var totalFreed = (result.freed || 0) + Math.round(freed / 1024);
            Utils.showToast('已清理缓存，释放 ' + totalFreed + 'KB');
            console.log('清理缓存完成，释放 ' + totalFreed + 'KB');
        } catch(e) {
            console.error('清理缓存失败:', e);
            Utils.showToast('清理缓存失败: ' + e.message);
        }
    };
    
    // 检查存储空间
    window.checkStorage = function() {
        try {
            var total = 0;
            var keyCount = localStorage.length;
            var details = [];
            
            for (var i = 0; i < localStorage.length; i++) {
                var key = localStorage.key(i);
                var value = localStorage.getItem(key);
                var size = value ? value.length * 2 : 0;
                total += size;
                details.push({ key: key, size: Math.round(size / 1024) + 'KB' });
            }
            
            var totalKB = Math.round(total / 1024);
            console.log('存储空间使用情况:');
            console.log('总大小: ' + totalKB + 'KB');
            console.log('键数量: ' + keyCount);
            console.log('详细:', details);
            
            alert('存储空间使用情况:\n' +
                '总大小: ' + totalKB + 'KB\n' +
                '键数量: ' + keyCount + '\n\n' +
                '如果超过 4500KB，建议清理缓存或清空数据后重新同步。');
            
            return { total: totalKB, keys: keyCount, details: details };
        } catch(e) {
            console.error('检查存储空间失败:', e);
            return null;
        }
    };
    
    // ===== 推送本地数据到云端（本地数据覆盖云端）=====
    window.pushLocalToCloud = async function() {
        if (typeof SupabaseClient === 'undefined') {
            Utils.showToast('云端同步功能未启用');
            return;
        }
        
        var central = Storage.getCentralStations();
        var dispersed = Storage.getDispersedStations();
        var localTotal = central.length + dispersed.length;
        
        if (localTotal === 0) {
            Utils.showToast('本地没有数据可推送');
            return;
        }
        
        if (!confirm(
            '⚠️ 警告：此操作将把本地数据推送到云端！\n\n' +
            '本地数据：\n' +
            '- 集中式站点：' + central.length + ' 个\n' +
            '- 分散式站点：' + dispersed.length + ' 个\n' +
            '- 总站点数：' + localTotal + ' 个\n\n' +
            '推送规则：\n' +
            '- 本地站点会覆盖云端同名站点\n' +
            '- 本地有但云端没有的站点会被添加\n' +
            '- 云端有但本地没有的站点会被保留\n\n' +
            '确定要推送吗？'
        )) {
            return;
        }
        
        Utils.showToast('正在推送本地数据到云端...');
        try {
            var result = await SupabaseClient.pushLocalToCloud();
            if (result.success) {
                Utils.showToast('推送完成！成功 ' + result.pushCount + ' 条');
                console.log('推送结果:', result);
            } else {
                Utils.showToast('推送失败: ' + (result.error || '未知错误'));
            }
        } catch(e) {
            console.error('推送失败:', e);
            Utils.showToast('推送失败: ' + e.message);
        }
    };
    
    // ===== 强制清理云端重复数据（开发调试用）=====
    window.cleanupCloudDuplicates = async function() {
        if (typeof SupabaseClient === 'undefined') {
            Utils.showToast('云端同步功能未启用');
            return;
        }
        
        if (!confirm('⚠️ 警告：此操作将删除云端重复数据！\n\n' +
            '删除规则：保留每个站点的最新记录，删除其他重复记录。\n\n' +
            '确定要继续吗？')) {
            return;
        }
        
        Utils.showToast('正在清理云端重复数据...');
        try {
            var result = await SupabaseClient.cleanupCloudDuplicates();
            if (result.success) {
                Utils.showToast('清理完成！删除了 ' + result.deleted + ' 条重复记录');
                // 清理后自动同步
                setTimeout(function() {
                    syncWithCloud();
                }, 1000);
            } else {
                Utils.showToast('清理失败: ' + (result.error || '未知错误'));
            }
        } catch(e) {
            console.error('清理失败:', e);
            Utils.showToast('清理失败: ' + e.message);
        }
    };

    // ===== 更多菜单切换 =====
    window.toggleMoreMenu = function() {
        var menu = document.getElementById('moreMenu');
        if (menu) {
            if (menu.style.display === 'none' || menu.style.display === '') {
                menu.style.display = 'block';
            } else {
                menu.style.display = 'none';
            }
        }
    };

    // ===== 统计刷新 =====
    window.App = {
        refreshStats: refreshStats,
        goBack: goBack
        // viewStationDetail 将在后面添加到 window 对象
    };

    function refreshStats() {
        var stats = Storage.getStats();
        setText('totalCount', stats.total);
        setText('centralCount', stats.central);
        setText('dispersedCount', stats.dispersed);
        setText('surveyedCount', stats.surveyed);
        setText('centralModuleCount', '共 ' + stats.central + ' 个站点');
        setText('dispersedModuleCount', '共 ' + stats.dispersed + ' 个站点');
    }

    function setText(id, val) {
        var el = document.getElementById(id);
        if (el) el.textContent = val;
    }

    // ===== 最近记录 =====
    function renderRecentList() {
        // 改为从 surveys 表获取最近完成的调查记录（支持云端同步）
        var surveys = Storage.getSurveys();
        var centralStations = Storage.getCentralStations();
        var dispersedStations = Storage.getDispersedStations();
        
        // 构建站点ID到站点信息的映射
        var stationMap = {};
        centralStations.forEach(function(s) {
            stationMap[s.id] = Object.assign({}, s, { _type: 'central' });
        });
        dispersedStations.forEach(function(s) {
            stationMap[s.id] = Object.assign({}, s, { _type: 'dispersed' });
        });
        
        // 将调查记录转换为列表并按时间排序
        var surveyList = [];
        for (var stationId in surveys) {
            var survey = surveys[stationId];
            var station = stationMap[stationId];
            if (station) {
                surveyList.push({
                    stationId: stationId,
                    name: station.name,
                    county: station.county,
                    town: station.town,
                    type: station._type,
                    time: survey.updateTime || survey.created_at || survey.surveyDate
                });
            }
        }
        
        // 按时间倒序排序
        surveyList.sort(function(a, b) {
            return new Date(b.time) - new Date(a.time);
        });
        
        var container = document.getElementById('recentList');
        if (!container) return;
        
        if (!surveyList.length) {
            container.innerHTML = '<div class="empty-tip">暂无调查记录，请先完成站点调查</div>';
            return;
        }
        
        container.innerHTML = surveyList.slice(0, 5).map(function(r) {
            return '<div class="recent-item" onclick="viewStationDetail(\'' + r.stationId + '\',\'' + r.type + '\')">' +
                '<div>' +
                '<div class="recent-name">' + Utils.escapeHtml(r.name) + '</div>' +
                '<div style="font-size:11px;color:#bbb;">' + Utils.escapeHtml(r.county || '') + ' ' + Utils.escapeHtml(r.town || '') + '</div>' +
                '</div>' +
                '<div class="recent-meta">' +
                '<span class="recent-time">' + Utils.formatDateTime(r.time) + '</span>' +
                '<span class="recent-badge">' + (r.type === 'central' ? '集中式' : '分散式') + '</span>' +
                '</div>' +
                '</div>';
        }).join('');
    }

    // ===== 页面导航 =====
    function showPage(pageId) {
        // 隐藏主页
        var appDiv = document.getElementById('app');
        if (appDiv) appDiv.style.display = 'none';
        
        // 关闭其他页面
        document.querySelectorAll('.page').forEach(function(p) {
            p.style.display = 'none';
        });
        
        var target = document.getElementById(pageId);
        if (target) {
            target.style.display = 'block';
            target.scrollTop = 0;
        }
        
        pageStack.push(pageId);
    }

    function goBack() {
        pageStack.pop();
        var prev = pageStack[pageStack.length - 1];
        
        document.querySelectorAll('.page').forEach(function(p) {
            p.style.display = 'none';
        });
        
        if (!prev || prev === 'home') {
            var appDiv = document.getElementById('app');
            if (appDiv) appDiv.style.display = 'block';
            pageStack = [];
            refreshStats();
            renderRecentList();
        } else {
            var target = document.getElementById(prev);
            if (target) {
                target.style.display = 'block';
                target.scrollTop = 0;
            }
        }
    }

    window.goBack = goBack;

    // ===== 打开全部调查记录页 =====
    window.openAllSurveys = function() {
        // 初始化地区筛选下拉框
        var central = Storage.getCentralStations();
        var dispersed = Storage.getDispersedStations();
        var all = central.concat(dispersed);
        var opts = Utils.getFilterOptions(all);
        Utils.updateSelect('allSurveyAreaFilter', opts.areas, '');
        
        renderAllSurveys();
        showPage('allSurveysPage');
    };

    // ===== 渲染全部调查记录 =====
    window.renderAllSurveys = function() {
        var typeFilter = document.getElementById('allSurveyTypeFilter') ? document.getElementById('allSurveyTypeFilter').value : '';
        var statusFilter = document.getElementById('allSurveyStatusFilter') ? document.getElementById('allSurveyStatusFilter').value : '';
        var areaFilter = document.getElementById('allSurveyAreaFilter') ? document.getElementById('allSurveyAreaFilter').value : '';
        
        var surveys = Storage.getSurveys();
        var drafts = Storage.getDraftSurveys ? Storage.getDraftSurveys() : {};
        var centralStations = Storage.getCentralStations();
        var dispersedStations = Storage.getDispersedStations();
        
        // 构建站点映射
        var stationMap = {};
        centralStations.forEach(function(s) {
            stationMap[s.id] = Object.assign({}, s, { _type: 'central' });
        });
        dispersedStations.forEach(function(s) {
            stationMap[s.id] = Object.assign({}, s, { _type: 'dispersed' });
        });
        
        var list = [];
        
        // 添加已完成的调查
        if (statusFilter === '' || statusFilter === 'completed') {
            for (var sid in surveys) {
                var survey = surveys[sid];
                var station = stationMap[sid];
                if (!station) continue;
                if (typeFilter && station._type !== typeFilter) continue;
                if (areaFilter && station.county !== areaFilter) continue;
                
                list.push({
                    stationId: sid,
                    name: station.name,
                    county: station.county,
                    town: station.town,
                    type: station._type,
                    status: 'completed',
                    statusText: '已完成',
                    statusClass: 'status-done',
                    time: survey.updateTime || survey.created_at || survey.surveyDate,
                    investigator: survey.investigators || survey.investigator || '-'
                });
            }
        }
        
        // 添加进行中的调查
        if (statusFilter === '' || statusFilter === 'draft') {
            for (var did in drafts) {
                // 跳过已完成的（避免重复）
                if (surveys[did]) continue;
                
                var draft = drafts[did];
                var station = stationMap[did];
                if (!station) continue;
                if (typeFilter && station._type !== typeFilter) continue;
                if (areaFilter && station.county !== areaFilter) continue;
                
                list.push({
                    stationId: did,
                    name: station.name,
                    county: station.county,
                    town: station.town,
                    type: station._type,
                    status: 'draft',
                    statusText: '进行中',
                    statusClass: 'status-progress',
                    time: draft.draftTime || draft.updateTime,
                    investigator: draft.investigators || draft.investigator || '-'
                });
            }
        }
        
        // 按时间倒序排序
        list.sort(function(a, b) {
            return new Date(b.time) - new Date(a.time);
        });
        
        // 更新统计
        var statsEl = document.getElementById('allSurveyListStats');
        if (statsEl) {
            statsEl.textContent = '共 ' + list.length + ' 条记录';
        }
        
        // 渲染列表
        var container = document.getElementById('allSurveyList');
        if (!container) return;
        
        if (!list.length) {
            container.innerHTML = '<div class="empty-tip">暂无调查记录</div>';
            return;
        }
        
        container.innerHTML = list.map(function(item) {
            return '<div class="station-item" onclick="viewStationDetail(\'' + item.stationId + '\', \'' + item.type + '\')">' +
                '<div class="station-info">' +
                '<div class="station-name">' + Utils.escapeHtml(item.name) +
                '<span class="station-status ' + item.statusClass + '">' + item.statusText + '</span>' +
                '</div>' +
                '<div class="station-meta">' +
                (item.county || '') + ' ' + (item.town || '') +
                ' · 调查员:' + Utils.escapeHtml(item.investigator) +
                '</div>' +
                '<div class="station-meta" style="color:#999;">' +
                '调查时间: ' + Utils.formatDateTime(item.time) +
                '</div>' +
                '</div>' +
                '<div class="station-arrow">›</div>' +
                '</div>';
        }).join('');
    };

    // ===== 模块入口 =====
    window.openModule = function(type, action) {
        if (action === 'add') {
            openAddStation(type);
            return;
        }
        currentStationType = type;
        
        if (type === 'central') {
            loadCentralList();
            showPage('centralPage');
        } else {
            loadDispersedList();
            showPage('dispersedPage');
        }
    };

    // ===== 集中式站点列表 =====
    function loadCentralList() {
        var stations = Storage.getCentralStations();
        var opts = Utils.getFilterOptions(stations);
        
        Utils.updateSelect('centralAreaFilter', opts.areas, '');
        Utils.updateSelect('centralTownFilter', opts.towns, '');
        Utils.updateSelect('centralVillageFilter', opts.villages, '');
        
        renderStationList('centralList', stations, 'central', 'centralListStats');
    }

    window.filterCentralList = function() {
        var area = document.getElementById('centralAreaFilter').value;
        var town = document.getElementById('centralTownFilter').value;
        var village = document.getElementById('centralVillageFilter').value;
        
        var stations = Storage.getCentralStations();
        var filtered = Utils.filterStations(stations, area, town, village, '');
        
        // 联动乡镇下拉
        if (area) {
            var areaStations = Utils.filterStations(stations, area, '', '', '');
            var townOpts = Utils.getFilterOptions(areaStations);
            Utils.updateSelect('centralTownFilter', townOpts.towns, town);
        }
        if (town) {
            var townStations = Utils.filterStations(stations, area, town, '', '');
            var villageOpts = Utils.getFilterOptions(townStations);
            Utils.updateSelect('centralVillageFilter', villageOpts.villages, village);
        }
        
        renderStationList('centralList', filtered, 'central', 'centralListStats');
    };

    // ===== 分散式站点列表 =====
    function loadDispersedList() {
        var stations = Storage.getDispersedStations();
        var opts = Utils.getFilterOptions(stations);
        
        Utils.updateSelect('dispersedAreaFilter', opts.areas, '');
        Utils.updateSelect('dispersedTownFilter', opts.towns, '');
        Utils.updateSelect('dispersedVillageFilter', opts.villages, '');
        
        renderStationList('dispersedList', stations, 'dispersed', 'dispersedListStats');
    }

    window.filterDispersedList = function() {
        var area = document.getElementById('dispersedAreaFilter').value;
        var town = document.getElementById('dispersedTownFilter').value;
        var village = document.getElementById('dispersedVillageFilter').value;
        
        var stations = Storage.getDispersedStations();
        var filtered = Utils.filterStations(stations, area, town, village, '');
        renderStationList('dispersedList', filtered, 'dispersed', 'dispersedListStats');
    };

    // ===== 渲染站点列表 =====
    function renderStationList(containerId, stations, type, statsId) {
        var container = document.getElementById(containerId);
        var stats = document.getElementById(statsId);
        if (!container) return;
        
        if (stats) stats.textContent = '共 ' + stations.length + ' 个站点';
        
        if (!stations.length) {
            container.innerHTML = '<div class="empty-tip">暂无站点数据<br>请导入台账或手动新增</div>';
            return;
        }
        
        var surveys = Storage.getSurveys();
        
        // 获取当前位置用于计算距离
        console.log('开始获取定位...');
        getCurrentLocation(function(currentPos) {
            console.log('定位成功，开始渲染列表带距离:', currentPos);
            renderListWithDistance(currentPos);
        }, function(e) {
            console.log('定位失败，渲染列表不带距离:', e);
            renderListWithDistance(null);
        });
        
        function renderListWithDistance(currentPos) {
            // 计算每个站点的距离并排序
            var stationsWithDistance = stations.map(function(s) {
                var distance = null;
                if (currentPos && s.lat && s.lng) {
                    distance = calculateDistance(currentPos.lat, currentPos.lng, s.lat, s.lng);
                }
                return { station: s, distance: distance };
            });
            
            // 按距离从小到大排序（没有距离的排在最后）
            stationsWithDistance.sort(function(a, b) {
                if (a.distance === null && b.distance === null) return 0;
                if (a.distance === null) return 1;
                if (b.distance === null) return -1;
                return a.distance - b.distance;
            });
            
            // 获取草稿数据
            var drafts = Storage.getDraftSurveys ? Storage.getDraftSurveys() : {};
            
            container.innerHTML = stationsWithDistance.map(function(item) {
                var s = item.station;
                var dist = item.distance;
                var isSurveyed = !!surveys[s.id];
                var isDraft = !!drafts[s.id] && !isSurveyed;
                var badge = type === 'central' ? 'badge-central' : 'badge-dispersed';
                var typeText = type === 'central' ? '集中式' : '分散式';
                
                var locationParts = [s.county, s.town, s.village].filter(Boolean);
                if (type === 'dispersed' && s.hamlet) locationParts.push(s.hamlet);
                
                // 显示距离
                var distanceHtml = '';
                if (dist !== null) {
                    distanceHtml = '<span class="station-distance">📏 ' + formatDistance(dist) + '</span>';
                }
                
                // 导航按钮
                var navHtml = '';
                if (s.lat && s.lng) {
                    navHtml = '<button class="nav-btn" onclick="event.stopPropagation(); openAmapNavigation(' + s.lat + ',' + s.lng + ',\'' + Utils.escapeHtml(s.name) + '\')">🧭 导航</button>';
                }
                
                // 调查状态样式
                var statusClass, statusText;
                if (isSurveyed) {
                    statusClass = 'status-surveyed';
                    statusText = '✓ 已调查';
                } else if (isDraft) {
                    statusClass = 'status-progress';
                    statusText = '⏳ 进行中';
                } else {
                    statusClass = 'status-pending';
                    statusText = '待调查';
                }
                
                return '<div class="station-card" onclick="viewStationDetail(\'' + s.id + '\',\'' + type + '\')">' +
                    '<div class="station-card-header">' +
                    '<div class="station-name">' + Utils.escapeHtml(s.name) + '</div>' +
                    '<div class="station-type-badge ' + badge + '">' + typeText + '</div>' +
                    '</div>' +
                    '<div class="station-info">' +
                    (s.stationType ? s.stationType + '&nbsp;|&nbsp;' : '') +
                    (s.investment ? '投资:' + s.investment + '万元&nbsp;' : '') +
                    (s.population ? '人口:' + s.population + '人&nbsp;' : '') +
                    (s.waterQualityResult ? '水质:' + s.waterQualityResult : '') +
                    '</div>' +
                    '<div class="station-location">📍 ' + locationParts.join(' > ') + '</div>' +
                    '<div class="station-card-footer">' +
                    '<div class="station-status ' + statusClass + '">' + statusText + '</div>' +
                    '<div class="station-actions">' + distanceHtml + navHtml + '</div>' +
                    '</div>' +
                    '</div>';
            }).join('');
        }
    }
    
    // 获取当前位置
    function getCurrentLocation(success, error) {
        var timeoutId = null;
        var hasResult = false;
        
        function handleSuccess(pos) {
            if (hasResult) return;
            hasResult = true;
            if (timeoutId) clearTimeout(timeoutId);
            success(pos);
        }
        
        function handleError(e) {
            if (hasResult) return;
            hasResult = true;
            if (timeoutId) clearTimeout(timeoutId);
            console.log('获取定位失败:', e);
            error && error(e);
        }
        
        // 设置超时（5秒）
        timeoutId = setTimeout(function() {
            handleError(new Error('定位超时'));
        }, 5000);
        
        // 优先使用 5+ App 的定位
        if (typeof plus !== 'undefined' && plus.geolocation) {
            console.log('使用 5+ App 定位');
            plus.geolocation.getCurrentPosition(function(position) {
                console.log('5+ App 定位成功:', position.coords.latitude, position.coords.longitude);
                handleSuccess({ lat: position.coords.latitude, lng: position.coords.longitude });
            }, function(e) {
                console.log('5+ App 定位失败:', e.message);
                handleError(e);
            }, {
                enableHighAccuracy: true,
                timeout: 5000,
                maximumAge: 0
            });
        } else if (navigator.geolocation) {
            console.log('使用浏览器定位');
            navigator.geolocation.getCurrentPosition(function(pos) {
                console.log('浏览器定位成功:', pos.coords.latitude, pos.coords.longitude);
                handleSuccess({ lat: pos.coords.latitude, lng: pos.coords.longitude });
            }, function(e) {
                console.log('浏览器定位失败:', e.message);
                handleError(e);
            }, {
                enableHighAccuracy: true,
                timeout: 5000,
                maximumAge: 0
            });
        } else {
            handleError(new Error('不支持定位'));
        }
    }
    
    // 计算两点间距离（使用Haversine公式，返回米）
    function calculateDistance(lat1, lng1, lat2, lng2) {
        var R = 6371000; // 地球半径（米）
        var dLat = (lat2 - lat1) * Math.PI / 180;
        var dLng = (lng2 - lng1) * Math.PI / 180;
        var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                Math.sin(dLng / 2) * Math.sin(dLng / 2);
        var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }
    
    // 格式化距离显示
    function formatDistance(meters) {
        if (meters < 1000) {
            return Math.round(meters) + 'm';
        } else {
            return (meters / 1000).toFixed(1) + 'km';
        }
    }
    
    // 更新详情页导航按钮（显示距离）
    function updateDetailNavButton(station, distance) {
        var btnContainer = document.querySelector('#stationDetailPage .detail-actions');
        if (!btnContainer) return;
        
        // 查找或创建导航按钮
        var navBtn = btnContainer.querySelector('.btn-nav');
        if (!navBtn) {
            // 在"查看/修改位置"按钮后插入导航按钮
            var mapBtn = btnContainer.querySelector('.btn-secondary');
            navBtn = document.createElement('button');
            navBtn.className = 'btn-secondary btn-nav';
            if (mapBtn && mapBtn.nextSibling) {
                btnContainer.insertBefore(navBtn, mapBtn.nextSibling);
            } else {
                btnContainer.appendChild(navBtn);
            }
        }
        
        // 设置按钮文字（带距离）
        var btnText = '🧭 导航';
        if (distance !== null && distance !== undefined) {
            btnText = '🧭 导航 (' + formatDistance(distance) + ')';
        }
        navBtn.textContent = btnText;
        navBtn.onclick = function() {
            openAmapNavigation(station.lat, station.lng, station.name);
        };
    }
    
    // 打开高德导航
    window.openAmapNavigation = function(lat, lng, name) {
        if (!lat || !lng) {
            Utils.showToast('该站点没有位置信息');
            return;
        }
        
        // 尝试使用高德地图APP导航
        var amapUrl = 'amapuri://route/plan/?sid=&did=&dlat=' + lat + '&dlon=' + lng + '&dname=' + encodeURIComponent(name || '目的地') + '&dev=0&t=0';
        
        // 备选：高德地图Web端
        var webUrl = 'https://uri.amap.com/navigation?to=' + lng + ',' + lat + ',' + encodeURIComponent(name || '目的地') + '&mode=car&policy=1';
        
        // 在HBuilder环境中尝试调用高德APP
        if (typeof plus !== 'undefined') {
            plus.runtime.openURL(amapUrl, function() {
                // 如果打开APP失败，使用Web端
                plus.runtime.openURL(webUrl);
            });
        } else {
            // 浏览器环境直接打开Web端
            window.open(webUrl, '_blank');
        }
    }

    // ===== 站点详情 =====
    window.viewStationDetail = async function(id, type) {
        // 同时添加到 App 对象供内部使用
        if (window.App && !window.App.viewStationDetail) {
            window.App.viewStationDetail = window.viewStationDetail;
        }
        currentStationId = id;
        currentStationType = type;
        
        var list = type === 'central' ? Storage.getCentralStations() : Storage.getDispersedStations();
        var station = list.find(function(s){ return s.id === id; });
        
        if (!station) {
            Utils.showToast('站点数据不存在');
            return;
        }
        
        // 获取调查记录（优先使用 IndexedDB 的完整数据）
        var survey = null;
        if (Storage.getSurveyAsync) {
            try {
                survey = await Storage.getSurveyAsync(id);
                console.log('viewStationDetail: IndexedDB 调查记录:', survey ? '有' : '无');
            } catch(e) {
                console.error('获取 IndexedDB 调查记录失败:', e);
                survey = Storage.getSurvey(id);
            }
        } else {
            survey = Storage.getSurvey(id);
            console.log('viewStationDetail: localStorage 调查记录:', survey ? '有' : '无');
        }
        
        var draftSurvey = Storage.getDraftSurvey ? Storage.getDraftSurvey(id) : null;
        console.log('viewStationDetail: 草稿记录:', draftSurvey ? '有' : '无');
        console.log('viewStationDetail: 调查状态判断 - survey:', !!survey, 'draftSurvey:', !!draftSurvey);
        
        var title = station.name;
        setText('detailPageTitle', title);
        
        var content = document.getElementById('stationDetailContent');
        if (!content) return;
        
        // 判断调查状态：已完成 / 进行中 / 未开始
        var surveyStatus = '未开始';
        var statusClass = 'status-pending';
        var statusIcon = '○';
        if (survey && Object.keys(survey).length > 0) {
            surveyStatus = '已完成';
            statusClass = 'status-done';
            statusIcon = '✓';
        } else if (draftSurvey && Object.keys(draftSurvey).length > 0) {
            surveyStatus = '进行中';
            statusClass = 'status-progress';
            statusIcon = '◐';
        }
        
        var statusHtml = '<span class="survey-status-badge ' + statusClass + '">' +
            '<span class="status-icon">' + statusIcon + '</span>' +
            '<span class="status-text">' + surveyStatus + '</span>' +
            '</span>';
        
        var infoHtml = '<div class="detail-section">' +
            '<div class="detail-section-title">基本信息</div>' +
            detailItem('站点名称', station.name) +
            detailItem('类型', type === 'central' ? '集中式' : '分散式') +
            detailItem('调查状态', statusHtml, true) +
            detailItem('县区', station.county || '-') +
            detailItem('乡镇', station.town || '-') +
            detailItem('行政村', station.village || '-');
        
        if (type === 'dispersed' && station.hamlet) {
            infoHtml += detailItem('自然屯', station.hamlet);
        }
        if (type === 'central') {
            infoHtml += detailItem('工程类型', station.stationType || '-') +
                       detailItem('投资金额', station.investment ? station.investment + ' 万元' : '-') +
                       detailItem('开始供水', station.startSupplyDate || '-') +
                       detailItem('所在位置', station.location || '-');
        } else {
            infoHtml += detailItem('供水人口', station.population ? station.population + ' 人' : '-') +
                       detailItem('水质结果', station.waterQualityResult || '-') +
                       detailItem('联系人', station.contactPerson || '-') +
                       detailItem('联系电话', station.contactPhone || '-');
        }
        
        if (station.lat && station.lng) {
            infoHtml += detailItem('GPS坐标', station.lat + ', ' + station.lng);
        }
        
        infoHtml += '</div>';
        
        // 调查记录信息
        if (survey) {
            // 供水方式显示（包含定时供水频次）
            var supplyModeText = survey.supplyMode || '-';
            if (survey.supplyMode === '定时供水' && (survey.supplyTimesPerDay || survey.supplyHoursPerTime)) {
                supplyModeText += ' (' + (survey.supplyTimesPerDay || '-') + '次/日、' + (survey.supplyHoursPerTime || '-') + '小时/次)';
            }
            
            infoHtml += '<div class="detail-section">' +
                '<div class="detail-section-title">调查记录</div>' +
                detailItem('调查时间', Utils.formatDateTime(survey.updateTime)) +
                detailItem('水质', survey.waterQuality || '-') +
                detailItem('水量', survey.waterQuantity || '-') +
                detailItem('供水方式', supplyModeText) +
                detailItem('用水方便', survey.convenience ? survey.convenience.slice(0,10) : '-') +
                detailItem('供水保证率', survey.supplyGuarantee ? survey.supplyGuarantee.slice(0,10) : '-') +
                detailItem('工程状态', survey.projectStatus || '-') +
                detailItem('调查员', survey.investigators || survey.investigator || '-') +
                '</div>';
            
            // 照片预览区域
            if (survey.photos && survey.photos.length > 0) {
                infoHtml += '<div class="detail-section">' +
                    '<div class="detail-section-title">📷 现场照片 (' + survey.photos.length + '张)</div>' +
                    '<div class="detail-photo-grid">';
                
                survey.photos.forEach(function(photoUrl, index) {
                    infoHtml += '<div class="detail-photo-item" onclick="window.viewPhoto(\'' + photoUrl + '\')">' +
                        '<img src="' + photoUrl + '" alt="照片' + (index + 1) + '" loading="lazy">' +
                        '</div>';
                });
                
                infoHtml += '</div></div>';
            }
            
            if (survey.problemSummary) {
                infoHtml += '<div class="detail-section">' +
                    '<div class="detail-section-title">发现问题</div>' +
                    '<div style="padding:12px 14px;font-size:13px;color:#555;line-height:1.8;">' + Utils.escapeHtml(survey.problemSummary) + '</div>' +
                    '</div>';
            }
        } else if (draftSurvey) {
            // 显示进行中的调查进度
            infoHtml += '<div class="detail-section">' +
                '<div class="detail-section-title">调查进度（进行中）</div>' +
                detailItem('最后保存', Utils.formatDateTime(draftSurvey.draftTime)) +
                (draftSurvey.waterQuality ? detailItem('水质', draftSurvey.waterQuality) : '') +
                (draftSurvey.waterQuantity ? detailItem('水量', draftSurvey.waterQuantity) : '') +
                '</div>';
        } else {
            infoHtml += '<div class="detail-section">' +
                '<div class="detail-section-title">调查状态</div>' +
                '<div style="text-align:center;padding:24px;color:#bbb;font-size:13px;">尚未进行调查</div>' +
                '</div>';
        }
        
        content.innerHTML = infoHtml;
        
        // 更新调查按钮文字
        var surveyBtn = content.parentElement.querySelector('.btn-primary');
        if (surveyBtn) {
            if (survey) {
                surveyBtn.textContent = '重新调查';
            } else if (draftSurvey) {
                surveyBtn.textContent = '继续调查';
            } else {
                surveyBtn.textContent = '开始调查';
            }
        }
        
        // 显示/隐藏导出按钮（只有已调查的站点才显示）
        var exportBtn = document.getElementById('exportSurveyBtn');
        if (exportBtn) {
            exportBtn.style.display = survey ? 'inline-block' : 'none';
        }
        
        // 显示/隐藏"设为进行中"按钮（只有已完成的站点才显示）
        var setToDraftBtn = document.getElementById('setToDraftBtn');
        if (setToDraftBtn) {
            setToDraftBtn.style.display = survey ? 'inline-block' : 'none';
        }
        
        // 获取当前位置并计算距离，更新导航按钮
        if (station.lat && station.lng) {
            getCurrentLocation(function(currentPos) {
                var distance = calculateDistance(currentPos.lat, currentPos.lng, station.lat, station.lng);
                updateDetailNavButton(station, distance);
            }, function() {
                // 定位失败，仍显示导航按钮但不显示距离
                updateDetailNavButton(station, null);
            });
        } else {
            updateDetailNavButton(station, null);
        }
        
        // 记录最近访问
        Storage.addRecentRecord({
            stationId: id,
            type: type,
            name: station.name,
            county: station.county,
            town: station.town,
            time: new Date().toISOString()
        });
        
        showPage('stationDetailPage');
    };
    
    // ===== 导出当前站点的调查表 =====
    window.exportCurrentSurvey = async function() {
        if (!currentStationId) {
            Utils.showToast('请先选择站点');
            return;
        }
        
        var survey = null;
        if (Storage.getSurveyAsync) {
            try {
                survey = await Storage.getSurveyAsync(currentStationId);
            } catch(e) {
                survey = Storage.getSurvey(currentStationId);
            }
        } else {
            survey = Storage.getSurvey(currentStationId);
        }
        
        if (!survey) {
            Utils.showToast('该站点尚未进行调查');
            return;
        }
        
        showSurveyViewModal(survey);
    };
    
    // ===== 将已完成的调查设为进行中 =====
    window.setSurveyToDraft = async function() {
        if (!currentStationId) {
            Utils.showToast('请先选择站点');
            return;
        }
        
        // 确认对话框
        if (!confirm('确定要将该站点设为"进行中"状态吗？\n\n原调查数据将保留，您可以继续完善后重新提交。')) {
            return;
        }
        
        console.log('=== 开始设为进行中 ===', currentStationId);
        
        // 获取已完成的调查数据
        var survey = null;
        if (Storage.getSurveyAsync) {
            try {
                survey = await Storage.getSurveyAsync(currentStationId);
                console.log('从 IndexedDB 获取调查数据:', survey ? '成功' : '无数据');
            } catch(e) {
                console.log('从 IndexedDB 获取失败，使用 localStorage:', e);
                survey = Storage.getSurvey(currentStationId);
            }
        } else {
            console.log('IndexedDB 不可用，使用 localStorage');
            survey = Storage.getSurvey(currentStationId);
        }
        
        if (!survey) {
            Utils.showToast('该站点尚未完成调查');
            return;
        }
        
        try {
            console.log('开始保存为草稿...');
            // 将数据保存为草稿（进行中状态）
            if (Storage.saveDraftSurvey) {
                Storage.saveDraftSurvey(currentStationId, survey);
                console.log('草稿保存成功');
            }
            
            console.log('开始删除本地已完成记录...');
            // 删除已完成的调查记录（使其变为进行中状态）
            if (Storage.deleteSurvey) {
                Storage.deleteSurvey(currentStationId);
                console.log('本地已完成记录删除成功');
            }
            
            console.log('开始删除 IndexedDB 数据...');
            // 同时删除 IndexedDB 中的数据
            if (typeof IndexedDBStorage !== 'undefined' && IndexedDBStorage.remove) {
                try {
                    await IndexedDBStorage.remove('surveys', currentStationId);
                    console.log('IndexedDB 数据删除成功');
                } catch(e) {
                    console.log('删除IndexedDB数据失败:', e);
                }
            } else {
                console.log('IndexedDB 不可用，跳过');
            }
            
            console.log('开始删除云端调查记录...');
            // 删除云端调查记录
            if (window.SupabaseAPI && SupabaseAPI.deleteSurvey) {
                try {
                    await SupabaseAPI.deleteSurvey(currentStationId);
                    console.log('云端调查记录删除成功');
                } catch(e) {
                    console.log('删除云端调查记录失败:', e);
                }
            } else {
                console.log('SupabaseAPI 不可用，跳过云端删除');
            }
            
            console.log('=== 设为进行中完成 ===');
            Utils.showToast('已设为进行中状态，您可以继续完善调查');
            
            // 延迟刷新页面显示，确保数据已更新
            setTimeout(function() {
                viewStationDetail(currentStationId, currentStationType);
            }, 500);
            
        } catch(e) {
            console.error('设为进行中失败:', e);
            Utils.showToast('操作失败，请重试');
        }
    };
    
    // 显示调查表查看弹窗
    function showSurveyViewModal(survey) {
        var modal = document.createElement('div');
        modal.className = 'survey-view-modal';
        modal.innerHTML = 
            '<div class="survey-view-backdrop" onclick="closeSurveyViewModal()"></div>' +
            '<div class="survey-view-content">' +
            '<div class="survey-view-header">' +
            '<h3>📋 调查表详情</h3>' +
            '<div class="survey-view-close" onclick="closeSurveyViewModal()">×</div>' +
            '</div>' +
            '<div class="survey-view-body">' +
            renderSurveyViewContent(survey) +
            '</div>' +
            '<div class="survey-view-footer">' +
            '<button class="btn-secondary" onclick="closeSurveyViewModal()">关闭</button>' +
            '<button class="btn-success" onclick="ExportManager.exportSurveyWord(currentStationId, currentStationType);closeSurveyViewModal();">📥 导出Word</button>' +
            '</div>' +
            '</div>';
        document.body.appendChild(modal);
        window.closeSurveyViewModal = function() {
            modal.remove();
        };
    }
    
    // 渲染调查表内容
    function renderSurveyViewContent(survey) {
        var html = '<div class="survey-view-section">';
        
        // 基本信息
        html += '<div class="survey-view-section-title">📍 基本信息</div>';
        html += '<div class="survey-view-grid">';
        html += '<div class="survey-view-item"><span class="label">调查时间：</span><span class="value">' + (survey.surveyDate || '-') + '</span></div>';
        html += '<div class="survey-view-item"><span class="label">县（市、区）：</span><span class="value">' + (survey.county || '-') + '</span></div>';
        html += '<div class="survey-view-item"><span class="label">乡镇：</span><span class="value">' + (survey.town || '-') + '</span></div>';
        html += '<div class="survey-view-item"><span class="label">村：</span><span class="value">' + (survey.village || '-') + '</span></div>';
        html += '<div class="survey-view-item"><span class="label">自然屯：</span><span class="value">' + (survey.hamlet || '-') + '</span></div>';
        html += '<div class="survey-view-item"><span class="label">工程名称：</span><span class="value">' + (survey.projectName || '-') + '</span></div>';
        html += '<div class="survey-view-item"><span class="label">调查员：</span><span class="value">' + (survey.investigator || '-') + '</span></div>';
        html += '</div>';
        
        // 水质水量
        html += '<div class="survey-view-section-title">💧 水质水量</div>';
        html += '<div class="survey-view-grid">';
        html += '<div class="survey-view-item"><span class="label">水质：</span><span class="value">' + (survey.waterQuality || '-') + '</span></div>';
        if (survey.waterQuality === '不符合要求') {
            html += '<div class="survey-view-item full-width"><span class="label">水质问题：</span><span class="value">' + (Array.isArray(survey.waterQualityProb) ? survey.waterQualityProb.join('、') : '-') + '</span></div>';
        }
        html += '<div class="survey-view-item"><span class="label">水量：</span><span class="value">' + (survey.waterQuantity || '-') + '</span></div>';
        html += '<div class="survey-view-item"><span class="label">供水方式：</span><span class="value">' + (survey.supplyMode || '-') + '</span></div>';
        if (survey.supplyMode === '定时供水') {
            html += '<div class="survey-view-item"><span class="label">定时频次：</span><span class="value">' + (survey.supplyTimesPerDay || '-') + '次/日、' + (survey.supplyHoursPerTime || '-') + '小时/次</span></div>';
        }
        html += '</div>';
        
        // 用水方便程度
        html += '<div class="survey-view-section-title">🚿 用水方便程度</div>';
        html += '<div class="survey-view-grid">';
        html += '<div class="survey-view-item"><span class="label">方便程度：</span><span class="value">' + (survey.convenience || '-') + '</span></div>';
        html += '<div class="survey-view-item"><span class="label">供水保证率：</span><span class="value">' + (survey.supplyGuarantee || '-') + '</span></div>';
        html += '</div>';
        
        // 运行管理
        html += '<div class="survey-view-section-title">🔧 运行管理</div>';
        html += '<div class="survey-view-grid">';
        html += '<div class="survey-view-item"><span class="label">水源稳定：</span><span class="value">' + (survey.stableSource || '-') + '</span></div>';
        html += '<div class="survey-view-item"><span class="label">运维主体：</span><span class="value">' + (survey.operationMaintenance || '-') + '</span></div>';
        html += '<div class="survey-view-item"><span class="label">设备状态：</span><span class="value">' + (survey.equipmentStatus || '-') + '</span></div>';
        html += '<div class="survey-view-item full-width"><span class="label">管理问题：</span><span class="value">' + (Array.isArray(survey.managementProb) ? survey.managementProb.join('、') : '-') + '</span></div>';
        html += '</div>';
        
        // 水费及补贴
        html += '<div class="survey-view-section-title">💰 水费及补贴</div>';
        html += '<div class="survey-view-grid">';
        html += '<div class="survey-view-item"><span class="label">是否收费：</span><span class="value">' + (survey.feeCollected || '-') + '</span></div>';
        if (survey.feeCollected === '是') {
            html += '<div class="survey-view-item"><span class="label">水费标准：</span><span class="value">' + (survey.waterFeeStandard || '-') + '</span></div>';
        }
        html += '<div class="survey-view-item"><span class="label">补贴机制：</span><span class="value">' + (survey.subsidyMechanism || '-') + '</span></div>';
        html += '</div>';
        
        // 发现问题
        html += '<div class="survey-view-section-title">⚠️ 发现问题</div>';
        html += '<div class="survey-view-grid">';
        html += '<div class="survey-view-item full-width"><span class="label">问题摘要：</span><span class="value">' + (survey.problemSummary || '无') + '</span></div>';
        html += '<div class="survey-view-item full-width"><span class="label">整改建议：</span><span class="value">' + (survey.suggestions || '无') + '</span></div>';
        html += '</div>';
        
        // 农户满意度
        if (survey.householdDetails && survey.householdDetails.length > 0) {
            html += '<div class="survey-view-section-title">👥 农户满意度</div>';
            html += '<div class="survey-view-households">';
            survey.householdDetails.forEach(function(h, i) {
                if (h.name) {
                    html += '<div class="survey-view-household">';
                    html += '<div class="household-name">农户' + (i+1) + '：' + h.name + '</div>';
                    html += '<div class="household-selection">评价：' + (Array.isArray(h.selection) ? h.selection.join('、') : '-') + '</div>';
                    if (h.reason) {
                        html += '<div class="household-reason">原因：' + h.reason + '</div>';
                    }
                    html += '</div>';
                }
            });
            html += '</div>';
        }
        
        // 照片
        if (survey.photos && survey.photos.length > 0) {
            html += '<div class="survey-view-section-title">📷 现场照片（' + survey.photos.length + '张）</div>';
            html += '<div class="survey-view-photos">';
            survey.photos.forEach(function(photo, i) {
                html += '<img src="' + photo + '" alt="照片' + (i+1) + '" onclick="viewPhoto(\'' + photo + '\')">';
            });
            html += '</div>';
        }
        
        html += '</div>';
        return html;
    }
    
    // ===== 查看照片大图 =====
    window.viewPhoto = function(photoUrl) {
        // 创建全屏查看层
        var viewer = document.createElement('div');
        viewer.className = 'photo-viewer';
        viewer.innerHTML = 
            '<div class="photo-viewer-backdrop" onclick="this.parentElement.remove()"></div>' +
            '<div class="photo-viewer-content">' +
            '<img src="' + photoUrl + '" alt="照片">' +
            '<div class="photo-viewer-close" onclick="this.parentElement.parentElement.remove()">×</div>' +
            '</div>';
        document.body.appendChild(viewer);
    };

    function detailItem(key, val, rawHtml) {
        // rawHtml=true 时不转义值（用于HTML标签）
        var valHtml = rawHtml ? String(val||'-') : Utils.escapeHtml(String(val||'-'));
        return '<div class="detail-item"><div class="detail-key">' + Utils.escapeHtml(key) + '</div>' +
               '<div class="detail-val">' + valHtml + '</div></div>';
    }

    // ===== 开始调查 =====
    window.startSurvey = async function() {
        if (!currentStationId) {
            Utils.showToast('请先选择站点');
            return;
        }
        
        // 异步加载已有调查数据（优先从 IndexedDB 获取完整数据）
        var existingSurvey = {};
        if (Storage.getSurveyAsync) {
            try {
                existingSurvey = await Storage.getSurveyAsync(currentStationId) || {};
                console.log('startSurvey: 从 IndexedDB 异步加载调查数据:', currentStationId);
            } catch(e) {
                console.error('startSurvey: 从 IndexedDB 加载失败:', e);
                existingSurvey = Storage.getSurvey(currentStationId) || {};
            }
        } else {
            existingSurvey = Storage.getSurvey(currentStationId) || {};
        }
        
        var draftSurvey = Storage.getDraftSurvey ? Storage.getDraftSurvey(currentStationId) : null;
        var list = currentStationType === 'central' ? Storage.getCentralStations() : Storage.getDispersedStations();
        var station = list.find(function(s){ return s.id === currentStationId; }) || {};
        
        // 如果有草稿数据且没有完成调查，使用草稿数据
        var surveyData = existingSurvey;
        if (draftSurvey && !existingSurvey.stationId) {
            surveyData = draftSurvey;
            Utils.showToast('已恢复上次调查进度', 2000);
        }
        
        // 预填充站点信息
        currentSurveyData = Object.assign({
            county: station.county,
            town: station.town,
            village: station.village,
            hamlet: station.hamlet,
            projectName: station.name,
            lat: station.lat,
            lng: station.lng
        }, surveyData);
        
        // 调试信息
        console.log('加载调查数据:', currentStationId);
        console.log('  investigator:', currentSurveyData.investigator);
        console.log('  supplyTimesPerDay:', currentSurveyData.supplyTimesPerDay);
        console.log('  supplyHoursPerTime:', currentSurveyData.supplyHoursPerTime);
        console.log('  managementProb:', JSON.stringify(currentSurveyData.managementProb));
        console.log('  householdDetails:', JSON.stringify(currentSurveyData.householdDetails));
        
        // 设置照片数据
        if (SurveyForm.setPhotos) {
            SurveyForm.setPhotos(currentSurveyData.photos || []);
        }
        
        currentStep = 1;
        renderSurveyStep(1);
        showPage('surveyPage');
    };

    // ===== 调查表步骤渲染 =====
    function renderSurveyStep(step) {
        var content = document.getElementById('surveyFormContent');
        var stepLabel = document.getElementById('surveyStepLabel');
        var prevBtn = document.getElementById('prevStepBtn');
        var nextBtn = document.getElementById('nextStepBtn');
        var saveBtn = document.getElementById('saveSurveyBtn');
        var submitBtn = document.getElementById('submitSurveyBtn');
        
        if (!content) return;
        
        // 渲染步骤内容
        content.innerHTML = SurveyForm.renderStep(step, currentSurveyData);
        
        // 更新步骤指示器
        if (stepLabel) stepLabel.textContent = step + '/' + totalSteps;
        
        for (var i = 1; i <= totalSteps; i++) {
            var dot = document.getElementById('step' + i + 'Dot');
            if (!dot) continue;
            dot.classList.remove('active', 'done');
            if (i < step) dot.classList.add('done');
            else if (i === step) dot.classList.add('active');
        }
        
        for (var j = 1; j < totalSteps; j++) {
            var line = document.getElementById('stepLine' + j);
            if (line) {
                line.classList.toggle('done', j < step);
            }
        }
        
        // 按钮显示
        if (prevBtn) prevBtn.style.display = step > 1 ? 'block' : 'none';
        if (nextBtn) nextBtn.style.display = step < totalSteps ? 'block' : 'none';
        if (saveBtn) saveBtn.style.display = 'block'; // 所有步骤都显示保存按钮
        if (submitBtn) submitBtn.style.display = step === totalSteps ? 'block' : 'none';
        
        content.scrollTop = 0;
    }

    window.prevStep = function() {
        // 保存当前步骤数据
        var stepData = SurveyForm.collectStepData(currentStep);
        Object.assign(currentSurveyData, stepData);
        
        if (currentStep > 1) {
            currentStep--;
            renderSurveyStep(currentStep);
        }
    };

    window.nextStep = function() {
        // 保存当前步骤数据
        var stepData = SurveyForm.collectStepData(currentStep);
        Object.assign(currentSurveyData, stepData);
        
        if (currentStep < totalSteps) {
            currentStep++;
            renderSurveyStep(currentStep);
        }
    };

    window.goToStep = function(step) {
        if (step <= currentStep) {
            var stepData = SurveyForm.collectStepData(currentStep);
            Object.assign(currentSurveyData, stepData);
            currentStep = step;
            renderSurveyStep(step);
        }
    };

    // ===== 保存调查（临时保存为草稿）=====
    window.saveSurvey = function() {
        // 保存当前步骤数据
        var stepData = SurveyForm.collectStepData(currentStep);
        Object.assign(currentSurveyData, stepData);
        
        // 保存为草稿（进行中的调查）
        if (Storage.saveDraftSurvey) {
            Storage.saveDraftSurvey(currentStationId, currentSurveyData);
            Utils.showToast('调查进度已保存（进行中）', 2000);
        } else {
            // 兼容旧版本
            Storage.saveSurvey(currentStationId, currentSurveyData);
            Utils.showToast('调查表已保存', 2000);
        }
    };

    // ===== 提交调查（完成调查）=====
    window.submitSurvey = async function() {
        // 保存最后一步数据
        var stepData = SurveyForm.collectStepData(currentStep);
        Object.assign(currentSurveyData, stepData);
        
        console.log('提交调查:', currentStationId, 'supplyTimesPerDay=' + currentSurveyData.supplyTimesPerDay, 'supplyHoursPerTime=' + currentSurveyData.supplyHoursPerTime);
        
        // 删除草稿（如果有）
        if (Storage.deleteDraftSurvey) {
            Storage.deleteDraftSurvey(currentStationId);
        }
        
        // 保存为正式调查记录（本地）
        Storage.saveSurvey(currentStationId, currentSurveyData);
        
        // 同步到云端（如果在线）
        if (typeof SupabaseClient !== 'undefined') {
            try {
                Utils.showToast('正在同步调查数据...', 1500);
                console.log('准备同步到云端:', currentStationId, 'householdDetails:', JSON.stringify(currentSurveyData.householdDetails));
                await SupabaseClient.saveSurvey(currentStationId, currentSurveyData);
                console.log('调查数据已同步到云端');
            } catch(e) {
                console.error('调查同步失败:', e);
                // 失败时会自动加入同步队列，稍后同步
            }
        }
        
        // 更新站点 GPS（如果调查中有定位）
        if (currentSurveyData.lat && currentSurveyData.lng) {
            updateStationGPS(currentStationId, currentStationType, currentSurveyData.lat, currentSurveyData.lng);
        }
        
        Utils.showToast('调查表已提交完成', 2000);
        
        // 返回详情页
        setTimeout(function() {
            goBack();
            viewStationDetail(currentStationId, currentStationType);
        }, 500);
    };

    function updateStationGPS(id, type, lat, lng) {
        var list = type === 'central' ? Storage.getCentralStations() : Storage.getDispersedStations();
        var station = list.find(function(s){ return s.id === id; });
        if (station) {
            station.lat = lat;
            station.lng = lng;
            if (type === 'central') Storage.saveCentralStations(list);
            else Storage.saveDispersedStations(list);
        }
    }

    window.confirmExitSurvey = function() {
        Utils.showConfirm('退出调查', '当前调查尚未提交，确定退出吗？（已填写的数据不会保存）', function() {
            goBack();
        });
    };

    // ===== 删除站点 =====
    window.deleteStation = function() {
        Utils.showConfirm('删除站点', '确定删除此站点及其调查记录吗？此操作不可恢复！', function() {
            if (currentStationType === 'central') {
                Storage.deleteCentral(currentStationId);
            } else {
                Storage.deleteDispersed(currentStationId);
            }
            Storage.deleteSurvey(currentStationId);
            Utils.showToast('已删除');
            goBack();
            goBack();
        });
    };

    // ===== 在地图查看 =====
    // 查看当前站点位置并支持修改
    window.viewOnMap = function() {
        console.log('viewOnMap 被调用', 'currentStationId:', currentStationId, 'currentStationType:', currentStationType);
        
        if (!currentStationId || !currentStationType) {
            Utils.showToast('请先选择站点');
            console.log('错误：站点ID或类型为空');
            return;
        }
        
        // 获取当前站点数据
        var list = currentStationType === 'central' ? Storage.getCentralStations() : Storage.getDispersedStations();
        console.log('站点列表数量:', list.length);
        
        var station = list.find(function(s) { return s.id === currentStationId; });
        console.log('找到的站点:', station);
        
        if (!station) {
            Utils.showToast('站点数据不存在');
            console.log('错误：站点不存在');
            return;
        }
        
        if (!station.lat || !station.lng) {
            Utils.showToast('该站点暂无位置信息，请在调查中添加GPS坐标');
            console.log('错误：站点无位置信息', 'lat:', station.lat, 'lng:', station.lng);
            return;
        }
        
        console.log('准备打开地图，站点位置:', station.lat, station.lng);
        
        // 使用新的单站点查看功能
        if (AmapManager && AmapManager.viewSingleStation) {
            console.log('调用 AmapManager.viewSingleStation');
            AmapManager.viewSingleStation(station, currentStationType);
        } else {
            console.log('AmapManager.viewSingleStation 不可用，使用旧方式');
            // 回退到旧方式
            openMap();
            setTimeout(function() {
                AmapManager.loadMarkersOnMap('all');
            }, 500);
        }
    };

    // ===== 打开地图 =====
    window.openMap = function() {
        showPage('mapPage');
        setTimeout(function() {
            AmapManager.initMap();
            AmapManager.initAreaFilter();
        }, 100);
    };

    // ===== 打开导入 =====
    window.openImport = function() {
        showPage('importPage');
    };

    // ===== 打开搜索 =====
    window.openSearch = function() {
        showPage('searchPage');
        document.getElementById('searchInput').focus();
    };

    window.doSearch = function() {
        var keyword = document.getElementById('searchInput').value.trim();
        var statusFilter = document.getElementById('searchStatusFilter') ? document.getElementById('searchStatusFilter').value : '';
        
        if (!keyword && !statusFilter) {
            document.getElementById('searchResult').innerHTML = '<div class="empty-tip">请输入搜索关键词或选择筛选条件</div>';
            return;
        }
        
        var surveys = Storage.getSurveys();
        var drafts = Storage.getDraftSurveys ? Storage.getDraftSurveys() : {};
        
        var central = keyword ? Utils.filterStations(Storage.getCentralStations(), '', '', '', keyword) : Storage.getCentralStations();
        var dispersed = keyword ? Utils.filterStations(Storage.getDispersedStations(), '', '', '', keyword) : Storage.getDispersedStations();
        
        var all = central.map(function(s){ s._type='central'; return s; })
                         .concat(dispersed.map(function(s){ s._type='dispersed'; return s; }));
        
        // 根据状态筛选
        if (statusFilter) {
            all = all.filter(function(s) {
                var hasSurvey = !!surveys[s.id];
                var hasDraft = !!drafts[s.id] && !hasSurvey;
                
                if (statusFilter === 'completed') return hasSurvey;
                if (statusFilter === 'draft') return hasDraft;
                if (statusFilter === 'unsurveyed') return !hasSurvey && !hasDraft;
                return true;
            });
        }
        
        renderStationList('searchResult', all.slice(0, 50), all[0] ? all[0]._type : 'central', null);
        
        if (!all.length) {
            document.getElementById('searchResult').innerHTML = '<div class="empty-tip">未找到相关站点</div>';
        }
    };

    // ===== 导出记录统计表 =====
    window.exportRecordTable = function() {
        ExportManager.exportRecordTable();
    };

    // ===== 打开问题台账 =====
    window.openProblems = function() {
        loadProblems();
        showPage('problemsPage');
    };

    function loadProblems() {
        // 从调查记录中提取有问题的站点
        // 规则：只有"发现问题"字段有内容才算有问题站点
        var surveys = Storage.getSurveys();
        var problems = [];
        
        var allStations = Storage.getCentralStations().concat(Storage.getDispersedStations());
        var stationMap = {};
        allStations.forEach(function(s){ stationMap[s.id] = s; });
        
        Object.keys(surveys).forEach(function(id) {
            var s = surveys[id];
            var station = stationMap[id] || {};
            
            // 检查是否有问题：只根据"发现问题"字段判断
            var problemSummary = s.problemSummary || s.problem_summary || '';
            if (problemSummary && problemSummary.trim().length > 0) {
                // 将问题内容按换行或分号分割成多个问题
                var hasProbs = problemSummary.split(/[;；\n]/).filter(function(p) {
                    return p && p.trim().length > 0;
                }).map(function(p) { return p.trim(); });
                
                // 如果没有分割出多个问题，将整个内容作为一个问题
                if (hasProbs.length === 0) {
                    hasProbs = [problemSummary.substring(0, 50) + (problemSummary.length > 50 ? '...' : '')];
                }
                
                problems.push({
                    id: id,
                    name: station.name || '未知站点',
                    county: station.county || s.county || '',
                    town: station.town || s.town || '',
                    type: station.type || 'central',
                    problems: hasProbs,
                    surveyTime: s.updateTime
                });
            }
        });
        
        // 更新县区筛选
        var counties = {};
        problems.forEach(function(p){ if(p.county) counties[p.county]=1; });
        Utils.updateSelect('problemAreaFilter', Object.keys(counties).sort(), '');
        
        renderProblems(problems);
    }

    window.filterProblems = function() {
        var area = document.getElementById('problemAreaFilter').value;
        var ptype = document.getElementById('problemTypeFilter').value;
        
        var surveys = Storage.getSurveys();
        var allStations = Storage.getCentralStations().concat(Storage.getDispersedStations());
        var stationMap = {};
        allStations.forEach(function(s){ stationMap[s.id] = s; });
        
        var problems = [];
        Object.keys(surveys).forEach(function(id) {
            var s = surveys[id];
            var station = stationMap[id] || {};
            
            // 检查是否有问题：只根据"发现问题"字段判断
            var problemSummary = s.problemSummary || s.problem_summary || '';
            if (!problemSummary || problemSummary.trim().length === 0) return;
            
            // 将问题内容按换行或分号分割成多个问题
            var hasProbs = problemSummary.split(/[;；\n]/).filter(function(p) {
                return p && p.trim().length > 0;
            }).map(function(p) { return p.trim(); });
            
            // 如果没有分割出多个问题，将整个内容作为一个问题
            if (hasProbs.length === 0) {
                hasProbs = [problemSummary.substring(0, 50) + (problemSummary.length > 50 ? '...' : '')];
            }
            
            // 县区筛选
            if (area && (station.county || '') !== area) return;
            
            // 问题类型筛选（在发现问题文本中搜索关键词）
            if (ptype) {
                var hasMatch = hasProbs.some(function(prob) {
                    return prob.indexOf(ptype) >= 0;
                });
                if (!hasMatch) return;
            }
            
            problems.push({
                id: id,
                name: station.name || '未知站点',
                county: station.county || '',
                town: station.town || '',
                type: station.type || 'central',
                problems: hasProbs,
                surveyTime: s.updateTime
            });
        });
        
        renderProblems(problems);
    };

    function renderProblems(problems) {
        var container = document.getElementById('problemsList');
        if (!container) return;
        
        if (!problems.length) {
            container.innerHTML = '<div class="empty-tip">暂无问题记录</div>';
            return;
        }
        
        container.innerHTML = problems.map(function(p) {
            return '<div class="station-card" onclick="viewStationDetail(\'' + p.id + '\',\'' + p.type + '\')">' +
                '<div class="station-card-header">' +
                '<div class="station-name">' + Utils.escapeHtml(p.name) + '</div>' +
                '<div style="font-size:11px;color:#e53e3e;font-weight:600;">' + p.problems.length + '个问题</div>' +
                '</div>' +
                '<div style="display:flex;flex-wrap:wrap;gap:6px;margin:6px 0;">' +
                p.problems.map(function(prob){ 
                    return '<span style="font-size:11px;padding:2px 8px;background:#fff0f0;color:#e53e3e;border-radius:10px;">' + prob + '</span>';
                }).join('') +
                '</div>' +
                '<div class="station-location">📍 ' + Utils.escapeHtml([p.county, p.town].filter(Boolean).join(' > ')) + '</div>' +
                '<div style="font-size:11px;color:#bbb;margin-top:4px;">调查时间：' + Utils.formatDateTime(p.surveyTime) + '</div>' +
                '</div>';
        }).join('');
    }

    // ===== 新增/编辑站点 =====
    function openAddStation(type) {
        isEditing = false;
        editingStation = null;
        currentStationType = type;
        
        setText('addStationTitle', (type === 'central' ? '集中式' : '分散式') + ' - 新增站点');
        renderAddStationForm(type, null);
        showPage('addStationPage');
    }

    function renderAddStationForm(type, station) {
        var d = station || {};
        var container = document.getElementById('addStationForm');
        if (!container) return;
        
        var html = '<div class="form-section">' +
            '<div class="form-section-title">基本信息</div>' +
            formItem('站点名称', '<input type="text" class="form-control" id="sf_name" placeholder="供水工程名称" value="' + esc(d.name) + '">', true) +
            formItem('省', '<input type="text" class="form-control" id="sf_province" value="' + esc(d.province || '黑龙江省') + '">') +
            formItem('市', '<input type="text" class="form-control" id="sf_city" value="' + esc(d.city || '绥化市') + '">') +
            formItem('县区', '<input type="text" class="form-control" id="sf_county" placeholder="县（市、区）" value="' + esc(d.county) + '">', true) +
            formItem('乡镇', '<input type="text" class="form-control" id="sf_town" placeholder="乡（镇）" value="' + esc(d.town) + '">') +
            formItem('行政村', '<input type="text" class="form-control" id="sf_village" placeholder="行政村" value="' + esc(d.village) + '">') +
            (type === 'dispersed' ? formItem('自然屯', '<input type="text" class="form-control" id="sf_hamlet" placeholder="自然屯" value="' + esc(d.hamlet) + '">') : '') +
            '</div>';
        
        if (type === 'central') {
            html += '<div class="form-section">' +
                '<div class="form-section-title">工程信息</div>' +
                formItem('工程类型', '<select class="form-control" id="sf_stationType">' +
                    selectOptions(['城市管网延伸工程','千吨万人工程','千人供水工程','百人以上工程','其他集中式'], d.stationType) +
                    '</select>') +
                formItem('投资额(万元)', '<input type="number" class="form-control" id="sf_investment" step="0.01" value="' + esc(d.investment) + '">') +
                formItem('开始供水', '<input type="date" class="form-control" id="sf_startSupplyDate" value="' + esc(d.startSupplyDate) + '">') +
                formItem('所在位置', '<input type="text" class="form-control" id="sf_location" placeholder="所在位置描述" value="' + esc(d.location) + '">') +
                formItem('供水范围', '<input type="text" class="form-control" id="sf_supplyRange" placeholder="供水范围" value="' + esc(d.supplyRange) + '">') +
                '</div>';
        } else {
            html += '<div class="form-section">' +
                '<div class="form-section-title">供水信息</div>' +
                formItem('供水人口', '<input type="number" class="form-control" id="sf_population" value="' + esc(d.population) + '">') +
                formItem('水质检测', '<select class="form-control" id="sf_waterQualityResult">' +
                    selectOptions(['达标','不达标','未检测'], d.waterQualityResult) + '</select>') +
                formItem('水源类型', '<select class="form-control" id="sf_waterSourceType">' +
                    selectOptions(['农户自打井','机井','大口井','山泉水','河流','水柜水窖','其他'], d.waterSourceType) + '</select>') +
                formItem('联系人', '<input type="text" class="form-control" id="sf_contactPerson" value="' + esc(d.contactPerson) + '">') +
                formItem('联系电话', '<input type="tel" class="form-control" id="sf_contactPhone" value="' + esc(d.contactPhone) + '">') +
                '</div>';
        }
        
        html += '<div class="form-section">' +
            '<div class="form-section-title">位置信息</div>' +
            formItem('纬度', '<input type="number" class="form-control" id="sf_lat" step="0.000001" placeholder="纬度" value="' + esc(d.lat) + '">') +
            formItem('经度', '<input type="number" class="form-control" id="sf_lng" step="0.000001" placeholder="经度" value="' + esc(d.lng) + '">') +
            '<div class="form-item"><div class="form-label"></div>' +
            '<button onclick="getStationGPS()" class="btn-primary" style="font-size:13px;padding:8px 16px;">📍 当前位置定位</button>' +
            '</div></div>';
        
        container.innerHTML = html;
    }

    function formItem(label, inputHtml, required) {
        return '<div class="form-item">' +
               '<div class="form-label' + (required ? ' required' : '') + '">' + label + '</div>' +
               inputHtml + '</div>';
    }

    function selectOptions(opts, selected) {
        return opts.map(function(o) {
            return '<option value="' + esc(o) + '"' + (o === selected ? ' selected' : '') + '>' + esc(o) + '</option>';
        }).join('');
    }

    window.getStationGPS = function() {
        var getPos = function(lat, lng) {
            var latEl = document.getElementById('sf_lat');
            var lngEl = document.getElementById('sf_lng');
            if (latEl) latEl.value = lat.toFixed(6);
            if (lngEl) lngEl.value = lng.toFixed(6);
            Utils.showToast('定位成功');
        };
        if (typeof plus !== 'undefined' && plus.geolocation) {
            plus.geolocation.getCurrentPosition(function(p) { getPos(p.coords.latitude, p.coords.longitude); }, function(e) { Utils.showToast('定位失败'); });
        } else if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(function(p) { getPos(p.coords.latitude, p.coords.longitude); }, function() { Utils.showToast('无法定位'); });
        }
    };

    window.saveStation = function() {
        var name = document.getElementById('sf_name');
        var county = document.getElementById('sf_county');
        
        if (!name || !name.value.trim()) {
            Utils.showToast('请填写站点名称');
            return;
        }
        
        var station = {
            id: isEditing ? editingStation.id : '',
            type: currentStationType,
            name: name.value.trim(),
            province: getVal('sf_province') || '黑龙江省',
            city: getVal('sf_city') || '绥化市',
            county: getVal('sf_county'),
            town: getVal('sf_town'),
            village: getVal('sf_village'),
            hamlet: getVal('sf_hamlet'),
            lat: getVal('sf_lat'),
            lng: getVal('sf_lng')
        };
        
        if (currentStationType === 'central') {
            station.stationType = getVal('sf_stationType');
            station.investment = getVal('sf_investment');
            station.startSupplyDate = getVal('sf_startSupplyDate');
            station.location = getVal('sf_location');
            station.supplyRange = getVal('sf_supplyRange');
            Storage.upsertCentral(station);
        } else {
            station.population = getVal('sf_population');
            station.waterQualityResult = getVal('sf_waterQualityResult');
            station.waterSourceType = getVal('sf_waterSourceType');
            station.contactPerson = getVal('sf_contactPerson');
            station.contactPhone = getVal('sf_contactPhone');
            Storage.upsertDispersed(station);
        }
        
        Utils.showToast(isEditing ? '保存成功' : '站点已新增');
        refreshStats();
        goBack();
        
        // 刷新列表
        if (currentStationType === 'central') loadCentralList();
        else loadDispersedList();
    };

    function getVal(id) {
        var el = document.getElementById(id);
        return el ? el.value.trim() : '';
    }

    function esc(v) { return Utils.escapeHtml(v || ''); }

    // ===== 统计详情弹窗 =====
    window.showStatsDetail = function() {
        var stats = Storage.getStats();
        Utils.showConfirm('统计概览', 
            '集中式站点：' + stats.central + ' 个\n' +
            '分散式站点：' + stats.dispersed + ' 个\n' +
            '已调查：' + stats.surveyed + ' 个\n' +
            '待调查：' + (stats.total - stats.surveyed) + ' 个',
            function() {}
        );
    };

})();
