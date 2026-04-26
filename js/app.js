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
    
    // 手动同步按钮
    window.syncWithCloud = async function() {
        if (typeof SupabaseClient === 'undefined') {
            Utils.showToast('云端同步功能未启用');
            return;
        }
        
        Utils.showToast('正在同步数据...');
        try {
            // 先推送本地数据到云端
            await SupabaseClient.sync();
            // 再从云端拉取最新数据
            await SupabaseClient.pullFromCloud();
            
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
        } catch(e) {
            console.error('同步失败:', e);
            Utils.showToast('同步失败: ' + (e.message || '未知错误'));
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
        getCurrentLocation(function(currentPos) {
            renderListWithDistance(currentPos);
        }, function() {
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
        if (typeof plus !== 'undefined' && plus.geolocation) {
            plus.geolocation.getCurrentPosition(function(pos) {
                success({ lat: pos.coords.latitude, lng: pos.coords.longitude });
            }, function(e) {
                error && error(e);
            });
        } else if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(function(pos) {
                success({ lat: pos.coords.latitude, lng: pos.coords.longitude });
            }, function(e) {
                error && error(e);
            });
        } else {
            error && error(new Error('不支持定位'));
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
    window.viewStationDetail = function(id, type) {
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
        
        var survey = Storage.getSurvey(id);
        var draftSurvey = Storage.getDraftSurvey ? Storage.getDraftSurvey(id) : null;
        var title = station.name;
        setText('detailPageTitle', title);
        
        var content = document.getElementById('stationDetailContent');
        if (!content) return;
        
        // 判断调查状态：已完成 / 进行中 / 未开始
        var surveyStatus = '未开始';
        var statusColor = '#bbb';
        if (survey && Object.keys(survey).length > 0) {
            surveyStatus = '已完成';
            statusColor = '#4caf50';
        } else if (draftSurvey && Object.keys(draftSurvey).length > 0) {
            surveyStatus = '进行中';
            statusColor = '#ff9800';
        }
        
        var infoHtml = '<div class="detail-section">' +
            '<div class="detail-section-title">基本信息</div>' +
            detailItem('站点名称', station.name) +
            detailItem('类型', type === 'central' ? '集中式供水' : '分散式供水') +
            detailItem('调查状态', '<span style="color:' + statusColor + ';font-weight:bold;">' + surveyStatus + '</span>') +
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
            infoHtml += '<div class="detail-section">' +
                '<div class="detail-section-title">调查记录</div>' +
                detailItem('调查时间', Utils.formatDateTime(survey.updateTime)) +
                detailItem('水质', survey.waterQuality || '-') +
                detailItem('水量', survey.waterQuantity || '-') +
                detailItem('用水方便', survey.convenience ? survey.convenience.slice(0,10) : '-') +
                detailItem('供水保证率', survey.supplyGuarantee ? survey.supplyGuarantee.slice(0,10) : '-') +
                detailItem('工程状态', survey.projectStatus || '-') +
                detailItem('调查员', survey.investigators || survey.investigator || '-') +
                '</div>';
            
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
    window.exportCurrentSurvey = function() {
        if (!currentStationId) {
            Utils.showToast('请先选择站点');
            return;
        }
        
        var survey = Storage.getSurvey(currentStationId);
        if (!survey) {
            Utils.showToast('该站点尚未进行调查，无法导出');
            return;
        }
        
        ExportManager.exportSurveyWord(currentStationId, currentStationType);
    };

    function detailItem(key, val) {
        return '<div class="detail-item"><div class="detail-key">' + Utils.escapeHtml(key) + '</div>' +
               '<div class="detail-val">' + Utils.escapeHtml(String(val||'-')) + '</div></div>';
    }

    // ===== 开始调查 =====
    window.startSurvey = function() {
        if (!currentStationId) {
            Utils.showToast('请先选择站点');
            return;
        }
        
        // 加载已有调查数据（优先加载草稿数据）
        var existingSurvey = Storage.getSurvey(currentStationId) || {};
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
    window.submitSurvey = function() {
        // 保存最后一步数据
        var stepData = SurveyForm.collectStepData(currentStep);
        Object.assign(currentSurveyData, stepData);
        
        // 删除草稿（如果有）
        if (Storage.deleteDraftSurvey) {
            Storage.deleteDraftSurvey(currentStationId);
        }
        
        // 保存为正式调查记录
        Storage.saveSurvey(currentStationId, currentSurveyData);
        
        // 更新站点 GPS（如果调查中有定位）
        if (currentSurveyData.lat && currentSurveyData.lng) {
            updateStationGPS(currentStationId, currentStationType, currentSurveyData.lat, currentSurveyData.lng);
        }
        
        Utils.showToast('调查表已提交完成', 2000);
        
        // 询问是否导出 Word
        Utils.showConfirm('导出调查表', '调查已保存！是否立即导出 Word 调查表？', function() {
            ExportManager.exportSurveyWord(currentStationId, currentStationType);
        });
        
        // 返回详情页
        setTimeout(function() {
            goBack();
            viewStationDetail(currentStationId, currentStationType);
        }, 200);
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
    window.viewOnMap = function() {
        openMap();
        setTimeout(function() {
            AmapManager.loadMarkersOnMap('all');
        }, 500);
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
        if (!keyword) {
            document.getElementById('searchResult').innerHTML = '<div class="empty-tip">请输入搜索关键词</div>';
            return;
        }
        
        var central = Utils.filterStations(Storage.getCentralStations(), '', '', '', keyword);
        var dispersed = Utils.filterStations(Storage.getDispersedStations(), '', '', '', keyword);
        
        var all = central.map(function(s){ s._type='central'; return s; })
                         .concat(dispersed.map(function(s){ s._type='dispersed'; return s; }));
        
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
        var surveys = Storage.getSurveys();
        var problems = [];
        
        var allStations = Storage.getCentralStations().concat(Storage.getDispersedStations());
        var stationMap = {};
        allStations.forEach(function(s){ stationMap[s.id] = s; });
        
        Object.keys(surveys).forEach(function(id) {
            var s = surveys[id];
            var station = stationMap[id] || {};
            
            // 检查是否有问题
            var hasProbs = [];
            if (s.waterQuality === '不符合要求') hasProbs.push('水质不达标');
            if (s.waterQuantity === '不符合要求') hasProbs.push('水量不达标');
            if (s.convenience && s.convenience.indexOf('不达标') >= 0) hasProbs.push('用水不方便');
            if (s.supplyGuarantee && s.supplyGuarantee.indexOf('不达标') >= 0) hasProbs.push('供水保证率不达标');
            if (s.projectStatus === '处于失管状态') hasProbs.push('工程失管');
            if (s.repairInfo === '无') hasProbs.push('无维修服务信息');
            if (s.qualityReport === '无') hasProbs.push('无水质检测报告');
            
            if (hasProbs.length > 0) {
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
            var hasProbs = [];
            if (s.waterQuality === '不符合要求') hasProbs.push('水质');
            if (s.waterQuantity === '不符合要求') hasProbs.push('水量');
            if (s.convenience && s.convenience.indexOf('不达标') >= 0) hasProbs.push('方便程度');
            if (s.supplyGuarantee && s.supplyGuarantee.indexOf('不达标') >= 0) hasProbs.push('供水保证率');
            if (s.projectStatus === '处于失管状态') hasProbs.push('管理');
            
            if (!hasProbs.length) return;
            if (area && (station.county || '') !== area) return;
            if (ptype && hasProbs.indexOf(ptype) < 0) return;
            
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
