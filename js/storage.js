/**
 * storage.js - 本地数据存储管理
 * 使用 localStorage 模拟，5+App 中使用 plus.storage
 */

var Storage = (function() {
    // 检测运行环境
    var isPlus = typeof plus !== 'undefined';
    
    // 获取存储引擎
    function getEngine() {
        if (isPlus) {
            return {
                getItem: function(k) { return plus.storage.getItem(k); },
                setItem: function(k, v) { plus.storage.setItem(k, v); },
                removeItem: function(k) { plus.storage.removeItem(k); },
                clear: function() { plus.storage.clear(); }
            };
        }
        return localStorage;
    }

    function get(key) {
        try {
            var v = getEngine().getItem(key);
            if (v) {
                return JSON.parse(v);
            }
            
            // LocalStorage 中没有，尝试从 IndexedDB 读取
            if (typeof IndexedDBStorage !== 'undefined' && IndexedDBStorage.isAvailable()) {
                // 注意：IndexedDB 是异步的，这里只能返回 null
                // 真正的数据读取需要在调用处处理
                console.log(key + ' 在 LocalStorage 中不存在，可能在 IndexedDB 中');
            }
            
            return null;
        } catch(e) {
            return null;
        }
    }
    
    // 从 IndexedDB 获取站点数据
    async function getStationsFromIndexedDB() {
        if (typeof IndexedDBStorage === 'undefined' || !IndexedDBStorage.isAvailable()) {
            return [];
        }
        try {
            await IndexedDBStorage.init();
            return await IndexedDBStorage.getAllStations();
        } catch(e) {
            console.error('从 IndexedDB 获取站点失败:', e);
            return [];
        }
    }
    
    // 从 IndexedDB 获取调查记录
    async function getSurveysFromIndexedDB() {
        if (typeof IndexedDBStorage === 'undefined' || !IndexedDBStorage.isAvailable()) {
            return {};
        }
        try {
            await IndexedDBStorage.init();
            return await IndexedDBStorage.getAllSurveys();
        } catch(e) {
            console.error('从 IndexedDB 获取调查记录失败:', e);
            return {};
        }
    }

    // 压缩调查数据中的照片
    // 注意：不再截断已有照片，只记录警告
    function compressSurveyPhotos(data) {
        if (!data || !data.photos || !Array.isArray(data.photos)) return data;
        
        var oversizedCount = 0;
        var totalSize = 0;
        
        data.photos.forEach(function(photo) {
            if (typeof photo === 'string') {
                totalSize += photo.length;
                if (photo.length > 80000) {
                    oversizedCount++;
                }
            }
        });
        
        if (oversizedCount > 0) {
            console.warn('警告: ' + oversizedCount + ' 张照片超过80KB，总大小: ' + Math.round(totalSize/1024) + 'KB');
        }
        
        // 不再截断照片，保持数据完整
        return data;
    }
    
    // 尝试清理存储空间
    function tryFreeUpSpace(aggressive) {
        try {
            console.log('尝试清理存储空间...');
            var freed = 0;
            var engine = getEngine();
            
            // 1. 清理过期的缓存数据
            var keysToRemove = [];
            for (var i = 0; i < engine.length; i++) {
                var k = engine.key(i);
                if (k && (k.indexOf('cache') >= 0 || k.indexOf('temp') >= 0 || k.indexOf('amap_geocode') >= 0)) {
                    var item = engine.getItem(k);
                    if (item) {
                        freed += item.length * 2;
                        keysToRemove.push(k);
                    }
                }
            }
            keysToRemove.forEach(function(k) {
                engine.removeItem(k);
            });
            console.log('已清理缓存，释放 ' + Math.round(freed/1024) + 'KB');
            
            // 2. 激进模式：删除旧草稿以释放空间（不再压缩已有照片，避免损坏）
            if (aggressive && freed < 100000) { // 激进模式下，如果释放不到100KB
                console.log('进入激进清理模式：删除旧草稿...');
                try {
                    var drafts = get('draft_surveys');
                    if (drafts && typeof drafts === 'object') {
                        var draftIds = Object.keys(drafts);
                        if (draftIds.length > 0) {
                            // 删除第一个（最旧的）
                            var oldestId = draftIds[0];
                            var draftSize = JSON.stringify(drafts[oldestId]).length;
                            delete drafts[oldestId];
                            engine.setItem('draft_surveys', JSON.stringify(drafts));
                            freed += draftSize;
                            console.log('删除旧草稿: ' + oldestId + ', 释放 ' + Math.round(draftSize/1024) + 'KB');
                        }
                    }
                } catch(e) {
                    console.error('删除旧草稿失败:', e);
                }
            }
            
            console.log('总共释放 ' + Math.round(freed/1024) + 'KB');
            return freed > 0;
        } catch(e) {
            console.error('清理存储空间失败:', e);
            return false;
        }
    }
    
    // 压缩站点数据，只保留必要字段以减少存储占用
    function compressStationDataMinimal(stations) {
        if (!Array.isArray(stations)) return stations;
        
        var essentialFields = ['id', 'type', 'name', 'county', 'town', 'village', 'hamlet', 
            'lat', 'lng', 'population', 'station_type'];
        
        return stations.map(function(s) {
            var compressed = {};
            essentialFields.forEach(function(field) {
                if (s.hasOwnProperty(field)) {
                    compressed[field] = s[field];
                }
            });
            return compressed;
        });
    }
    
    // 标记是否使用 IndexedDB
    var useIndexedDB = false;
    
    // 尝试初始化 IndexedDB
    if (typeof IndexedDBStorage !== 'undefined' && IndexedDBStorage.isAvailable()) {
        IndexedDBStorage.init().then(function() {
            console.log('IndexedDB 已准备好');
            useIndexedDB = true;
        }).catch(function(e) {
            console.log('IndexedDB 初始化失败，将使用 LocalStorage:', e);
        });
    }
    
    function set(key, val) {
        try {
            // 对于调查数据，尝试压缩照片
            if (key.indexOf('survey') >= 0 || key.indexOf('draft') >= 0) {
                val = compressSurveyPhotos(val);
            }
            
            getEngine().setItem(key, JSON.stringify(val));
            return true;
        } catch(e) {
            console.error('Storage set error:', e);
            
            // 如果是配额超出错误，尝试清理空间后重试
            if (e.name === 'QuotaExceededError' || (e.message && e.message.includes('quota'))) {
                console.log('LocalStorage 已满，尝试切换到 IndexedDB...');
                
                // 尝试使用 IndexedDB
                if (typeof IndexedDBStorage !== 'undefined' && IndexedDBStorage.isAvailable()) {
                    try {
                        // 异步保存到 IndexedDB
                        IndexedDBStorage.init().then(function() {
                            if (key === 'central_stations' && Array.isArray(val)) {
                                IndexedDBStorage.saveStations(val).then(function() {
                                    console.log('站点数据已保存到 IndexedDB');
                                });
                            } else if (key === 'dispersed_stations' && Array.isArray(val)) {
                                IndexedDBStorage.saveStations(val).then(function() {
                                    console.log('分散式站点数据已保存到 IndexedDB');
                                });
                            } else if (key === 'surveys') {
                                IndexedDBStorage.saveSurveys(val).then(function() {
                                    console.log('调查记录已保存到 IndexedDB');
                                });
                            }
                        });
                        Utils.showToast('已切换到 IndexedDB 存储，容量更大');
                        return true;
                    } catch(dbError) {
                        console.error('IndexedDB 保存失败:', dbError);
                    }
                }
                
                // 如果 IndexedDB 也失败，尝试清理空间
                console.log('尝试自动清理 LocalStorage...');
                
                // 先尝试清理缓存（普通模式）
                if (tryFreeUpSpace(false)) {
                    try {
                        getEngine().setItem(key, JSON.stringify(val));
                        Utils.showToast('存储空间已自动清理，请重试');
                        return true;
                    } catch(e2) {
                        console.error('清理后仍然无法保存:', e2);
                    }
                }
                
                // 对于调查数据，尝试使用 IndexedDB 保存（包含照片）
                if (key === 'surveys' && val && Object.keys(val).length > 0) {
                    console.log('尝试使用 IndexedDB 保存调查记录（包含照片）...');
                    try {
                        // 先保存站点数据到 IndexedDB
                        var central = get('central_stations') || [];
                        var dispersed = get('dispersed_stations') || [];
                        
                        if (typeof IndexedDBStorage !== 'undefined' && IndexedDBStorage.isAvailable()) {
                            // 异步保存到 IndexedDB（包含照片）
                            IndexedDBStorage.init().then(function() {
                                // 保存站点数据
                                if (central.length > 0) {
                                    IndexedDBStorage.saveStations(central);
                                }
                                if (dispersed.length > 0) {
                                    IndexedDBStorage.saveStations(dispersed);
                                }
                                // 保存调查记录（包含照片）
                                IndexedDBStorage.saveSurveys(val).then(function() {
                                    console.log('调查记录（含照片）已保存到 IndexedDB');
                                });
                            });
                            
                            // 同时在 LocalStorage 保存一份不含照片的调查记录作为备份
                            var noPhotoSurveys = {};
                            for (var sid in val) {
                                noPhotoSurveys[sid] = Object.assign({}, val[sid]);
                                if (noPhotoSurveys[sid].photos) {
                                    delete noPhotoSurveys[sid].photos;
                                }
                            }
                            getEngine().setItem(key, JSON.stringify(noPhotoSurveys));
                            
                            Utils.showToast('调查记录已保存，照片存储在 IndexedDB 中');
                            console.log('调查记录保存成功（照片在 IndexedDB）');
                            return true;
                        }
                    } catch(e5) {
                        console.error('保存到 IndexedDB 失败:', e5);
                    }
                }
                
                // 最后尝试：只保留当前调查，删除其他草稿
                if (key === 'draft_surveys' && val) {
                    console.log('最后尝试：只保留当前调查');
                    var currentId = Object.keys(val).pop(); // 保留最后一条（当前正在保存的）
                    var singleDraft = {};
                    if (currentId) {
                        singleDraft[currentId] = val[currentId];
                    }
                    
                    try {
                        getEngine().setItem(key, JSON.stringify(singleDraft));
                        Utils.showToast('存储已满，仅保留当前调查');
                        return true;
                    } catch(e5) {
                        console.error('最后尝试仍然失败:', e5);
                    }
                }
                
                Utils.showToast('存储空间严重不足，请删除部分调查数据后重试');
            }
            return false;
        }
    }
    
    // 清理存储空间
    function clearStorage() {
        try {
            getEngine().clear();
            return true;
        } catch(e) {
            console.error('Clear storage error:', e);
            return false;
        }
    }
    
    // 获取存储大小（KB）
    function getStorageSize() {
        try {
            var total = 0;
            for (var key in getEngine()) {
                if (getEngine().hasOwnProperty(key)) {
                    total += getEngine().getItem(key).length * 2; // UTF-16 编码，每个字符2字节
                }
            }
            return (total / 1024).toFixed(2); // 返回 KB
        } catch(e) {
            return 0;
        }
    }

    function remove(key) {
        getEngine().removeItem(key);
    }

    // ===== 站点相关 =====
    // 站点必要字段（减少存储大小）
    var essentialStationFields = ['id', 'type', 'name', 'county', 'town', 'village', 'hamlet', 
        'station_type', 'lat', 'lng', 'population', 'water_quality_result', 
        'contact_person', 'contact_phone', 'createTime', 'updateTime'];
    
    // 压缩站点数据，只保留必要字段
    function compressStations(list) {
        return list.map(function(station) {
            var compressed = {};
            essentialStationFields.forEach(function(field) {
                if (station.hasOwnProperty(field)) {
                    compressed[field] = station[field];
                }
            });
            return compressed;
        });
    }
    
    // 合并 LocalStorage 和 IndexedDB 的站点数据
    async function getAllStationsMerged() {
        var localCentral = get('central_stations') || [];
        var localDispersed = get('dispersed_stations') || [];
        var localStations = localCentral.concat(localDispersed);
        
        // 尝试从 IndexedDB 获取
        var dbStations = await getStationsFromIndexedDB();
        
        if (dbStations.length > 0) {
            console.log('从 IndexedDB 获取到', dbStations.length, '个站点');
            // 合并数据，LocalStorage 优先
            var idMap = {};
            dbStations.forEach(function(s) { idMap[s.id] = s; });
            localStations.forEach(function(s) { idMap[s.id] = s; });
            return Object.values(idMap);
        }
        
        return localStations;
    }
    
    function getCentralStations() {
        return get('central_stations') || [];
    }

    function saveCentralStations(list) {
        // 压缩后存储
        var compressed = compressStations(list);
        var result = set('central_stations', compressed);
        
        // 如果保存失败，尝试更激进的压缩（只保留最少字段）
        if (!result && list.length > 0) {
            console.log('尝试激进压缩站点数据...');
            var minimal = compressStationDataMinimal(list);
            result = set('central_stations', minimal);
            if (result) {
                console.log('激进压缩后保存成功，保留了', minimal.length, '个站点的基本字段');
            }
        }
        return result;
    }

    function getDispersedStations() {
        return get('dispersed_stations') || [];
    }

    function saveDispersedStations(list) {
        // 压缩后存储
        var compressed = compressStations(list);
        var result = set('dispersed_stations', compressed);
        
        // 如果保存失败，尝试更激进的压缩
        if (!result && list.length > 0) {
            console.log('尝试激进压缩分散式站点数据...');
            var minimal = compressStationDataMinimal(list);
            result = set('dispersed_stations', minimal);
            if (result) {
                console.log('激进压缩后保存成功，保留了', minimal.length, '个站点的基本字段');
            }
        }
        return result;
    }

    // 新增/更新集中式站点
    function upsertCentral(station) {
        var list = getCentralStations();
        if (!station.id) {
            station.id = 'C' + Date.now() + Math.random().toString(36).slice(2, 6);
            station.createTime = new Date().toISOString();
            list.push(station);
        } else {
            var idx = list.findIndex(function(s){ return s.id === station.id; });
            if (idx >= 0) list[idx] = station;
            else list.push(station);
        }
        saveCentralStations(list);
        return station;
    }

    // 新增/更新分散式站点
    function upsertDispersed(station) {
        var list = getDispersedStations();
        if (!station.id) {
            station.id = 'D' + Date.now() + Math.random().toString(36).slice(2, 6);
            station.createTime = new Date().toISOString();
            list.push(station);
        } else {
            var idx = list.findIndex(function(s){ return s.id === station.id; });
            if (idx >= 0) list[idx] = station;
            else list.push(station);
        }
        saveDispersedStations(list);
        return station;
    }

    // 删除集中式
    function deleteCentral(id) {
        var list = getCentralStations().filter(function(s){ return s.id !== id; });
        saveCentralStations(list);
    }

    // 删除分散式
    function deleteDispersed(id) {
        var list = getDispersedStations().filter(function(s){ return s.id !== id; });
        saveDispersedStations(list);
    }

    // 清空所有站点数据
    function clearAllStations() {
        remove('central_stations');
        remove('dispersed_stations');
        console.log('已清空所有本地站点数据');
        return true;
    }

    // ===== 调查记录 =====
    // 存储从 IndexedDB 获取的数据（用于异步合并）
    var _indexedDBSurveys = null;
    var _indexedDBLoaded = false;
    
    // 重置 IndexedDB 缓存（同步后调用）
    function resetIndexedDBCache() {
        _indexedDBSurveys = null;
        _indexedDBLoaded = false;
        console.log('IndexedDB 缓存已重置，下次将重新加载');
    }
    
    function getSurveys() {
        var localSurveys = get('surveys') || {};
        
        // 如果已经加载过 IndexedDB 数据，直接合并
        if (_indexedDBLoaded && _indexedDBSurveys) {
            // 合并数据：IndexedDB（完整数据）优先于 LocalStorage
            var merged = Object.assign({}, localSurveys);
            for (var sid in _indexedDBSurveys) {
                var dbSurvey = _indexedDBSurveys[sid];
                var localSurvey = merged[sid] || {};
                // IndexedDB 数据优先（因为它包含完整数据）
                merged[sid] = Object.assign({}, localSurvey, dbSurvey);
            }
            return merged;
        }
        
        // 异步加载 IndexedDB 数据（只加载一次）
        if (!_indexedDBLoaded && typeof IndexedDBStorage !== 'undefined' && IndexedDBStorage.isAvailable()) {
            IndexedDBStorage.getAllSurveys().then(function(dbSurveys) {
                _indexedDBSurveys = dbSurveys;
                _indexedDBLoaded = true;
                console.log('从 IndexedDB 获取到', Object.keys(dbSurveys).length, '条调查记录');
            }).catch(function(e) {
                console.error('从 IndexedDB 获取调查记录失败:', e);
                _indexedDBLoaded = true;
            });
        }
        
        return localSurveys;
    }
    
    // 异步获取所有调查记录（包括 IndexedDB）
    async function getAllSurveysAsync() {
        var localSurveys = get('surveys') || {};
        
        try {
            var dbSurveys = await getSurveysFromIndexedDB();
            if (Object.keys(dbSurveys).length > 0) {
                console.log('从 IndexedDB 获取到', Object.keys(dbSurveys).length, '条调查记录');
                // 合并数据：IndexedDB（完整数据）+ LocalStorage（备份）
                // 优先使用 IndexedDB 的数据（因为它包含完整数据）
                var merged = Object.assign({}, localSurveys);
                for (var sid in dbSurveys) {
                    var dbSurvey = dbSurveys[sid];
                    var localSurvey = merged[sid] || {};
                    
                    // 优先使用 IndexedDB 的数据（更完整）
                    merged[sid] = Object.assign({}, localSurvey, dbSurvey);
                    
                    // 调试输出
                    if (dbSurvey.supplyTimesPerDay || dbSurvey.supplyHoursPerTime) {
                        console.log('合并调查记录', sid, ': IndexedDB supplyTimesPerDay=', dbSurvey.supplyTimesPerDay, 'local=', localSurvey.supplyTimesPerDay);
                    }
                }
                return merged;
            }
        } catch(e) {
            console.error('获取 IndexedDB 调查记录失败:', e);
        }
        
        return localSurveys;
    }

    function saveSurvey(stationId, surveyData) {
        var surveys = getSurveys();
        surveyData.stationId = stationId;
        surveyData.updateTime = new Date().toISOString();
        surveys[stationId] = surveyData;
        set('surveys', surveys);
        console.log('本地保存:', stationId, 'supplyTimesPerDay=' + surveyData.supplyTimesPerDay, 'supplyHoursPerTime=' + surveyData.supplyHoursPerTime);
        
        // 同时保存到 IndexedDB（如果可用）
        if (typeof IndexedDBStorage !== 'undefined' && IndexedDBStorage.isAvailable()) {
            IndexedDBStorage.saveSurveys([surveyData]);
        }
    }

    // 同步获取单条调查记录
    function getSurvey(stationId) {
        var surveys = getSurveys();
        return surveys[stationId] || null;
    }
    
    // 异步获取单条调查记录（包含 IndexedDB 中的完整数据）
    async function getSurveyAsync(stationId) {
        var localSurvey = getSurvey(stationId);
        
        if (typeof IndexedDBStorage !== 'undefined' && IndexedDBStorage.isAvailable()) {
            try {
                await IndexedDBStorage.init();
                var dbSurvey = await IndexedDBStorage.getSurvey(stationId);
                if (dbSurvey) {
                    var merged = Object.assign({}, localSurvey || {}, dbSurvey);
                    console.log('读取数据:', stationId, 'supplyTimesPerDay=' + merged.supplyTimesPerDay, 'supplyHoursPerTime=' + merged.supplyHoursPerTime);
                    return merged;
                }
                // IndexedDB 返回 null，但 localStorage 可能有数据（从未使用 IndexedDB 的情况）
                // 如果缓存中有数据但 IndexedDB 没有，说明数据被删除了
                if (_indexedDBLoaded && _indexedDBSurveys && !_indexedDBSurveys[stationId]) {
                    console.log('IndexedDB 缓存确认数据已被删除:', stationId);
                    return null;
                }
            } catch(e) {
                console.error('IndexedDB 读取失败:', e);
            }
        }
        
        return localSurvey;
    }

    function deleteSurvey(stationId) {
        var surveys = getSurveys();
        delete surveys[stationId];
        set('surveys', surveys);
        
        // 同时清除 IndexedDB 缓存
        if (_indexedDBSurveys && _indexedDBSurveys[stationId]) {
            delete _indexedDBSurveys[stationId];
            console.log('已从 IndexedDB 缓存中删除:', stationId);
        }
    }

    // ===== 进行中的调查（临时保存）=====
    function getDraftSurveys() {
        return get('draft_surveys') || {};
    }

    function saveDraftSurvey(stationId, surveyData) {
        var drafts = getDraftSurveys();
        surveyData.stationId = stationId;
        surveyData.draftTime = new Date().toISOString();
        surveyData.isDraft = true;
        drafts[stationId] = surveyData;
        set('draft_surveys', drafts);
    }

    function getDraftSurvey(stationId) {
        var drafts = getDraftSurveys();
        return drafts[stationId] || null;
    }

    function deleteDraftSurvey(stationId) {
        var drafts = getDraftSurveys();
        delete drafts[stationId];
        set('draft_surveys', drafts);
    }

    // ===== 最近记录 =====
    function addRecentRecord(record) {
        var recent = get('recent_records') || [];
        // 去重
        recent = recent.filter(function(r){ return r.stationId !== record.stationId; });
        recent.unshift(record);
        if (recent.length > 20) recent = recent.slice(0, 20);
        set('recent_records', recent);
    }

    function getRecentRecords() {
        return get('recent_records') || [];
    }

    // ===== 问题台账 =====
    function getProblems() {
        return get('problems') || [];
    }

    function saveProblems(list) {
        set('problems', list);
    }

    // ===== 统计 =====
    function getStats() {
        var central = getCentralStations();
        var dispersed = getDispersedStations();
        var surveys = getSurveys();
        var surveyCount = Object.keys(surveys).length;
        return {
            total: central.length + dispersed.length,
            central: central.length,
            dispersed: dispersed.length,
            surveyed: surveyCount
        };
    }
    
    // ===== 手动清理缓存 =====
    function clearCache() {
        try {
            var freed = 0;
            var engine = getEngine();
            var keysToRemove = [];
            
            // 清理所有缓存相关的键
            for (var i = 0; i < engine.length; i++) {
                var k = engine.key(i);
                if (k && (k.indexOf('cache') >= 0 || k.indexOf('temp') >= 0 || k.indexOf('amap_geocode') >= 0)) {
                    var item = engine.getItem(k);
                    if (item) {
                        freed += item.length * 2;
                        keysToRemove.push(k);
                    }
                }
            }
            
            keysToRemove.forEach(function(k) {
                engine.removeItem(k);
            });
            
            var freedKB = Math.round(freed / 1024);
            console.log('手动清理完成，释放 ' + freedKB + 'KB');
            return { success: true, freed: freedKB };
        } catch(e) {
            console.error('手动清理失败:', e);
            return { success: false, error: e.message };
        }
    }

    return {
        get: get,
        set: set,
        remove: remove,
        clearStorage: clearStorage,
        getStorageSize: getStorageSize,
        clearCache: clearCache,
        getAllStationsMerged: getAllStationsMerged,
        getAllSurveysAsync: getAllSurveysAsync,
        resetIndexedDBCache: resetIndexedDBCache,
        getCentralStations: getCentralStations,
        saveCentralStations: saveCentralStations,
        getDispersedStations: getDispersedStations,
        saveDispersedStations: saveDispersedStations,
        upsertCentral: upsertCentral,
        upsertDispersed: upsertDispersed,
        deleteCentral: deleteCentral,
        deleteDispersed: deleteDispersed,
        clearAllStations: clearAllStations,
        getSurveys: getSurveys,
        getAllSurveysAsync: getAllSurveysAsync,
        saveSurvey: saveSurvey,
        getSurvey: getSurvey,
        getSurveyAsync: getSurveyAsync,
        deleteSurvey: deleteSurvey,
        getDraftSurveys: getDraftSurveys,
        saveDraftSurvey: saveDraftSurvey,
        getDraftSurvey: getDraftSurvey,
        deleteDraftSurvey: deleteDraftSurvey,
        addRecentRecord: addRecentRecord,
        getRecentRecords: getRecentRecords,
        getProblems: getProblems,
        saveProblems: saveProblems,
        getStats: getStats
    };
})();
