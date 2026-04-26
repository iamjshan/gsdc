/**
 * amap.js - 高德地图集成
 * 5+App 使用 plus.maps，HTML5+ Maps 模块
 */

var AmapManager = (function() {
    var map = null;
    var markers = [];
    var currentFilter = 'all';
    var currentAreaFilter = ''; // 当前地区筛选
    var infoWindow = null;

    // 初始化地图
    function initMap() {
        var container = document.getElementById('amapContainer');
        if (!container) return;
        
        // 检测是否在5+App环境
        if (typeof plus !== 'undefined' && plus.maps) {
            // 5+App 原生地图
            var mapStyles = plus.maps.MapStyles;
            map = new plus.maps.Map('amapContainer', {
                center: new plus.maps.LatLng(46.6376, 126.9942), // 绥化市中心
                zoom: 10
            });
            map.setTrafficEnabled(false);
        } else {
            // H5 降级：使用高德 JS API
            loadAmapScript(function() {
                if (typeof AMap === 'undefined') {
                    container.innerHTML = '<div style="text-align:center;padding:60px;color:#999;">地图加载失败，请检查网络连接</div>';
                    return;
                }
                map = new AMap.Map('amapContainer', {
                    zoom: 10,
                    center: [126.9942, 46.6376], // 绥化市
                    mapStyle: 'light'
                });
                
                console.log('地图初始化成功');
                
                // 地图加载完成后加载站点
                setTimeout(function() {
                    console.log('地图加载完成，开始加载站点');
                    loadMarkersOnMap(currentFilter);
                }, 500);
                
                // 添加控件
                AMap.plugin(['AMap.Scale', 'AMap.ToolBar'], function() {
                    map.addControl(new AMap.Scale());
                    map.addControl(new AMap.ToolBar({ position: 'RB' }));
                });
            });
        }
    }

    // 动态加载高德 JS API
    var _amapLoaded = false;
    var _amapCallbacks = [];
    function loadAmapScript(cb) {
        if (_amapLoaded) { cb(); return; }
        _amapCallbacks.push(cb);
        if (_amapCallbacks.length > 1) return; // 已在加载
        
        var script = document.createElement('script');
        // 使用高德 JS API 1.4.15 稳定版本
        // 需要配合安全密钥使用，在高德控制台申请
        script.src = 'https://webapi.amap.com/maps?v=1.4.15&key=f6cd3190f514e447d283a4ddc0fa8163&callback=_amapLoaded';
        window._amapLoaded = function() {
            _amapLoaded = true;
            _amapCallbacks.forEach(function(fn){ fn(); });
            _amapCallbacks = [];
        };
        document.head.appendChild(script);
        
        // 加载安全密钥脚本（如果需要）
        var securityScript = document.createElement('script');
        securityScript.type = 'text/javascript';
        securityScript.textContent = 'window._AMapSecurityConfig = { securityJsCode: "" }';
        document.head.appendChild(securityScript);
    }

    // 地理编码缓存
    var geocodeCache = {};
    try {
        var cached = localStorage.getItem('amap_geocode_cache');
        if (cached) geocodeCache = JSON.parse(cached);
    } catch(e) {}
    
    function saveGeocodeCache() {
        try {
            localStorage.setItem('amap_geocode_cache', JSON.stringify(geocodeCache));
        } catch(e) {}
    }
    
    // 地理编码请求队列（控制QPS）
    var geocodeQueue = [];
    var isProcessingQueue = false;
    var QUEUE_DELAY = 300; // 每300ms处理一个请求，约3次/秒
    
    function processGeocodeQueue() {
        if (isProcessingQueue || geocodeQueue.length === 0) return;
        isProcessingQueue = true;
        
        var item = geocodeQueue.shift();
        _doGeocodeAddress(item.address, function(result) {
            item.callback(result);
            isProcessingQueue = false;
            // 延迟处理下一个
            setTimeout(processGeocodeQueue, QUEUE_DELAY);
        });
    }
    
    // 使用高德 Web 服务 API 进行地理编码（带队列控制）
    function geocodeAddress(address, callback) {
        if (!address) { callback(null); return; }
        
        // 检查缓存
        if (geocodeCache[address]) {
            callback(geocodeCache[address]);
            return;
        }
        
        // 加入队列
        geocodeQueue.push({ address: address, callback: callback });
        processGeocodeQueue();
    }
    
    // 实际执行地理编码请求
    function _doGeocodeAddress(address, callback) {
        // 使用高德 Web 服务 API（使用专门的 Web 服务 Key）
        var url = 'https://restapi.amap.com/v3/geocode/geo?key=aa85c10dd2b6874dcaee8286f6b77370&address=' + encodeURIComponent(address);
        
        fetch(url)
            .then(function(res) { return res.json(); })
            .then(function(data) {
                if (data.status === '1' && data.geocodes && data.geocodes.length > 0) {
                    var loc = data.geocodes[0].location.split(',');
                    var result = { lng: parseFloat(loc[0]), lat: parseFloat(loc[1]) };
                    geocodeCache[address] = result;
                    saveGeocodeCache();
                    callback(result);
                } else if (data.infocode === '10021') {
                    console.log('QPS超限，稍后重试:', address);
                    // 重新加入队列稍后重试
                    setTimeout(function() {
                        geocodeQueue.unshift({ address: address, callback: callback });
                    }, 1000);
                } else {
                    console.log('地理编码失败:', data.info);
                    callback(null);
                }
            })
            .catch(function(err) { 
                console.error('地理编码请求失败:', err);
                callback(null); 
            });
    }

    // 在地图上加载站点标记
    function loadMarkersOnMap(filter, areaFilter) {
        if (!map) {
            console.log('地图未初始化');
            return;
        }
        
        // 参数默认值
        filter = filter || currentFilter;
        areaFilter = areaFilter || currentAreaFilter;
        
        console.log('开始加载站点，类型筛选:', filter, '地区筛选:', areaFilter);
        
        // 确保地图容器可见后重绘
        setTimeout(function() {
            map.resize && map.resize();
        }, 100);
        
        // 清除旧标记和信息窗口
        clearMarkers();
        if (infoWindow) { infoWindow.close(); infoWindow = null; }
        
        // 停止之前的队列处理
        geocodeQueue = [];
        
        var allStations = [];
        var surveys = Storage.getSurveys();
        
        // 根据筛选条件获取站点
        if (filter === 'normal' || filter === 'problem') {
            // 已调查正常/有问题 - 获取所有站点但只显示有调查数据的
            var central = Storage.getCentralStations();
            central.forEach(function(s) {
                s._type = 'central';
                var survey = surveys[s.id];
                if (survey) {
                    var hasProblem = checkSurveyHasProblem(survey);
                    if ((filter === 'normal' && !hasProblem) || (filter === 'problem' && hasProblem)) {
                        allStations.push(s);
                    }
                }
            });
            var dispersed = Storage.getDispersedStations();
            dispersed.forEach(function(s) {
                s._type = 'dispersed';
                var survey = surveys[s.id];
                if (survey) {
                    var hasProblem = checkSurveyHasProblem(survey);
                    if ((filter === 'normal' && !hasProblem) || (filter === 'problem' && hasProblem)) {
                        allStations.push(s);
                    }
                }
            });
        } else if (filter === 'progress') {
            // 进行中 - 获取有草稿数据但未完成的站点
            var drafts = Storage.getDraftSurveys ? Storage.getDraftSurveys() : {};
            var central = Storage.getCentralStations();
            central.forEach(function(s) {
                s._type = 'central';
                // 有草稿数据且没有完成调查的站点
                if (drafts[s.id] && !surveys[s.id]) {
                    allStations.push(s);
                }
            });
            var dispersed = Storage.getDispersedStations();
            dispersed.forEach(function(s) {
                s._type = 'dispersed';
                // 有草稿数据且没有完成调查的站点
                if (drafts[s.id] && !surveys[s.id]) {
                    allStations.push(s);
                }
            });
        } else {
            // 原有筛选逻辑：all, central, dispersed
            if (filter !== 'dispersed') {
                var central = Storage.getCentralStations();
                central.forEach(function(s) {
                    s._type = 'central';
                    allStations.push(s);
                });
            }
            if (filter !== 'central') {
                var dispersed = Storage.getDispersedStations();
                dispersed.forEach(function(s) {
                    s._type = 'dispersed';
                    allStations.push(s);
                });
            }
        }
        
        // 应用地区筛选
        if (areaFilter) {
            allStations = allStations.filter(function(s) {
                return s.county === areaFilter;
            });
        }

        console.log('筛选后站点数量:', allStations.length);
        
        var surveys = Storage.getSurveys();
        var stationsNeedGeocode = [];
        
        allStations.forEach(function(s) {
            if (s.lat && s.lng) {
                // 已有坐标，直接显示
                console.log('站点已有坐标:', s.name, s.lat, s.lng);
                addMarker(s, surveys[s.id] ? true : false);
            } else {
                // 需要地理编码
                stationsNeedGeocode.push(s);
            }
        });
        
        console.log('需要地理编码的站点数:', stationsNeedGeocode.length);
        
        // 对需要地理编码的站点进行处理
        var totalToProcess = stationsNeedGeocode.length;
        if (totalToProcess > 0) {
            Utils.showToast('正在解析 ' + totalToProcess + ' 个站点位置，请稍候...');
            
            var processed = 0;
            var hasNewMarker = false;
            var checkInterval = null;
            
            // 定期检查是否全部完成
            function checkComplete() {
                if (processed === totalToProcess && geocodeQueue.length === 0) {
                    clearInterval(checkInterval);
                    console.log('所有站点处理完成，标记数:', markers.length);
                    Utils.showToast('位置解析完成，共显示 ' + markers.length + ' 个站点');
                    // 自动调整地图视野
                    if (hasNewMarker || markers.length > 0) {
                        setTimeout(autoFitMapBounds, 500);
                    }
                }
            }
            
            // 每500ms检查一次完成状态
            checkInterval = setInterval(checkComplete, 500);
            
            // 最多等待30秒
            setTimeout(function() {
                clearInterval(checkInterval);
                if (markers.length > 0) {
                    autoFitMapBounds();
                }
            }, 30000);
            
            stationsNeedGeocode.forEach(function(s) {
                // 构建地址字符串
                var address = buildAddress(s);
                
                geocodeAddress(address, function(loc) {
                    processed++;
                    if (loc) {
                        s.lat = loc.lat;
                        s.lng = loc.lng;
                        addMarker(s, surveys[s.id] ? true : false);
                        hasNewMarker = true;
                        
                        // 更新存储中的站点坐标
                        updateStationCoords(s);
                    }
                });
            });
        } else if (markers.length > 0) {
            // 已有标记，自动调整视野
            console.log('直接使用已有坐标，标记数:', markers.length);
            setTimeout(autoFitMapBounds, 100);
        } else {
            console.log('没有站点需要显示');
        }
    }
    
    // 自动调整地图视野以显示所有标记
    function autoFitMapBounds() {
        if (!map || markers.length === 0) return;
        
        try {
            if (typeof AMap !== 'undefined') {
                // 使用延迟确保标记已渲染
                setTimeout(function() {
                    // 1.4.15 版本 setFitView 用法
                    map.setFitView(markers);
                }, 200);
            }
        } catch(e) {
            console.log('调整视野失败:', e);
        }
    }
    
    // 构建地址字符串
    function buildAddress(station) {
        var parts = [];
        if (station.province) parts.push(station.province);
        if (station.city) parts.push(station.city);
        if (station.county) parts.push(station.county);
        if (station.town) parts.push(station.town);
        if (station.village) parts.push(station.village);
        if (station.location) parts.push(station.location);
        if (station.name && !station.location) parts.push(station.name);
        
        // 如果地址太短，添加绥化市作为前缀
        var addr = parts.join('');
        if (addr.length < 10 && !addr.includes('绥化')) {
            addr = '黑龙江省绥化市' + addr;
        }
        return addr;
    }
    
    // 更新站点坐标到存储
    function updateStationCoords(station) {
        if (station._type === 'central') {
            var list = Storage.getCentralStations();
            var idx = list.findIndex(function(s) { return s.id === station.id; });
            if (idx >= 0) {
                list[idx].lat = station.lat;
                list[idx].lng = station.lng;
                Storage.saveCentralStations(list);
            }
        } else {
            var list = Storage.getDispersedStations();
            var idx = list.findIndex(function(s) { return s.id === station.id; });
            if (idx >= 0) {
                list[idx].lat = station.lat;
                list[idx].lng = station.lng;
                Storage.saveDispersedStations(list);
            }
        }
    }

    // 检查调查是否有问题
    function checkSurveyHasProblem(survey) {
        if (!survey) return false;
        // 判断是否有问题：水质、水量、方便程度、保证率不达标，或有管理问题
        if (survey.waterQuality === '不符合要求') return true;
        if (survey.waterQuantity === '不符合要求') return true;
        if (survey.convenience && survey.convenience.indexOf('不达标') >= 0) return true;
        if (survey.supplyGuarantee && survey.supplyGuarantee.indexOf('不达标') >= 0) return true;
        if (survey.managementProb && survey.managementProb.length > 0) return true;
        return false;
    }

    // 添加标记
    function addMarker(station, isSurveyed) {
        if (!map) {
            console.log('添加标记失败：地图未初始化');
            return;
        }
        
        console.log('添加标记:', station.name, station.lng, station.lat);
        
        // 获取调查数据判断是否有问题
        var hasProblem = false;
        if (isSurveyed) {
            var survey = Storage.getSurvey(station.id);
            hasProblem = checkSurveyHasProblem(survey);
        }
        
        // 设置标记颜色：未调查-蓝色/绿色，已调查无问题-绿色，已调查有问题-红色
        var fillColor, strokeColor;
        if (isSurveyed) {
            if (hasProblem) {
                fillColor = '#f44336'; // 红色 - 调查有问题
                strokeColor = '#d32f2f';
            } else {
                fillColor = '#4caf50'; // 绿色 - 调查完成无问题
                strokeColor = '#388e3c';
            }
        } else {
            // 未调查：集中式蓝色，分散式绿色
            if (station._type === 'central') {
                fillColor = '#1a6fbf';
                strokeColor = '#1565c0';
            } else {
                fillColor = '#2e7d32';
                strokeColor = '#1b5e20';
            }
        }
        
        try {
            if (typeof AMap !== 'undefined') {
                // H5 API - 使用圆点标记
                var marker = new AMap.CircleMarker({
                    center: [parseFloat(station.lng), parseFloat(station.lat)],
                    radius: 8,
                    fillColor: fillColor,
                    fillOpacity: 0.9,
                    strokeColor: strokeColor,
                    strokeWeight: 2,
                    extData: { station: station, hasProblem: hasProblem }
                });
                
                marker.on('click', function() {
                    showStationPopup(station);
                });
                
                marker.setMap(map);
                markers.push(marker);
                console.log('标记添加成功:', station.name, isSurveyed ? (hasProblem ? '有问题' : '已完成') : '未调查');
            } else if (typeof plus !== 'undefined' && plus.maps) {
                // 5+App 原生
                var m = new plus.maps.Marker(new plus.maps.LatLng(station.lat, station.lng));
                m.setTitle(station.name);
                map.addOverlay(m);
                m.addEventListener('click', function() {
                    showStationPopup(station);
                });
                markers.push(m);
            }
        } catch(e) {
            console.error('添加标记失败:', e);
        }
    }

    // 清除所有标记
    function clearMarkers() {
        if (!map) return;
        try {
            if (typeof AMap !== 'undefined') {
                markers.forEach(function(m) { m.setMap(null); });
            } else if (typeof plus !== 'undefined' && plus.maps) {
                markers.forEach(function(m) { map.removeOverlay(m); });
            }
        } catch(e) {}
        markers = [];
    }

    // 显示站点弹窗
    function showStationPopup(station) {
        if (!map) return;
        var survey = Storage.getSurvey(station.id);
        var statusText = survey ? '已调查' : '待调查';
        var typeText = station._type === 'central' ? '集中式' : '分散式';
        
        var content = '<div style="padding:10px;min-width:180px;">' +
            '<div style="font-weight:bold;font-size:14px;margin-bottom:6px;">' + Utils.escapeHtml(station.name) + '</div>' +
            '<div style="font-size:12px;color:#666;margin-bottom:4px;">' + typeText + ' | ' + statusText + '</div>' +
            '<div style="font-size:12px;color:#999;">' + [station.county, station.town, station.village].filter(Boolean).join(' > ') + '</div>' +
            '<div style="margin-top:10px;display:flex;gap:8px;">' +
            '<button onclick="AmapManager.viewStationFromMap(\'' + station.id + '\',\'' + station._type + '\')" style="flex:1;padding:6px;background:#1a6fbf;color:#fff;border:none;border-radius:4px;font-size:12px;">查看详情</button>' +
            '</div></div>';
        
        try {
            if (typeof AMap !== 'undefined') {
                if (infoWindow) { infoWindow.close(); }
                infoWindow = new AMap.InfoWindow({
                    content: content,
                    offset: new AMap.Pixel(0, -10)
                });
                infoWindow.open(map, [parseFloat(station.lng), parseFloat(station.lat)]);
            }
        } catch(e) {
            Utils.showToast(station.name + ' - ' + typeText + ' - ' + statusText);
        }
    }

    // 从地图跳转站点详情
    function viewStationFromMap(id, type) {
        if (infoWindow) { try { infoWindow.close(); } catch(e) {} }
        if (typeof viewStationDetail === 'function') {
            viewStationDetail(id, type);
        } else if (window.App && typeof window.App.viewStationDetail === 'function') {
            window.App.viewStationDetail(id, type);
        } else {
            console.error('viewStationDetail 函数未定义');
            Utils.showToast('无法打开站点详情');
        }
    }

    // 定位当前位置
    function locateMe() {
        if (typeof plus !== 'undefined' && plus.geolocation) {
            plus.geolocation.getCurrentPosition(function(pos) {
                var lat = pos.coords.latitude;
                var lng = pos.coords.longitude;
                if (map && typeof AMap !== 'undefined') {
                    map.setCenter([lng, lat]);
                    map.setZoom(14);
                }
            }, function(e) {
                Utils.showToast('定位失败：' + e.message);
            });
        } else if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(function(pos) {
                var lat = pos.coords.latitude;
                var lng = pos.coords.longitude;
                if (map && typeof AMap !== 'undefined') {
                    map.setCenter([lng, lat]);
                    map.setZoom(14);
                }
                Utils.showToast('定位成功');
            }, function() {
                Utils.showToast('定位失败，请检查权限');
            });
        } else {
            Utils.showToast('设备不支持定位');
        }
    }

    // 设置类型筛选
    function setFilter(filter) {
        currentFilter = filter;
        var allFilters = ['all','central','dispersed','progress','normal','problem'];
        allFilters.forEach(function(f) {
            var btnId = 'mapBtn' + f.charAt(0).toUpperCase() + f.slice(1);
            var btn = document.getElementById(btnId);
            if (btn) btn.classList.toggle('active', f === filter);
        });
        loadMarkersOnMap(filter, currentAreaFilter);
    }
    
    // 设置地区筛选
    function setAreaFilter(area) {
        currentAreaFilter = area;
        loadMarkersOnMap(currentFilter, area);
    }
    
    // 初始化地区筛选下拉框
    function initAreaFilter() {
        var select = document.getElementById('mapAreaSelect');
        if (!select) return;
        
        // 获取所有站点，提取地区列表
        var allStations = Storage.getCentralStations().concat(Storage.getDispersedStations());
        var areas = {};
        allStations.forEach(function(s) {
            if (s.county) areas[s.county] = true;
        });
        
        // 清空并重新填充下拉框
        select.innerHTML = '<option value="">全部地区</option>';
        Object.keys(areas).sort().forEach(function(area) {
            var option = document.createElement('option');
            option.value = area;
            option.textContent = area;
            select.appendChild(option);
        });
        
        // 重置筛选
        currentAreaFilter = '';
        select.value = '';
    }

    // 高德地图逆地理编码（坐标转地址）
    function reverseGeocode(lat, lng, callback) {
        if (typeof AMap === 'undefined') { callback(''); return; }
        AMap.plugin('AMap.Geocoder', function() {
            var geocoder = new AMap.Geocoder({ radius: 1000 });
            geocoder.getAddress([lng, lat], function(status, result) {
                if (status === 'complete' && result.regeocode) {
                    callback(result.regeocode.formattedAddress);
                } else {
                    callback('');
                }
            });
        });
    }

    // 高德地图正地理编码（地址转坐标）
    function geocode(address, callback) {
        if (typeof AMap === 'undefined') { callback(null); return; }
        AMap.plugin('AMap.Geocoder', function() {
            var geocoder = new AMap.Geocoder();
            geocoder.getLocation(address, function(status, result) {
                if (status === 'complete' && result.geocodes.length > 0) {
                    var loc = result.geocodes[0].location;
                    callback({ lat: loc.lat, lng: loc.lng });
                } else {
                    callback(null);
                }
            });
        });
    }

    return {
        initMap: initMap,
        loadMarkersOnMap: loadMarkersOnMap,
        locateMe: locateMe,
        setFilter: setFilter,
        setAreaFilter: setAreaFilter,
        initAreaFilter: initAreaFilter,
        viewStationFromMap: viewStationFromMap,
        reverseGeocode: reverseGeocode,
        geocode: geocode
    };
})();

// 全局挂载
function locateMe() { AmapManager.locateMe(); }
function setMapFilter(f) { AmapManager.setFilter(f); }
function setMapAreaFilter(area) { AmapManager.setAreaFilter(area); }
