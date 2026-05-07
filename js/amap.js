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
        
        // 统一使用 H5 高德地图，避免原生地图兼容性问题
        window._isNativeMap = false;
        initH5Map();
    }
    
    // H5 地图初始化
    function initH5Map() {
        var container = document.getElementById('amapContainer');
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
            
            console.log('H5地图初始化成功');
            
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

    // 地理编码缓存（使用新键名强制刷新）
    var CACHE_KEY = 'amap_geocode_cache_v2';
    var geocodeCache = {};
    try {
        var cached = localStorage.getItem(CACHE_KEY);
        if (cached) geocodeCache = JSON.parse(cached);
    } catch(e) {}
    
    function saveGeocodeCache() {
        try {
            localStorage.setItem(CACHE_KEY, JSON.stringify(geocodeCache));
        } catch(e) {}
    }
    
    // 清除旧版本缓存
    try {
        localStorage.removeItem('amap_geocode_cache');
    } catch(e) {}
    
    // 地理编码请求队列（控制QPS）
    var geocodeQueue = [];
    var isProcessingQueue = false;
    var QUEUE_DELAY = 100; // 每100ms处理一个请求，约10次/秒
    var CONCURRENT_REQUESTS = 3; // 并发请求数
    
    function processGeocodeQueue() {
        if (geocodeQueue.length === 0) return;
        
        // 同时处理多个请求
        var batchSize = Math.min(CONCURRENT_REQUESTS, geocodeQueue.length);
        var processed = 0;
        
        for (var i = 0; i < batchSize; i++) {
            var item = geocodeQueue.shift();
            if (!item) continue;
            
            // 闭包保存当前 item
            (function(currentItem) {
                _doGeocodeAddress(currentItem, function(result) {
                    currentItem.callback(result);
                    processed++;
                    
                    // 当批次处理完成后，延迟处理下一批
                    if (processed >= batchSize) {
                        setTimeout(processGeocodeQueue, QUEUE_DELAY);
                    }
                });
            })(item);
        }
    }
    
    // 使用高德 Web 服务 API 进行地理编码（带队列控制）
    // city: 城市/县区名称，用于限定搜索范围
    function geocodeAddress(address, callback, city) {
        if (!address) { callback(null); return; }
        
        // 构建缓存键（包含城市信息）
        var cacheKey = city ? (city + '|' + address) : address;
        
        // 检查缓存
        if (geocodeCache[cacheKey]) {
            // 如果之前解析失败，直接返回 null
            if (geocodeCache[cacheKey].failed) {
                callback(null);
            } else {
                callback(geocodeCache[cacheKey]);
            }
            return;
        }
        
        // 加入队列
        geocodeQueue.push({ address: address, callback: callback, city: city, cacheKey: cacheKey });
        processGeocodeQueue();
    }
    
    // 实际执行地理编码请求
    // item: { address, callback, city, cacheKey }
    function _doGeocodeAddress(item) {
        var address = item.address;
        var callback = item.callback;
        var city = item.city;
        var cacheKey = item.cacheKey || address;
        
        // 过滤无效地址
        if (!address || address.length < 2 || address === 'undefined' || address === 'null') {
            console.log('跳过无效地址:', address);
            callback(null);
            return;
        }
        
        // 使用高德 Web 服务 API（使用专门的 Web 服务 Key）
        // 添加 city 参数限定搜索范围（优先使用县区，更准确）
        var url = 'https://restapi.amap.com/v3/geocode/geo?key=aa85c10dd2b6874dcaee8286f6b77370&address=' + encodeURIComponent(address);
        if (city) {
            url += '&city=' + encodeURIComponent(city);
        }
        
        console.log('地理编码请求:', address, city ? '(城市:' + city + ')' : '(无城市限制)');
        
        // 设置超时
        var timeoutId = setTimeout(function() {
            console.log('地理编码超时:', address);
            callback(null);
        }, 5000);
        
        fetch(url)
            .then(function(res) { 
                clearTimeout(timeoutId);
                return res.json(); 
            })
            .then(function(data) {
                if (data.status === '1' && data.geocodes && data.geocodes.length > 0) {
                    var geo = data.geocodes[0];
                    var loc = geo.location.split(',');
                    var result = { lng: parseFloat(loc[0]), lat: parseFloat(loc[1]) };
                    
                    // 严格验证：检查解析结果是否在期望的省份/城市范围内
                    var parsedProvince = geo.province || '';
                    var parsedCity = geo.city || '';
                    var parsedDistrict = geo.district || '';
                    
                    console.log('解析结果:', address, '->', parsedProvince, parsedCity, parsedDistrict, result);
                    
                    // 验证必须在黑龙江省
                    if (!parsedProvince.includes('黑龙江')) {
                        console.warn('解析结果不在黑龙江省:', address, '->', parsedProvince, parsedCity);
                        // 尝试找其他结果
                        var foundValid = false;
                        for (var i = 1; i < data.geocodes.length; i++) {
                            var altGeo = data.geocodes[i];
                            if (altGeo.province && altGeo.province.includes('黑龙江')) {
                                var altLoc = altGeo.location.split(',');
                                result = { lng: parseFloat(altLoc[0]), lat: parseFloat(altLoc[1]) };
                                parsedProvince = altGeo.province;
                                parsedCity = altGeo.city || '';
                                parsedDistrict = altGeo.district || '';
                                foundValid = true;
                                console.log('找到替代结果:', address, '->', parsedProvince, parsedCity, parsedDistrict);
                                break;
                            }
                        }
                        if (!foundValid) {
                            console.log('无可用的黑龙江省内结果:', address);
                            callback(null);
                            return;
                        }
                    }
                    
                    // 如果指定了城市/县区，验证是否匹配
                    if (city) {
                        var cityMatched = parsedCity.includes(city) || parsedDistrict.includes(city) ||
                                          city.includes(parsedCity) || city.includes(parsedDistrict);
                        if (!cityMatched) {
                            console.warn('城市不匹配:', address, '期望:', city, '实际:', parsedCity, parsedDistrict);
                            // 城市不匹配但省份正确，仍然使用但标记警告
                        }
                    }
                    
                    geocodeCache[cacheKey] = result;
                    saveGeocodeCache();
                    callback(result);
                } else if (data.infocode === '10021') {
                    console.log('QPS超限，稍后重试:', address);
                    // 重新加入队列稍后重试
                    setTimeout(function() {
                        geocodeQueue.unshift({ address: address, callback: callback, city: city, cacheKey: cacheKey });
                    }, 1000);
                } else if (data.infocode === '10001' || data.info === 'ENGINE_RESPONSE_DATA_ERROR') {
                    console.log('地址解析引擎错误，跳过:', address);
                    // 标记为失败，不再重试
                    geocodeCache[cacheKey] = { failed: true };
                    saveGeocodeCache();
                    callback(null);
                } else {
                    console.log('地理编码失败:', data.info, address);
                    callback(null);
                }
            })
            .catch(function(err) { 
                clearTimeout(timeoutId);
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
                    var probText = survey.problemSummary || survey.problem_summary || '';
                    console.log('站点检查:', s.name, '发现问题:', probText.substring(0, 50), '... 是否有问题:', hasProblem);
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
                    var probText = survey.problemSummary || survey.problem_summary || '';
                    console.log('站点检查:', s.name, '发现问题:', probText.substring(0, 50), '... 是否有问题:', hasProblem);
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
        
        // 黑龙江省大致经纬度范围（用于验证坐标有效性）
        var HEILONGJIANG_BOUNDS = {
            minLng: 121.0,
            maxLng: 135.0,
            minLat: 43.0,
            maxLat: 53.0
        };
        
        // 验证坐标是否在黑龙江范围内
        function isInHeilongjiang(lng, lat) {
            return lng >= HEILONGJIANG_BOUNDS.minLng && 
                   lng <= HEILONGJIANG_BOUNDS.maxLng &&
                   lat >= HEILONGJIANG_BOUNDS.minLat && 
                   lat <= HEILONGJIANG_BOUNDS.maxLat;
        }
        
        allStations.forEach(function(s) {
            if (s.lat && s.lng) {
                // 已有坐标，验证是否在黑龙江范围内
                if (isInHeilongjiang(parseFloat(s.lng), parseFloat(s.lat))) {
                    console.log('站点已有有效坐标:', s.name, s.lat, s.lng);
                    addMarker(s, surveys[s.id] ? true : false);
                } else {
                    // 坐标在省外，需要重新地理编码
                    console.warn('站点坐标在省外，重新解析:', s.name, s.lat, s.lng, '-> 期望范围:', '黑龙江');
                    s.lat = null; // 清除错误坐标
                    s.lng = null;
                    stationsNeedGeocode.push(s);
                }
            } else {
                // 需要地理编码
                stationsNeedGeocode.push(s);
            }
        });
        
        console.log('需要地理编码的站点数:', stationsNeedGeocode.length);
        
        // 对需要地理编码的站点进行处理
        var totalToProcess = stationsNeedGeocode.length;
        
        // 限制单次处理的站点数量，避免过长等待
        var MAX_GEOCODE_PER_BATCH = 50;
        if (totalToProcess > MAX_GEOCODE_PER_BATCH) {
            console.log('站点数量过多，只处理前 ' + MAX_GEOCODE_PER_BATCH + ' 个');
            stationsNeedGeocode = stationsNeedGeocode.slice(0, MAX_GEOCODE_PER_BATCH);
            totalToProcess = MAX_GEOCODE_PER_BATCH;
        }
        
        if (totalToProcess > 0) {
            Utils.showToast('正在解析 ' + totalToProcess + ' 个站点位置，请稍候...');
            
            var processed = 0;
            var successCount = 0;
            var hasNewMarker = false;
            var checkInterval = null;
            
            // 定期检查是否全部完成
            function checkComplete() {
                if (processed === totalToProcess && geocodeQueue.length === 0) {
                    clearInterval(checkInterval);
                    console.log('所有站点处理完成，成功:', successCount, '标记数:', markers.length);
                    Utils.showToast('位置解析完成，成功 ' + successCount + ' 个，共显示 ' + markers.length + ' 个站点');
                    // 自动调整地图视野
                    if (hasNewMarker || markers.length > 0) {
                        setTimeout(autoFitMapBounds, 500);
                    }
                } else {
                    // 显示进度
                    var progress = Math.round((processed / totalToProcess) * 100);
                    if (processed % 5 === 0) {
                        console.log('地理编码进度:', progress + '%', processed + '/' + totalToProcess);
                    }
                }
            }
            
            // 每500ms检查一次完成状态
            checkInterval = setInterval(checkComplete, 500);
            
            // 最多等待60秒
            setTimeout(function() {
                clearInterval(checkInterval);
                if (markers.length > 0) {
                    autoFitMapBounds();
                }
            }, 60000);
            
            stationsNeedGeocode.forEach(function(s) {
                // 构建地址字符串
                var address = buildAddress(s);
                // 使用县区作为城市限制参数，提高解析准确度
                var city = s.county || '绥化市';
                console.log('准备解析地址:', s.name, '->', address, '(城市限制:', city, ')');
                
                (function(station) {
                    geocodeAddress(address, function(loc) {
                        processed++;
                        if (loc) {
                            successCount++;
                            station.lat = loc.lat;
                            station.lng = loc.lng;
                            addMarker(station, surveys[station.id] ? true : false);
                            hasNewMarker = true;
                            
                            // 更新存储中的站点坐标
                            updateStationCoords(station);
                            console.log('地址解析成功:', station.name, loc.lat, loc.lng);
                            
                            // 同步到云端（延迟执行，避免频繁请求）
                            setTimeout(function() {
                                if (typeof SupabaseClient !== 'undefined' && SupabaseClient.pushStationsToCloud) {
                                    SupabaseClient.pushStationsToCloud([station]).catch(function(e) {
                                        console.log('坐标同步到云端失败:', station.name, e);
                                    });
                                }
                            }, 100);
                        } else {
                            console.log('地址解析失败:', station.name, address);
                            // 尝试备用地址格式
                            tryBackupAddress(station, surveys, function(success) {
                                if (success) {
                                    successCount++;
                                    hasNewMarker = true;
                                }
                            });
                        }
                    }, city);  // 传入城市/县区参数
                })(s);
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
        
        // 辅助函数：清理和去重
        function addPart(part) {
            if (!part || typeof part !== 'string') return;
            part = part.trim();
            if (part.length === 0) return;
            
            // 检查是否已存在（避免重复）
            for (var i = 0; i < parts.length; i++) {
                if (parts[i].includes(part) || part.includes(parts[i])) {
                    // 保留较长的那个
                    if (part.length > parts[i].length) {
                        parts[i] = part;
                    }
                    return;
                }
            }
            parts.push(part);
        }
        
        // 添加行政层级（从大到小）
        // 确保始终包含黑龙江省和绥化市前缀
        var province = station.province || '黑龙江省';
        var city = station.city || '绥化市';
        addPart(province);
        addPart(city);
        addPart(station.county);
        addPart(station.town);
        addPart(station.village);
        
        // 处理名称中的重复
        var name = station.name || '';
        var location = station.location || '';
        
        // 如果 name 包含 village 或 town，移除重复部分
        if (station.village && name.includes(station.village)) {
            name = name.replace(station.village, '').trim();
        }
        if (station.town && name.includes(station.town)) {
            name = name.replace(station.town, '').trim();
        }
        
        // 添加详细位置
        if (location) addPart(location);
        if (name) addPart(name);
        
        // 拼接地址
        var addr = parts.join('');
        
        // 如果地址太短或无效，使用默认前缀
        if (addr.length < 5) {
            addr = '黑龙江省绥化市' + (station.county || '') + (station.town || '') + (station.name || '');
        }
        
        // 最终清理：移除重复的村、乡等字样
        addr = addr.replace(/(村)+/g, '村');
        addr = addr.replace(/(乡)+/g, '乡');
        addr = addr.replace(/(镇)+/g, '镇');
        
        return addr;
    }
    
    // 尝试备用地址格式（不使用队列，直接请求）
    function tryBackupAddress(station, surveys, callback) {
        var backupAddresses = [];
        var county = station.county || '';
        var town = station.town || '';
        var village = station.village || '';
        var name = station.name || '';
        
        // 格式1: 完整的省市区 + 名称
        backupAddresses.push('黑龙江省绥化市' + county + town + village + name);
        
        // 格式2: 省 + 市 + 县 + 镇/乡 + 村（不含站点名称）
        if (town || village) {
            backupAddresses.push('黑龙江省绥化市' + county + town + village);
        }
        
        // 格式3: 市 + 县 + 镇/乡 + 名称
        backupAddresses.push('绥化市' + county + town + name);
        
        // 格式4: 县 + 镇/乡 + 村（限定在绥化市内）
        if (county && (town || village)) {
            backupAddresses.push('绥化市' + county + town + village);
        }
        
        // 格式5: 只使用县区+乡镇+村名（不含站点名称）
        if (county && (town || village)) {
            backupAddresses.push(county + town + village);
        }
        
        var tried = 0;
        var total = backupAddresses.length;
        
        var city = station.county || '绥化市';
        
        function tryNext() {
            if (tried >= total) {
                console.log('所有备用地址都失败:', station.name);
                callback(false);
                return;
            }
            
            var addr = backupAddresses[tried];
            tried++;
            
            console.log('尝试备用地址' + tried + ':', station.name, '->', addr, '(城市限制:', city, ')');
            
            // 直接请求，不加入队列，传入城市参数
            var item = {
                address: addr,
                callback: function(loc) {
                    if (loc) {
                        console.log('备用地址解析成功:', station.name, addr, loc.lat, loc.lng);
                        station.lat = loc.lat;
                        station.lng = loc.lng;
                        addMarker(station, surveys[station.id] ? true : false);
                        updateStationCoords(station);
                        
                        // 同步到云端
                        setTimeout(function() {
                            if (typeof SupabaseClient !== 'undefined' && SupabaseClient.pushStationsToCloud) {
                                SupabaseClient.pushStationsToCloud([station]).catch(function(e) {
                                    console.log('坐标同步到云端失败:', station.name, e);
                                });
                            }
                        }, 100);
                        
                        callback(true);
                    } else {
                        tryNext();
                    }
                },
                city: city,
                cacheKey: city + '|' + addr
            };
            _doGeocodeAddress(item);
        }
        
        tryNext();
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
    // 规则：只有"发现问题"字段有内容时才算有问题站点
    function checkSurveyHasProblem(survey) {
        if (!survey) return false;
        // 仅根据"发现问题"字段判断：有文字内容则为有问题，无为正常
        var problemSummary = survey.problemSummary || survey.problem_summary;
        if (problemSummary && typeof problemSummary === 'string' && problemSummary.trim().length > 0) {
            return true;
        }
        return false;
    }

    // 添加标记
    function addMarker(station, isSurveyed) {
        if (!map) {
            console.log('添加标记失败：地图未初始化');
            return;
        }
        
        console.log('添加标记:', station.name, station.lng, station.lat);
        
        // 确保坐标是数字
        var lat = parseFloat(station.lat);
        var lng = parseFloat(station.lng);
        
        if (isNaN(lat) || isNaN(lng)) {
            console.log('坐标无效，跳过:', station.name);
            return;
        }
        
        // 获取调查数据判断是否有问题
        var hasProblem = false;
        if (isSurveyed) {
            var survey = Storage.getSurvey(station.id);
            hasProblem = checkSurveyHasProblem(survey);
        }
        
        // 设置标记颜色
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
            // 优先判断使用哪种地图 - 检查 map 对象的类型
            if (window._isNativeMap) {
                // 5+App 原生地图
                console.log('使用原生地图添加标记:', station.name);
                var point = new plus.maps.Point(lng, lat); // 注意：Point(经度, 纬度)
                var m = new plus.maps.Marker(point);
                m.setTitle(station.name);
                
                // 设置标记图标
                if (isSurveyed) {
                    if (hasProblem) {
                        m.setIcon(plus.maps.Marker.RED); // 红色
                    } else {
                        m.setIcon(plus.maps.Marker.GREEN); // 绿色
                    }
                } else {
                    m.setIcon(plus.maps.Marker.DEFAULT);
                }
                
                map.addOverlay(m);
                markers.push(m);
                console.log('原生标记添加成功:', station.name);
            } else if (typeof AMap !== 'undefined' && map instanceof AMap.Map) {
                // H5 高德地图
                console.log('使用H5地图添加标记:', station.name);
                var marker = new AMap.CircleMarker({
                    center: [lng, lat],
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
                console.log('H5标记添加成功:', station.name);
            } else {
                console.log('未知地图类型，无法添加标记');
            }
        } catch(e) {
            console.error('添加标记失败:', e, station.name);
        }
    }

    // 清除所有标记
    function clearMarkers() {
        if (!map) return;
        try {
            if (window._isNativeMap && plus.maps) {
                // 原生地图
                markers.forEach(function(m) { map.removeOverlay(m); });
            } else if (typeof AMap !== 'undefined') {
                // H5 地图
                markers.forEach(function(m) { m.setMap(null); });
            }
        } catch(e) {
            console.error('清除标记失败:', e);
        }
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
        if (window.plus && plus.geolocation) {
            plus.geolocation.getCurrentPosition(function(pos) {
                var lat = pos.coords.latitude;
                var lng = pos.coords.longitude;
                if (map) {
                    if (window._isNativeMap) {
                        // 原生地图
                        map.setCenter(new plus.maps.Point(lng, lat));
                    } else if (typeof AMap !== 'undefined') {
                        // H5 地图
                        map.setCenter([lng, lat]);
                        map.setZoom(14);
                    }
                    Utils.showToast('定位成功');
                }
            }, function(e) {
                Utils.showToast('定位失败：' + e.message);
            });
        } else if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(function(pos) {
                var lat = pos.coords.latitude;
                var lng = pos.coords.longitude;
                if (map) {
                    if (window._isNativeMap) {
                        map.setCenter(new plus.maps.Point(lng, lat));
                    } else if (typeof AMap !== 'undefined') {
                        map.setCenter([lng, lat]);
                        map.setZoom(14);
                    }
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

    // 刷新地图标记（同步后调用）
    function refreshMarkers() {
        console.log('刷新地图标记...');
        if (!map) {
            console.log('地图未初始化，无法刷新');
            return;
        }
        // 重新加载标记
        loadMarkersOnMap(currentFilter, currentAreaFilter);
        console.log('地图标记刷新完成');
    }

    // 查看单个站点并支持修改位置
    var currentEditStation = null;
    var currentEditMarker = null;
    var currentEditType = null;
    
    function viewSingleStation(station, type) {
        console.log('viewSingleStation 被调用', 'station:', station ? station.name : 'null', 'type:', type);
        
        if (!station || !station.lat || !station.lng) {
            Utils.showToast('该站点暂无位置信息，请在调查中添加GPS坐标');
            console.log('错误：站点无位置信息');
            return;
        }
        
        currentEditStation = station;
        currentEditType = type;
        
        console.log('准备切换到地图页');
        
        // 切换到地图页
        if (typeof openMap === 'function') {
            openMap();
        } else if (typeof showPage === 'function') {
            showPage('mapPage');
        } else {
            console.error('openMap 和 showPage 函数都不存在');
            Utils.showToast('页面切换失败');
            return;
        }
        
        setTimeout(function() {
            console.log('初始化地图...');
            initMap();
            
            // 等待地图初始化完成
            setTimeout(function() {
                console.log('检查地图对象:', map ? '已初始化' : '未初始化');
                
                if (!map) {
                    Utils.showToast('地图初始化失败');
                    console.error('地图初始化失败');
                    return;
                }
                
                // 清除现有标记
                clearAllMarkers();
                
                var center = [station.lng, station.lat];
                console.log('设置地图中心:', center);
                
                map.setCenter(center);
                map.setZoom(16);
                
                // 创建可拖动的标记
                console.log('创建可拖动标记');
                var marker = createDraggableMarker(station, type, center);
                currentEditMarker = marker;
                
                // 显示编辑提示
                showEditHint();
                
                console.log('单站点地图初始化完成');
                
            }, 800);
        }, 100);
    }
    
    // 创建可拖动标记
    function createDraggableMarker(station, type, center) {
        var isH5 = !window._isNativeMap;
        var marker = null;
        
        console.log('createDraggableMarker:', 'isH5:', isH5, 'AMap:', typeof AMap !== 'undefined' ? '已定义' : '未定义');
        
        if (isH5 && typeof AMap !== 'undefined') {
            // H5 地图 - 创建可拖动标记
            try {
                marker = new AMap.Marker({
                    position: center,
                    draggable: true,
                    title: station.name + ' (拖动修改位置)',
                    animation: 'AMAP_ANIMATION_DROP'
                });
                
                marker.setMap(map);
                console.log('标记创建成功');
            } catch(e) {
                console.error('创建标记失败:', e);
            }
            
            // 添加信息窗
            var infoContent = '<div style="padding:8px;">' +
                '<div style="font-weight:bold;font-size:14px;margin-bottom:5px;">' + station.name + '</div>' +
                '<div style="font-size:12px;color:#666;">拖动标记修改位置</div>' +
                '<div style="margin-top:8px;">' +
                '<button onclick="AmapManager.saveStationPosition()" style="background:#1a6fbf;color:#fff;border:none;padding:5px 12px;border-radius:4px;cursor:pointer;">保存位置</button>' +
                '<button onclick="AmapManager.cancelEditPosition()" style="background:#999;color:#fff;border:none;padding:5px 12px;border-radius:4px;margin-left:8px;cursor:pointer;">取消</button>' +
                '</div>' +
                '</div>';
            
            var infoWin = new AMap.InfoWindow({
                content: infoContent,
                offset: new AMap.Pixel(0, -30)
            });
            
            marker.on('click', function() {
                infoWin.open(map, marker.getPosition());
            });
            
            // 拖动结束事件
            marker.on('dragend', function(e) {
                var newPos = e.lnglat;
                console.log('标记拖动到新位置:', newPos);
                Utils.showToast('位置已变更，请点击保存');
            });
            
            // 自动打开信息窗
            infoWin.open(map, center);
        }
        
        return marker;
    }
    
    // 显示编辑提示
    function showEditHint() {
        var container = document.getElementById('amapContainer');
        if (!container) return;
        
        // 移除旧的提示
        var oldHint = document.getElementById('editPositionHint');
        if (oldHint) oldHint.remove();
        
        var hint = document.createElement('div');
        hint.id = 'editPositionHint';
        hint.style.cssText = 'position:absolute;top:10px;left:50%;transform:translateX(-50%);background:rgba(26,111,191,0.9);color:#fff;padding:8px 16px;border-radius:20px;font-size:13px;z-index:1000;box-shadow:0 2px 8px rgba(0,0,0,0.2);';
        hint.innerHTML = '📍 拖动标记修改站点位置，点击标记保存';
        container.appendChild(hint);
    }
    
    // 隐藏编辑提示
    function hideEditHint() {
        var hint = document.getElementById('editPositionHint');
        if (hint) hint.remove();
    }
    
    // 保存站点位置
    function saveStationPosition() {
        if (!currentEditStation || !currentEditMarker) {
            Utils.showToast('没有可保存的位置');
            return;
        }
        
        var newPos = currentEditMarker.getPosition();
        var newLng = newPos.lng || newPos.getLng();
        var newLat = newPos.lat || newPos.getLat();
        
        // 更新站点数据
        currentEditStation.lng = newLng;
        currentEditStation.lat = newLat;
        
        // 保存到本地存储
        if (currentEditType === 'central') {
            var stations = Storage.getCentralStations();
            var idx = stations.findIndex(function(s) { return s.id === currentEditStation.id; });
            if (idx >= 0) {
                stations[idx] = currentEditStation;
                Storage.set('central_stations', stations);
            }
        } else {
            var stations = Storage.getDispersedStations();
            var idx = stations.findIndex(function(s) { return s.id === currentEditStation.id; });
            if (idx >= 0) {
                stations[idx] = currentEditStation;
                Storage.set('dispersed_stations', stations);
            }
        }
        
        // 同步到云端
        if (typeof SupabaseClient !== 'undefined' && SupabaseClient.pushStationsToCloud) {
            SupabaseClient.pushStationsToCloud([currentEditStation]).then(function() {
                Utils.showToast('位置已保存并同步到云端');
            }).catch(function(e) {
                console.error('同步失败:', e);
                Utils.showToast('位置已保存到本地');
            });
        } else {
            Utils.showToast('位置已保存');
        }
        
        hideEditHint();
        
        // 清除编辑状态
        currentEditStation = null;
        currentEditMarker = null;
        currentEditType = null;
        
        // 返回详情页
        setTimeout(function() {
            if (typeof goBack === 'function') {
                goBack();
            }
        }, 1000);
    }
    
    // 取消编辑
    function cancelEditPosition() {
        hideEditHint();
        clearAllMarkers();
        currentEditStation = null;
        currentEditMarker = null;
        currentEditType = null;
        
        // 重新加载所有标记
        loadMarkersOnMap(currentFilter, currentAreaFilter);
        
        Utils.showToast('已取消修改');
    }
    
    // 清除所有标记
    function clearAllMarkers() {
        if (window._isNativeMap) {
            // 原生地图清理
        } else if (map && typeof AMap !== 'undefined') {
            map.clearMap();
        }
        markers = [];
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
        geocode: geocode,
        refreshMarkers: refreshMarkers,
        viewSingleStation: viewSingleStation,
        saveStationPosition: saveStationPosition,
        cancelEditPosition: cancelEditPosition
    };
})();

// 全局挂载
function locateMe() { AmapManager.locateMe(); }
function setMapFilter(f) { AmapManager.setFilter(f); }
function setMapAreaFilter(area) { AmapManager.setAreaFilter(area); }
