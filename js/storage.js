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
            return v ? JSON.parse(v) : null;
        } catch(e) {
            return null;
        }
    }

    function set(key, val) {
        try {
            getEngine().setItem(key, JSON.stringify(val));
            return true;
        } catch(e) {
            console.error('Storage set error:', e);
            // 如果是配额超出错误，提示用户
            if (e.name === 'QuotaExceededError' || e.message && e.message.includes('quota')) {
                alert('本地存储空间不足，请清理浏览器缓存或使用 5+App 版本');
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
    
    function getCentralStations() {
        return get('central_stations') || [];
    }

    function saveCentralStations(list) {
        // 压缩后存储
        var compressed = compressStations(list);
        return set('central_stations', compressed);
    }

    function getDispersedStations() {
        return get('dispersed_stations') || [];
    }

    function saveDispersedStations(list) {
        // 压缩后存储
        var compressed = compressStations(list);
        return set('dispersed_stations', compressed);
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

    // ===== 调查记录 =====
    function getSurveys() {
        return get('surveys') || {};
    }

    function saveSurvey(stationId, surveyData) {
        var surveys = getSurveys();
        surveyData.stationId = stationId;
        surveyData.updateTime = new Date().toISOString();
        surveys[stationId] = surveyData;
        set('surveys', surveys);
    }

    function getSurvey(stationId) {
        var surveys = getSurveys();
        return surveys[stationId] || null;
    }

    function deleteSurvey(stationId) {
        var surveys = getSurveys();
        delete surveys[stationId];
        set('surveys', surveys);
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

    return {
        get: get,
        set: set,
        remove: remove,
        clearStorage: clearStorage,
        getStorageSize: getStorageSize,
        getCentralStations: getCentralStations,
        saveCentralStations: saveCentralStations,
        getDispersedStations: getDispersedStations,
        saveDispersedStations: saveDispersedStations,
        upsertCentral: upsertCentral,
        upsertDispersed: upsertDispersed,
        deleteCentral: deleteCentral,
        deleteDispersed: deleteDispersed,
        getSurveys: getSurveys,
        saveSurvey: saveSurvey,
        getSurvey: getSurvey,
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
